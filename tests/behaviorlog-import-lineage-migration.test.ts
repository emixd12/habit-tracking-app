import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260831001533_preserve_unknown_imported_configuration_lineage.sql", "utf8");
describe("imported occurrence lineage migration", () => {
  it("replaces the existing private function assignment without widening permissions", () => {
    const original = readFileSync("supabase/migrations/20260827025303_make_behaviorlog_import_apply_atomic.sql", "utf8");
    const target = "select current_configuration_event_id into configuration_event_id\n      from public.behaviors where user_id = current_user_id and id = behavior_id;";
    expect(original.split(target)).toHaveLength(2);
    expect(migration).toContain(target.replace("\n", "\\n"));
    expect(migration).toContain("'cadence_private.apply_behaviorlog_import(jsonb)'::regprocedure");
    expect(migration).toContain("'configuration_event_id := null;'");
    expect(migration).toContain("raise exception 'Expected imported occurrence configuration assignment was not found'");
    expect(migration.trim().startsWith("begin;")).toBe(true);
    expect(migration.trim().endsWith("commit;")).toBe(true);
    expect(migration).not.toMatch(/\bgrant\b|\brevoke\b|\bdrop\b/i);
  });
});
