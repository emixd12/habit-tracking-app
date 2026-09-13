# Account synchronization audit — September 8, 2026

Synchronization is stalled despite an existing account link. This audit changed no product code or account data.

## P1: The planner retains reminders without their parent occurrences

`packages/core/src/resolvers/account-sync.resolver.ts:22` protects every reminder delivery from deletion.
`protectedDelete` permits deletion of Unresolved occurrences. The merge processes these entities independently.

Reproduction: baseline and local snapshots contain an Unresolved occurrence and its pending reminder. The hosted snapshot contains neither.
The planner returns zero conflicts, a hosted reminder upsert, and a local occurrence deletion. The merged snapshot has no occurrence.

The hosted schema cascades occurrence deletion into reminder deletion. This makes the reproduction a reachable state after schedule changes.
The hosted apply correctly orders parents before children, but the plan contains no parent upsert.
Postgres therefore rejects the reminder insertion with the foreign-key error shown in the screenshot.

`apps/desktop/src/sync-engine.ts:29` applies hosted writes before local writes. This failure blocks account downloads and baseline advancement.
The defect reproduces in current workspace code. The precise offending production row was not retrieved.

Required repair: reconcile dependent rows as a graph. Distinguish removable pending delivery records from retained delivery history.
Preserve required parent context for retained history. Do not resurrect obsolete schedules or weaken foreign keys.
Cover hosted deletion, desktop deletion, retained delivery history, and retries with real database contracts.

## P1: Installed desktop predates the hosted Behavior contract

`/Applications/Cadence.app/Contents/Info.plist` reports `0.1.1-preview.19`; the bundle directory dates to September 2.
The September 6 archive-notes migration rejects Behavior writes without `archive_notes` and explicitly requests a desktop update.
`STATUS.md` records that migration as deployed. Its current hosted installation was not independently queried during this audit.

The installed Settings screenshot also contains obsolete local-only and first-link descriptions alongside an established account connection.
Current source already branches these descriptions on connection state. Updating the app should carry that existing correction.
An update alone will not fix the reproduced planner defect, which remains in current source.

## P2: Native reminder journaling grows the local database

Read-only SQLite inspection found a 6,093,627,392-byte database, with only six free pages.
Two device-local operations dominate its journal:

| Operation | Records | Request and result JSON bytes |
|---|---:|---:|
| `recordNativeReminderCoverage` | 9,577 | 2,315,326,140 |
| `commitNativeReminderPlan` | 9,550 | 3,751,044,216 |

`apps/desktop/src-tauri/src/local_store/mod.rs:527` journals these requests and complete reminder-state results.
The audit observed over 7,600 pending journal entries, overwhelmingly native-reminder operations.
These entries are not equivalent to thousands of unsent user edits. Account synchronization uses snapshots.

Required follow-up: bound device-local idempotency bookkeeping and avoid repeated full-state journal payloads.
Plan backup and verified cleanup separately. This audit performed no pruning or vacuuming.

## Live local evidence and limits

- Account-link metadata and saved baseline identify the same hosted account internally.
- Last baseline completion: September 5, 2026, 8:43:58 PM America/New_York (`2026-09-06T00:43:58.087Z`).
- Local database: 1,451 occurrences, 1,392 hosted reminder records, zero existing orphan reminders.
- The user's screenshots show different Needs decision counts and an additional desktop Behavior.
- Local counts changed during inspection because the desktop remained active. No atomic cross-platform comparison was performed.
- Hosted SQL inspection was unavailable: the Supabase CLI failed during its telemetry-file write under filesystem restrictions.
- Authentication tokens, Notes, and individual record identifiers were not extracted.

## Verification

Passed 59 tests across `account-sync.resolver`, `desktop-sync-engine`, `desktop-account-sync-adapter`, and `desktop-account-sync-ui`.
Those tests do not cover the reproduced parent-deletion/reminder-retention combination.
The synthetic planner probe independently confirmed the invalid plan described above.
No application build was necessary for this read-only audit. No repair, deployment, app installation, or account mutation occurred.

Repair scope: shared planner plus hosted/native contract coverage; updated desktop distribution after compatibility verification.
Marketing has no synchronized account data. Future mobile has no implementation in scope.
