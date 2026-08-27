import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../supabase/migrations/20260827071000_make_behavior_edit_conflicts_nonretryable.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("behavior edit conflict migration", () => {
  it("keeps the stale update guard and makes it nonretryable", () => {
    expect(sql).toContain(
      "current_behavior.updated_at is distinct from expected_updated_at",
    );
    expect(sql).toContain(
      "Behavior schedule graph changed after it was read.",
    );
    expect(sql).toContain("using errcode = 'P0001'");
    expect(sql).not.toContain("using errcode = '40001'");
  });
});
