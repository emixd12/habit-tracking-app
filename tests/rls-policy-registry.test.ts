import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION_DIR = join(process.cwd(), "supabase", "migrations");
const MIGRATION_SQL = [
  "20260607204951_create_database_schema.sql",
  "20260609202707_add_behavior_schedule_slots.sql",
  "20260612075036_add_occurrence_status_events.sql",
  "20260612221022_add_behaviorlog_import_tracking.sql",
  "20260618120000_add_imported_notes.sql",
  "20260618220226_add_imported_intervention_history.sql",
  "20260625204148_add_occurrence_sync_state.sql",
]
  .map((fileName) => readFileSync(join(MIGRATION_DIR, fileName), "utf8"))
  .join("\n");

const USER_OWNED_TABLES = [
  "profiles",
  "categories",
  "behaviors",
  "behavior_schedule_slots",
  "occurrences",
  "reminder_deliveries",
  "push_subscriptions",
  "occurrence_status_events",
  "occurrence_sync_state",
  "behaviorlog_import_runs",
  "behaviorlog_import_record_mappings",
  "imported_notes",
  "imported_interventions",
] as const;

const NORMALIZED_MIGRATION_SQL = MIGRATION_SQL.replace(/\s+/g, " ");

const AUTHENTICATED_TABLE_GRANTS = new Map<(typeof USER_OWNED_TABLES)[number], string>([
  ["profiles", "select, insert, update, delete"],
  ["categories", "select, insert, update, delete"],
  ["behaviors", "select, insert, update, delete"],
  ["behavior_schedule_slots", "select, insert, update, delete"],
  ["occurrences", "select, insert, update, delete"],
  ["reminder_deliveries", "select, insert, update, delete"],
  ["push_subscriptions", "select, insert, update, delete"],
  ["occurrence_status_events", "select, insert"],
  ["occurrence_sync_state", "select, insert, update, delete"],
  ["behaviorlog_import_runs", "select, insert, update, delete"],
  ["behaviorlog_import_record_mappings", "select, insert, update, delete"],
  ["imported_notes", "select, insert, update, delete"],
  ["imported_interventions", "select, insert, update, delete"],
]);

describe("RLS policy registry", () => {
  it("keeps every user-owned public table behind row level security", () => {
    for (const table of USER_OWNED_TABLES) {
      expect(MIGRATION_SQL).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
  });

  it("keeps every user-owned table scoped by auth.uid policies", () => {
    for (const table of USER_OWNED_TABLES) {
      const policyPattern = new RegExp(
        `create policy [\\s\\S]+?on public\\.${table}[\\s\\S]+?auth\\.uid\\(\\)`,
        "i",
      );

      expect(MIGRATION_SQL).toMatch(policyPattern);
    }
  });

  it("keeps every user-owned public table explicitly granted to authenticated clients", () => {
    for (const table of USER_OWNED_TABLES) {
      const expectedPrivileges = AUTHENTICATED_TABLE_GRANTS.get(table);

      expect(expectedPrivileges).toBeDefined();
      expect(NORMALIZED_MIGRATION_SQL).toMatch(
        new RegExp(
          `grant ${expectedPrivileges} on table public\\.${table} to [^;]*\\bauthenticated\\b[^;]*;`,
        ),
      );
    }
  });
});
