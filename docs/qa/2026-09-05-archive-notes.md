# Ticket 125: Archive notes

User approved optional archive notes and retention of every archive cycle.

## Implementation

- Shared `archive-note.resolver.ts` validates, appends, and edits dated entries.
- `BehaviorList.tsx` exposes the optional archive draft and archived history.
  Controlled fields preserve failed drafts. Edit/remove saves retain cycle IDs.
- Behavior services pass exact revisions; the existing graph transactions store
  notes atomically on web and desktop.
- Migration `20260906010951_add_behavior_archive_notes.sql` adds the Postgres
  JSONB field and extends create/update/import/restore/export/sync boundaries.
  SQLite migration 0012 upgrades local storage and known older backups.
- Export/import uses the Cadence extension. Include Notes governs text; older
  bundles preserve existing archive history when the extension is absent.
- Account-sync carries whole Behavior history and requires review for conflicts.
  JSON timestamps remain unchanged across native and hosted snapshot encoders.

## Verification

- Full suite: 1,516 passed, 25 opt-in tests skipped.
- Native tests: 69 passed. Real SQLite contracts: 17 passed.
- Real authenticated Postgres contract passed. It checks two archive cycles,
  retained notes through Restore, editing/removal, stale-write rollback,
  account isolation, and archive-note export/import/restore roundtrips.
- Account-sync RPC smoke passed with disposable local accounts.
- Root/core/desktop typechecks, lint, web/desktop builds, agent, interaction,
  resolver, design-system, desktop parity, and marketing checks/builds pass.
- Clean migration replay passed using the existing project-scoped loopback
  proxy. Generated database types match the local schema.
- SQL constraint smoke passed, including duplicate IDs and Unicode length limits.
- Lint reports seven existing warnings in the BehaviorLog reference fixture; no errors.
- Fresh read-only review returned `ship` with no findings after parent verification.

## Browser acceptance

Used the local server at localhost:4323 with a disposable synthetic account.
The browser showed: creation, archive with note, Restore, second archive, both
retained notes, earlier-note editing, text removal, and persistence after reload.
At 390px width the document width remained 390px. Keyboard focus and wrapped
controls stayed visible; the captured archive-history view showed both entries.
No hosted account or application data was used.

## Release limits

The desktop frontend and real native storage contracts are verified. This task
does not distribute a new signed desktop binary. Older desktop builds must
update before synchronizing Behavior writes; the hosted guard prevents note loss.

## Production release

The user authorized production rollout on 2026-09-05. PR #46 merged at
`d401cea83d9d71d140c20ec864763ad86101c45e`. The isolated branch excluded
unfinished export, reminder, and timezone changes. Its exact code passed 1,510
tests and every required check/build. Clean local migration replay, actual
Postgres lifecycle/portability contracts, SQL constraint smoke, and generated
type comparison passed. Fresh release review returned ship without findings.

- Hosted migration `20260906010951` applied before merge. Migration history
  matches the isolated release; hosted function lint reports no errors.
- Application: `dpl_6E7iZpSiPGw6KVmw5fPenpvJQ9A4`, Ready at the merge commit.
- Marketing: `dpl_BtqTHJpfw75ZSszBv55V9noAciTc`, Ready at the merge commit.
- Existing canonical production aliases remain unchanged.
- `/login` and marketing return 200. Protected app routes redirect to login.
  Reminder processing rejects unauthenticated calls with 401. Test login
  redirects with `test_login_unavailable`, matching its production contract.
- The new application deployment has no error/fatal runtime logs in the
  post-deploy scan. Project error groups contain only the previously documented
  web-push deprecation from the preceding deployment.
- No production user data, reminders, or email were mutated for smoke QA.
  Authenticated archive editing was verified locally before release.
- Local main now tracks the merge. Unrelated workspace edits were preserved,
  and the workspace-only export migration was restored in the local database.
