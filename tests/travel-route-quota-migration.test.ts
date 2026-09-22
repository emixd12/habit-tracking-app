import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = resolve(process.cwd(), "supabase/migrations/20260922013000_add_travel_route_quota.sql");

describe("travel route quota migration", () => {
  it("uses one atomic owner and global admission function without location fields", async () => {
    const sql = await readFile(migration, "utf8");
    expect(sql).toContain("create table public.travel_route_owner_quota");
    expect(sql).toContain("create table public.travel_route_global_quota");
    expect(sql).toContain("create or replace function public.consume_travel_route_quota()");
    expect(sql).toContain("owner_limit constant integer := 6");
    expect(sql).toContain("global_limit constant integer := 100");
    expect(sql).toContain("initial_budget_refreshes constant integer := 40");
    expect(sql.indexOf("pg_advisory_xact_lock")).toBeLessThan(sql.indexOf("select coalesce(sum(attempt_count)"));
    expect(sql.indexOf("select coalesce(sum(attempt_count)")).toBeLessThan(sql.indexOf("insert into public.travel_route_owner_quota as quota"));
    expect(sql).not.toMatch(/latitude|longitude|place_id|address|route_response/i);
  });
});
