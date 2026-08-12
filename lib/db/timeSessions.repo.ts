import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import { measurePerformanceSpan } from "@/lib/services/performance-timing";
import type {
  NewOccurrenceTimeSession,
  OccurrenceTimeSession,
} from "@/lib/types/database";

const ARBITRARY_ID_BATCH_SIZE = 2_000;
const RPC_PAGE_SIZE = 1_000;
const ALL_TIME_START_LOCAL_DATE = "0001-01-01";

export type OccurrenceTimeSessionReadRow = Pick<
  OccurrenceTimeSession,
  | "id"
  | "user_id"
  | "occurrence_id"
  | "behavior_id"
  | "started_at"
  | "stopped_at"
>;

export async function listTimeSessionsByOccurrenceIds(
  supabase: AppSupabaseClient,
  input: Readonly<{ userId: string; occurrenceIds: string[] }>,
): Promise<OccurrenceTimeSessionReadRow[]> {
  const occurrenceIds = Array.from(new Set(input.occurrenceIds));

  if (occurrenceIds.length === 0) {
    return [];
  }

  void input.userId;

  const result = await measurePerformanceSpan(
    {
      span: "db.list_time_sessions_by_occurrence_ids",
      counts: (read) => ({
        rpc_batches: read.batchCount,
        rpc_pages: read.pageCount,
        sessions: read.sessions.length,
      }),
    },
    async () => {
      const sessionsById = new Map<string, OccurrenceTimeSessionReadRow>();
      let batchCount = 0;
      let pageCount = 0;

      for (
        let batchStart = 0;
        batchStart < occurrenceIds.length;
        batchStart += ARBITRARY_ID_BATCH_SIZE
      ) {
        const occurrenceIdBatch = occurrenceIds.slice(
          batchStart,
          batchStart + ARBITRARY_ID_BATCH_SIZE,
        );
        batchCount += 1;

        for (let pageStart = 0; ; pageStart += RPC_PAGE_SIZE) {
          const { data, error } = await supabase
            .rpc("list_my_occurrence_time_sessions", {
              occurrence_ids: occurrenceIdBatch,
            })
            .range(pageStart, pageStart + RPC_PAGE_SIZE - 1);
          pageCount += 1;

          if (error) {
            throw error;
          }

          const page = data ?? [];
          let addedSessionCount = 0;

          for (const session of page) {
            if (!sessionsById.has(session.id)) {
              addedSessionCount += 1;
            }

            sessionsById.set(session.id, session);
          }

          if (page.length < RPC_PAGE_SIZE) {
            break;
          }

          if (addedSessionCount === 0) {
            throw new Error("Time-session ID pagination did not advance.");
          }
        }
      }

      return {
        sessions: Array.from(sessionsById.values()).sort(compareTimeSessions),
        batchCount,
        pageCount,
      };
    },
  );

  return result.sessions;
}

export async function listTimeSessionHistory(
  supabase: AppSupabaseClient,
  input: Readonly<{
    userId: string;
    startLocalDate: string | null;
    endLocalDate: string;
    includeArchived: boolean;
    throughStartedAt: string;
  }>,
): Promise<OccurrenceTimeSessionReadRow[]> {
  void input.userId;

  const result = await measurePerformanceSpan(
    {
      span: "db.list_time_session_history",
      counts: (read) => ({
        rpc_pages: read.pageCount,
        sessions: read.sessions.length,
      }),
    },
    async () => {
      const sessions: OccurrenceTimeSessionReadRow[] = [];
      let cursorStartedAt: string | null = null;
      let cursorSessionId: string | null = null;
      let pageCount = 0;

      for (;;) {
        const response = await supabase.rpc(
          "list_my_occurrence_time_session_history",
          {
            range_start_local_date:
              input.startLocalDate ?? ALL_TIME_START_LOCAL_DATE,
            range_end_local_date: input.endLocalDate,
            include_archived: input.includeArchived,
            through_started_at: input.throughStartedAt,
            // Generated RPC args cannot express nullable SQL cursor inputs.
            // PostgREST still requires explicit nulls for the first page.
            cursor_started_at: cursorStartedAt as unknown as string,
            cursor_session_id: cursorSessionId as unknown as string,
            page_size: RPC_PAGE_SIZE,
          },
        );
        pageCount += 1;

        if (response.error) {
          throw response.error;
        }

        const page: OccurrenceTimeSessionReadRow[] = response.data ?? [];
        sessions.push(...page);

        if (page.length < RPC_PAGE_SIZE) {
          break;
        }

        const lastSession: OccurrenceTimeSessionReadRow | undefined =
          page.at(-1);

        if (!lastSession) {
          throw new Error("Time-session history cursor did not advance.");
        }

        if (
          cursorStartedAt !== null &&
          cursorSessionId !== null &&
          compareTimeSessionToCursor(
            lastSession,
            cursorStartedAt,
            cursorSessionId,
          ) <= 0
        ) {
          throw new Error("Time-session history cursor did not advance.");
        }

        cursorStartedAt = lastSession.started_at;
        cursorSessionId = lastSession.id;
      }

      return { sessions, pageCount };
    },
  );

  return result.sessions;
}

function compareTimeSessions(
  left: OccurrenceTimeSessionReadRow,
  right: OccurrenceTimeSessionReadRow,
): number {
  if (left.started_at < right.started_at) {
    return -1;
  }

  if (left.started_at > right.started_at) {
    return 1;
  }

  if (left.id < right.id) {
    return -1;
  }

  return left.id > right.id ? 1 : 0;
}

function compareTimeSessionToCursor(
  session: OccurrenceTimeSessionReadRow,
  cursorStartedAt: string,
  cursorSessionId: string,
): number {
  if (session.started_at < cursorStartedAt) {
    return -1;
  }

  if (session.started_at > cursorStartedAt) {
    return 1;
  }

  if (session.id < cursorSessionId) {
    return -1;
  }

  return session.id > cursorSessionId ? 1 : 0;
}

export async function listTimeSessionsForOccurrence(
  supabase: AppSupabaseClient,
  input: Readonly<{ userId: string; occurrenceId: string }>,
): Promise<OccurrenceTimeSessionReadRow[]> {
  return listTimeSessionsByOccurrenceIds(supabase, {
    userId: input.userId,
    occurrenceIds: [input.occurrenceId],
  });
}

export async function createRunningTimeSession(
  supabase: AppSupabaseClient,
  session: NewOccurrenceTimeSession,
): Promise<OccurrenceTimeSession | null> {
  const { data, error } = await supabase
    .from("occurrence_time_sessions")
    .insert(session)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return null;
    }

    throw error;
  }

  return data;
}

export async function stopRunningTimeSession(
  supabase: AppSupabaseClient,
  input: Readonly<{
    userId: string;
    occurrenceId: string;
    sessionId: string;
    stoppedAt: string;
  }>,
): Promise<OccurrenceTimeSession | null> {
  const { data, error } = await supabase
    .from("occurrence_time_sessions")
    .update({ stopped_at: input.stoppedAt })
    .eq("user_id", input.userId)
    .eq("occurrence_id", input.occurrenceId)
    .eq("id", input.sessionId)
    .is("stopped_at", null)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteTimeSessionsForOccurrence(
  supabase: AppSupabaseClient,
  input: Readonly<{ userId: string; occurrenceId: string }>,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("occurrence_time_sessions")
    .delete()
    .eq("user_id", input.userId)
    .eq("occurrence_id", input.occurrenceId)
    .select("id");

  if (error) {
    throw error;
  }

  return (data ?? []).map((session) => session.id);
}
