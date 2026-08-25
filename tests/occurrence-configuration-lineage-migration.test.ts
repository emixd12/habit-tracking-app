import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260815023424_link_occurrences_to_behavior_configuration_events.sql",
  ),
  "utf8",
);
const normalizedSql = migrationSql.replace(/\s+/g, " ");

describe("occurrence configuration lineage migration", () => {
  it("adds nullable owner-and-Behavior-scoped lineage without backfilling Occurrences", () => {
    expect(normalizedSql).toContain(
      "alter table public.occurrences add column behavior_configuration_event_id uuid;",
    );
    expect(normalizedSql).toContain(
      "foreign key (user_id, behavior_id, behavior_configuration_event_id) references public.behavior_configuration_events(user_id, behavior_id, id) deferrable initially deferred;",
    );
    expect(
      normalizedSql.split(
        "create or replace function public.apply_occurrence_generation_plan",
      )[0],
    ).not.toMatch(
      /update public\.occurrences[\s\S]+behavior_configuration_event_id/,
    );
  });

  it("keeps one atomic current-event pointer on each Behavior", () => {
    expect(normalizedSql).toContain(
      "alter table public.behaviors add column current_configuration_event_id uuid;",
    );
    expect(normalizedSql).toContain(
      "foreign key (user_id, id, current_configuration_event_id) references public.behavior_configuration_events(user_id, behavior_id, id) deferrable initially deferred;",
    );
    expect(normalizedSql).toContain(
      "create or replace function cadence_private.insert_behavior_configuration_event(",
    );
    expect(normalizedSql).toContain(
      "set current_configuration_event_id = created_event_id",
    );
    expect(normalizedSql).not.toContain(
      "create trigger set_behavior_current_configuration_event",
    );
    expect(normalizedSql).toContain(
      "Every Behavior must have a matching current configuration event.",
    );
  });

  it("locks the Behavior and rejects stale generation plans before writes", () => {
    const functionSql = migrationSql.match(
      /create or replace function public\.apply_occurrence_generation_plan\([\s\S]+?\$\$;/,
    )?.[0];

    expect(functionSql).toContain("security definer");
    expect(functionSql).toContain("for update;");
    expect(functionSql).toContain(
      "Behavior configuration changed after occurrence planning.",
    );
    expect(functionSql).toContain("using errcode = 'P0001'");
    expect(functionSql).not.toContain("using errcode = '40001'");
    expect(functionSql).toContain("insert into public.occurrences");
    expect(functionSql).toContain("update public.occurrences");
    expect(functionSql).toContain("delete from public.occurrences");
  });

  it("preserves null legacy lineage and advances only already-linked update targets", () => {
    const functionSql = migrationSql.match(
      /create or replace function public\.apply_occurrence_generation_plan\([\s\S]+?\$\$;/,
    )?.[0];

    expect(functionSql).toContain(
      "occurrence.behavior_configuration_event_id is not null",
    );
    expect(functionSql).toMatch(
      /planned\.behavior_configuration_event_id =\s+expected_configuration_event_id/,
    );
    expect(functionSql).toContain("occurrence.scheduled_for > plan_now");
    expect(functionSql).toContain(
      "btrim(coalesce(occurrence.note, '')) = ''",
    );
    expect(functionSql).toContain("public.occurrence_time_sessions");
    expect(functionSql).toContain(
      "inserted_count <> jsonb_array_length(occurrence_inserts)",
    );
    expect(functionSql).toContain(
      "deleted_count <> jsonb_array_length(occurrence_deletes)",
    );
    expect(functionSql).toContain(
      "Occurrence lineage update targets changed after planning.",
    );
    expect(functionSql).toContain(
      "occurrence.behavior_configuration_event_id is not distinct from\n      planned.behavior_configuration_event_id",
    );
  });

  it("clears false restore lineage while status-only writes remain untouched", () => {
    expect(normalizedSql).toContain(
      "create trigger clear_occurrence_configuration_lineage before update of behavior_id, behavior_schedule_slot_id, scheduled_for, local_date, schedule_kind, schedule_preset, schedule_start_time, schedule_end_time on public.occurrences",
    );
    expect(normalizedSql).toContain(
      "new.behavior_configuration_event_id := null;",
    );
    expect(normalizedSql).not.toMatch(
      /before update of[^;]+\bstatus\b[^;]+on public\.occurrences/,
    );
    expect(normalizedSql).not.toMatch(
      /before update of[^;]+\bnote\b[^;]+on public\.occurrences/,
    );
  });

  it("prevents authenticated direct writes from forging lineage", () => {
    expect(normalizedSql).toContain(
      "revoke insert, update on table public.occurrences from authenticated;",
    );
    expect(normalizedSql).not.toMatch(
      /grant insert \([^)]+behavior_configuration_event_id/,
    );
    expect(normalizedSql).not.toMatch(
      /grant update \([^)]+behavior_configuration_event_id/,
    );
    expect(normalizedSql).toContain(
      "grant update ( status, completed_at, status_marked_at, note ) on public.occurrences to authenticated;",
    );
  });

  it("marks freshness only under the configuration-writer advisory lock and exact Behavior set", () => {
    const functionSql = migrationSql.match(
      /create or replace function public\.mark_occurrence_sync_fresh_if_configuration_current\([\s\S]+?\$\$;/,
    )?.[0];

    expect(functionSql).toContain("security definer");
    expect(functionSql).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(functionSql).toContain(
      "pg_catalog.hashtextextended(target_user_id::text, 0)",
    );
    expect(functionSql).toContain(
      "jsonb_array_length(expected_behavior_configuration_events)",
    );
    expect(functionSql).toContain(
      "Behavior configuration changed after occurrence sync planning.",
    );
    expect(normalizedSql).toContain(
      "alter table public.occurrence_sync_state add column state_version bigint not null default 0;",
    );
    expect(normalizedSql).toContain(
      "new.state_version := old.state_version + 1;",
    );
    expect(functionSql).toContain(
      "current_sync_state_version is distinct from expected_sync_state_version",
    );
    expect(functionSql).toContain(
      "Occurrence sync state changed during freshness persistence.",
    );
    expect(normalizedSql).toContain(
      "revoke insert, update on table public.occurrence_sync_state from authenticated;",
    );
    expect(normalizedSql).not.toMatch(
      /grant insert \([^)]+state_version[^)]+\) on public\.occurrence_sync_state/,
    );
    expect(normalizedSql).not.toMatch(
      /grant update \([^)]+state_version[^)]+\) on public\.occurrence_sync_state/,
    );
    expect(functionSql).toContain("using errcode = 'P0001'");
    expect(functionSql).not.toContain("using errcode = '40001'");
  });

  it("restricts the plan RPC to authenticated and service-role callers", () => {
    expect(normalizedSql).toMatch(
      /revoke all on function public\.apply_occurrence_generation_plan\([\s\S]+?\) from public, anon, authenticated, service_role;/,
    );
    expect(normalizedSql).toMatch(
      /grant execute on function public\.apply_occurrence_generation_plan\([\s\S]+?\) to authenticated, service_role;/,
    );
  });

  it("wraps the pointer backfill and constraints in an explicit transaction", () => {
    expect(migrationSql.trimStart().startsWith("begin;")).toBe(true);
    expect(migrationSql.trimEnd().endsWith("commit;")).toBe(true);
  });
});
