import type {
  NoteShortcutContext,
  NoteShortcutState,
  NoteShortcutStore,
  NoteSource,
} from "@cadence/core/types/note-shortcut";
import { validateNoteShortcutState } from "@cadence/core/resolvers/note-suggestion.resolver";

import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import type { Json } from "@/lib/db/database.types";
import { readAllPostgrestRows } from "@/lib/db/paginated-read";

export function createNoteShortcutStore(
  supabase: AppSupabaseClient,
  userId: string,
): NoteShortcutStore {
  return {
    userId,
    readStates: () => readNoteShortcutStates(supabase, userId),
    readContext: (behaviorId) =>
      readNoteShortcutContext(supabase, userId, behaviorId),
    commit: (input) => commitNoteShortcutState(supabase, userId, input),
  };
}

export async function readNoteShortcutStates(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<NoteShortcutState[]> {
  const rows = await readAllPostgrestRows({
    label: "Note shortcut states",
    createQuery: () =>
      supabase
        .from("note_shortcut_states")
        .select("*")
        .eq("user_id", userId)
        .order("id", { ascending: true }),
    getRowKey: (row) => row.id,
    absoluteCeilingError:
      "Note shortcut states exceed Cadence's absolute read ceiling of 100,000 rows.",
  });

  return rows.map((row) => readState(row, userId));
}

export async function readNoteShortcutContext(
  supabase: AppSupabaseClient,
  userId: string,
  behaviorId: string | null,
): Promise<NoteShortcutContext> {
  const { data, error } = await supabase.rpc("read_note_shortcut_context", {
    target_behavior_id: behaviorId as unknown as string,
  });
  if (error) throw error;
  return parseContext(data, userId, behaviorId);
}

export async function commitNoteShortcutState(
  supabase: AppSupabaseClient,
  userId: string,
  input: {
    expected: NoteShortcutContext;
    next: NoteShortcutState;
    requireEnabled: boolean;
  },
): Promise<NoteShortcutState> {
  if (input.next.user_id !== userId) {
    throw new Error("Shortcut state belongs to another owner.");
  }
  validateNoteShortcutState(input.next);
  const { data, error } = await supabase.rpc("commit_note_shortcut_state", {
    expected_context: input.expected as unknown as Json,
    next_state: input.next as unknown as Json,
    require_enabled: input.requireEnabled,
  });
  if (error) throw error;
  return readState(data, userId);
}

function parseContext(
  value: unknown,
  userId: string,
  behaviorId: string | null,
): NoteShortcutContext {
  if (!isRecord(value) || !Array.isArray(value.notes) ||
      !Array.isArray(value.importedOccurrenceIds)) {
    throw new Error("Invalid Note shortcut context.");
  }
  const state = value.state === null ? null : readState(value.state, userId);
  const globalState = value.globalState === null
    ? null
    : readState(value.globalState, userId);
  const behavior = value.behavior === null
    ? null
    : readBehavior(value.behavior, userId, behaviorId);
  const notes = value.notes.map((note) => readNoteSource(note, userId, behaviorId));
  const importedOccurrenceIds = value.importedOccurrenceIds.map((id) => {
    if (typeof id !== "string") throw new Error("Invalid imported Occurrence ID.");
    return id;
  });
  return { state, globalState, behavior, notes, importedOccurrenceIds };
}

function readState(value: unknown, userId: string): NoteShortcutState {
  validateNoteShortcutState(value);
  if (value.user_id !== userId) {
    throw new Error("Shortcut state belongs to another owner.");
  }
  return value;
}

function readBehavior(
  value: unknown,
  userId: string,
  behaviorId: string | null,
): NoteShortcutContext["behavior"] {
  if (behaviorId === null || !isRecord(value) || typeof value.id !== "string" ||
      value.user_id !== userId || value.id !== behaviorId ||
      typeof value.active !== "boolean" || typeof value.timezone !== "string") {
    throw new Error("Invalid Note shortcut Behavior context.");
  }
  return {
    id: value.id,
    user_id: userId,
    active: value.active,
    timezone: value.timezone,
  };
}

function readNoteSource(
  value: unknown,
  userId: string,
  behaviorId: string | null,
): NoteSource {
  if (behaviorId === null) {
    throw new Error("Invalid Note shortcut source.");
  }
  if (!isRecord(value) || typeof value.id !== "string" ||
      value.user_id !== userId || value.behavior_id !== behaviorId ||
      (typeof value.note !== "string" && value.note !== null) ||
      typeof value.local_date !== "string" ||
      typeof value.scheduled_for !== "string") {
    throw new Error("Invalid Note shortcut source.");
  }
  return {
    id: value.id,
    user_id: userId,
    behavior_id: behaviorId,
    note: value.note,
    local_date: value.local_date,
    scheduled_for: value.scheduled_for,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
