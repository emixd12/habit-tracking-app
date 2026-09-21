# Behavior planning fields — Tickets 142–143

Source verification: September 17, 2026. Hosted release: September 18, 2026.
Preview.41 installed September 19 with schema-upgrade and synchronization acceptance.
Feature-specific native UI acceptance remains pending. See
`2026-09-19-desktop-sync-compatibility.md`.

## Implemented contract

- Optional default duration: whole minutes, 1–1,440; blank clears it. Timeline
  uses it before the measured estimate. Tracked-time records and averages remain
  independent.
- Optional end date: the first archived local day in the Behavior timezone.
  Hosted and foreground lifecycle processing archive due Behaviors. Desktop
  catches up on launch, resume, day change, and refresh.
- Automatic archive retains history and records a durable in-app notification.
  It cancels pending reminders. Restore clears the expired date and notice.
- Postgres and SQLite persist all fields through edits, synchronization,
  BehaviorLog import/restore, and full exports.

## Verification

- `agents:check`, `interactions:check`, `resolvers:check`, `core:check`,
  `desktop:parity:check`, and `design-system:check`: passed.
- `lint`: passed, with ten existing warnings outside this change.
- `typecheck` and `desktop:typecheck`: passed.
- `test`: 221 files passed; 1,786 tests passed and 29 skipped.
- `build` and `desktop:build`: passed. Desktop retains its bundle-size warning.
- `desktop:native:test`: 106 passed.
- `desktop:contract:test`: 20 passed, one skipped.
- `CADENCE_SUPABASE_CONTRACT=1 npx vitest run
  tests/behavior-store-supabase.contract.test.ts`: passed against local Supabase.
- Clean `supabase db reset --network-id cadence-local`: passed, including both
  new migrations. Database types were generated from the local schema.
- `tests/sql/behavior-end-date-lifecycle-smoke.sql`: passed against local
  Postgres. The transaction rolls back its synthetic records. It verifies
  owner isolation, service-role restrictions, live end-date rejection of stale
  generation plans, delayed effective history,
  reminder cancellation, delayed generated-row cleanup, and ambiguous Havana midnight.
  The authenticated restore contract also reactivates an automatically archived
  Behavior from an older bundle without losing its default duration.

## Browser QA

The Codex browser used `http://localhost:4322/design-system` with synthetic
fixtures. The shared Behavior form showed native number/date inputs at desktop
and 390-pixel widths. Entered values reset on Cancel. Timeline showed the
archive notice and the separate “Default duration: 30m” label. Narrow-width
Timeline details wrapped within the preview.

An existing Timeline preview fixture used a scheduled instant outside its
section's local day. Correcting that fixture restored the preview. This change
only affects the design-system fixture.

These checks cover shared components and real persistence contracts. They do
not claim an installed native-app acceptance run. Hosted release evidence follows.

## Main changed files

- `components/behaviors/BehaviorForm.tsx` and shared Behavior services own the
  optional fields and validation.
- `packages/core/src/resolvers/timeline-context.resolver.ts` selects the default
  duration without changing measured-time analytics.
- `packages/core/src/resolvers/occurrence.resolver.ts`,
  `lib/services/behavior-lifecycle.service.ts`, and
  `apps/desktop/src/local-behavior-lifecycle.service.ts` handle due archives.
- Timeline and Behavior list components render the durable notice.
- `supabase/migrations/20260918010100_add_behavior_duration_and_scheduled_archive.sql`,
  `supabase/migrations/20260918010200_archive_due_behaviors.sql`, and desktop
  migration `0015_behavior_duration_and_scheduled_archive.sql` add persistence.
- Synchronization and portability adapters carry the three new fields.
- `docs/TICKETS.md`, product/data/UI docs, and `interaction-registry.json`
  document the implemented contract.

## Independent acceptance

Two reviews identified delayed cleanup, legacy restore, refresh coalescing, and
stale generation issues. The fixes have regression coverage and passed the
checks above. A fresh final review returned `ship` with no findings.

## Hosted release — September 18, 2026

The owner authorized deployment. Vercel deployment
`dpl_DqLBYnrVyJQfDFV3YFcCRWicT29f` is READY and promoted at
`https://app.cadence-me.com`. The preceding app deployment is
`dpl_2J1VKxrPY6gDvxVTNzFf8hpMRZ4b`.

The release uses that production source plus the feature patch. It preserves
the published Privacy correction and excludes unrelated workspace web changes.
This is a CLI source deployment, not a claim that the working-tree Git HEAD
equals production. The isolated source lives at
`/private/tmp/cadence-behavior-release-20260918/web`. Its source manifest has
SHA-256 `9a8c1a952a560a513834cc913c7c390240db518beff302db5ce610c24209afc9`.
The separate marketing deployment remains unchanged.

- Candidate agents, interactions, resolvers, lint, typecheck, test, and Vercel
  production build passed. Lint retained seven fixture warnings. Tests passed
  1,745 cases with 26 skipped. Counts differ from the full workspace because
  the candidate retains the deployed web baseline outside this feature.
- The CLI pushed only `20260918010100` and `20260918010200`. Hosted migration
  history confirmed both. Unrelated `20260916195000` remains undeployed.
- The complete rollback SQL lifecycle contract passed on hosted Postgres.
  A subsequent query confirmed zero synthetic accounts remained.
- Login and Privacy returned 200. All five protected routes redirected to
  login. Both processing endpoints rejected unauthenticated calls with 401.
- Signed-in production Behaviors loaded successfully. The creation form
  accepted duration 45 and end date 2026-10-01 as draft values. Cancel cleared
  both values. No Behavior was saved or edited during browser verification.
- Independent release review returned `ship`. Vercel promotion and a subsequent
  domain lookup confirmed the exact deployment above.

Logs and the source manifest reside beside the isolated source. Native package
publication and installed-upgrade acceptance remain pending under the existing
desktop release workflow. Older native clients receive the recognized
“Update required to synchronize” response for Behavior writes. They retain local
tracking; synchronizing those changes requires the native update.

If an application rollback becomes necessary, retain the additive database
columns and recorded data. Do not drop the feature schema to roll back the UI.
