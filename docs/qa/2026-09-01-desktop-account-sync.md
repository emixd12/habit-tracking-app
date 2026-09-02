# Desktop account synchronization QA — 2026-09-01

Ticket 120 is complete. Its original local contract, authenticated
loopback verification, repository checks, and hosted rollout passed. The
two-copy matrix then exposed expected-null, canonical entity ordering,
half-even timestamp, hydration revision, and Occurrence lineage defects. Those
root causes are fixed through `20260902052213`.

- A clean local Supabase reset applied `20260901054332_add_account_sync_contract.sql`.
- Every published local Supabase port remained bound to `127.0.0.1`.
- `npm run smoke:account-sync:local` verified unauthenticated rejection, two-account snapshot isolation, cross-account and stale apply rejection, stable receipt replay, merged-fingerprint binding, timestamp normalization with server-owned `updated_at`, and idempotency-key substitution rejection. The script removed both temporary users.
- The full RLS smoke passed 92 checks. Cleanup left zero temporary auth users, profiles, categories, or sync receipts.
- Focused planner, adapter, engine, UI, SQL contract, and native SQLite tests pass.
- Native apply validates every compare-and-set before mutation, applies parent-first upserts and child-first deletes in one SQLite transaction, and preserves protected history and delivery lifecycle rules.
- The desktop keeps retries in-process with bounded exponential backoff and jitter. It adds no closed-app helper.
- `npm run agents:check`, `npm run interactions:check`, `npm run resolvers:check`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and the complete serialized native Rust suite pass. Lint reports seven pre-existing fixture warnings and no errors.

## Hosted rollout

- Preflight showed only `20260901054332_add_account_sync_contract.sql` pending for project `qjodzutjxtmtzczbloxa`.
- `npm run supabase -- db push --yes` deployed exactly that migration without seeds. Postflight history matches through `20260901054332`.
- Hosted `npm run smoke:rls` run `cd0d293d` passed 92 ordinary-user ownership checks and removed three temporary users.
- Hosted `npm run smoke:account-sync` passed unauthenticated rejection, two-account isolation, foreign/stale rejection, stable replay, merged-fingerprint and server-owned timestamp checks, and idempotency-key substitution rejection.
- Both smoke scripts clean fixtures in all exit paths. No desktop client received or used a service-role credential.

The later corrective migrations are now also deployed. Local and hosted
migration histories are congruent through
`20260902052213_serialize_and_bound_account_sync_apply.sql`. Hosted
account-sync smoke passed serialized same-account plans, cross-account entity
identity races, and bounded receipt replay against the corrected contract. Hosted RLS passed 92
checks. The obsolete unguarded `auth_complete_first_link` function is removed.

## Expected-null insert follow-up

After both disposable QA working copies hydrated the same empty hosted account,
QA A created the first local product row. Hosted apply rejected the insert as
stale because the function compared SQL NULL for the missing stored row against
the plan's JSON null expectation. The failed attempt inserted no hosted product
row and did not advance either local baseline.

Migration `20260901182100_fix_account_sync_insert_compare.sql` changes the
function definition to compare `coalesce(stored_value, 'null'::jsonb)` with the
expected JSON value. A clean local Supabase reset passed, inspection confirmed
the corrected function definition, and the local ordinary-user account-sync
smoke passed. Migration `20260901182100` and the derived-field and
canonical-order corrections ending at `20260901193000` are deployed. The
current hosted chain is congruent through `20260901203000`. Canonical entity
ordering and half-even timestamp normalization are fixed. The final QA A and
QA B binary hashes are
`051b963faf26e262dba241e8e96a21b8304c94d165d5d3719514830ee5c9873c`
and `317ff0a011d0e92ad56e9b270e52ca1fcc214e008eea6d84b7bdf0c7bfb4d598`.

## Native two-copy convergence

The hydration revision fix passed native QA. A later status transition exposed
Occurrence configuration lineage as the next root cause. Migration
`20260901200000_preserve_occurrence_lineage_on_sync_upsert.sql` supplied the
initial broad guard. Migration
`20260901203000_scope_occurrence_lineage_preservation_to_account_sync.sql`
restored the established trigger contract and limited preservation to unchanged
account-sync scheduling fields. Hosted migrations are congruent through that
scoped correction. Hosted account-sync smoke and all 92 RLS checks pass.

The native status transition converged. Branched status history was rejected
before conflict review. Concurrent Behavior edits produced the shell cue and
conflict panel. A stale decision was rejected. Both Mac and account decisions
applied; Keep both remained withheld. The final two-copy baseline was
`6911d097b519e00f1f05487aaefda5d36ccb630c3d078178dd7a5d4586c7037b`
with zero pending changes.

The corrected installed first-link Ignore and Import cases passed. Ignore left
hosted data unchanged and converged at fingerprint
`6911d097b519e00f1f05487aaefda5d36ccb630c3d078178dd7a5d4586c7037b`.
Import converged with baseline prefix `ccbb658424a3`, zero pending changes, and
hosted totals of two Behaviors, 64 Occurrences, seven definition events, and one
status event.

## Post-classifier completion matrix

The full repository and desktop matrix passes after the revoked-session
classifier correction. Vitest passed 1,463 tests with 23 skipped. All 59 native
tests passed. Agent, interaction, resolver, lint, type, desktop type, test, web
build, and desktop build checks passed. Lint retained only its existing fixture
warnings, and the build retained only its existing chunk-size warning.

The unique disposable app is
`/private/tmp/cadence-ticket122-matrix-build/revoked/target/release/bundle/macos/Cadence QA Revoked.app`.
It uses bundle ID `app.cadence.desktop.qa-revoked`; strict deep code-sign
verification passed, the corrected classifier is embedded, and the executable
SHA-256 is
`7a28021b858cbc37702d0655bdf1e4fa70b7cf7a4ec917c051ff7ee988081d60`.
The app-owned FIFO delivered the disposable session. Native revoked-session UI
acceptance then passed with this exact guidance: `The account session expired
or was revoked. Reconnect or disconnect the account.` Sync now preserved the
same revoked state. Baseline `ccbb6584…` did not advance, pending local mutations
remained unacknowledged, and hosted state stayed at two Behaviors, 64
Occurrences, seven definition events, and one status event. Keep a local copy
then disconnected the account. The local database retained two Behaviors and 64
Occurrences with integrity `ok` and zero foreign-key violations. Link metadata
and baseline tables contained zero rows, and the isolated Keychain item was
absent. Preview.14 then passed final cross-ticket publication, updater,
migration, preservation, configured-state, and secret acceptance.
