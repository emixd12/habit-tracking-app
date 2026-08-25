import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260825061411_protect_profile_email_and_reminder_delivery_state.sql",
  ),
  "utf8",
);

describe("profile email and reminder delivery integrity migration", () => {
  it("limits authenticated profile writes to timezone updates", () => {
    expect(MIGRATION).toContain(
      "revoke insert, update, delete on table public.profiles from authenticated;",
    );
    expect(MIGRATION).toContain(
      "grant update (timezone) on table public.profiles to authenticated;",
    );
  });

  it("syncs identity-provider email changes into the profile", () => {
    expect(MIGRATION).toContain(
      "create or replace function public.sync_profile_email_from_auth_user()",
    );
    expect(MIGRATION).toContain(
      "after update of email on auth.users",
    );
    expect(MIGRATION).toContain("set email = coalesce(new.email, '')");
    expect(MIGRATION).toContain("where id = new.id;");
  });

  it("blocks authenticated terminal recycling and claim clearing", () => {
    expect(MIGRATION).toContain("if current_user <> 'service_role' then");
    expect(MIGRATION).toContain(
      "old.status in ('sent', 'failed') and new.status = 'pending'",
    );
    expect(MIGRATION).toContain(
      "old.processing_started_at is not null",
    );
    expect(MIGRATION).toContain("new.processing_started_at is null");
    expect(MIGRATION).toContain(
      "before update on public.reminder_deliveries",
    );
  });

  it("keeps both trigger functions unavailable for direct authenticated calls", () => {
    for (const functionName of [
      "sync_profile_email_from_auth_user",
      "guard_reminder_delivery_state_update",
    ]) {
      expect(MIGRATION).toContain(
        `revoke all on function public.${functionName}() from public;`,
      );
      expect(MIGRATION).toContain(
        `revoke all on function public.${functionName}() from anon;`,
      );
      expect(MIGRATION).toContain(
        `revoke all on function public.${functionName}() from authenticated;`,
      );
    }
  });
});
