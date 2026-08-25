import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260815015023_add_behavior_configuration_events.sql",
  ),
  "utf8",
);
const normalizedSql = migrationSql.replace(/\s+/g, " ");

describe("behavior configuration events migration", () => {
  it("creates an append-only owner-scoped table", () => {
    expect(migrationSql).toContain(
      "create table public.behavior_configuration_events",
    );
    expect(migrationSql).toContain(
      "alter table public.behavior_configuration_events enable row level security",
    );
    expect(migrationSql).toMatch(
      /create policy behavior_configuration_events_select_own[\s\S]+?for select[\s\S]+?to authenticated[\s\S]+?auth\.uid\(\)/,
    );
    expect(migrationSql).not.toContain(
      "create policy behavior_configuration_events_insert_own",
    );
    expect(migrationSql).not.toContain(
      "create policy behavior_configuration_events_update",
    );
    expect(migrationSql).not.toContain(
      "create policy behavior_configuration_events_delete",
    );
    expect(normalizedSql).toContain(
      "grant select on table public.behavior_configuration_events to authenticated;",
    );
  });

  it("backfills truthful capture-start baselines at migration time", () => {
    expect(normalizedSql).toContain(
      "insert into public.behavior_configuration_events",
    );
    expect(normalizedSql).toContain("'history_capture_started'");
    expect(normalizedSql).toContain("'system'");
    expect(normalizedSql).toContain("statement_timestamp()");
    expect(normalizedSql).not.toMatch(
      /history_capture_started[\s\S]{0,600}behaviors\.created_at/,
    );
  });

  it("extends manual create and update RPCs with validated configuration plans", () => {
    const createSql = migrationSql.match(
      /create or replace function public\.create_behavior_with_schedule_graph\([\s\S]+?\$\$;/,
    )?.[0];
    const updateSql = migrationSql.match(
      /create or replace function public\.update_behavior_with_schedule_graph\([\s\S]+?\$\$;/,
    )?.[0];

    expect(createSql).toContain("configuration_event_plan jsonb");
    expect(createSql).toContain("security definer");
    expect(createSql).toContain(
      "cadence_private.insert_behavior_configuration_event",
    );
    expect(updateSql).toContain("configuration_event_plan jsonb");
    expect(updateSql).toContain("for update;");
    expect(updateSql).toContain(
      "cadence_private.insert_behavior_configuration_event",
    );
    expect(updateSql).toContain(
      "A changed behavior configuration requires an event plan.",
    );
    expect(normalizedSql).toContain(
      "drop function public.create_behavior_with_schedule_graph(jsonb, jsonb, jsonb);",
    );
    expect(normalizedSql).toMatch(
      /drop function public\.update_behavior_with_schedule_graph\(\s*uuid, jsonb, jsonb, jsonb, timestamptz, jsonb, jsonb\s*\);/,
    );
  });

  it("adds one atomic Settings timezone boundary", () => {
    const functionSql = migrationSql.match(
      /create or replace function public\.update_profile_and_behavior_timezones_with_config_events[\s\S]+?\$\$;/,
    )?.[0];

    expect(functionSql).toContain("security definer");
    expect(functionSql).toContain("for update;");
    expect(functionSql).toContain("update public.profiles");
    expect(functionSql).toContain("update public.behaviors");
    expect(functionSql).toContain(
      "cadence_private.insert_behavior_configuration_event",
    );
    expect(functionSql).toContain("insert into public.occurrence_sync_state");
    expect(
      functionSql?.match(/insert into public\.occurrence_sync_state/g),
    ).toHaveLength(1);
    expect(functionSql).toContain("current_profile.timezone is distinct from target_timezone");
    expect(functionSql).toContain("Active behavior changed after it was read.");
    expect(functionSql).toContain("Profile timezone changed after it was read.");
  });

  it("wraps destructive restore so previous and next snapshots are checked in one transaction", () => {
    const functionSql = migrationSql.match(
      /create or replace function public\.apply_behaviorlog_restore_with_configuration_events[\s\S]+?\$\$;/,
    )?.[0];

    expect(functionSql).toContain("security definer");
    expect(functionSql).toContain("for update;");
    expect(functionSql).toContain("public.apply_behaviorlog_restore(restore_payload)");
    expect(functionSql).toContain(
      "cadence_private.insert_behavior_configuration_event",
    );
    expect(functionSql).toContain(
      "Restore requires exactly one event for every changed configuration.",
    );
    expect(functionSql).toContain("affected_behavior_ids");
    expect(functionSql).toContain("previous_configurations");
    expect(functionSql).toContain("derived_schedule_graphs");
    expect(functionSql).toContain("restored_schedule -> 'recurrence_rule'");
    expect(functionSql).toContain(
      "cadence_private.validate_behavior_schedule_graph",
    );
    expect(functionSql).not.toContain(
      "behavior_configuration_schedule_graphs",
    );
    expect(functionSql).toContain(
      "derived_schedule_graph := current_schedule_graph",
    );
  });

  it("removes authenticated access to definition-only write RPCs", () => {
    expect(normalizedSql).toContain(
      "revoke all on function public.create_behavior_with_definition_event(jsonb, jsonb) from authenticated;",
    );
    expect(normalizedSql).toMatch(
      /revoke all on function public\.update_behavior_with_definition_event\(\s*uuid, jsonb, jsonb, jsonb\s*\) from authenticated;/,
    );
  });

  it("prevents authenticated callers from bypassing configuration capture", () => {
    expect(normalizedSql).toContain(
      "revoke all on function cadence_private.insert_behavior_configuration_event( uuid, uuid, jsonb, jsonb, jsonb ) from public, anon, authenticated, service_role;",
    );
    expect(normalizedSql).toContain(
      "revoke all on function cadence_private.replace_behavior_schedule_graph( uuid, uuid, jsonb ) from authenticated;",
    );
    expect(normalizedSql).toContain(
      "revoke insert, update, delete on table public.behaviors from authenticated;",
    );
    expect(normalizedSql).toContain(
      "revoke insert on table public.behavior_definition_events from authenticated;",
    );
    expect(normalizedSql).toContain(
      "revoke insert, update, delete on table public.behavior_schedules from authenticated;",
    );
    expect(normalizedSql).toContain(
      "revoke insert, update, delete on table public.behavior_schedule_slots from authenticated;",
    );
    expect(normalizedSql).toContain(
      "revoke delete on table public.categories from authenticated;",
    );
  });
});
