import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION_DIR = join(process.cwd(), "supabase", "migrations");
const DEFECTIVE_RESTORE_RPC_MIGRATION = readFileSync(
  join(
    MIGRATION_DIR,
    "20260619093000_add_behaviorlog_restore_apply_mode_and_rpc.sql",
  ),
  "utf8",
);
const CORRECTIVE_RESTORE_RPC_MIGRATION = readFileSync(
  join(MIGRATION_DIR, "20260625220756_fix_behaviorlog_restore_apply_rpc.sql"),
  "utf8",
);
const ATOMIC_RESTORE_RPC_MIGRATION = readFileSync(
  join(
    MIGRATION_DIR,
    "20260709203154_make_behaviorlog_restore_atomic_and_idempotent.sql",
  ),
  "utf8",
);

describe("BehaviorLog restore RPC migration safety", () => {
  it("corrects the invalid behaviors upsert conflict target", () => {
    const defectiveBehaviorTarget = [
      "from jsonb_array_elements(coalesce(restore_payload -> 'behaviors', '[]'::jsonb)) as row",
      "  on conflict (import_run_id, external_id) do update set",
    ].join("\n");
    const correctedBehaviorTarget = [
      "from jsonb_array_elements(coalesce(restore_payload -> 'behaviors', '[]'::jsonb)) as row",
      "  on conflict (id) do update set",
    ].join("\n");

    expect(DEFECTIVE_RESTORE_RPC_MIGRATION).toContain(defectiveBehaviorTarget);
    expect(CORRECTIVE_RESTORE_RPC_MIGRATION).toContain(
      "defective_behavior_conflict_target",
    );
    expect(CORRECTIVE_RESTORE_RPC_MIGRATION).toContain(
      "corrected_behavior_conflict_target",
    );
    expect(CORRECTIVE_RESTORE_RPC_MIGRATION).toContain(
      "on conflict (id) do update set",
    );
    expect(
      DEFECTIVE_RESTORE_RPC_MIGRATION.replace(
        defectiveBehaviorTarget,
        correctedBehaviorTarget,
      ),
    ).not.toContain(defectiveBehaviorTarget);
    expect(
      DEFECTIVE_RESTORE_RPC_MIGRATION.replace(
        defectiveBehaviorTarget,
        correctedBehaviorTarget,
      ),
    ).toContain("on conflict (import_run_id, external_id) do update set");
  });

  it("keeps restore apply callable only by authenticated users", () => {
    expect(CORRECTIVE_RESTORE_RPC_MIGRATION).toContain(
      "revoke all on function public.apply_behaviorlog_restore(jsonb) from public;",
    );
    expect(CORRECTIVE_RESTORE_RPC_MIGRATION).toContain(
      "revoke all on function public.apply_behaviorlog_restore(jsonb) from anon;",
    );
    expect(CORRECTIVE_RESTORE_RPC_MIGRATION).toContain(
      "grant execute on function public.apply_behaviorlog_restore(jsonb) to authenticated;",
    );
  });

  it("keeps the atomic wrapper owner-scoped with a hardened search path and narrow execute grants", () => {
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain("set search_path = ''");
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "if v_user_id is null then",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "where preview_run.user_id = v_user_id",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "revoke all on function public.apply_behaviorlog_restore(jsonb) from public;",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "revoke all on function public.apply_behaviorlog_restore(jsonb) from anon;",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "revoke all on function public.apply_behaviorlog_restore(jsonb) from service_role;",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "grant execute on function public.apply_behaviorlog_restore(jsonb) to authenticated;",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "revoke all\n  on function public.apply_behaviorlog_restore_product_writes(jsonb)\n  from public, anon, authenticated, service_role;",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "alter function public.apply_behaviorlog_restore_product_writes(jsonb)\n  set search_path = '';",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "revoke all\n  on function public.bind_behaviorlog_restore_apply_payload(jsonb)\n  from public, anon, authenticated, service_role;",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "grant execute\n  on function public.bind_behaviorlog_restore_apply_payload(jsonb)\n  to authenticated;",
    );
  });

  it("writes complete provenance inside the same statement as product data", () => {
    const productWrites = ATOMIC_RESTORE_RPC_MIGRATION.indexOf(
      "product_result := public.apply_behaviorlog_restore_product_writes(restore_payload);",
    );
    const mappingInsert = ATOMIC_RESTORE_RPC_MIGRATION.indexOf(
      "insert into public.behaviorlog_import_record_mappings",
    );
    const appliedLedgerUpdate = ATOMIC_RESTORE_RPC_MIGRATION.indexOf(
      "status = 'applied',\n    failure_message = null",
    );

    expect(productWrites).toBeGreaterThan(0);
    expect(mappingInsert).toBeGreaterThan(productWrites);
    expect(appliedLedgerUpdate).toBeGreaterThan(mappingInsert);
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "Every restored record requires matching provenance in the same transaction",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "Restore provenance mapping target is invalid or not user-owned",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "Restore provenance mappings were not written completely",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).not.toContain("exception when");
  });

  it("validates and inserts resolver-planned import definition history atomically", () => {
    const behaviorLock = ATOMIC_RESTORE_RPC_MIGRATION.indexOf(
      "from public.behaviors as behavior",
    );
    const productWrites = ATOMIC_RESTORE_RPC_MIGRATION.indexOf(
      "product_result := public.apply_behaviorlog_restore_product_writes(restore_payload);",
    );
    const definitionInsert = ATOMIC_RESTORE_RPC_MIGRATION.indexOf(
      "insert into public.behavior_definition_events",
    );
    const mappingInsert = ATOMIC_RESTORE_RPC_MIGRATION.indexOf(
      "insert into public.behaviorlog_import_record_mappings",
    );

    expect(behaviorLock).toBeGreaterThan(0);
    expect(behaviorLock).toBeLessThan(productWrites);
    expect(definitionInsert).toBeGreaterThan(productWrites);
    expect(definitionInsert).toBeLessThan(mappingInsert);
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "current_behavior.title is distinct from",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "event_input.row ->> 'next_title' is distinct from",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "event_input.row ->> 'source' is distinct from 'import'",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "Every newly restored behavior requires an atomic definition baseline",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "Every restored definition change requires an atomic transition event",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "Restore behavior definition events were not written completely",
    );
  });

  it("serializes and deduplicates restore apply by the exact accepted preview", () => {
    const previewLock = ATOMIC_RESTORE_RPC_MIGRATION.indexOf("for update;");
    const appliedLookup = ATOMIC_RESTORE_RPC_MIGRATION.indexOf(
      "and applied_run.status = 'applied'",
    );

    expect(previewLock).toBeGreaterThan(0);
    expect(appliedLookup).toBeGreaterThan(previewLock);
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "behaviorlog_import_runs_one_applied_restore_per_preview_idx",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "accepted_preview_run_id = v_accepted_preview_run_id",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "accepted_preview_fingerprint = v_accepted_preview_fingerprint",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "'already_applied', true",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "dry_run_summary -> 'applyResult'",
    );
  });

  it("binds and rechecks the exact canonical apply payload before product writes", () => {
    const digestCheck = ATOMIC_RESTORE_RPC_MIGRATION.indexOf(
      "Restore apply payload digest does not match its locked ledger",
    );
    const productWrites = ATOMIC_RESTORE_RPC_MIGRATION.indexOf(
      "product_result := public.apply_behaviorlog_restore_product_writes(restore_payload);",
    );

    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "create function public.bind_behaviorlog_restore_apply_payload",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "(restore_payload - 'apply_payload_digest')::text",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "'{applyPayloadDigest}'",
    );
    expect(digestCheck).toBeGreaterThan(0);
    expect(digestCheck).toBeLessThan(productWrites);
  });

  it("rejects unsafe preview policy and stale affected rows before product writes", () => {
    const productWrites = ATOMIC_RESTORE_RPC_MIGRATION.indexOf(
      "product_result := public.apply_behaviorlog_restore_product_writes(restore_payload);",
    );
    const behaviorLock = ATOMIC_RESTORE_RPC_MIGRATION.indexOf(
      "perform behavior.id",
    );
    const scheduleLock = ATOMIC_RESTORE_RPC_MIGRATION.indexOf(
      "perform schedule.id",
    );
    const occurrenceLock = ATOMIC_RESTORE_RPC_MIGRATION.indexOf(
      "perform occurrence.id",
    );
    const statusLock = ATOMIC_RESTORE_RPC_MIGRATION.indexOf(
      "perform status_event.id",
    );
    const noteLock = ATOMIC_RESTORE_RPC_MIGRATION.indexOf("perform note.id");
    const interventionLock = ATOMIC_RESTORE_RPC_MIGRATION.indexOf(
      "perform intervention.id",
    );
    const staleCheck = ATOMIC_RESTORE_RPC_MIGRATION.indexOf(
      "Restore target changed after preview; preview the restore again",
    );

    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "Accepted restore preview contains invalid, unsupported, or skipped actions",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "Accepted restore status-history policy is preview-only",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "Append-only status-history restore may only create accepted status events",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "Restore destructive target is outside the accepted preview actions",
    );
    expect(ATOMIC_RESTORE_RPC_MIGRATION).toContain(
      "Restore row preconditions do not exactly cover the affected payload",
    );
    expect(behaviorLock).toBeGreaterThan(0);
    expect(scheduleLock).toBeGreaterThan(behaviorLock);
    expect(occurrenceLock).toBeGreaterThan(scheduleLock);
    expect(statusLock).toBeGreaterThan(occurrenceLock);
    expect(noteLock).toBeGreaterThan(statusLock);
    expect(interventionLock).toBeGreaterThan(noteLock);
    expect(staleCheck).toBeGreaterThan(interventionLock);
    expect(staleCheck).toBeLessThan(productWrites);
  });
});
