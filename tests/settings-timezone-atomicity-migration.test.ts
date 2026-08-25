import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260825075255_fix_settings_timezone_conflict_errors.sql",
  ),
  "utf8",
);
const normalizedSql = migrationSql.replace(/\s+/g, " ");

describe("Settings timezone atomicity migration", () => {
  it("uses non-retryable errors for stale profile and Behavior inputs", () => {
    expect(migrationSql).not.toContain("errcode = '40001'");
    expect(migrationSql).toMatch(
      /Profile timezone changed after it was read\.[\s\S]+?errcode = 'P0001'/,
    );
    expect(migrationSql).toMatch(
      /Active behavior set changed after it was read\.[\s\S]+?errcode = 'P0001'/,
    );
    expect(migrationSql).toMatch(
      /Active behavior changed after it was read\.[\s\S]+?errcode = 'P0001'/,
    );
  });

  it("checks each locked Behavior after the profile update inside one function", () => {
    const profileUpdateIndex = migrationSql.indexOf("update public.profiles");
    const behaviorConflictIndex = migrationSql.indexOf(
      "Active behavior changed after it was read.",
    );

    expect(profileUpdateIndex).toBeGreaterThan(-1);
    expect(behaviorConflictIndex).toBeGreaterThan(profileUpdateIndex);
    expect(migrationSql).toContain("for update;");
    expect(migrationSql).toContain("update public.behaviors");
  });

  it("writes one timezone stale marker and preserves authenticated-only execute", () => {
    expect(
      migrationSql.match(/insert into public\.occurrence_sync_state/g),
    ).toHaveLength(1);
    expect(migrationSql).toContain("stale_reason = 'timezone_changed'");
    expect(normalizedSql).toContain(
      "revoke all on function public.update_profile_and_behavior_timezones_with_config_events( text, text, jsonb ) from public, anon, service_role;",
    );
    expect(normalizedSql).toContain(
      "grant execute on function public.update_profile_and_behavior_timezones_with_config_events( text, text, jsonb ) to authenticated;",
    );
  });
});
