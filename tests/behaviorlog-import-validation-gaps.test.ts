import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260827030343_close_behaviorlog_import_validation_gaps.sql",
    import.meta.url,
  ),
  "utf8",
);
const notesRepo = readFileSync(
  new URL("../lib/db/notes.repo.ts", import.meta.url),
  "utf8",
);
const atomicMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260827025303_make_behaviorlog_import_apply_atomic.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Ticket 086 import validation and dedup gaps", () => {
  it("enforces schedule ownership across Behavior and schedule ids", () => {
    expect(migration).toContain(
      "behavior_schedule_slots_schedule_behavior_owner_fkey",
    );
    expect(migration).toContain(
      "foreign key (user_id, behavior_id, behavior_schedule_id)",
    );
  });

  it("deduplicates imported notes by account and attachment", () => {
    expect(notesRepo).not.toContain('.eq("import_run_id", input.importRunId)');
    expect(notesRepo).toContain('.eq("target_type", input.targetType)');
    expect(notesRepo).toContain(
      '.eq("target_external_id", input.targetExternalId)',
    );
    expect(atomicMigration).toContain(
      "imported_note.user_id = current_user_id",
    );
  });
});
