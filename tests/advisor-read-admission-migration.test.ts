import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const migrationPath = new URL(
  "../supabase/migrations/20260919010200_add_advisor_read_admission.sql",
  import.meta.url,
);

describe("advisor read admission migration", () => {
  it("keeps admission state private and serializes owner decisions", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("create schema if not exists cadence_advisor_private");
    expect(sql).toContain("as restrictive");
    expect(sql).toContain("create function cadence_advisor_private.acquire_day_context_read");
    expect(sql).toContain("security definer");
    expect(sql).toContain("create function public.acquire_advisor_day_context_read");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(sql).toContain("observed_at := pg_catalog.clock_timestamp()");
    expect(sql).toContain("interval '60 seconds'");
    expect(sql).toContain("interval '1 day'");
    expect(sql).toContain("from public, anon, authenticated, service_role");
    expect(sql).toContain("grant execute on function public.acquire_advisor_day_context_read(text) to authenticated");
  });
});
