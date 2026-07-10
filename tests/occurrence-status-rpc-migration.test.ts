import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260709203117_add_transactional_occurrence_status_change.sql",
  ),
  "utf8",
);
const normalizedSql = migrationSql.replace(/\s+/g, " ");
const functionSql = migrationSql.match(
  /create or replace function public\.apply_occurrence_status_transition[\s\S]+?\$\$;/,
)?.[0];
const normalizedFunctionSql = functionSql?.replace(/\s+/g, " ");

describe("transactional occurrence status migration", () => {
  it("does not manufacture provenance events for legacy resolved snapshots", () => {
    const functionStart = migrationSql.indexOf(
      "create or replace function public.apply_occurrence_status_transition",
    );

    expect(migrationSql.slice(0, functionStart).trim()).toBe("");
    expect(
      migrationSql.match(/insert into public\.occurrence_status_events/g),
    ).toHaveLength(1);
  });

  it("keeps the snapshot, event, and pending-reminder cancellation in one RPC transaction", () => {
    expect(functionSql).toBeDefined();
    expect(functionSql).toContain("security invoker");
    expect(functionSql).toContain("set search_path = ''");
    expect(functionSql).toContain("update public.occurrences as occurrence");
    expect(functionSql).toContain(
      "insert into public.occurrence_status_events",
    );
    expect(functionSql).toContain(
      "update public.reminder_deliveries as reminder_delivery",
    );
    expect(
      functionSql?.indexOf("update public.occurrences as occurrence"),
    ).toBeLessThan(
      functionSql?.indexOf("insert into public.occurrence_status_events") ?? -1,
    );
    expect(functionSql).toContain("if inserted_status_event.id is null then");
    expect(
      functionSql?.lastIndexOf(
        "update public.reminder_deliveries as reminder_delivery",
      ),
    ).toBeGreaterThan(
      functionSql?.indexOf("insert into public.occurrence_status_events") ?? -1,
    );
    expect(functionSql).not.toContain("exception when");
  });

  it("locks the owner row and rejects an ABA-stale latest-event token", () => {
    expect(functionSql).toContain("current_user_id uuid := auth.uid()");
    expect(functionSql).toContain("occurrence.user_id = current_user_id");
    expect(functionSql).toContain("for update;");
    expect(functionSql).toContain("into latest_status_event");
    expect(functionSql).toContain(
      "latest_status_event_id is distinct from expected_latest_event_id",
    );
    expect(functionSql?.indexOf("for update;")).toBeLessThan(
      functionSql?.indexOf("into latest_status_event") ?? -1,
    );
    expect(functionSql?.indexOf("into latest_status_event")).toBeLessThan(
      functionSql?.indexOf(
        "latest_status_event_id is distinct from expected_latest_event_id",
      ) ?? -1,
    );
    expect(functionSql).toContain(
      "Occurrence status history changed concurrently.",
    );
    expect(functionSql).toContain("using errcode = '40001'");
  });

  it("still serializes duplicate submissions without appending another event", () => {
    expect(functionSql).toContain(
      "if current_occurrence.status <> expected_status then",
    );
    expect(functionSql).toContain(
      "current_occurrence.status = planned_status",
    );
    expect(functionSql).toContain(
      "latest_status_event.previous_status = expected_status",
    );
    expect(functionSql).toContain(
      "latest_status_event.status = planned_status",
    );
    expect(functionSql).toContain(
      "latest_status_event.revises_event_id is not distinct from expected_latest_event_id",
    );
    expect(functionSql).toContain("'concurrent_duplicate', true");
  });

  it("does not append same-status events or rewrite non-null status timestamps", () => {
    expect(functionSql).toContain("if not status_changed then");
    expect(functionSql).toContain(
      "An unchanged occurrence status cannot append a status event.",
    );
    expect(functionSql).toContain(
      "current_occurrence.completed_at is not null",
    );
    expect(functionSql).toContain(
      "current_occurrence.status_marked_at is not null",
    );
    expect(functionSql).toContain(
      "An unchanged occurrence status cannot rewrite existing status timestamps.",
    );
    expect(normalizedFunctionSql).toContain(
      "completed_at = coalesce( current_occurrence.completed_at, planned_completed_at )",
    );
    expect(normalizedFunctionSql).toContain(
      "status_marked_at = coalesce( current_occurrence.status_marked_at, planned_status_marked_at )",
    );
  });

  it("uses the locked latest event for correction linking when one exists", () => {
    expect(functionSql).toMatch(
      /order by\s+status_event\.recorded_at desc,\s+status_event\.created_at desc,\s+status_event\.id desc/,
    );
    expect(normalizedFunctionSql).toContain(
      "case when planned_event_semantics = 'explicit_user_correction' then latest_status_event_id else null end,",
    );
    expect(functionSql).not.toContain(
      "A status correction requires an existing status event to revise.",
    );
    expect(
      functionSql?.match(
        /from public\.occurrence_status_events as status_event/g,
      ),
    ).toHaveLength(1);
  });

  it("rejects null or inconsistent plans before writing", () => {
    expect(functionSql).toContain("expected_status is null");
    expect(functionSql).toContain("planned_status is null");
    expect(functionSql).toContain(
      "A changed occurrence status requires a complete status-event plan.",
    );
    expect(functionSql).toContain(
      "Status-event semantics do not match the accepted status transition.",
    );
    expect(normalizedFunctionSql).toContain(
      "when expected_status = 'unresolved' and expected_latest_event_id is null then 'explicit_user_mark' else 'explicit_user_correction'",
    );
    expect(functionSql).toContain(
      "Manual status changes require manual-tap, high-confidence provenance.",
    );
    expect(functionSql).toContain(
      "planned_cancel_pending_reminders is distinct from (",
    );
    expect(functionSql).toContain(
      "Reminder-cancellation intent does not match the planned occurrence status.",
    );
    expect(normalizedFunctionSql).toContain(
      "and reminder_delivery.status = 'pending';",
    );
  });

  it("exposes the RPC only to authenticated callers", () => {
    expect(normalizedSql).toContain(
      "revoke all on function public.apply_occurrence_status_transition( uuid, text, uuid, text, timestamptz, timestamptz, text, timestamptz, timestamptz, text, text, boolean ) from public, anon, authenticated, service_role;",
    );
    expect(normalizedSql).toContain(
      "grant execute on function public.apply_occurrence_status_transition( uuid, text, uuid, text, timestamptz, timestamptz, text, timestamptz, timestamptz, text, text, boolean ) to authenticated;",
    );
  });
});
