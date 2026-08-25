import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260825072106_cap_push_subscriptions_and_rate_limit.sql",
  ),
  "utf8",
).toLowerCase();

describe("push subscription cap migration", () => {
  it("adds a fixed authenticated account registration limit", () => {
    expect(migration).toContain("push_subscription_registration");
    expect(migration).toContain("limit_count := 6");
    expect(migration).toContain("window_seconds integer := 60");
    expect(migration).toContain("auth.uid()");
  });

  it("cleans existing rows and retains only the 20 most recently used", () => {
    expect(migration).toContain(
      "lock table public.push_subscriptions in share row exclusive mode",
    );
    expect(migration).toContain("partition by user_id");
    expect(migration).toContain("order by updated_at desc, created_at desc, id desc");
    expect(migration).toContain("ranked.subscription_rank > 20");
  });

  it("serializes writes per owner and protects the newly registered row", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("hashtextextended(new.user_id::text, 82020)");
    expect(migration).toContain("active_subscription.id <> new.id");
    expect(migration).toContain("offset 19");
    expect(migration).toContain(
      "after insert or update of active on public.push_subscriptions",
    );
  });
});
