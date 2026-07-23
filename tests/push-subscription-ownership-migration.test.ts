import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = join(process.cwd(), "supabase", "migrations");

describe("push subscription ownership migration", () => {
  it("deduplicates active endpoint owners before enforcing one active owner", () => {
    const migration = readdirSync(migrationsDirectory)
      .filter((file) => file.endsWith(".sql"))
      .map((file) => ({
        file,
        sql: readFileSync(join(migrationsDirectory, file), "utf8"),
      }))
      .find(({ sql }) =>
        sql.includes("push_subscriptions_active_endpoint_key"),
      );

    expect(migration, "ownership migration should exist").toBeDefined();
    expect(migration?.sql.trim().toLowerCase()).toMatch(/^begin;/u);
    expect(migration?.sql.trim().toLowerCase()).toMatch(/commit;$/u);
    expect(migration?.sql).toMatch(
      /lock table public\.push_subscriptions in share row exclusive mode/,
    );
    expect(migration?.sql).toMatch(
      /row_number\(\) over \(\s*partition by endpoint/,
    );
    expect(migration?.sql).toMatch(
      /update public\.push_subscriptions[\s\S]*set active = false/,
    );
    expect(migration?.sql).toMatch(
      /create unique index push_subscriptions_active_endpoint_key[\s\S]*on public\.push_subscriptions \(endpoint\)[\s\S]*where active/,
    );
    expect(migration?.sql.toLowerCase()).not.toContain("security definer");
    expect(migration?.sql.toLowerCase()).not.toContain("service_role");
  });
});
