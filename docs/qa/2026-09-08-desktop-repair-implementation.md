# Desktop repair implementation — Tickets 129–131

## Scope and release separation

Tickets 129 and 130 ship together. Ticket 131 has separate implementation and
release acceptance. The isolated repair checkout is
`/private/tmp/cadence-desktop-repair-release`, based on `d401cea8`.
The source baseline at `/tmp/cadence-repair-start-20260908` preserves unrelated
workspace edits. SQLite migration 0013 remains a schema-only prerequisite for
0014 in the repair release. Note shortcut runtime does not enter that release.

Web: Ticket 130 hosted apply guard uses the tracked Supabase migration. Shared
form draft markers preserve web behavior. Desktop: native recovery, sync, and
update implementation. Marketing: no new feature claims before native acceptance.
Future mobile: not applicable; implementation remains deferred.

## Automated evidence

- The prior sync planner failed the new sent-reminder parent deletion case.
- Focused planner tests cover ordinary and reviewed deletion, all reminder states,
  protected history, and complete graphs.
- Local Supabase reset replayed the tracked dependency guard migration. The RPC
  smoke passed deletion, rollback, ownership, stale data, and idempotency cases.
  The operator verified zero auth/public/storage/vault data before and after.
  Every exposed local container port remained on 127.0.0.1.
- Full Vitest run: 200 files passed, five skipped; 1,607 tests passed, 26 skipped.
  The first sandboxed attempt blocked five synthetic loopback-server tests.
  The authorized rerun passed those tests.
- Web, desktop, and marketing builds passed. Root and desktop TypeScript passed.
  Lint passed with seven warnings. Agent, interaction, resolver, shared-core,
  design-system, and desktop parity checks passed.
- Parent review added synchronous draft discard verification and queued native
  command exclusion. Focused restart and Settings tests passed (17 tests).

Native full suite: 93 tests passed. Real SQLite contract suite: 18 tests passed.
Isolated release: 85 native tests and 17 real SQLite contracts passed.
The final pending-recovery Settings label check passed in both copies (15 tests).

## Installed acceptance gates

The installed app baseline is 0.1.1-preview.19. It showed a linked account and the
reported reminder foreign-key synchronization failure. No owner data changed.
The Mac is locked as of the UI verification attempt. Native UI, storage recovery,
real signed upgrade, and account convergence remain unverified.

The user has not selected automatic recovery-backup deletion. Recovery retains
the backup by default and exposes an acknowledged deletion action in Settings.
User-created backups remain untouched.

Independent sync and updater reviews returned `ship` for code readiness.
Fresh storage review returned `ship`. Installed acceptance continues below.

Read-only installed file measurement before repair: database 6,169,415,680 bytes;
WAL 7,712,672 bytes; shared memory 32,768 bytes. These are logical file sizes,
not reclaimed disk measurements. Preview20 configuration prerequisites passed;
preview.20 artifacts passed local checks but were rejected before publication.
The corrected preview.21 build and installed upgrade remain pending.

## Review and isolated-release continuation

The first storage review returned `fix-first`: rollback staging could remain
unreported after a crash, and a fixed-path backup collision could overwrite an
unowned file. Corrections add tracked rollback state and file ownership checks.
Parent reran both complete native suites and real SQLite contracts successfully.
Fresh storage review returned `ship` after the backup-resume correction below. An unproven staging-file reservation fails
closed before cleanup and requires operator inspection; the file remains intact.

Updater reviews required visibility-resume handling and complete owning-document
response details. Both corrections are present. The final updater review returned `ship`.
The sync review also returned `ship`, with no findings.

The isolated repair release passed 1,523 TypeScript tests (25 skipped), all agent,
interaction, resolver, core, design-system, parity, lint, and TypeScript checks.
Web and desktop builds passed. Marketing build and checks passed after generating
the fresh dist directory. The first web build needed network access for its
configured Google Font download; the authorized rerun passed.

The no-Note Supabase reset replayed the new migration and its RPC smoke passed.
Parent independently reran the synthetic RPC smoke and ten native account-sync
tests; both passed. At that verification stage, no hosted migration or owner-data mutation had occurred.

The preview.20 local candidate passed cryptographic and artifact checks, but
remains unpublished. Fresh storage review found missing protective-backup
revalidation after an interrupted maintenance stage. The correction verifies
identity and contents before resumed migration, compaction, or reopen. Regression
cases cover replacement and same-inode corruption at all three stages. The
corrected candidate will use preview.21; preview.20 remains rejected evidence.

## Published repair and installed recovery

The hosted ledger confirms migration 20260908174627. Preview.21 is published at
the existing desktop-preview release. Remote artifact SHA-256 values match the
verified packet. The public latest.json is byte-identical to that packet. Source
commit: 509f7a88c26621bacade4537b82f8e3bd3bcf0ab on the published repair branch.

Desktop access resumed. Preview.19 discovered, downloaded, and installed
preview.21 through its existing manual updater. Restart reached durable
reopen_verified after backup, cleanup, compaction, and integrity verification.

- Before: database 6,205,390,848 bytes; WAL 7,712,672; shared memory 32,768.
- After: live database 6,529,024 bytes; WAL zero; shared memory 32,768.
- Retained recovery files: 6,206,198,457 bytes, including the protected backup.
- Total retained footprint: 6,212,760,249 bytes. Retaining the backup means the
  live database reduction is not equivalent to reclaimed free disk space.
- Installed plist confirms preview.21. Integrity check passed; zero foreign-key
  errors. Exactly one 84-byte native receipt remains per operation.
- All existing protected table values match the read-only pre-upgrade snapshot.
  New schema columns are excluded from that comparison. All 42 pending domain
  mutations remain intact; no account link was reset.

Cadence next waits in SecItemCopyMatching for existing-session Keychain access.
Computer Use cannot operate SecurityAgent. The owner must complete that prompt.
Normal sync convergence and repeated unchanged reconciliation remain pending.

The desktop Settings fixture passed keyboard install/restart/Keep editing/retry,
manual-download preference, accessible progress/status/error roles, reduced-motion
emulation, and narrow layout without horizontal overflow (341 CSS pixels).
Viewport and reduced-motion overrides were reset. Native Ticket 131 acceptance
remains separate from fixture evidence.

Read-only account comparison before repaired sync: both copies use
America/New_York. For local date 2026-09-08, local Needs decision is 57 and
hosted Needs decision is 14. Local Completed/Not Completed counts are 748/223;
hosted counts are 773/241. Both copies contain 21 occurrences with Notes.
These are pre-convergence measurements, not acceptance results.

The published repair source also passed public-source and public-trust checks:
866 tracked text files, zero worktree/history pattern findings, and zero client
environment violations. The three public-trust fixtures passed.

The repair deployment excluded the earlier unshipped export-summary and Note
shortcut migrations. Future deployments must inspect the hosted ledger and
explicitly reconcile those older pending timestamps; do not deploy them implicitly
as part of this repair.

## Isolated automatic-update implementation

Ticket 131 is prepared in `/private/tmp/cadence-desktop-updater-release`, branch
`codex/desktop-automatic-update-downloads`, based on repair commit 509f7a88.
The change excludes unrelated Note shortcut runtime work, migrations, dependencies,
and hosted changes. Parent inspected the complete implementation diff.

Parent verification passed: agents, interactions, resolvers, lint, web and desktop
types, 1,544 JavaScript tests (25 skipped), 86 native tests, 17 real SQLite
contracts, core, design-system, desktop parity, web build, desktop build, marketing
build, and marketing checks. Seven existing lint warnings remain.

The isolated review found a maintenance restart gap. The correction routes backup,
restore, and recovery-backup deletion through the existing pending-command guard.
The guard covers native dialogs and clears on success or failure. Parent reran
the required JavaScript checks and both builds successfully. Main-worktree updater
regressions also passed (26 tests). Fresh correction review returned `ship`, with no blockers.

Ticket 131 remains unreleased until installed
repair sync convergence and unchanged reconciliation acceptance pass. The owner
Keychain prompt still blocks those checks. No protected backup was deleted.

The verified isolated Ticket 131 implementation is saved as local commit
`dbd8044ab08b8e59fcc5e95de2c478d9ce161458` on
`codex/desktop-automatic-update-downloads`. The worktree is clean. The commit
is not published, and the update feed remains on repair preview.21.

## Installed repair acceptance — 2026-09-09

The owner completed Keychain access. Installed preview.21 reports Account data
is current. An explicit unchanged Sync now returned successfully. Local baseline
and hosted snapshot fingerprint both equal
`5fc684727788aec9658ba407055bafc83dc9d525d25204dd967f9c782c8d4a63`.
The hosted snapshot contains 4,143 entities. Both copies contain 782 Completed,
244 Not Completed, and 405 Unresolved occurrences, with 21 nonempty Notes.
Both raw datasets contain 15 prior-day Unresolved occurrences for 2026-09-09.
No domain mutations remain pending. SQLite integrity passes; foreign-key errors: zero.

Repeated unchanged native reminder refreshes retain exactly one compact receipt
per native operation. Database, WAL, and shared-memory byte growth was zero
across the measured refresh interval. Live files measured 9,547,776 database bytes,
5,908,112 WAL bytes, and 32,768 shared-memory bytes after account convergence.
Native readback reports limited coverage through September 10 at 11 AM EDT,
with 13 retained reminders. The UI explicitly discloses the shorter OS horizon.
The protected recovery backup remains intact. Tickets 129–130 installed acceptance
is complete; Ticket 131 signed installed acceptance is next.

## Automatic updater rollout — 2026-09-09

Source commit dbd8044a is published on its isolated branch. Preview.22 passed
all artifact checks. All four uploaded artifact hashes and sizes matched. The
public feed matched the local packet byte-for-byte. Preview.21 downloaded and
installed preview.22; restart acceptance is in progress.

Preview.23 uses identical reviewed source and passed the same artifact checks.
Its four uploaded artifact hashes and sizes matched. Automatic approval review
rejected activating preview.23 because public-channel changes require explicit
owner authorization. No alternate activation was attempted. The feed remains
preview.22. Preview.23 activation is pending owner approval for the automatic
download lifecycle acceptance check.

Preview.22 restart succeeded after account synchronization returned current.
The installed plist reports preview.22, and its executable hash matches the
verified artifact. Startup now waits in auth_secret_get / SecItemCopyMatching
for Keychain access again. The owner must complete this macOS prompt; Computer
Use cannot operate SecurityAgent. Automatic-download installed acceptance remains
pending that access and explicit preview.23 public-feed activation approval.

## Native updater permission defect — 2026-09-09

The owner explicitly approved preview.23 activation. The public feed update and
byte comparison succeeded. Preview.22 opened after Keychain approval. Its startup
check had run before activation and reported no newer version. A manual check
then discovered preview.23 and automatically attempted download, which failed.

Installed QA exposed a native capability mismatch: main.json authorized only
updater:allow-download-and-install, while native-updater.ts now calls separate
download and install commands. The installed plugin's generated permissions
confirm those require updater:allow-download and updater:allow-install. The
minimal correction replaces the old permission with both required permissions,
and a runnable regression check covers the capability contract. Ticket 131 remains
in progress. Preview.22/23 cannot self-update through their split-command UI; a
corrected installed candidate is required before final acceptance.

The public feed was restored to verified repair preview.21 after discovering the
permission defect; byte comparison passed. This does not downgrade installed
clients. The corrected preview.24 candidate is building. The fix passed 1,545
JavaScript tests (25 skipped), agents/interactions/resolvers checks, lint, types,
and web/desktop builds. Final native artifact verification and fresh review remain
pending. The owner data and protected backup are unchanged by this correction.

Preview.24 passed all native artifact checks and fresh read-only review (`ship`).
Correction source commit 2867b5802ca5343fecb5fe9f3a178601dfff9112 is published on
the isolated updater branch. All four staged preview.24 artifact hashes and sizes
match GitHub. The public feed remains preview.21. Activation of the replacement
preview.24 and direct installation over preview.22 remain pending. The earlier
owner approval named preview.23; the replacement version is a separate activation.

## Preview.24 direct installation — 2026-09-09

The owner approved preview.24 activation and direct installation. The public feed
was activated and matched the local packet byte-for-byte. After Settings reported
Account data is current, Cadence quit normally. The verified application was
staged, checked with strict codesign, and installed. The prior application remains
at `/Applications/.Cadence-preview22.previous` for rollback. No user data was deleted.

The installed plist reports preview.24, and its executable hash matches the
verified artifact. Protected domain and account rows exactly match the pre-install
snapshot. SQLite integrity passes with zero foreign-key errors. Preview.24 launched
but waits in auth_secret_get / SecItemCopyMatching for renewed macOS Keychain
approval. Computer Use cannot operate SecurityAgent. Ticket 131 remains in
progress for post-approval startup and installed updater acceptance.

## Preview.24 post-Keychain verification — 2026-09-09

The owner completed Keychain approval. Preview.24 opened the Timeline and
Settings. Settings reports Account data is current. Download updates automatically
is checked. An explicit Check for updates succeeded and reported No newer version
is available against the active preview.24 feed. The native permission fix is
built, reviewed, and installed; actual download/install of a newer signed release
from preview.24 remains unverified because no newer release is available.
Ticket 131 remains in progress for that final lifecycle acceptance. No additional
release activation or backup deletion occurred.
