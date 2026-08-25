import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  "supabase/migrations/20260825080815_add_occurrence_sync_batch_order_index.sql",
  "utf8",
).toLowerCase();
const repositorySource = readFileSync("lib/db/profiles.repo.ts", "utf8");

describe("occurrence sync batch index migration", () => {
  it("matches the repository's complete deterministic batch order", () => {
    expect(migrationSql).toMatch(
      /create index occurrence_sync_state_batch_order_idx\s+on public\.occurrence_sync_state\s*\(\s*stale desc,\s*synced_through_local_date asc nulls first,\s*updated_at asc,\s*user_id asc\s*\);/,
    );

    const orderedCalls = [
      '.order("stale", { ascending: false })',
      '.order("synced_through_local_date", {',
      "ascending: true,",
      "nullsFirst: true,",
      '.order("updated_at", { ascending: true })',
      '.order("user_id", { ascending: true })',
      ".limit(options.limit)",
    ];

    let cursor = -1;
    for (const call of orderedCalls) {
      const nextCursor = repositorySource.indexOf(call, cursor + 1);
      expect(nextCursor, `${call} must follow the previous batch-order clause`).toBeGreaterThan(
        cursor,
      );
      cursor = nextCursor;
    }
  });
});
