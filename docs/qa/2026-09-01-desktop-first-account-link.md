# Ticket 119 first account-link QA

Date: 2026-09-01

## Outcome

Ticket 119 is complete. The decision surface and corrected installed Cancel,
Ignore, Import, retry, protected-backup, and conflict-routing cases pass. The
preview.14 cross-ticket release checks also pass.

## Verified

- Typed snapshot classification distinguishes untouched seed data from product,
  profile, category, history, delivery-history, and provenance changes.
- Component tests cover import, ignore, cancel, automatic hydrate, completion,
  the exact protected-backup path, conflict routing, commit order, and injected
  hosted, backup, and local failures.
- Native tests cover schema-8 baseline persistence, exact idempotent replay,
  substitution rejection, and the owner-only protected backup.
- Hosted reads use the authenticated Supabase client, RLS-owned tables,
  100,000-row limits, a 64-MiB canonical snapshot limit, and abortable 30-second
  reads.
- Hosted import reuses `public.apply_behaviorlog_import(jsonb)`. Local hydrate
  reuses the reviewed BehaviorLog restore plan and one atomic native apply.
- The baseline saves only after the selected hosted operation and local apply
  complete. Deterministic identifiers make interrupted retries idempotent.
- The separate ad-hoc bundle built successfully at
  `apps/desktop/src-tauri/target/release/bundle/macos/Cadence Ticket 119 QA.app`.
- The bundle used identifier `app.cadence.desktop.ticket119qa` and its distinct
  Application Support database. Settings exposed Import, Ignore, and Cancel.
- Cancel removed incomplete link state and returned the bundle to local mode.
- The earlier divergent Ignore run stopped at a generic error. It did not open
  the whole-plan conflict review and therefore did not satisfy conflict routing.
- SQLite contained migrations 1–9. `integrity_check` returned `ok`,
  `foreign_key_check` returned no rows, `account_sync_baselines` contained zero
  rows, and `account_first_link_attempts` retained one stable Ignore attempt for
  exact retry.

## Checks

- `npm run agents:check`: passed.
- `npm run interactions:check`: passed.
- `npm run resolvers:check`: passed.
- `npm run lint`: passed with seven existing fixture warnings.
- `npm run typecheck`: passed.
- Final `npm run test`: 1,463 passed and 23 skipped.
- `npm run build`: passed.
- `npm run build --workspace @cadence/desktop`: passed.
- Final native suite: 59 passed.
- `git diff --check`: passed.

## Release follow-up

The service now falls back to the account-sync planner when restore cannot
represent the hosted snapshot. An unchanged local copy treats itself as the
common source, so hosted-success retry applies only the hosted delta. A changed
local copy preserves both intentions and opens the existing whole-plan conflict
review. Focused tests cover reconciled-baseline ordering and divergent routing.
Installed hosted-import retry and conflict-decision acceptance passed in the
final native matrix.

Schema 10 now persists the bounded pre-attempt AccountSync snapshot with the
stable attempt. Restart retry therefore distinguishes a local deletion from
absence and cannot silently resurrect the hosted row. Pre-import preview
conflicts still use an explicit empty baseline because neither copy committed.
If a protected row was deleted after the hosted commit, retry stops with an
explicit cancel-and-restart instruction before either copy changes. A migrated
schema-9 pending attempt backfills only when its complete local fingerprint is
unchanged; otherwise it stops with the same safe instruction.

## Two-copy hosted checkpoint

Two isolated schema-10 QA apps linked the same disposable ordinary account and
completed automatic hydration from its untouched hosted seed. QA A's first
post-baseline insert then failed before a hosted write. The hosted apply
function treated a missing row as SQL NULL while the insert plan carried JSON
null as its expected value. No baseline advanced and the hosted fixture stayed
at one profile, eight seed categories, and zero product rows.

Migration `20260901182100_fix_account_sync_insert_compare.sql` normalizes the
missing stored value to JSON null for compare-and-set. A clean local reset
loaded the corrected function definition, and the local ordinary-user
account-sync smoke passed. The correction and later migrations through
`20260901203000` are deployed and congruent. Hosted account-sync smoke passed,
and hosted RLS passed 92 checks. The obsolete unguarded
`auth_complete_first_link` function is removed. The root QA `cadence.sqlite3`
was moved outside the repository. The hydration revision fix passed native QA.
Installed retry now reaches the corrected converged baseline.

## Corrected installed first-link acceptance

The Ignore case selected `ignore`. Every saved fingerprint matched
`6911d097b519e00f1f05487aaefda5d36ccb630c3d078178dd7a5d4586c7037b`.
The live copy contained only `Matrix account winner`. The protected mode-600
backup contained only `Ignore me local`:

`~/Library/Application Support/app.cadence.desktop.qa-b/Backups/<protected-backup>.sqlite3`

The live copy had zero pending changes. Hosted data remained unchanged.

After a fresh Remove and creation of local `Import me local`, the Import case
selected `import` and succeeded. The live copy contained `Import me local` and
`Matrix account winner`, saved baseline prefix `ccbb658424a3`, and had zero
pending changes. SQLite integrity was `ok`, and the foreign-key check returned
no rows. Hosted state then contained two Behaviors, 64 Occurrences, seven
definition events, and one status event. Remove created this safety backup
before the Import reset:

`~/Library/Application Support/app.cadence.desktop.qa-b/Backups/<protected-backup>.sqlite3`

Ticket 119 is complete after preview.14 cross-ticket release acceptance.

The final post-classifier agent, interaction, resolver, lint, type, desktop
type, test, web build, desktop build, and native checks pass. Only the existing
lint and chunk-size warnings remain. Preview.8 and preview.9 are superseded and
unpublished. The unique revoked-session native UI and Keep-local cleanup path
now pass. Preview.14 final release acceptance also passes.
