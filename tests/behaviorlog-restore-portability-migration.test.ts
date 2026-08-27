import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const MIGRATION = readFileSync(
  "supabase/migrations/20260827032031_extend_behaviorlog_restore_portability.sql",
  "utf8",
).toLowerCase();

describe("BehaviorLog restore portability migration", () => {
  it("keeps the restore write and ledger update in one explicit transaction", () => {
    expect(MIGRATION.trimStart().startsWith("begin;")).toBe(true);
    expect(MIGRATION.trimEnd().endsWith("commit;")).toBe(true);
    expect(MIGRATION).toContain(
      "create or replace function public.apply_behaviorlog_restore(",
    );
    expect(MIGRATION).toContain(
      "create or replace function public.apply_behaviorlog_restore_with_configuration_events(",
    );
    expect(MIGRATION).toContain("applypayloaddigest".toLowerCase());
    expect(MIGRATION).toContain("accepted_preview_fingerprint");
    expect(MIGRATION).toContain("status = 'applied'");
  });

  it("extends provenance ownership to definition events and time sessions", () => {
    expect(MIGRATION).toContain("'behavior_definition_event'");
    expect(MIGRATION).toContain("'time_session'");
    expect(MIGRATION).toContain("public.behavior_definition_events");
    expect(MIGRATION).toContain("public.occurrence_time_sessions");
    expect(MIGRATION).toContain("public.behaviorlog_import_record_mappings");
    expect(MIGRATION).toContain("accepted_preview_run.dry_run_summary #> '{actions,definitionevents}'");
    expect(MIGRATION).toContain("accepted_preview_run.dry_run_summary #> '{actions,timesessions}'");
  });

  it("resolves categories and reconstructs grouped schedule parents", () => {
    expect(MIGRATION).toContain("from public.categories as category");
    expect(MIGRATION).toContain(
      "lower(regexp_replace(btrim(category.name), '\\s+', ' ', 'g'))",
    );
    expect(MIGRATION).toContain("insert into public.categories");
    expect(MIGRATION).toContain("parent_group_key");
    expect(MIGRATION).toContain(
      "cadence_private.replace_behavior_schedule_graph",
    );
  });

  it("preserves owner checks and exposes only the configuration wrapper", () => {
    expect(MIGRATION).toContain("security definer");
    expect(MIGRATION).toContain("auth.uid()");
    expect(MIGRATION).toContain(
      "revoke all on function public.apply_behaviorlog_restore(jsonb)",
    );
    expect(MIGRATION).toContain(
      "grant execute on function public.apply_behaviorlog_restore_with_configuration_events(jsonb)",
    );
    expect(MIGRATION).toContain("to authenticated");
  });
});
