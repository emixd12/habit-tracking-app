import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SQL = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260802000000_add_occurrence_time_sessions.sql",
  ),
  "utf8",
);
const NORMALIZED_SQL = SQL.replace(/\s+/g, " ");

describe("occurrence time sessions migration", () => {
  it("adds only the owner-consistent timing table and its required constraints", () => {
    expect(SQL).toContain("create table public.occurrence_time_sessions");
    expect(SQL).toContain("references auth.users(id) on delete cascade");
    expect(SQL).toContain("references public.occurrences(user_id, id, behavior_id)");
    expect(SQL).toContain("on delete cascade");
    expect(SQL).toContain("check (stopped_at is null or stopped_at >= started_at)");
    expect(SQL).toContain("where stopped_at is null");
    expect(SQL).not.toContain("insert into public.occurrences");
    expect(SQL).not.toContain("update public.occurrences");
  });

  it("enables owner-scoped RLS and minimum authenticated grants", () => {
    expect(SQL).toContain(
      "alter table public.occurrence_time_sessions enable row level security",
    );
    for (const operation of ["select", "insert", "update", "delete"]) {
      expect(SQL).toContain(`occurrence_time_sessions_${operation}_own`);
    }
    expect(NORMALIZED_SQL).toContain(
      "grant select, insert, update, delete on table public.occurrence_time_sessions to authenticated;",
    );
  });
});
