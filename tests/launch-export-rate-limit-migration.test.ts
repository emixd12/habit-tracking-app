import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260801051601_add_launch_export_rate_limit.sql",
  ),
  "utf8",
).toLowerCase();

describe("launch export rate limit migration", () => {
  it("creates an owner-scoped RLS table with read-only client access", () => {
    expect(migration).toContain("create table public.launch_rate_limits");
    expect(migration).toContain("user_id uuid not null");
    expect(migration).toContain(
      "alter table public.launch_rate_limits enable row level security",
    );
    expect(migration).toMatch(
      /create policy [\s\S]+?on public\.launch_rate_limits[\s\S]+?auth\.uid\(\)/,
    );
    expect(migration).toContain(
      "grant select on table public.launch_rate_limits to authenticated",
    );
    expect(migration).not.toContain(
      "grant insert, update, delete on table public.launch_rate_limits to authenticated",
    );
  });

  it("uses one atomic authenticated RPC with a fixed export policy", () => {
    expect(migration).toContain(
      "create or replace function public.consume_launch_rate_limit",
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("export_download");
    expect(migration).toContain("limit_count := 6");
    expect(migration).toContain("window_seconds integer := 60");
    expect(migration).toContain(
      "grant execute on function public.consume_launch_rate_limit(text) to authenticated",
    );
    expect(migration).toContain(
      "revoke all on function public.consume_launch_rate_limit(text) from anon",
    );
  });
});
