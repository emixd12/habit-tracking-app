import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260827025303_make_behaviorlog_import_apply_atomic.sql",
    import.meta.url,
  ),
  "utf8",
);
const portabilityMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260827032029_extend_behaviorlog_import_portability.sql",
    import.meta.url,
  ),
  "utf8",
);
const service = readFileSync(
  new URL("../lib/services/behaviorlog-import.service.ts", import.meta.url),
  "utf8",
);
const writeService = readFileSync(
  new URL(
    "../lib/services/behaviorlog-import-write.service.ts",
    import.meta.url,
  ),
  "utf8",
);

describe("Ticket 084 atomic BehaviorLog import apply", () => {
  it("serializes one accepted preview and returns its applied result", () => {
    expect(migration).toContain(
      "behaviorlog_import_runs_one_applied_import_per_preview_idx",
    );
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain(
      "existing_run.dry_run_summary -> 'applyResult'",
    );
  });

  it("rolls product writes back before recording a failed ledger", () => {
    const productWrite = migration.indexOf("insert into public.behaviors");
    const rollbackBoundary = migration.indexOf("exception when others");
    const failedLedger = migration.indexOf("set status = 'failed'");

    expect(productWrite).toBeGreaterThan(0);
    expect(rollbackBoundary).toBeGreaterThan(productWrite);
    expect(failedLedger).toBeGreaterThan(rollbackBoundary);
  });

  it("routes accepted applies through the transactional RPC", () => {
    expect(service).toContain("applyAcceptedBehaviorLogImportPlanAtomically");
    expect(writeService).toContain("intervention_rules_present:");
    expect(writeService).toContain(
      'file.path === "data/intervention_rules.jsonl"',
    );
    expect(service).not.toContain("applyCreateMissingBehaviorLogImportPlan(");
    expect(service).not.toContain("applyApprovedBehaviorLogMergePlan(");
  });

  it("extends the atomic apply with portable history mappings", () => {
    expect(portabilityMigration.trimStart()).toMatch(/^begin;/u);
    expect(portabilityMigration.trimEnd()).toMatch(/commit;$/u);
    expect(portabilityMigration).toContain("'behavior_definition_event'");
    expect(portabilityMigration).toContain("'time_session'");
    expect(portabilityMigration).toContain(
      "insert into public.behavior_definition_events",
    );
    expect(portabilityMigration).toContain(
      "insert into public.occurrence_time_sessions",
    );
    expect(portabilityMigration).toContain(
      "cadence_private.apply_behaviorlog_import(adjusted_payload)",
    );
    expect(portabilityMigration).toContain(
      "core_result #> '{created,definitionEvents}' is not null",
    );
  });

  it("applies standard reminder rules and restores schedule parents", () => {
    expect(portabilityMigration).toContain("intervention_rules_present");
    expect(portabilityMigration).toContain("cadenceBrowserReminderEnabled");
    expect(portabilityMigration).toContain("cadenceEmailReminderEnabled");
    expect(portabilityMigration).toContain("cadenceReminderOffsetMinutes");
    expect(portabilityMigration).toContain("cadenceBehaviorScheduleId");
    expect(portabilityMigration).toContain(
      "set behavior_schedule_id = target_parent_id",
    );
  });
});
