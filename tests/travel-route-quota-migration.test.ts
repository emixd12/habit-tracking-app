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

const admissions = resolve(process.cwd(), "supabase/migrations/20260922200000_travel_route_quota_admissions.sql");

// Text-only: this suite cannot execute SQL. tests/sql/ticket-165-travel-budget-smoke.sql executes the
// 24th-allowed / 25th-rejected / unchanged-count behavior against a local database.
describe("travel route quota admissions migration", () => {
  it("allows 24 owner admissions and rejects without incrementing", async () => {
    const sql = await readFile(admissions, "utf8");
    expect(sql).toContain("create or replace function public.consume_travel_route_quota()");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("owner_limit constant integer := 24");
    expect(sql).toContain("global_limit constant integer := 100");
    expect(sql).toContain("initial_budget_refreshes constant integer := 40");
    expect(sql).toContain("if coalesce(owner_attempt_count, 0) >= owner_limit then");
    expect(sql).toContain("if coalesce(global_attempt_count, 0) >= global_limit then");
    const firstInsert = sql.indexOf("insert into public.travel_route_owner_quota");
    expect(sql.indexOf("pg_advisory_xact_lock")).toBeLessThan(sql.indexOf("select coalesce(sum(attempt_count)"));
    expect(sql.indexOf("owner_attempt_count, 0) >= owner_limit")).toBeLessThan(firstInsert);
    expect(sql.indexOf("global_attempt_count, 0) >= global_limit")).toBeLessThan(firstInsert);
    expect(sql.lastIndexOf("return query select false")).toBeLessThan(firstInsert);
    expect(sql).toContain("grant execute on function public.consume_travel_route_quota() to authenticated");
    expect(sql).toContain("revoke all on function public.consume_travel_route_quota() from anon");
    expect(sql).not.toMatch(/latitude|longitude|place_id|address|route_response/i);
  });
});
