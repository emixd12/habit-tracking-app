import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260717161342_repair_schedule_integrity_and_atomic_behavior_writes.sql",
  ),
  "utf8",
);
const normalizedSql = migrationSql.replace(/\s+/g, " ");

describe("Ticket 060 schedule integrity migration", () => {
  it("discovers every empty owned schedule and inserts one exact compatibility slot", () => {
    const repairSql = migrationSql.match(
      /create or replace function cadence_private\.repair_empty_behavior_schedules[\s\S]+?\$\$;/,
    )?.[0];

    expect(repairSql).toBeDefined();
    expect(repairSql).toContain("not exists (");
    expect(repairSql).toContain("from public.behavior_schedule_slots as slots");
    expect(repairSql).toContain("slots.behavior_schedule_id = schedules.id");
    expect(repairSql).toContain("behaviors.scheduled_time");
    expect(normalizedSql).toContain("'exact', null, behaviors.scheduled_time, null, 0");
    expect(repairSql).toContain("on conflict (behavior_schedule_id, start_time)");
    expect(migrationSql).not.toMatch(
      /2026-07-(03|10|17)|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );
  });

  it("repairs only active-schedule occurrences and preserves every existing row", () => {
    expect(normalizedSql).toContain("and behaviors.active = true");
    expect(normalizedSql).toContain("'unresolved'");
    expect(normalizedSql).toContain(
      "on conflict (behavior_id, scheduled_for) do nothing;",
    );
    expect(migrationSql).not.toMatch(/update public\.occurrences/);
    expect(migrationSql).not.toMatch(/delete from public\.occurrences/);
    expect(migrationSql).not.toContain("occurrence_status_events");
    expect(migrationSql).not.toContain("reminder_deliveries");
    expect(normalizedSql).toContain("stale_reason = 'manual_repair'");
  });

  it("keeps one-time SQL recurrence expansion aligned with every resolver rule", () => {
    const recurrenceSql = migrationSql.match(
      /create or replace function cadence_private\.ticket_060_matches_recurrence[\s\S]+?\$\$;/,
    )?.[0];

    expect(recurrenceSql).toBeDefined();
    expect(recurrenceSql).toContain("when 'daily'");
    expect(recurrenceSql).toContain("when 'interval_days'");
    expect(recurrenceSql).toContain("when 'weekly'");
    expect(recurrenceSql).toContain("date_trunc('week', candidate_date)");
    expect(recurrenceSql).toContain("when 'monthly'");
    expect(recurrenceSql).toContain("least(requested_day, last_day)");
    expect(normalizedSql).toContain(
      "(behaviors.created_at at time zone behaviors.timezone)::date",
    );
    expect(normalizedSql).toContain(
      "(repair_now at time zone behaviors.timezone)::date + 30",
    );
    expect(normalizedSql).toContain("select min(candidate)");
  });

  it("validates and replaces each manual schedule graph inside owner-scoped invoker RPCs", () => {
    for (const functionName of [
      "create_behavior_with_schedule_graph",
      "update_behavior_with_schedule_graph",
    ]) {
      const functionSql = migrationSql.match(
        new RegExp(
          `create or replace function public\\.${functionName}[\\s\\S]+?\\$\\$;`,
        ),
      )?.[0];

      expect(functionSql).toBeDefined();
      expect(functionSql).toContain("security invoker");
      expect(functionSql).toContain("set search_path = ''");
      expect(functionSql).toContain("current_user_id uuid := (select auth.uid())");
      expect(functionSql).toContain(
        "cadence_private.validate_behavior_schedule_graph",
      );
      expect(functionSql).toContain(
        "cadence_private.replace_behavior_schedule_graph",
      );
      expect(functionSql).toContain("stale_reason");
      expect(functionSql).toContain("'behavior_changed'");
    }
  });

  it("retains definition and schedule ABA guards and rejects cross-owner graph ids", () => {
    const updateSql = migrationSql.match(
      /create or replace function public\.update_behavior_with_schedule_graph[\s\S]+?\$\$;/,
    )?.[0];
    const replacementSql = migrationSql.match(
      /create or replace function cadence_private\.replace_behavior_schedule_graph[\s\S]+?\$\$;/,
    )?.[0];

    expect(updateSql).toContain("for update;");
    expect(updateSql).toContain("current_behavior.updated_at");
    expect(updateSql).toContain("expected_updated_at");
    expect(updateSql).toContain("current_schedule_graph is distinct from");
    expect(updateSql).toContain("expected_schedule_graph");
    expect(updateSql).toContain("public.update_behavior_with_definition_event");
    expect(replacementSql).toContain("and user_id = target_user_id");
    expect(replacementSql).toContain("and behavior_id = target_behavior_id");
    expect(replacementSql).toContain("using errcode = '40001'");
  });

  it("exposes only the two public atomic entry points to authenticated callers", () => {
    expect(normalizedSql).toContain(
      "revoke all on function public.create_behavior_with_schedule_graph(jsonb, jsonb, jsonb) from public;",
    );
    expect(normalizedSql).toContain(
      "revoke all on function public.create_behavior_with_schedule_graph(jsonb, jsonb, jsonb) from anon;",
    );
    expect(normalizedSql).toContain(
      "grant execute on function public.create_behavior_with_schedule_graph(jsonb, jsonb, jsonb) to authenticated;",
    );
    expect(normalizedSql).not.toMatch(
      /grant execute on function public\.(create|update)_behavior_with_schedule_graph[\s\S]+?service_role/,
    );
    expect(normalizedSql).toContain(
      "revoke all on function cadence_private.repair_empty_behavior_schedules(timestamptz) from public;",
    );
  });
});
