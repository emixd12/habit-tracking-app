import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260731041500_use_nonretryable_occurrence_contention_errors.sql",
  ),
  "utf8",
);
const normalizedSql = migrationSql.replace(/\s+/g, " ");

describe("occurrence contention error repair migration", () => {
  it("replaces exactly the two semantic stale errors without changing the RPC signature", () => {
    expect(migrationSql).toContain(
      "public.apply_occurrence_status_transition(uuid,text,uuid,text,timestamptz,timestamptz,text,timestamptz,timestamptz,text,text,boolean)",
    );
    expect(normalizedSql).toContain("if retryable_error_count <> 2 then");
    expect(migrationSql).toContain(
      "retryable_error_marker constant text := 'using errcode = ''40001'';'",
    );
    expect(migrationSql).toContain(
      "nonretryable_error_marker constant text := 'using errcode = ''P0001'';'",
    );
    expect(normalizedSql).toContain(
      "execute replace( function_definition, retryable_error_marker, nonretryable_error_marker );",
    );
  });

  it("documents why serialization-failure retry semantics are invalid here", () => {
    expect(migrationSql).toContain("40001 means serialization_failure");
    expect(migrationSql).toContain("application-level stale plans");
    expect(migrationSql).toContain(
      "rejects stale plans with a non-retryable application error",
    );
  });
});
