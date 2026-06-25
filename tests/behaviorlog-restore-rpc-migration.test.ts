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
});
