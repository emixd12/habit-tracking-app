# Desktop conflict review and disconnect QA

Status: complete. Automated verification and the installed conflict, retry,
Keep-local, Restore, Remove-account-data, and unique revoked-session paths
passed. Preview.14 final cross-ticket release acceptance also passed.

## Verified automatically

- The planner auto-merges independent changes and repairs one-sided protected-row deletion from the retained copy.
- Append-only rewrites, ID collisions, and status-history branches fail before review.
- Mutable concurrent-update and delete-versus-update conflicts pause the whole plan.
- Both account and Mac decisions produce complete typed write plans.
- A changed baseline, local, or hosted fingerprint rejects the reviewed plan before apply.
- Keep both stays unavailable because no current conflict can duplicate its complete referenced graph safely.
- Structured 401/403 and JWT failures stop synchronization as revoked sessions.
- Disconnect clears Keychain state before native database mutation.
- Keep local copy preserves product data and clears link state.
- Remove account data creates a validated owner-only backup and seeds a fresh local profile.
- Native database info derives local mode from SQLite account metadata.
- Native Restore rejects linked mode before opening the file picker.
- Hosted reminder updates inherit the existing table-level terminal-status and processing-claim trigger, including writes issued by the sync RPC.

## Checks

- `npm run desktop:typecheck`
- focused Vitest conflict, adapter, sync-engine, UI, and authentication tests
- final `npm run desktop:native:test` (59 passed)
- `npm run interactions:check`
- `npm run agents:check`, `npm run resolvers:check`, `npm run lint`, and `npm run typecheck`
- final full `npm run test` (1,463 passed, 23 skipped)
- `npm run build` and `npm run desktop:build`
- clean local Supabase reset, authenticated account-sync smoke, and 92-check RLS smoke

## Installed-app QA

The QA uses the owner-approved temporary legacy-Keychain build. Preserve the
working database and original app backup for Ticket 122.
The configured Ticket 121 legacy-Keychain build is installed at
`/Applications/Cadence.app`. Computer Use recovered after root removed only the
inaccessible temporary legacy-Keychain QA secrets created before an ad hoc
signature change. Root relaunched the app and completed the approved Google
sign-in with the owner's approved Google account.

Installed Settings verified:

- the linked email and first-link-pending state;
- the exact live Application Support database path;
- raw Restore controls hidden in account mode with the disconnect instruction;
- **Keep a local copy**;
- the typed `REMOVE` guard and disabled **Remove account data** action; and
- preserved schema 9 data with 4 Behaviors, 6 Occurrences, one profile, one
  account link, zero sync baselines, integrity `ok`, and no foreign-key errors.

The non-destructive inspection changed no product row. The preserved original
app and earlier QA app backups remain outside `/Applications`.

Remaining gates:

- Preview.14 completed the real-updater and final preservation acceptance.
  Preview.8 and preview.9 remain superseded and unpublished.

## Unique revoked-session native acceptance

The isolated app showed: `The account session expired or was revoked. Reconnect
or disconnect the account.` Sync now preserved the same revoked state. Baseline
`ccbb6584…` remained unchanged, and pending local mutations remained
unacknowledged. Hosted state stayed at two Behaviors, 64 Occurrences, seven
definition events, and one status event.

Keep a local copy then showed `Account disconnected`. The local database
retained two Behaviors and 64 Occurrences. Integrity was `ok`, the foreign-key
check returned zero rows, `account_link_metadata` contained zero rows, and
`account_sync_baselines` contained zero rows. The isolated Keychain item was
absent.

The disposable two-copy run reached a common hydrated baseline, then stopped on
the hosted expected-null insert defect before conflict creation. The corrective
migrations through `20260901203000` are deployed and congruent. Hosted
account-sync smoke passed, and hosted RLS passed 92 checks. Canonical entity
ordering and half-even timestamp normalization are fixed. The obsolete
unguarded `auth_complete_first_link` function is removed.

## Installed conflict and disconnect acceptance

The hydration revision correction passed native QA. A later status transition
exposed configuration-lineage clearing. Migration `20260901200000` added the
initial guard; migration `20260901203000` scoped it to unchanged account-sync
scheduling fields. Hosted migration history is congruent through the scoped
correction. Hosted account-sync smoke and all 92 RLS checks pass. The native
status transition converged, while branched status history was rejected before
review.

Concurrent Behavior edits displayed the shell conflict cue and review panel.
The app rejected a stale decision. Both Mac and account decisions then applied.
Keep both remained withheld. The final two-copy baseline was
`6911d097b519e00f1f05487aaefda5d36ccb630c3d078178dd7a5d4586c7037b`
with zero pending changes.

**Keep a local copy** removed Keychain, account-link, and baseline state while
preserving one Behavior and 32 Occurrences. Raw local-mode Restore then passed
from `/private/tmp/cadence-ticket122-qa-b-pre-conflict.sqlite3`. Cadence
protected the prior database at
`~/Library/Application Support/app.cadence.desktop.qa-b/Backups/<protected-backup>.sqlite3`.

**Remove account data** created the owner-only mode-600 backup
`~/Library/Application Support/app.cadence.desktop.qa-b/Backups/<protected-backup>.sqlite3`.
It seeded a fresh profile and default categories. Product rows, account-link
state, baseline state, and Keychain session were absent afterward.
