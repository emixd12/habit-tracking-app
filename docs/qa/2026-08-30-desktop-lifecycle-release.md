# Desktop lifecycle and release continuation — 2026-08-30

Tickets 111 and 112 are complete locally after the 2026-08-31 owner-assisted
offline and system sleep/wake checks. Historical checkpoint: Ticket 113's
owner-authorized ad hoc preview was still in progress here. It later completed;
Apple-trusted distribution requirements moved to deferred Ticket 115.
This continuation fixes local-midnight refresh and native delivery history,
and verifies the release helper with real signatures. It does not establish
final-release or real preview-upgrade acceptance.

## Local-midnight refresh

`apps/desktop/src/desktop-lifecycle.ts` schedules the next midnight in the
loaded profile's timezone. Product replaces the timer when that timezone
changes and cancels it on unmount. The existing minute refresh remains.
No resolver, recurrence rule, native observer, or database schema changed.

The actual Product test starts 500 milliseconds before local midnight. It
verifies that an Unresolved Occurrence moves into Needs decision at midnight
and reminder reconciliation runs before the next minute poll. Other checks
cover 23-hour and 25-hour DST days, a non-hour timezone, timezone replacement,
and timer cleanup.

The native wake/resume path already exists:
`NSWorkspaceDidWakeNotification` / `NSApplicationDidBecomeActiveNotification`
→ native event buffer → Rust `desktop-native-event` → Product event drain
→ existing tracking refresh and reminder reconciliation. Product tests exercise
both event kinds and an event arriving during the initial drain. Those tests
do not simulate actual macOS system sleep.

## Actual native reminder attempt

The native UI created the synthetic `Cadence lifecycle QA` Behavior
(`75d042e9-615e-42a8-aa55-d53e57991c04`) with a 22:30 America/New_York reminder.
Settings readback verified 30 retained requests for 30 eligible Occurrences.
Cadence fully quit before the scheduled time. It remained closed at 22:30:57.

Computer Use exposed only Notification Center's Month widget, without the
notification row. No notification click was observed. The agent manually
reopened Cadence at approximately 22:31:05. Native readback then recorded
`cadence.local.58db4985-8221-4796-949d-47c33237a931` as delivered, with
`verified_at` of `2026-08-31T02:31:05.53046543Z`. Manual reopening does not prove
notification activation. The Timeline row remained collapsed.

The UI archived the synthetic Behavior at `2026-08-31T02:31:24.556473162Z`.
Settings confirmed zero retained and zero eligible pending reminders.
Its delivered receipt and historical Occurrence remain preserved. SQLite
integrity and foreign-key checks passed. Evidence is in
`/private/tmp/cadence-native-qa/lifecycle-cleanup.json`.

## Product notification click passed

The owner requested a new notification. The native UI restored the same
synthetic Behavior and changed its schedule to every 365 days at 22:41 EDT.
This left one eligible request in the current 30-day window. Settings verified
one retained request at 22:40:32. The app fully quit before the scheduled time.
The target was `cadence.local.2688533a-7c7d-4450-9e2f-8ad640022a33`.

The owner then reported clicking that notification. At 22:46:18, Computer Use
listed Cadence as already running before the agent inspected its window.
No agent launched it between the pre-delivery quit and that observation.
Timeline showed `Opened reminder for Cadence lifecycle QA on 2026-08-30`.
The 22:41 Occurrence was expanded; the earlier 22:30 Occurrence stayed collapsed.
The first screenshot showed keyboard focus on the 22:41 summary. One Tab moved
the focus outline to that Occurrence's Track Time control without a mouse click.
This verifies actual product notification launch, exact-target routing,
expansion, scrolling, and keyboard focus in WKWebView.

Evidence: [focused notification target](images/2026-08-30-desktop-notification-target.jpg)
and [focus after Tab](images/2026-08-30-desktop-notification-tab.jpg).
The raw initial accessibility tree is
`/private/tmp/cadence-native-qa/product-notification-click.txt`.

The native UI archived the synthetic Behavior after verification. Settings
confirmed zero retained and zero eligible reminders at 22:48:33 EDT.
The historical Occurrences remain intact. At this checkpoint, Ticket 112 still
needed system sleep/wake evidence. The later check below supplies that evidence.

The click also exposed a separate delivery-history defect. Before archival,
the target's native state said `cancelled`: macOS had removed the clicked
notification from delivered readback, and expiry cleanup retired its intent.
Canonical export repeated that cleanup state despite the known OS delivery.
The correction must preserve exact delivery evidence before cleanup and keep
user receipt/reading unverified. This does not invalidate the routing/focus
proof above. The correction's verification is tracked separately below.

## Delivery-history correction

Native presentation and activation callbacks now capture the request's exact
identifier, fire time, title, body, and OS delivery time. Delivered readback
captures the same evidence, including every settlement poll. The adapter uses
the retained calendar components because a fired one-shot trigger no longer
has a next trigger date.

Reconciliation retains evidence until SQLite accepts it, before expiry cleanup.
SQLite checks ownership, the unchanged request fields, and delivery timestamps.
Late evidence can correct cancellation history without scheduling another
notification. Failed writes retain evidence for retry. Evidence arriving after
the reconciliation's captured clock waits for the next refresh. Canonical
export keeps OS delivery distinct from unverified user receipt and reading.

The real SQLite contract covers late activation after cancellation, archival,
restart, and canonical delivered export. Focused regressions cover stale
request evidence, failed writes, callback timing, and Notification Center
clearing after any delivered readback. No schema or IPC command was added.
The earlier callback already drained by the preceding build cannot be rebuilt
from its request ID; its pre-fix history is preserved without invented evidence.

Actual macOS verification passed on the rebuilt app. The synthetic 23:10 EDT
request `cadence.local.ae50ceb0-5196-48dd-a27b-fc9eddffcd97` changed from scheduled
to delivered automatically at `2026-08-31T03:10:15.756755829Z`. A read-only SQLite
poll observed that write before the agent inspected or refreshed the window.
This establishes native OS evidence capture; this run does not distinguish
callback capture from delivered readback.

The UI archived the Behavior at `2026-08-31T03:10:57.583815809Z`. The native
delivery remained `delivered` after archival and a full quit/relaunch. SQLite
integrity passed with zero foreign-key failures. Settings then showed Allowed,
zero retained reminders, and zero eligible reminders. Its last readback was
23:12:47 EDT. The later handoff screenshot shows an automatic 23:14:47 readback,
with the app left open for the separate sleep/wake check.
[Settings evidence](images/2026-08-30-desktop-delivery-fix-settings.jpg).

The actual native export dialog saved an all-time BehaviorLog bundle including
archived Behaviors, with Notes and time tracking excluded. The target's single
canonical intervention retains `delivery_status: delivered` and
`user_receipt: unverified`; it does not invent `sent_at_utc`. The pinned reference
validator passed. Its four warnings concern two uncategorized synthetic
Behaviors and two existing imported intervention failure-reason fields.

Private evidence: `delivery-fix-before.json`, `delivery-fix-observed.json`,
`delivery-fix-archived.json`, `delivery-fix-restarted.json`, and
`delivery-fix-export-verification.json` under `/private/tmp/cadence-native-qa`.
The exported `delivery-fix.behaviorlog.zip` is 26,168 bytes with SHA-256
`ffeb2dc5d4332e40bdb4e8433e7250917ea8f48cefbc2779dd5b247ff369e503`.

Key changed files: `apps/desktop/src-tauri/native/notifications.m`,
`apps/desktop/src/local-reminder.service.ts`, `apps/desktop/src/product.tsx`,
native/TypeScript request types, and
`apps/desktop/src-tauri/src/local_store/reminder.rs`.
Regression evidence lives in `tests/desktop-reminder-repair.test.ts`,
`tests/desktop-retry.dom.test.tsx`, `tests/desktop-store-contract.test.ts`, and
the Rust local-store tests. Notification, export, and desktop data contracts,
the interaction registry, parity ledger, and ticket status changed with them.

## System sleep and wake passed

The owner slept and woke the Mac on 2026-08-31 while Cadence remained open in
Settings. `pmset -g log` records Software Sleep at 00:17:30 EDT and Wake from
Deep Idle at 00:17:32 EDT. This was a two-second system sleep, not merely an
app switch. The agent did not sleep, wake, launch, or refresh Cadence for this check.

Before any GUI inspection, a read-only SQLite snapshot at 00:18:09 EDT showed
complete coverage, zero pending/eligible reminders, and a 00:17:43 readback.
The mutation outbox retains stronger timing evidence: reminder reconciliation
started at `2026-08-31T04:17:32.668804479Z` and committed coverage at
`2026-08-31T04:17:35.252855252Z`. The preceding periodic readback was 00:16:44;
the next periodic readback was 00:17:43. The extra reconciliation therefore
occurred during wake, before the next minute poll. The persisted operations
do not distinguish the native wake callback from the native resume callback.

Computer Use listed Cadence as already running. Its process start time was
2026-08-30 23:12:45 EDT, before the system sleep. Its subsequent Settings view
showed Allowed permission, complete coverage, zero pending/eligible reminders,
and no error. SQLite integrity passed with zero foreign-key failures. The agent
did not select Refresh. Zero eligible reminders verifies automatic renewal;
earlier nonzero scheduling, cancellation, delivery, and OS-limit checks remain
the corresponding evidence. [Post-wake Settings](images/2026-08-31-desktop-sleep-wake.jpg).

Private evidence under `/private/tmp/cadence-native-qa`:
`sleep-wake-power-log.txt`, `sleep-wake-before-inspection.json`,
`sleep-wake-reconciliation-history.json`, `sleep-wake-process-start.json`, and
`sleep-wake-settings.txt`.
Ticket 112's tracking implementation dependency is fulfilled. Ticket 111's
separate disconnected-network acceptance subsequently passed below. Ticket 113's
release gates remain open. This evidence update changes no runtime code or artifact.

## Offline launch and persistence passed

The native UI prepared `Cadence offline QA` on 2026-08-31 with native reminders
off and one Unresolved Occurrence at local midnight. The Behavior is
`59302207-a50d-464d-b1e5-bc023249ece7`; the Occurrence is
`a04ec137-afa4-4ec5-a20d-9df8bf5b2129`. The private baseline and SQLite backup are
`/private/tmp/cadence-native-qa/offline-before.json` and `offline-before.sqlite3`.

The owner confirmed the requested sequence worked: disconnect networking,
quit/reopen Cadence, mark the test Completed, quit/reopen again, and check that
Completed persisted before reconnecting. Their attached screenshot at
`2026-08-31T04:26:36.037Z` shows the Completed row. The disconnected network
state is owner-confirmed; the agent did not independently observe networking.

Before GUI inspection, a read-only SQLite snapshot at 00:28:19 EDT confirmed
the exact Occurrence was Completed with its status mutation committed at
`2026-08-31T04:26:04.205351362Z`. Cadence's running process started at 00:26:20
EDT, after that mutation. Computer Use confirmed the already-running app
displayed the same Completed Occurrence. These independent checks establish
saved status and relaunch persistence. SQLite integrity passed with zero
foreign-key failures. [Verified Completed row](images/2026-08-31-desktop-offline-passed.jpg).

The native UI archived only this synthetic Behavior at
`2026-08-31T04:30:04.509593977Z`. Its Completed Occurrence and original mutation
timestamp remain unchanged. Settings verified complete coverage with zero
pending and zero eligible reminders at 00:30:21 EDT. No active synthetic
Behavior or active reminder intent remains. No domain history was deleted.

Private evidence under `/private/tmp/cadence-native-qa`:
`offline-after-owner.json`, `offline-process-start.json`, `offline-verified.txt`,
`offline-cleanup.json`, and `offline-cleanup-settings.txt`. Ticket 111 is complete
locally. The verified app/DMG and runtime code are unchanged; this follow-up
updates acceptance evidence, ticket status, and registry notes only.

## Release verification

The release command now calls the tested
`apps/desktop/scripts/verify-updater-signature.mjs` helper. It validates the
Tauri signature envelope, runs real Minisign verification with a timeout,
and removes temporary public-key/signature files. Disposable fixture private
keys stay in memory; no production key or updater feed changed.

Six cryptographic checks passed: unchanged archive, changed archive, wrong key
with the same key ID, corrupted signature, altered trusted comment, and malformed
base64. The valid archive passed; each altered input failed. This establishes
the local verifier's behavior, not Tauri installation or signed-upgrade recovery.

[The asset record](2026-08-30-desktop-asset-provenance.md) now records the owner's
2026-08-31 ownership statement and Cadence distribution authorization for the
six exact image/audio hashes. Bundled font and Lucide notices match their
installed package sources. MIT exclusions, reserved marks, and third-party
notices remain unchanged. No asset bytes changed.

At this checkpoint, release preflight failed for missing Developer ID identity,
notarization
credentials, updater public/private keys, and an owner-controlled HTTPS feed.
The interaction release check retains the planned updater variant. Actual
product notification activation now passes. No hosted deployment, publication,
or Apple submission ran.

Before preview authorization, the 2026-08-31 read-only preflight found those
inputs absent and zero
Developer ID Application identities in the keychain. This host runs macOS
26.5.2, so it cannot supply macOS 14 runtime evidence. Local packaging,
cryptographic-verifier, archive-safety, updater-control, and SQLite recovery
checks covered the available local work at that checkpoint. The later preview
decision permits further local preparation without Apple credentials. Real
preview update, installation, and recovery evidence remains separate from these
earlier checks. Original final-release requirements are deferred, not passed.

## Verification

The 2026-08-31 acceptance closure changes documentation, registry evidence, and
synthetic QA data only. Agent/interaction checks, eight parity/registry tests,
and diff validation passed again. The strict release check still rejects only
the planned signed updater. The unchanged runtime build retains these results:

- `CADENCE_RELEASE_CRYPTO=1 npm run test -- --maxWorkers=2`: 1,364 passed,
  17 environment-gated skips; 177 files passed and four skipped.
- `npm run agents:check`, `interactions:check`, `resolvers:check`, `core:check`,
  and `design-system:check`: passed.
- Web and desktop TypeScript, lint, web build, and desktop frontend build: passed.
  Lint retains seven existing vendored-validator warnings. Vite retains its
  existing large-chunk warning.
- Native Rust tests: 41 passed. `cargo fmt --check`: passed.
- Real SQLite contracts: 15 passed, including delivered-history export after
  archival and restart.
- `git diff --check`: passed.
- The earlier ordinary-client Supabase contracts remain the web adapter
  evidence. This continuation changes no database schema.

The updated native app and DMG built successfully. A read-only DMG mount
matched the app's complete file/permission/symlink manifest and detached cleanly.
Strict ad hoc code-signature verification passed with hardened runtime,
sealed resources, arm64 architecture, and macOS 14 minimum in both Info.plist
and the executable. The DMG remains unsigned; no notarization occurred.

- DMG: `apps/desktop/src-tauri/target/debug/bundle/dmg/Cadence_0.1.0_aarch64.dmg`.
- Bytes: `13853588`.
- SHA-256: `43f156d062e568bdbfc22cfa03b3108dccf89a88d00774563344c4e551e92fb2`.
- Binary SHA-256: `9316abfdafbf3e889ed3a8f64a9bf8922b644a748c209d7de4c19df21d1018db`.
- Frontend chunk: `product-PfoA8Tmi.js`.
- Verification time: `2026-08-31T03:07:14.206167Z`.
- Full report: `/private/tmp/cadence-final-artifact-verification.json`.

The corrected app launched through Computer Use and rendered Timeline and
Settings. Settings retained America/New_York and Allowed notification permission.
It still disclosed that signed updates are unconfigured. The UI restored the
existing synthetic Behavior and scheduled one 23:10 EDT reminder. Settings
verified one retained request for one eligible Occurrence at 23:08:19 EDT.
Native UI evidence: `/private/tmp/cadence-native-qa/delivery-fix-scheduled.txt`.

macOS 14 runtime remains unverified. Original signed-release installation and
recovery remain deferred; preview update/recovery tests need their own evidence.
Product notification click/focus, actual system sleep/wake, and owner-confirmed
offline launch/persistence passed in the checks above.

## Remaining owner-assisted acceptance

The 2026-08-31 preview preparation is authorized under Ticket 113. Prepare
concrete artifacts and the dedicated HTTPS feed locally before requesting any
public hosting approval. Real preview upgrade tests follow that approval;
local tests do not substitute for them. Keep private keys and passwords out of
chat, logs, tracked files, and build artifacts.

Apple enrollment, Developer ID signing, notarization, and final-release
acceptance remain deferred. macOS 14 needs a suitable test system; it does not
block preparation on this laptop. The six asset permissions are resolved for
Cadence distribution and must not be requested again.
