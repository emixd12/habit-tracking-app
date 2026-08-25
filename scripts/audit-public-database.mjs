import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  PUBLIC_AUTHENTICATED_FUNCTIONS,
  PUBLIC_DATA_API_RELATIONS,
} from "./supabase-rls-smoke.mjs";

const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

function queryJson(sql) {
  const result = spawnSync(
    "psql",
    [LOCAL_DATABASE_URL, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
    {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.status !== 0 || result.error) {
    throw new Error("Unable to read the project-local PostgreSQL catalog.");
  }

  return JSON.parse(result.stdout.trim());
}

export function auditPublicDatabase() {
  const catalog = queryJson(`
    with relations as (
      select
        c.relname as name,
        c.relkind,
        c.relrowsecurity as rls,
        has_table_privilege('anon', c.oid, 'select,insert,update,delete') as anon_grant,
        has_table_privilege('authenticated', c.oid, 'select') as authenticated_select
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v', 'm')
    ), functions as (
      select
        p.proname as name,
        has_function_privilege('anon', p.oid, 'execute') as anon_execute,
        has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
        p.prosecdef as security_definer,
        coalesce(p.proconfig, '{}')::text like '%search_path%' as search_path_pinned
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
    ), policies as (
      select count(*) filter (
        where roles && array['public', 'anon']::name[]
      ) as anonymous_policy_count
      from pg_policies
      where schemaname = 'public'
    )
    select json_build_object(
      'relations', (select json_agg(relations order by name) from relations),
      'functions', (select json_agg(functions order by name) from functions),
      'anonymous_policy_count', (select anonymous_policy_count from policies)
    );
  `);
  const relations = catalog.relations ?? [];
  const functions = catalog.functions ?? [];
  const expectedRelations = PUBLIC_DATA_API_RELATIONS.map(({ table }) => table).sort();
  const actualRelations = relations.map(({ name }) => name).sort();
  const views = relations.filter(({ relkind }) => relkind === "v" || relkind === "m");
  const unprotectedTables = relations.filter(
    ({ relkind, rls }) => (relkind === "r" || relkind === "p") && !rls,
  );
  const unauthenticatedFunctions = functions.filter(({ anon_execute }) => anon_execute);
  const authenticatedFunctions = functions
    .filter(({ authenticated_execute }) => authenticated_execute)
    .map(({ name }) => name)
    .sort();
  const unpinnedDefiners = functions.filter(
    ({ security_definer, search_path_pinned }) =>
      security_definer && !search_path_pinned,
  );

  if (JSON.stringify(actualRelations) !== JSON.stringify(expectedRelations)) {
    throw new Error("The public relation inventory differs from the audited registry.");
  }
  if (views.length > 0) {
    throw new Error("The public schema exposes an unregistered view.");
  }
  if (unprotectedTables.length > 0) {
    throw new Error("A public table does not have row level security enabled.");
  }
  if (catalog.anonymous_policy_count !== 0) {
    throw new Error("A public policy authorizes an anonymous Data API role.");
  }
  if (unauthenticatedFunctions.length > 0) {
    throw new Error("A public function remains executable by the anonymous role.");
  }
  if (
    JSON.stringify(authenticatedFunctions) !==
    JSON.stringify([...PUBLIC_AUTHENTICATED_FUNCTIONS].sort())
  ) {
    throw new Error("The authenticated public function inventory differs from the registry.");
  }
  if (unpinnedDefiners.length > 0) {
    throw new Error("A SECURITY DEFINER function lacks a pinned search path.");
  }

  return {
    public_tables: relations.length,
    public_views: views.length,
    rls_tables: relations.filter(({ rls }) => rls).length,
    anonymous_table_grants: relations.filter(({ anon_grant }) => anon_grant).length,
    anonymous_policies: catalog.anonymous_policy_count,
    public_functions: functions.length,
    anonymous_executable_functions: unauthenticatedFunctions.length,
    authenticated_executable_functions: authenticatedFunctions.length,
    pinned_security_definer_functions: functions.filter(
      ({ security_definer, search_path_pinned }) =>
        security_definer && search_path_pinned,
    ).length,
  };
}

function main() {
  console.log(JSON.stringify(auditPublicDatabase()));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
