# Desktop sync compatibility — September 19, 2026

## Failure and repair

Installed preview.40 predates the hosted September 18 Behavior field migration.
Its executable lacks `default_duration_minutes` and `auto_archived_at`; the local
Behavior table lacks all three new fields. The last saved baseline completed at
2026-09-18T04:00:23.048Z. SQLite quick-check and foreign-key checks pass.

The existing native decoder rejects unknown fields. The hosted compatibility
check protects Behavior uploads, but did not intercept downloads into the older
native model. The September 15–16 reminder, status-history, and import-capacity
repairs remain installed; this is a subsequent model compatibility failure.

The repair uses the current native model and its existing schema-15 migration.
A read-only native snapshot check reuses the exact row types used by sync apply.
The shared hosted-snapshot reader calls it after fingerprint verification and
before normal sync, reviewed sync, or first-link writes. Unknown fields return
the existing Update required state. Malformed known fields still fail validation.
No field is dropped, and no history reconciliation rule changes.

Files: desktop `account/account-sync.ts`, `sync-engine.ts`, `local-store.ts`,
native `local_store/mod.rs` and `local_store/sync_apply.rs`, and adapter/native
regression tests. `INT-AUTH-009` records the changed failure condition.

Platform impact: desktop receives the compatibility check and current schema;
web already hosts the fields and requires no deployment. Marketing has no runtime
change. Future mobile is deferred. No new migration or provider configuration.

## Verification

The adapter regressions failed before the fix. They now verify the native check
and Update required result with zero sync apply or baseline-acknowledgement calls.
The native regression failed before the command existed. It now accepts current
Behavior fields, rejects a future field even when null, retains malformed-type
rejection, and proves zero database changes.

All required checks passed: agents, interactions, resolvers, shared core,
desktop parity, lint, web/desktop type checks, and web/desktop production builds.
The default suite passed 1,850 tests (29 skipped). Native tests passed 107.
Real SQLite contracts passed 20 (one skipped). The sandbox initially prevented
five synthetic email-provider tests from binding localhost; the authorized full
rerun passed. Existing lint and bundle-size warnings remain.

A private consistent copy of the installed database upgraded from schema 14 to
15. Every pre-existing table value remained unchanged, apart from the migration
ledger. All 4,748 saved baseline entities validated with the new nullable fields.
Integrity and foreign-key checks passed.

## Installed acceptance

Preview.41 passed all 11 artifact checks and replaced preview.40 at
`/Applications/Cadence.app`. Installed executable hash matches the verified
candidate. A consistent pre-install database backup and preview.40 ZIP remain
in `~/Library/Application Support/Cadence Release/sync-compatibility-2026-09-19`.
The rollback ZIP was extracted and compared for bytes, permissions, symlinks,
and extended attributes. No unpacked rollback app remains.

Startup and a subsequent manual Sync now both displayed Account data is current.
The saved baseline advanced to 2026-09-19T18:12:09.846Z; no outbox entries remain
unacknowledged. All 4,801 accepted baseline entities match SQLite at the existing
half-even microsecond timestamp precision.

All 1,236 pre-install status-history entries remain unchanged. Synchronization
added 22 hosted entries and updated their occurrence projections, plus one Note.
It added 15 reminder rows and synchronized 18 existing delivery states. No
tracked rows were deleted. Behaviors, schedules, categories, definition and
configuration history, timing sessions, and import provenance remain unchanged
in their pre-existing columns. SQLite integrity and foreign keys pass.

Private verification scripts and aggregate reports reside under
`/private/tmp/cadence-sync-repair-20260919`; no private tracking content or session
secrets are committed. The native preview remains ad hoc signed. No release
publication, web deployment, hosted migration, account relink, or manual data
repair occurred. Native duration/end-date UI acceptance and Apple-trusted
release gates remain separate.
