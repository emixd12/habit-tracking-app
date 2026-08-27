import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260827065231_fix_overlapping_occurrence_identity.sql",
  ),
  "utf8",
);
const normalizedSql = migrationSql.replace(/\s+/g, " ");

describe("Ticket 085 occurrence identity migration", () => {
  it("swaps to a generated range-aware conflict target", () => {
    expect(normalizedSql).toContain(
      "drop constraint if exists occurrences_behavior_id_scheduled_for_key",
    );
    expect(normalizedSql).toContain(
      "add column if not exists schedule_range_identity bigint generated always as",
    );
    expect(normalizedSql).toContain(
      "unique ( behavior_id, local_date, schedule_start_time, schedule_range_identity )",
    );
    expect(normalizedSql).toContain(
      "on conflict ( behavior_id, local_date, schedule_start_time, schedule_range_identity ) do nothing",
    );
  });

  it("reports and backfills only missing overlapping range identities", () => {
    const migrationBeforeFunction = migrationSql.split(
      "create or replace function public.apply_occurrence_generation_plan",
    )[0];

    expect(migrationSql).toContain("ticket_085_occurrence_backfill");
    expect(migrationSql).toContain("ticket_085_matches_recurrence");
    expect(migrationSql).not.toContain("ticket_060_matches_recurrence");
    expect(normalizedSql).toContain(
      "drop function cadence_private.ticket_085_matches_recurrence(jsonb, date, date)",
    );
    expect(normalizedSql).toContain(
      "having count(distinct schedule_range_identity) > 1",
    );
    expect(normalizedSql).toContain(
      "Ticket 085 detected % duplicate-suppressed occurrence(s) across % account(s).",
    );
    expect(migrationBeforeFunction).not.toMatch(/update public\.occurrences/i);
    expect(migrationBeforeFunction).not.toMatch(/delete from public\.occurrences/i);
  });

  it("updates the atomic generation RPC for identity and instant changes", () => {
    const functionSql = migrationSql.match(
      /create or replace function public\.apply_occurrence_generation_plan[\s\S]+?\$\$;/,
    )?.[0];

    expect(functionSql).toContain("previous_scheduled_for timestamptz");
    expect(functionSql).toContain("scheduled_for = planned.scheduled_for");
    expect(functionSql).toContain(
      "occurrence.scheduled_for = planned.previous_scheduled_for",
    );
  });
});
