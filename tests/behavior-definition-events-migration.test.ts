import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260709201516_add_behavior_definition_events.sql",
  ),
  "utf8",
);
const normalizedSql = migrationSql.replace(/\s+/g, " ");

describe("behavior definition events migration", () => {
  it("creates append-only authenticated access with owner-scoped RLS", () => {
    expect(migrationSql).toContain(
      "alter table public.behavior_definition_events enable row level security",
    );
    expect(migrationSql).toMatch(
      /create policy behavior_definition_events_select_own[\s\S]+?for select[\s\S]+?to authenticated[\s\S]+?auth\.uid\(\)/,
    );
    expect(migrationSql).toMatch(
      /create policy behavior_definition_events_insert_own[\s\S]+?for insert[\s\S]+?to authenticated[\s\S]+?auth\.uid\(\)/,
    );
    expect(migrationSql).not.toContain(
      "create policy behavior_definition_events_update",
    );
    expect(migrationSql).not.toContain(
      "create policy behavior_definition_events_delete",
    );
    expect(normalizedSql).toContain(
      "grant select, insert on table public.behavior_definition_events to authenticated;",
    );
  });

  it("backfills one system baseline at behavior creation time", () => {
    expect(normalizedSql).toContain(
      "insert into public.behavior_definition_events",
    );
    expect(normalizedSql).toContain("behaviors.created_at");
    expect(normalizedSql).toContain("'system'");
    expect(normalizedSql).toContain("'baseline_backfill'");
    expect(normalizedSql).toContain("from public.behaviors");
  });

  it("keeps baseline changed fields consistent with initial-event planning", () => {
    expect(normalizedSql).toContain("then array['title']::text[]");
    expect(normalizedSql).toContain(
      "else array['title', 'description']::text[]",
    );
  });

  it("keeps create and definition-event persistence in one owner-scoped invoker transaction", () => {
    const functionSql = migrationSql.match(
      /create or replace function public\.create_behavior_with_definition_event[\s\S]+?\$\$;/,
    )?.[0];

    expect(functionSql).toBeDefined();
    expect(functionSql).toContain("security invoker");
    expect(functionSql).toContain("set search_path = public");
    expect(functionSql).toContain("current_user_id uuid := (select auth.uid())");
    expect(functionSql?.indexOf("insert into public.behaviors")).toBeLessThan(
      functionSql?.indexOf("insert into public.behavior_definition_events") ?? -1,
    );
    expect(functionSql).toContain(
      "Definition event plan does not match behavior payload.",
    );
    expect(functionSql).toContain("behavior_payload ->> 'title'");
    expect(functionSql).toContain("behavior_payload ->> 'description'");
    expect(functionSql).toContain("definition_event_plan ->> 'next_title'");
    expect(functionSql).toContain(
      "definition_event_plan ->> 'next_description'",
    );
  });

  it("locks the owned current definition and rejects stale concurrent edit plans", () => {
    const functionSql = migrationSql.match(
      /create or replace function public\.update_behavior_with_definition_event[\s\S]+?\$\$;/,
    )?.[0];

    expect(functionSql).toBeDefined();
    expect(functionSql).toContain("security invoker");
    expect(functionSql).toContain("and user_id = current_user_id");
    expect(functionSql).toContain("for update;");
    expect(functionSql).toContain("current_behavior.title");
    expect(functionSql).toContain("current_behavior.description");
    expect(functionSql).toContain("expected_definition ->> 'stored_title'");
    expect(functionSql).toContain(
      "expected_definition ->> 'stored_description'",
    );
    expect(functionSql).toContain(
      "expected_definition ->> 'normalized_title'",
    );
    expect(functionSql).toContain("definition_event_plan ->> 'previous_title'");
    expect(functionSql).toContain(
      "definition_event_plan ->> 'previous_description'",
    );
    expect(functionSql).toContain("using errcode = '40001'");
    expect(functionSql).toContain(
      "A changed behavior definition requires an event plan.",
    );
    expect(functionSql).toContain(
      "expected_definition ->> 'stored_title'",
    );
    expect(functionSql).toContain(
      "Definition event plan does not match expected and next definitions.",
    );
    expect(functionSql?.indexOf("update public.behaviors")).toBeLessThan(
      functionSql?.indexOf("insert into public.behavior_definition_events") ?? -1,
    );
  });

  it("exposes only the two transactional entry points to authenticated callers", () => {
    for (const signature of [
      "create_behavior_with_definition_event(jsonb, jsonb)",
      "update_behavior_with_definition_event(uuid, jsonb, jsonb, jsonb)",
    ]) {
      expect(normalizedSql).toContain(
        `revoke all on function public.${signature} from public;`,
      );
      expect(normalizedSql).toContain(
        `revoke all on function public.${signature} from anon;`,
      );
      expect(normalizedSql).toContain(
        `grant execute on function public.${signature} to authenticated;`,
      );
    }

    expect(migrationSql).not.toMatch(
      /create trigger [\s\S]+? on public\.behaviors/,
    );
  });

  it("preserves an explicit imported creation time for the atomic baseline", () => {
    const functionSql = migrationSql.match(
      /create or replace function public\.create_behavior_with_definition_event[\s\S]+?\$\$;/,
    )?.[0];

    expect(functionSql).toContain("behavior_payload ->> 'created_at'");
    expect(functionSql).toContain(
      "Initial definition event must match behavior creation time.",
    );
    expect(functionSql).toContain("behavior_created_at");
  });

  it("preserves exact stored baseline text instead of silently canonicalizing it", () => {
    const backfillSql = migrationSql.slice(
      migrationSql.lastIndexOf("insert into public.behavior_definition_events"),
    );

    expect(backfillSql).toContain("behaviors.title");
    expect(backfillSql).toContain("behaviors.description");
    expect(backfillSql).not.toContain("btrim(");
  });
});
