import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260812172823_add_time_session_query_rpcs.sql",
  ),
  "utf8",
).toLowerCase();
const normalizedSql = migrationSql.replace(/\s+/g, " ");
const canonicalSql = normalizedSql
  .replace(/\(\s+/g, "(")
  .replace(/\s+\)/g, ")");

const idFunctionSql = migrationSql.match(
  /create or replace function public\.list_my_occurrence_time_sessions[\s\S]+?\$\$;/,
)?.[0];
const historyFunctionSql = migrationSql.match(
  /create or replace function public\.list_my_occurrence_time_session_history[\s\S]+?\$\$;/,
)?.[0];

const idSignature = "list_my_occurrence_time_sessions(uuid[])";
const historySignature =
  "list_my_occurrence_time_session_history(date, date, boolean, timestamptz, timestamptz, uuid, integer)";

const minimalReturnColumns = [
  "id pg_catalog.uuid",
  "user_id pg_catalog.uuid",
  "occurrence_id pg_catalog.uuid",
  "behavior_id pg_catalog.uuid",
  "started_at pg_catalog.timestamptz",
  "stopped_at pg_catalog.timestamptz",
];

describe("Ticket 094 time-session query RPC migration", () => {
  it("adds the EXPLAIN-backed owner and keyset cursor index", () => {
    expect(canonicalSql).toContain(
      "create index occurrence_time_sessions_user_started_id_idx on public.occurrence_time_sessions (user_id, started_at asc, id asc);",
    );
  });

  it("creates one non-overloaded function for each exact signature", () => {
    expect(idFunctionSql).toBeDefined();
    expect(historyFunctionSql).toBeDefined();
    expect(
      migrationSql.match(
        /create or replace function public\.list_my_occurrence_time_sessions\s*\(/g,
      ),
    ).toHaveLength(1);
    expect(
      migrationSql.match(
        /create or replace function public\.list_my_occurrence_time_session_history\s*\(/g,
      ),
    ).toHaveLength(1);
    expect(canonicalSql).toContain(
      "list_my_occurrence_time_sessions(occurrence_ids pg_catalog.uuid[])",
    );
    expect(canonicalSql).toContain(
      "list_my_occurrence_time_session_history(range_start_local_date pg_catalog.date, range_end_local_date pg_catalog.date, include_archived pg_catalog.bool, through_started_at pg_catalog.timestamptz, cursor_started_at pg_catalog.timestamptz, cursor_session_id pg_catalog.uuid, page_size pg_catalog.int4)",
    );
  });

  it.each([
    ["arbitrary-ID", idFunctionSql],
    ["history", historyFunctionSql],
  ])("keeps the %s function invoker-scoped with a hardened search path", (_, sql) => {
    expect(sql).toContain("stable");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path = ''");
    expect(sql).not.toContain("security definer");
    expect(sql).toContain(
      "current_user_id pg_catalog.uuid := (select auth.uid())",
    );
    expect(sql).toContain("if current_user_id is null then");
    expect(sql).not.toMatch(/\bexecute\b|\bformat\s*\(/);
  });

  it.each([
    [idSignature, idFunctionSql],
    [historySignature, historyFunctionSql],
  ])("returns only the six time-session columns from %s", (_, sql) => {
    expect(sql).toBeDefined();
    const normalizedFunctionSql = sql?.replace(/\s+/g, " ") ?? "";

    expect(normalizedFunctionSql).toContain(
      `returns table ( ${minimalReturnColumns.join(", ")} )`,
    );
    expect(normalizedFunctionSql).toContain(
      "select session.id, session.user_id, session.occurrence_id, session.behavior_id, session.started_at, session.stopped_at",
    );
    expect(normalizedFunctionSql).not.toMatch(/select\s+\*/);
    expect(normalizedFunctionSql).toContain(
      "order by session.started_at asc, session.id asc",
    );
  });

  it("bounds, deduplicates, and owner-scopes arbitrary occurrence IDs", () => {
    expect(idFunctionSql).toContain(
      "if occurrence_ids is null or pg_catalog.cardinality(occurrence_ids) = 0 then",
    );
    expect(idFunctionSql).toContain(
      "if pg_catalog.cardinality(occurrence_ids) > 2000 then",
    );
    expect(idFunctionSql).toContain(
      "a maximum of 2000 occurrence ids is allowed per call.",
    );
    expect(idFunctionSql).toContain("from pg_catalog.unnest(occurrence_ids)");
    expect(idFunctionSql).toContain("select distinct requested_occurrence_id");
    expect(idFunctionSql).toContain(
      "from public.occurrence_time_sessions as session",
    );
    expect(idFunctionSql).toContain(
      "session.user_id = current_user_id",
    );
  });

  it("joins owner identity directly and filters history by occurrence local date", () => {
    expect(historyFunctionSql).toContain("from public.occurrences as occurrence");
    expect(historyFunctionSql).toContain(
      "join public.occurrence_time_sessions as session",
    );
    expect(historyFunctionSql).toContain(
      "session.user_id = occurrence.user_id",
    );
    expect(historyFunctionSql).toContain(
      "session.occurrence_id = occurrence.id",
    );
    expect(historyFunctionSql).toContain(
      "session.behavior_id = occurrence.behavior_id",
    );
    expect(historyFunctionSql).toContain("join public.behaviors as behavior");
    expect(historyFunctionSql).toContain(
      "behavior.user_id = occurrence.user_id",
    );
    expect(historyFunctionSql).toContain(
      "behavior.id = occurrence.behavior_id",
    );
    expect(historyFunctionSql).toContain(
      "occurrence.local_date between range_start_local_date and range_end_local_date",
    );
    expect(historyFunctionSql).not.toMatch(
      /started_at\s*(::|at time zone|\)|,)\s*date/,
    );
    for (const alias of ["occurrence", "session", "behavior"]) {
      expect(historyFunctionSql).toContain(
        `${alias}.user_id = current_user_id`,
      );
    }
  });

  it("enforces archive, high-water, cursor, and page-size contracts", () => {
    expect(historyFunctionSql).toContain(
      "range_start_local_date is null",
    );
    expect(historyFunctionSql).toContain("range_end_local_date is null");
    expect(historyFunctionSql).toContain("include_archived is null");
    expect(historyFunctionSql).toContain("through_started_at is null");
    expect(historyFunctionSql).toContain(
      "range_start_local_date > range_end_local_date",
    );
    expect(historyFunctionSql).toContain(
      "(cursor_started_at is null and cursor_session_id is not null)",
    );
    expect(historyFunctionSql).toContain(
      "(cursor_started_at is not null and cursor_session_id is null)",
    );
    expect(historyFunctionSql).toContain("page_size < 1 or page_size > 1000");
    expect(historyFunctionSql).toContain(
      "(include_archived or behavior.active)",
    );
    expect(historyFunctionSql).toContain(
      "session.started_at <= through_started_at",
    );
    expect(historyFunctionSql).toContain(
      "(session.started_at, session.id) > (cursor_started_at, cursor_session_id)",
    );
    expect(historyFunctionSql).toContain("limit page_size");
    expect(historyFunctionSql).not.toMatch(/\boffset\b/);
  });

  it.each([idSignature, historySignature])(
    "grants only authenticated callers access to %s",
    (signature) => {
      expect(canonicalSql).toContain(
        `revoke all on function public.${signature} from public, anon, authenticated, service_role;`,
      );
      expect(canonicalSql).toContain(
        `grant execute on function public.${signature} to authenticated;`,
      );
    },
  );
});
