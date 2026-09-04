import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260901054332_add_account_sync_contract.sql",
  "utf8",
).toLowerCase();
const lifecycleSql = readFileSync("supabase/migrations/20260825061411_protect_profile_email_and_reminder_delivery_state.sql", "utf8").toLowerCase();
const insertCompareSql = readFileSync("supabase/migrations/20260901182100_fix_account_sync_insert_compare.sql", "utf8").toLowerCase();
const unresolvedOccurrenceSql = readFileSync("supabase/migrations/20260901183400_allow_new_unresolved_occurrence_sync.sql", "utf8").toLowerCase();
const derivedFieldSql = readFileSync("supabase/migrations/20260901190000_normalize_account_sync_derived_fields.sql", "utf8").toLowerCase();
const canonicalOrderSql = readFileSync("supabase/migrations/20260901193000_stabilize_account_sync_canonical_order.sql", "utf8").toLowerCase();
const occurrenceLineageSql = readFileSync("supabase/migrations/20260901200000_preserve_occurrence_lineage_on_sync_upsert.sql", "utf8").toLowerCase();
const scopedOccurrenceLineageSql = readFileSync("supabase/migrations/20260901203000_scope_occurrence_lineage_preservation_to_account_sync.sql", "utf8").toLowerCase();
const serializedApplySql = readFileSync("supabase/migrations/20260902052213_serialize_and_bound_account_sync_apply.sql", "utf8").toLowerCase();

describe("account synchronization migration", () => {
  it("normalizes a missing hosted insert row to JSON null before compare-and-set", () => {
    expect(insertCompareSql).toContain("cadence_private.apply_account_sync_plan(jsonb)");
    expect(insertCompareSql).toContain("coalesce(stored_value, ''null''::jsonb) is distinct from write -> ''expected''");
    expect(insertCompareSql).toContain("original_count = 1 and corrected_count = 0");
    expect(insertCompareSql).toContain("original_count = 0 and corrected_count = 1");
    expect(insertCompareSql).toContain("definition changed unexpectedly");
  });

  it("allows only new Unresolved Occurrences to omit status history", () => {
    expect(unresolvedOccurrenceSql).toContain("stored_value is not null and stored_value -> ''status'' is distinct");
    expect(unresolvedOccurrenceSql).toContain("stored_value is null and write #>> ''{value,status}'' <> ''unresolved''");
    expect(unresolvedOccurrenceSql).toContain("original_count = 1 and corrected_count = 0");
    expect(unresolvedOccurrenceSql).toContain("original_count = 0 and corrected_count = 1");
    expect(unresolvedOccurrenceSql).toContain("attribute.attgenerated = ''");
    expect(unresolvedOccurrenceSql).toContain("insert into %1$s (%3$s) select %3$s from jsonb_populate_record");
  });

  it("excludes database-generated occurrence identity from the sync contract", () => {
    expect(derivedFieldSql).toContain("where key <> 'schedule_range_identity'");
    expect(derivedFieldSql).toContain("create or replace function cadence_private.normalize_account_sync_row");
  });
  it("locks canonical keys and entities to bytewise PostgreSQL ordering", () => {
    expect(canonicalOrderSql).toContain('order by key collate "c"');
    expect(canonicalOrderSql).toContain('order by kind collate "c", id collate "c"');
    expect(canonicalOrderSql).toContain("original_count = 1 and corrected_count = 0");
    expect(canonicalOrderSql).toContain("original_count = 0 and corrected_count = 1");
  });
  it("preserves occurrence configuration lineage when a status sync upserts unchanged schedule fields", () => {
    expect(occurrenceLineageSql).toContain("create or replace function cadence_private.clear_occurrence_configuration_lineage");
    expect(occurrenceLineageSql).toContain("is distinct from");
    expect(occurrenceLineageSql).toContain("new.behavior_configuration_event_id := null");
  });
  it("scopes lineage preservation to unchanged account-sync scheduling fields", () => {
    expect(scopedOccurrenceLineageSql).toContain("new.behavior_configuration_event_id := null");
    expect(scopedOccurrenceLineageSql).toContain("write_kind <> 'occurrence'");
    expect(scopedOccurrenceLineageSql).toContain("write -> 'expected' -> attribute.attname is distinct from write -> 'value' -> attribute.attname");
    expect(scopedOccurrenceLineageSql).toContain("account-sync occurrence update-column filter changed unexpectedly");
  });
  it("serializes account apply and bounds immutable receipt storage", () => {
    expect(serializedApplySql).toContain("hashtextextended(current_user_id::text, 0)");
    expect(serializedApplySql).toContain("hashtextextended(table_name || ':' || row_id::text, 0)");
    expect(serializedApplySql).toContain("current_snapshot ->> 'fingerprint' <> stored_receipt.result_fingerprint");
    expect(serializedApplySql).toContain("jsonb_build_object('status', 'applied')");
    expect(serializedApplySql).toContain("account changed after this synchronization receipt");
  });
  it("reads one bounded, owner-scoped snapshot through an invoker RPC", () => {
    expect(sql).toContain(
      "create function public.read_account_sync_snapshot()",
    );
    expect(sql).toMatch(/stable\s+security invoker\s+set search_path = ''/);
    expect(sql).toContain("where r.user_id = current_user_id");
    expect(sql).toContain("having count(*) > 100000");
    expect(sql).toContain("octet_length(snapshot::text) > 67108864");
    expect(sql).not.toContain("push_subscriptions");
    expect(sql).not.toContain("occurrence_sync_state");
  });

  it("rejects stale, conflicting, oversized, or non-idempotent apply payloads", () => {
    expect(sql).toMatch(
      /create function cadence_private\.apply_account_sync_plan[\s\S]*?security definer[\s\S]*?set search_path = ''/,
    );
    expect(sql).toMatch(
      /create function public\.apply_account_sync_plan[\s\S]*?security invoker[\s\S]*?set search_path = ''/,
    );
    expect(sql).toContain("current_user_id uuid := (select auth.uid())");
    expect(sql).toContain("octet_length(sync_payload::text) > 67108864");
    expect(sql).toContain(
      "jsonb_array_length(coalesce(sync_payload #> '{plan,conflicts}'",
    );
    expect(sql).toContain(
      "current_snapshot ->> 'fingerprint' <> sync_payload ->> 'hostedfingerprint'",
    );
    expect(sql).toContain(
      "stored_receipt.request_fingerprint <> request_fingerprint",
    );
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("sync_payload #> '{plan,writes}'");
    expect(sql).toContain("array['writes', 'mergedfingerprint', 'conflicts']");
    expect(sql).toContain("row belongs to another account");
    expect(sql).toContain("result differs from the accepted merge");
    expect(sql).toContain("synchronized history and provenance are append-only");
    expect(sql).toMatch(
      /write_kind in \(\s*'definition_event', 'configuration_event', 'status_event',\s*'mapping'\s*\)/,
    );
    expect(sql).not.toMatch(
      /write_kind in \([^)]*'imported_note'[^)]*\)[\s\S]{0,160}synchronized history and provenance are append-only/,
    );
    expect(sql).toContain("resolved occurrences are protected");
    expect(sql).toContain(
      "'behavior', 'import_run', 'imported_note',\n        'imported_intervention', 'reminder_delivery'",
    );
    expect(sql).toContain(
      "a referenced category requires guarded behavior rewrites before deletion",
    );
    expect(sql).toContain(
      "behavior_write -> 'expected' = cadence_private.normalize_account_sync_row(to_jsonb(behavior) - 'user_id')",
    );
    expect(sql).toContain("on conflict (id) do update set");
    expect(sql).not.toContain("apply_behaviorlog_restore(");
    expect(sql).not.toContain("apply_behaviorlog_import(");
  });

  it("keeps receipts immutable and every public RPC authenticated-only", () => {
    expect(sql).toContain(
      "alter table public.account_sync_apply_receipts enable row level security",
    );
    expect(sql).toContain("using ((select auth.uid()) = user_id)");
    expect(sql).toContain(
      "grant select on table public.account_sync_apply_receipts to authenticated",
    );
    expect(sql).not.toMatch(
      /grant[^;]*(update|delete)[^;]*account_sync_apply_receipts/,
    );
    expect(sql).not.toMatch(/grant[^;]*insert[^;]*account_sync_apply_receipts/);
    expect(sql).toContain(
      "revoke all on function public.read_account_sync_snapshot() from public, anon, service_role",
    );
    expect(sql).toContain(
      "revoke all on function public.apply_account_sync_plan(jsonb) from public, anon, service_role",
    );
    expect(sql).toContain(
      "revoke all on function cadence_private.apply_account_sync_plan(jsonb)",
    );
  });

  it("inherits the table-level reminder lifecycle trigger during sync RPC writes", () => {
    expect(lifecycleSql).toContain("before update on public.reminder_deliveries");
    expect(lifecycleSql).toContain("terminal reminder deliveries cannot return to pending");
    expect(lifecycleSql).toContain("reminder delivery processing claims cannot be cleared");
  });
});
