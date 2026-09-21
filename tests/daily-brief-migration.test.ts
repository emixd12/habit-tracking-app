import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration = await readFile(
  new URL("../supabase/migrations/20260921003952_add_daily_brief_controls.sql", import.meta.url),
  "utf8",
);

describe("Daily Brief controls migration", () => {
  it("keeps operational state private and public wrappers invoker-only", () => {
    expect(migration).toContain("create table cadence_advisor_private.daily_brief_preferences");
    expect(migration).toContain("create table cadence_advisor_private.daily_brief_runs");
    expect(migration).toContain("create table cadence_advisor_private.daily_brief_rate_limits");
    expect(migration).toMatch(/create function public\.begin_daily_brief[\s\S]*?security invoker/);
    expect(migration).toMatch(/create function cadence_advisor_private\.begin_daily_brief[\s\S]*?security definer/);
    expect(migration).toContain("from auth.sessions as auth_session");
    expect(migration).toContain("auth_session.not_after is null or auth_session.not_after > pg_catalog.clock_timestamp()");
    expect(migration).toContain("and run.status = 'completed'");
    expect(migration).toContain("revoke all on all tables in schema cadence_advisor_private");
    expect(migration).not.toMatch(/grant (select|insert|update|delete).*daily_brief_/i);
  });

  it("records disclosure fences and bounded content-free admission metadata", () => {
    expect(migration).toContain("calendar_connection_generation");
    expect(migration).toContain("calendar_selection_revision");
    expect(migration).toContain("interval '75 seconds'");
    expect(migration).toContain("cardinality(generation_starts) <= 6");
    expect(migration).toContain("if row_count >= 8 then");
    expect(migration).toContain("A retry with no current attempt is an initial acquisition.");
    expect(migration).toContain("No prompt or generated content is stored.");
    expect(migration).not.toMatch(/prompt_(text|content)|generated_(text|content)|output_content/i);
  });
});
