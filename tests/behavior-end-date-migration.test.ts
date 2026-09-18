import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20260918010200_archive_due_behaviors.sql",
), "utf8");
const normalized = sql.replace(/\s+/g, " ");

describe("scheduled Behavior archive migration", () => {
  it("uses the Behavior timezone and preserves the effective end-date boundary", () => {
    expect(normalized).toContain(
      "(processed_at at time zone behavior.timezone)::date >= behavior.end_date",
    );
    expect(normalized).toContain(
      "cadence_private.behavior_end_date_boundary( candidate.end_date, candidate.timezone )",
    );
    expect(normalized).toContain("'behavior_end_date_reached'");
    expect(normalized).toContain("'Automatically archived on the end date.'");
  });

  it("chooses the earlier instant when local midnight is ambiguous", () => {
    expect(normalized).toContain("min(candidate_instant) filter");
    expect(normalized).toContain(
      "candidate_instant at time zone timezone = local_timestamp",
    );
    expect(normalized).toContain("default_instant - interval '1 day'");
    expect(normalized).toContain("default_instant + interval '1 day'");
  });

  it("marks occurrence data stale and cancels pending reminders atomically", () => {
    expect(normalized).toContain("insert into public.occurrence_sync_state");
    expect(normalized).toContain("stale_reason = 'behavior_changed'");
    expect(normalized).toContain("update public.reminder_deliveries as delivery");
    expect(normalized).toContain("delivery.status = 'pending'");
  });

  it("takes the account writer lock before the Behavior row lock", () => {
    const accountLock = normalized.indexOf("pg_catalog.pg_advisory_xact_lock");
    const behaviorLock = normalized.indexOf("for update;");
    expect(accountLock).toBeGreaterThan(-1);
    expect(behaviorLock).toBeGreaterThan(accountLock);
    expect(normalized).toContain(
      "pg_catalog.hashtextextended(candidate.user_id::text, 0)",
    );
  });

  it("keeps owner and service batches separate", () => {
    expect(normalized).toContain("current_user_id uuid := (select auth.uid())");
    expect(normalized).toContain("auth.jwt() ->> 'role'");
    expect(normalized).toContain("<> 'service_role'");
    expect(normalized).toContain(
      "revoke all on function public.archive_due_behaviors(timestamptz, integer) from public, anon, authenticated",
    );
    expect(normalized).toContain(
      "grant execute on function public.archive_my_due_behaviors(integer) to authenticated",
    );
  });
});
