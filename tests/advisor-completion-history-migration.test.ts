import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260921003928_revise_advisor_completion_history.sql",
  "utf8",
).replace(/\s+/g, " ").toLowerCase();

describe("advisor completion-history migration", () => {
  it("keeps the public RPC signatures and revises only the shared payload helper", () => {
    expect(migration).toContain(
      "create or replace function cadence_private.advisor_cadence_snapshot_payload( owner_id uuid, target_local_date date, history_start_local_date date, selected_behavior_ids uuid[], history_occurrence_limit integer, history_session_limit integer )",
    );
    expect(migration).not.toContain("function public.read_advisor_cadence_snapshot");
    expect(migration).not.toContain("function public.read_advisor_cadence_revision");
  });

  it("reads every manual status while keeping duration sessions completed-only", () => {
    const historyOccurrences = migration.match(/history_occurrences as \(([\s\S]*?)\), history_sessions as/)?.[1];
    const historySessions = migration.match(/history_sessions as \(([\s\S]*?)\) select jsonb_build_object/)?.[1];

    expect(historyOccurrences).toContain("occurrence.local_date >= history_start_local_date");
    expect(historyOccurrences).not.toContain("occurrence.status = 'completed'");
    expect(historySessions).toContain("occurrence.status = 'completed'");
    expect(migration).toContain("'status', occurrence.status");
    expect(migration).toContain("limit history_occurrence_limit + 1");
  });
});


it("extends the fenced private snapshot with existing mark times without adding capture fields", () => {
  const current = readFileSync("supabase/migrations/20260922034223_advisor_historical_completion_times.sql", "utf8");
  const previous = readFileSync("supabase/migrations/20260921003928_revise_advisor_completion_history.sql", "utf8");
  const withoutComment = current.slice(current.indexOf("begin;"));
  expect(withoutComment.replace(
    "'status', occurrence.status,\n        'statusMarkedAt', occurrence.status_marked_at",
    "'status', occurrence.status",
  )).toBe(previous);
  expect(current).not.toMatch(/alter table|add column|security definer/i);
});
