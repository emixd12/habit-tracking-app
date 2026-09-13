import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260908003245_add_note_shortcut_states.sql", import.meta.url),
  "utf8",
).toLowerCase();

describe("Ticket 127 Note shortcut migration", () => {
  it("creates an owner-scoped constrained state table with RLS", () => {
    expect(migration).toContain("create table public.note_shortcut_states");
    expect(migration).toContain("primary key (user_id, id)");
    expect(migration).toContain("foreign key (user_id, behavior_id)");
    expect(migration).toContain("alter table public.note_shortcut_states enable row level security");
    expect(migration).toContain("grant select on table public.note_shortcut_states to authenticated");
    expect(migration).not.toContain("grant insert on table public.note_shortcut_states to authenticated");
    expect(migration).not.toContain("grant update on table public.note_shortcut_states to authenticated");
  });

  it("keeps reads under RLS and protects both atomic mutation boundaries", () => {
    expect(migration).toMatch(/create function public\.read_note_shortcut_context[\s\S]*?security invoker/);
    expect(migration).toMatch(/create function public\.commit_note_shortcut_state[\s\S]*?security definer[\s\S]*?auth\.uid\(\)/);
    expect(migration).toMatch(/create function public\.update_occurrence_note_with_shortcut[\s\S]*?security definer[\s\S]*?auth\.uid\(\)/);
    expect(migration).toContain("this shortcut changed elsewhere. refresh and try again.");
    expect(migration).toContain("a note shortcut source collection exceeds 100,000 rows.");
    expect(migration).toContain("the note shortcut context exceeds 64 mib.");
  });

  it("keeps schema version one while adding the closed sync entity", () => {
    expect(migration).toContain("'note_shortcut_state'");
    expect(migration).toContain("from public.note_shortcut_states r");
    expect(migration).not.toContain("'schemaversion', 2");
    expect(migration).toContain("on conflict (user_id, id) do update set");
  });
});
