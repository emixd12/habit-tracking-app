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
npm run smoke:rls
```

The command reads `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` from the environment or `.env.local`. It uses the
service-role key only to create and delete two temporary auth users. It signs
those users in through ordinary publishable-key clients, creates one behavior
per user, and verifies one account cannot read, insert, or update another
account's rows.

Do not print Supabase keys, temporary user ids, emails, or auth responses in
handoff notes. The command summary intentionally reports only counts.

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
