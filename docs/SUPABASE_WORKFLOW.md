# Supabase CLI Workflow

Supabase work in this repository is CLI-first. Agents should not spend time rediscovering how to move local database work to the hosted project: use the commands and rules in this file.

Authoritative upstream docs checked during this setup:
- Local Development & CLI: install with `npm install supabase --save-dev`, initialize with `npx supabase init`, start with `npx supabase start`.
- Database Migrations: create migrations with `supabase migration new`, apply locally with `supabase migration up` or `supabase db reset`, deploy with `supabase db push`, and never change the hosted database directly once migrations exist.
- Generating TypeScript Types: generate local types with `supabase gen types typescript --local` or hosted types with `supabase gen types typescript --project-id "$PROJECT_REF" --schema public`.

## Installed pathway

The Supabase CLI is installed as a project dev dependency. Prefer the project-local binary so every agent uses the same version:

```bash
npm run supabase -- --version
npm run supabase -- <command>
```

Examples:

```bash
npm run supabase -- start
npm run supabase -- db reset
npm run supabase -- migration new create_initial_schema
```

`npx supabase <command>` is acceptable when quoting is simpler, but package scripts are the default in repo docs.

## Prerequisites

Local Supabase requires a container runtime compatible with Docker APIs, such as Docker Desktop, OrbStack, Rancher Desktop, or Podman.

Hosted Supabase commands require an authenticated CLI session and a linked project. Do not ask the user for API keys unless the task genuinely needs one. Prefer `supabase login`, which uses a Personal Access Token flow owned by the user.

## Local environment lifecycle

Use these commands during Ticket 002 and later Supabase work:

```bash
npm run supabase -- init      # only once, when the supabase/ directory does not exist
npm run supabase -- start     # starts local stack
npm run supabase -- status    # prints local API, DB, Studio, and auth URLs/keys
npm run supabase -- stop      # stops local stack
```

If the machine is on an untrusted public network, bind local Supabase to localhost through a Docker network before starting it, as recommended by Supabase docs:

```bash
docker network create -o 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1' local-network
npm run supabase -- start --network-id local-network
```

Never expose the local Supabase stack publicly.

## Schema change workflow

All schema work must be represented by migration files under `supabase/migrations/`.

1. Create a migration locally:

   ```bash
   npm run supabase -- migration new <short_description>
   ```

2. Edit the generated SQL file.

3. Apply and test locally:

   ```bash
   npm run supabase -- db reset
   ```

   Use `db reset` as the default verification because it proves a clean database can be recreated from migrations and seed data.

4. Update docs and generated types in the same task:
   - `docs/DATA_MODEL.md`
   - `lib/db/database.types.ts` after type generation exists
   - relevant resolver/service tests

5. Run the standard checks:

   ```bash
   npm run agents:check
   npm run resolvers:check
   npm run lint
   npm run typecheck
   npm run test
   npm run build
   ```

## Type generation

When the local stack is running, generate types from local schema:

```bash
mkdir -p lib/db
npm run supabase -- gen types typescript --local > lib/db/database.types.ts
```

When a hosted project is intentionally being inspected, generate hosted types with an explicit project ref:

```bash
npm run supabase -- gen types typescript --project-id "$SUPABASE_PROJECT_REF" --schema public > lib/db/database.types.ts
```

Do not paste generated types into docs. Commit the generated TypeScript file when schema changes require it.

## Hosted project workflow

Hosted project changes are gated. Only run hosted commands when the user has authorized the target project or the active ticket explicitly requires deployment.

```bash
npm run supabase -- login
npm run supabase -- link
npm run supabase -- migration list
npm run supabase -- db push
```

Rules:

- Migrations are the only normal path from local to hosted.
- Never change the hosted database directly in the Dashboard SQL editor or Table editor.
- Never use the hosted Dashboard to make schema changes that are not captured in git.
- Coordinate `supabase db push`; only one actor should push migrations at a time.
- Use `supabase migration list` before hosted deployment when there is any doubt about state.
- Do not run `supabase db push --include-seed` unless the ticket explicitly authorizes hosted seed data.

## Many-user RLS smoke QA

Use the project smoke command when a ticket calls for hosted or local
many-independent-user RLS verification:

```bash
npm run smoke:rls:local # local stack; ignores .env.local and requires loopback
npm run smoke:rls       # selected environment; hosted use requires authorization
```

The command reads `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` from the environment or `.env.local`. It uses the
service-role key only to create and delete two temporary auth users. It signs
those users in through ordinary publishable-key clients, creates one behavior
and owned time-session fixture per user, and verifies one account cannot read,
insert, or update another account's rows. It also verifies own-only,
foreign-only, and mixed-owner reads through both Ticket 094 time-session RPCs.

Do not print Supabase keys, temporary user ids, emails, or auth responses in
handoff notes. The command summary intentionally reports only counts.

## Ticket 094 time-session RPC workflow

Migration `20260812172823_add_time_session_query_rpcs.sql` adds two
authenticated owner-scoped reads and the evidence-backed
`occurrence_time_sessions_user_started_id_idx` index. Both functions are
`STABLE`, `SECURITY INVOKER`, use an empty `search_path`, require
`auth.uid()`, and retain owner RLS. Their exact signatures are:

- `public.list_my_occurrence_time_sessions(uuid[])`
- `public.list_my_occurrence_time_session_history(date, date, boolean, timestamptz, timestamptz, uuid, integer)`

The migration revokes each exact signature from `PUBLIC`, `anon`,
`authenticated`, and `service_role`. It then grants execute only to
`authenticated`. Do not replace either read with a service-role client.

The local Data API sets `max_rows = 1000`. This response cap is independent of
the arbitrary-ID function's 2,000-ID input guard. The repository normalizes
IDs, sends sequential batches of at most 2,000, and follows each batch through
1,000-row PostgREST response ranges. A typical 666-ID input returning fewer
than 1,000 sessions uses one request. An exact 1,000-row response requires a
continuation request. The repository deduplicates sessions by ID and restores
global `started_at ASC, id ASC` order across response pages and ID batches.
Do not remove response-range continuation because the current production input
usually returns fewer rows than IDs. The hosted row cap is not verified by the
local implementation. Confirm it before application deployment.

Historical reads do not send ID arrays. They join Occurrences and Time Sessions
inside PostgreSQL, filter by Occurrence `local_date`, and use 1,000-row
`(started_at, id)` keyset pages. The archive predicate is
`include_archived OR behavior.active`, preserving current Export semantics.
The service supplies one
`through_started_at` high-water value for the entire read. All-time reads send
`0001-01-01` as the required start-date sentinel. Analytics supplies its
resolved range, `includeArchived: true`, and injected `now`. Export uses this
path only when time tracking is requested and supplies its resolved dates,
archive choice, and injected `now`. Timeline and single-Occurrence reads stay
on the arbitrary-ID path. Repositories are the only RPC callers.

Verify this migration locally before any hosted rollout:

```bash
npm run supabase -- db reset
npm run --silent supabase -- gen types typescript --local > lib/db/database.types.ts
npm run test -- tests/time-sessions-rpc-migration.test.ts tests/time-sessions.repo.test.ts tests/analytics.service.test.ts tests/timeline.service.test.ts tests/export.service.test.ts tests/rls-smoke-script.test.ts
npm run smoke:rls:local
```

Also run the repository-wide completion checks from `AGENTS.md`. The RLS smoke
must use ordinary authenticated clients for both RPC reads. The service role
remains limited to exact temporary-user setup and cleanup.

Ticket 094's index decision used `EXPLAIN (ANALYZE, BUFFERS)` against a
rollback-only local fixture with 3,650 daily Occurrences and 7,300 stopped
sessions for one owner. The 90-day plan kept the existing Occurrence date
index. The all-time first page and a later cursor page changed from sequential
scan and sort plans to
`occurrence_time_sessions_user_started_id_idx`, improving those local runs from
2.801 ms to 0.798 ms and from 1.516 ms to 0.876 ms. Treat this as planning
evidence, not a hosted capacity benchmark.

Hosted rollout is migration-first and requires explicit authorization:

1. Confirm the linked target and compare hosted migration history with git.
2. Confirm the hosted Data API row cap is 1,000 before application deployment.
3. Push the additive migration with `npm run supabase -- db push`.
4. Verify both exact signatures, invoker mode, empty search path, grants, and
   two-account isolation through ordinary authenticated clients.
5. Deploy the compatible application only after the schema checks pass.
6. Smoke Behaviors ranges 7, 30, and 90, Timeline timing, and a time-tracking
   export. Check logs for request, permission, timeout, and isolation errors.

If application rollout fails, roll back the application first. Leave the
unused additive functions in place until a later migration removes them. Never
edit an applied migration or drop a hosted function manually.

## Synthetic many-account load fixtures

Ticket 064's read baseline uses the project-local Supabase stack only. The
target classification must be exactly `local`, and the resolved Supabase and
Cadence URLs must both be loopback. Do not infer safety from `.env.local`: it
may intentionally contain hosted credentials for another workflow. A hosted
URL, linked project, or valid hosted key is a preflight failure for Ticket 064.

The privilege boundary is strict:

- A server-side lifecycle process may receive the local service-role key for
  exact run-scoped Auth provisioning, cohort seeding, and cleanup, including
  their pre/post aggregate boundary checks.
- Account creation, password sign-in, and cookie preparation finish before
  timed route statistics.
- Each active virtual user receives one unique ordinary signed-in identity and
  cookie jar, including while it selects a public-document task. Identity
  exhaustion fails the user or run; it does not permit sharing.
- Timed product reads use ordinary sessions and normal RLS.
- The service-role key must not be written to the session file, exposed through
  a worker environment or command line, copied to a report, or made available
  to Locust.
- `npm run smoke:rls` must pass against the local target after the load run.

Disposable users must match the exact run-scoped
`cadence-load-...@example.invalid` convention. Provisioning is idempotent for
one exact run ID. Cleanup must reject blank, malformed, wildcard-bearing,
path-like, or overly broad selectors; use only the captured exact run and Auth
users; remove their owned rows and private session material; verify zero
residual fixtures; and be safe to retry. Never delete users by the
`example.invalid` domain alone or by a broad `cadence-load-` prefix.

Session artifacts are run-specific, ignored, outside tracked source, and
owner-only. They contain ordinary cookies plus the minimum cohort and owned
fixture selectors required by the reader. Do not log cookies, passwords,
tokens, keys, user IDs, emails, selectors, behavior titles, notes, response
bodies, or export contents. Retained results contain only aggregate cohort
counts and sanitized statistics.

The five data cohorts are `empty`, `typical_daily`, `review_heavy`,
`export_heavy`, and `heavy_schedule`. The heavy-schedule cohort is opt-in and
must not enter the default mix. A full default 100-user fixture may reserve five
additional inactive heavy-schedule identities for a separately tagged stage.
Default fixtures disable email reminders, omit push subscriptions, and do not
contact any provider or invoke reminder or occurrence processing.

Ticket 064 does not authorize:

- a hosted Supabase target, even for synthetic data;
- schema changes or hosted migration deployment;
- Auth-capacity measurement;
- product mutations, import, restore, account deletion, or other destructive
  load;
- Google OAuth automation, real email, Web Push, provider calls, or process
  routes;
- direct Dashboard SQL or Table Editor setup/cleanup.

Hosted synthetic load requires a later ticket's isolated staging target,
explicit user authorization, provider/platform coordination, cost and traffic
ceilings, monitoring, and its own cleanup proof. Missing authorization blocks
the run; it does not authorize production or a linked hosted project as a
fallback.

### Ticket 066 hosted staging load

Supabase's current production checklist recommends load testing in staging.
Use a dedicated synthetic-only Supabase staging project. Do not copy production
users, behaviors, notes, subscriptions, or recipients. Match the production-
relevant region, compute tier, migrations, RLS, indexes, and environment shape
without reusing the production project ref.

Before traffic, compare hosted migration history with git. Run the hosted RLS
smoke, Supabase advisors, a one-user product smoke, monitoring collection test,
and the exact-cleanup dry run. Record the project ref only in private task
notes. Locust receives ordinary sessions only. It never receives a service-role
key.

The current read-only discovery found the existing Supabase organization on
Pro and found no separate Cadence staging project. That discovery does not
authorize creating a project or running load. If the selected target uses Team
or Enterprise and the workload is heavy or prolonged, coordinate with
Supabase support at least two weeks ahead. Record the support reference in the
private stage manifest. Under the current production checklist, a Pro target
records coordination as not required, but every other isolation and safety
gate still applies.

References:

- <https://supabase.com/docs/guides/deployment/going-into-prod>
- <https://supabase.com/docs/guides/deployment/managing-environments>
- <https://supabase.com/changelog?types=breaking-change>

The end-to-end local procedure and failure recovery are documented in
`docs/LOAD_TESTING_RUNBOOK.md`. The canonical commands are
`npm run load:read:smoke`, `npm run load:read:baseline`,
`npm run load:read:ramp`, and `npm run load:read:full`; each owns setup through
verified cleanup for one independent exact run. The supervisor reads the
project-local values from `npm run supabase -- status -o env`, validates
loopback endpoints, and does not trust `.env.local`. Do not invoke raw Locust
in a way that bypasses local-target validation, identity allocation, integrity
checks, or exact cleanup.

Ticket 064 changes no schema. It requires a healthy local stack with the
current migrations, but it does not require `npm run supabase -- db reset`.
Use a reset for independent clean-migration verification after schema work,
never as load-fixture cleanup or failed-run recovery.

## Launch cost controls

Supabase's cost-control documentation and billing changelog were rechecked on
2026-08-01. Read-only Ticket 066 discovery identified the current organization
as Pro. It did not verify the Spend Cap setting, compute size, add-ons, current
usage, invoice estimate, billing contact, or notification delivery.

On Pro, the Spend Cap covers these current usage items:

- Disk Size
- Egress
- Edge Function Invocations
- Logs Ingest and Logs Query
- Monthly Active Users, SSO Users, and Third Party Users
- Realtime Messages and Realtime Peak Connections
- Storage Image Transformations and Storage Size

The Spend Cap does not currently cover:

- Compute, Branching Compute, or Read Replica Compute
- Custom Domain
- additionally provisioned Disk IOPS or Disk Throughput
- IPv4 address
- Log Drain Hours or Log Drain Events
- Multi-Factor Authentication Phone
- Point-in-Time Recovery

The Spend Cap is not a fine-grained budget and does not provide per-item
threshold notifications. Covered usage can be restricted after quota, but
already-incurred usage remains. Compute is billed independently while a
project runs. Provider restrictions may affect availability across an
organization. Recheck the current dashboard and documentation before every
setting change.

Before broad launch, an organization Owner must privately record:

1. the current billing cycle, plan, project count, compute size, disk posture,
   add-ons, included quotas, overage rates, and current baseline;
2. whether the Spend Cap is enabled;
3. the accepted availability tradeoff for every covered item;
4. the owner and backup who receive and have tested billing notifications;
5. compute and add-on exposure that remains when the cap is enabled.

Changing the Spend Cap, pausing a project, resizing compute, adding resources,
or changing a plan is a provider mutation. Each action requires exact owner
authorization. Ticket 067 never toggles these controls automatically.

Recovery after a restriction:

1. Capture aggregate usage, affected item, current restriction, project health,
   and migration state without identifiers or user data.
2. Stop the proven application source with the narrow Ticket 067 circuit
   breaker when possible.
3. Do not disable the Spend Cap or resize compute until the owner accepts the
   resulting cost.
4. Before resumption, verify migration congruence, advisors, RLS smoke,
   application integrity, queue state, and one ordinary authenticated flow.
5. Record the owner go decision. Provider restrictions may take time to clear
   after a billing-cycle reset.

References:

- <https://supabase.com/docs/guides/platform/cost-control>
- <https://supabase.com/docs/guides/platform/billing-on-supabase>
- <https://supabase.com/docs/guides/platform/manage-your-usage/compute>
- <https://supabase.com/changelog.md>

## Local and hosted congruence

The desired invariant is: git migrations define schema, local can reset from git, and hosted migration history matches git.

Default loop:

1. Pull latest git.
2. Run `npm run supabase -- db reset` locally.
3. Implement schema changes as a new migration.
4. Reset locally again.
5. Generate types.
6. Commit migration, docs, types, and tests together.
7. Push to hosted with `npm run supabase -- db push` only after verification and authorization.

If hosted appears ahead or different:

1. Stop and document the drift in the final response or `STATUS.md` if it affects handoff.
2. Run `npm run supabase -- migration list` to compare histories.
3. If direct hosted changes were made, use `npm run supabase -- db pull` to capture the hosted schema into a migration, review it, and commit it.
4. Use `npm run supabase -- migration repair` only when the migration history table is wrong and the real schema state is already understood. It updates tracking history; it does not apply or revert SQL.

## Agent decision table

| Scenario | Use CLI? | Command path |
|---|---:|---|
| Start local database/auth stack | Yes | `npm run supabase -- start` |
| Check local URLs and keys | Yes | `npm run supabase -- status` |
| Create schema change | Yes | `npm run supabase -- migration new <name>` |
| Verify migrations from scratch | Yes | `npm run supabase -- db reset` |
| Generate TypeScript database types | Yes | `npm run supabase -- gen types typescript --local > lib/db/database.types.ts` |
| Link hosted project | Yes, with user authorization | `npm run supabase -- login` then `npm run supabase -- link` |
| Deploy migrations to hosted | Yes, with user authorization | `npm run supabase -- db push` |
| Make hosted schema edit in dashboard | No | Create a migration locally instead |
| Investigate hosted drift | Yes, cautiously | `migration list`, then `db pull` only if needed |

## Secrets

Do not commit `.env`, `.env.local`, Supabase access tokens, service-role keys, or CLI config files.

`.env.example` contains names only. Real values belong in local env files, deployment secrets, or user-owned CLI auth storage.
