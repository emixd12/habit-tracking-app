import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hosted = readFileSync("supabase/migrations/20260922010000_add_travel_settings.sql", "utf8");
const local = readFileSync("apps/desktop/src-tauri/migrations/0016_travel_settings.sql", "utf8");

describe("travel settings migrations", () => {
  it("stores only owner-authored locations with owner RLS and disabled defaults", () => {
    expect(hosted).toContain("add column location_text text");
    expect(hosted).toContain("enabled boolean not null default false");
    expect(hosted).toContain("alter table public.travel_settings enable row level security");
    expect(hosted).toMatch(/travel_settings_select_own[\s\S]+auth\.uid\(\)[\s\S]+user_id/);
    expect(hosted).toMatch(/travel_settings_update_own[\s\S]+with check[\s\S]+auth\.uid\(\)[\s\S]+user_id/);
    expect(hosted).not.toMatch(/device_(latitude|longitude)|route_result|provider_response|place_id/);
  });

  it("keeps SQLite backup and account-sync shape compatible", () => {
    expect(local).toContain("CREATE TABLE travel_settings");
    expect(local).toContain("ALTER TABLE behaviors ADD COLUMN location_text");
    expect(hosted).toContain("'travel_enabled', settings.enabled");
    expect(hosted).toContain("'location_text'");
  });

  it("extends hosted Behavior graph writes and configuration history", () => {
    expect(hosted).toContain("location_text = nullif(behavior_payload ->> 'location_text', '')");
    expect(hosted).toContain("nullif(behavior_payload ->> 'location_text', ''),");
    expect(hosted).toContain("'location_text', behavior.location_text");
    expect(hosted).toContain("previous_configuration || jsonb_build_object('location_text', null)");
    expect(hosted).toContain("then array_append(changed_fields, 'location_text')");
  });
});
