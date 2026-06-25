import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260625221334_harden_internal_function_permissions.sql",
  ),
  "utf8",
);

describe("Supabase internal function permission hardening", () => {
  it("pins the updated-at trigger function search path", () => {
    expect(MIGRATION).toContain("create or replace function public.set_updated_at()");
    expect(MIGRATION).toContain("set search_path = public");
  });

  it("removes direct execute grants from internal trigger functions", () => {
    for (const fn of ["set_updated_at", "handle_new_user"]) {
      expect(MIGRATION).toContain(
        `revoke all on function public.${fn}() from public;`,
      );
      expect(MIGRATION).toContain(
        `revoke all on function public.${fn}() from anon;`,
      );
      expect(MIGRATION).toContain(
        `revoke all on function public.${fn}() from authenticated;`,
      );
    }
  });
});
