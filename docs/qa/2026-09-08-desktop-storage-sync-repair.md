# Desktop storage and sync repair evidence

Tickets 129–130 remain in progress until installed acceptance. This isolated
release starts at d401cea8. SQLite migration 0013 is an unchanged schema-only
prerequisite. Note shortcut runtime and Ticket 131 are excluded.

## Automated verification

- All repository governance, lint, TypeScript, shared-core, design-system,
  interaction, resolver, and desktop parity checks passed.
- Full Vitest suite: 1,523 passed, 25 skipped. The final recovery disclosure
  adjustment passed the 15-test Settings suite separately.
- Native suite: 85 passed. Real SQLite contracts: 17 passed.
- Web, desktop, and marketing builds passed. Marketing checks passed.
- Real local Postgres reset and sync RPC smoke passed. Parent reran the RPC
  smoke and ten native sync tests. Synthetic account data was removed.
- The hosted deployment dry run selects only
  20260908174627_guard_dependency_safe_account_sync.sql.
- Independent sync review returned ship with no findings. Fresh storage review
  returned ship after verified file-ownership, rollback, and resume corrections.

## Installed acceptance

The installed baseline is preview.19. The Mac is locked, so signed upgrade,
owner storage reduction, and normal account convergence remain unverified.
The recovery backup remains retained unless the user explicitly deletes it.
No owner database mutation has occurred. Developer ID and notarization remain
Ticket 115 work; updater signatures do not establish Apple notarization.

The preview.20 local candidate passed cryptographic and artifact checks, but
remains unpublished. Fresh storage review found missing protective-backup
revalidation after an interrupted maintenance stage. The correction verifies
identity and contents before resumed migration, compaction, or reopen. Regression
cases cover replacement and same-inode corruption at all three stages. The
corrected candidate will use preview.21; preview.20 remains rejected evidence.

Preview.21 passed updater signature, archive, read-only DMG, strict code-signature,
architecture, hardened runtime, and legacy Keychain checks. It remains
unnotarized. The hosted ledger confirms migration 20260908174627 after deployment.
No other migration was included. Owner-data acceptance remains pending.
