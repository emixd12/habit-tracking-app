import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260815030929_add_configuration_lineage_to_export_read.sql",
  ),
  "utf8",
);
const normalizedSql = migrationSql.replace(/\s+/g, " ");

describe("export configuration lineage migration", () => {
  it("adds Behavior pointers, Occurrence lineage, and sync-state version to one export snapshot", () => {
    expect(normalizedSql).toContain(
      "create or replace function public.get_export_page_read_bundle( range_start_local_date date, range_end_local_date date )",
    );
    expect(normalizedSql).toContain(
      "'current_configuration_event_id', b.current_configuration_event_id",
    );
    expect(normalizedSql).toContain(
      "'behavior_configuration_event_id', o.behavior_configuration_event_id",
    );
    expect(normalizedSql).toContain("s.state_version");
  });

  it("keeps export reads authenticated and invoker-scoped", () => {
    expect(normalizedSql).toContain("security invoker");
    expect(normalizedSql).toContain(
      "revoke all on function public.get_export_page_read_bundle(date, date) from public;",
    );
    expect(normalizedSql).toContain(
      "revoke all on function public.get_export_page_read_bundle(date, date) from anon;",
    );
    expect(normalizedSql).toContain(
      "grant execute on function public.get_export_page_read_bundle(date, date) to authenticated;",
    );
  });
});
