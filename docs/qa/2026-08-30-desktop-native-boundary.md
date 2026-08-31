# Ticket 108 native boundary evidence

This is development-bench evidence, not tracking parity or release acceptance.
The host ran macOS 26.5.2 on Apple Silicon with Node 24.19.0 and Rust 1.97.1.
No hosted data, real reminder content, or provider operation was used.

Current scope update, 2026-08-31: Ticket 113's ad hoc, unnotarized preview is in
progress. Original Apple enrollment, Developer ID signing, notarization, and
final-release acceptance are deferred, not passed. The owner authorized Cadence
distribution of the six exact hashes in
[the asset record](2026-08-30-desktop-asset-provenance.md). MIT exclusions,
reserved marks, and third-party notices remain unchanged. The dated observations
below remain historical evidence; they do not describe the preview's readiness.

## Passed

- TypeScript/Vite frontend build and debug Tauri application packaging.
- Real SQLite commit, forced transaction rollback, and database reopen tests.
- Native command validation rejects foreign IDs, duplicates, unknown fields,
  and invalid notification batches. Empty cancellation is idempotent.
- Actual WKWebView rendering at `tauri://localhost` in the packaged application.
- Native UI commit, changed-input rollback, quit, and reopen preserved the
  committed value and revision. No web server was needed by the packaged app.
- Native permission readback reported `notDetermined`. Scheduling before
  permission returned a clear error. Readback confirmed zero pending requests.
- After owner authorization, the Cadence-only macOS notification switch was
  enabled. Native permission readback reported `authorized`.
- Temporarily disabling that switch produced `denied`. Scheduling refused the
  request, while a SQLite commit succeeded and advanced revision 1 to 2. The
  Cadence-only notification switch was restored to enabled. Global notification
  settings and other applications' settings were not changed.
- Scheduling one synthetic notification returned one pending request and zero
  missing IDs. Repeating the same stable ID kept one pending request.
- Timing replacement passed separately: a 180-second request submitted at
  `20:51:28.662Z` was replaced with a 30-second request at `20:51:36.794Z`.
  OS readback showed delivery at `20:52:06Z`. Readback after the original
  `20:54:28Z` deadline showed zero pending requests and only that one delivery.
- Fully quit delivery passed OS readback: after quitting before the fire time,
  reopening returned `cadence-spike.1` with `deliveredAt` of
  `2026-08-30T20:43:23Z`. The app's next startup event was at `20:43:46Z`.
  This proves retained OS delivery, not banner visibility or click activation.
- Cancellation removed pending requests. A subsequent quit/reopen read back
  zero pending requests. Delivered-only cleanup also removed the observed
  `cadence-spike.1` notification; separate delivered readback returned `[]`.
- Empty cancellation returned zero pending requests. Cleanup queries both pending
  and delivered IDs, deduplicates overlaps, and never clears another app's data.
- Native keyboard Tab moved focus from the test value to the commit button.
- Application activation produced a native resume event. This does not prove
  wake from system sleep.
- Browser preview at 390px and 1280px had no horizontal overflow or console
  errors. Native controls were disabled outside Tauri.
- The compiled bundle declares macOS 14 minimum and contains an arm64 binary.

## Failed coverage gate

The 2026-08-30 capacity probe submitted 128 unique synthetic requests with a
24-hour delay. macOS returned 100 pending requests, 28 missing IDs, and zero
scheduling errors. A later read and a full application restart both retained
100 requests. All retained requests were then cancelled; readback returned zero.

The host's `usernoted` log corroborated this result with exactly 28
`Too many requests, dropping` entries from 16:38:36.335 through 16:38:36.348
America/New_York. Evictions included previously accepted identifiers, not only
the final requests. Acceptance callbacks alone therefore cannot establish coverage.

This is evidence of a 100-request ceiling in this probe on macOS 26.5.2, not
a universal macOS limit. A one-request-per-Occurrence schedule for four daily
Behaviors needs 120 requests over 30 days. The current approach cannot promise
the agreed coverage based on this result.

This result blocked the original coverage gate. The owner then explicitly
accepted a clearly displayed OS-limited reminder horizon on 2026-08-30.
Thirty days remains the target. Nearest eligible reminders take priority;
actual pending readback bounds contiguous coverage. Shorter or unverified
coverage must remain visible. The observed count is not a universal limit.
No background helper or silent truncation is authorized by this decision.
Ticket 108 has resumed; native activation proof still precedes broad extraction.

The revised native coverage probe passed at `20:57:50Z`. It submitted 128
requests with a 24-hour delay and one-minute spacing, then repaired retention
using the nearest observed count. Actual OS readback verified 100 of 128
requests. The UI showed `limited`, verified through `2026-08-31T22:36:47Z`,
and first unscheduled at `2026-08-31T22:37:47Z`. The 30-day target remained
visible. These checks compare request identity, fire time, and content; a
later retained request cannot hide an earlier coverage gap. All capacity
requests were then cancelled.

Pure resolver and adapter tests cover nearest selection, partial same-time
groups, holes, mismatched times/content, unknown readback, invalid input, and
the bounded repair. The complete test suite passed 1,121 tests with one
environment-gated skip. Seven temporary mutation checks rejected faulty
selection, rounding, matching, coverage, and validation behavior.

## Remaining native evidence

Visible presentation, sleep/wake, and macOS 14 runtime verification remain
unverified. App activation emits `resume`;
system wake has a separate `wake` event. Neither event proves notification
activation. Delivered storage contains only notifications retained by macOS;
an empty list cannot establish that an earlier notification was never delivered.

Computer Use exposes only a Month widget for Notification Center on this host;
it does not expose the actual notification row for a click. A Persistent-style
probe produced a retained delivery and an OS log reporting alert presentation,
but no accessible alert. This does not establish that global privacy settings
suppressed it. The app-only alert style was restored to Temporary, and all
notifications from that probe were cleared.

The user clicked the separate **Cadence native reminder test** notification
from fully quit and confirmed the app opened. Native readback recorded
`{ kind: "notificationActivated", id: "cadence-spike.1", at: "2026-08-30T21:05:16Z" }`.
No agent manually launched the app before this event. Cleanup at `21:05:50Z`
and separate delivered/pending readbacks at `21:05:53Z` and `21:06:04Z` verified
zero remaining synthetic notifications. This completes Ticket 108's native
boundary prerequisite; product reminder lifecycle and release checks remain.

The owner authorized OS notification changes and similar local verification
on 2026-08-30. Further equivalent local checks do not require renewed permission.

## Release boundary

### Product tracking follow-through

Actual WKWebView QA created the synthetic `Desktop QA walk` Behavior on
2026-08-30, daily at 18:30. The Timeline accepted Completed and saved the note
`Native note persisted after restart.`. The app quit with timing active.
After reopening, the Timeline retained Completed, the note, and the running
timer. Stop saved 101 seconds. This verifies native UI-to-SQLite persistence;
it does not establish complete tracking parity or reminder product coverage.

The first create refresh exposed concurrent occurrence-generation planning.
The local generation queue now serializes focus and screen refresh calls.
An actual SQLite contract verifies two concurrent Timeline loads return the
same generated occurrences. The rebuilt app opened successfully at 17:41 EDT.
Subsequent refreshes completed without the earlier generation conflict.
Actual WKWebView rendering showed the full Cadence brand after the width fix.

### Native product Settings and cancellation

The 17:41 EDT build opened Settings through the native sidebar. It displayed
macOS permission as Allowed and verified 29 retained reminders out of 29
eligible reminders. The visible target and verified-through time were
September 29 at 17:41:38 EDT. Saving the unchanged America/New_York timezone
returned `Timezone confirmed.` and retained the same scheduling count.

Unmarking today's synthetic Occurrence increased the verified pending count
to 30 of 30. Marking it Not Completed then returned coverage to 29 of 29.
Settings readback at 17:54:38 EDT confirmed 29 retained and 29 eligible, with
verified coverage through September 29 at 17:54:38 EDT. The interface states
that scheduling does not prove delivery and that opening Cadence refreshes
the verified horizon. These observations exercise actual macOS scheduling
and cancellation, not the simulated adapter.

The synthetic Behavior remains available for subsequent export checks.
Archive cleanup, product notification activation routing, sleep/wake, and
macOS 14 runtime verification remain unverified at this checkpoint.

### Native portability and narrow-layout checks

The native Export screen rendered all five formats, shared range/privacy
options, prompt tools, import, and restore. Cancelling NSSavePanel returned
`Save cancelled. No file was written.`. Saving the default BehaviorLog bundle
created a 14,018-byte archive with mode `0600`. Reading that saved artifact
confirmed notes and time sessions were excluded. Enabling both privacy
options created a separate 14,883-byte bundle containing the synthetic note
and its original timing interval (21:32:34.748549732Z–21:34:15.786605692Z).
The Copy summary action returned `Copied` in WKWebView.

Uploading the default bundle through the native file picker produced a valid
preview. Approved merge created zero Behaviors, schedules, Occurrences,
status events, Notes, or interventions and mapped three existing records.
Repeating the accepted merge retained the same applied run and counts.
Restore preview disclosed future-Occurrence deletions. A full-note backup
required a separate sensitivity acknowledgment. Lowercase `restore` kept
Apply restore disabled; exact `RESTORE` enabled it after both acknowledgments.

The first restore binding rejected an unreviewed change to a Keep Behavior.
No domain write occurred. Subsequent native selected-day review still showed
the saved note and `1m 41s`. The planner now preserves Keep rows exactly;
a real SQLite self-export/merge/restore regression verifies that fix.
The rebuilt native UI restore passed at 18:08 EDT. It deleted 31 reviewed
future Occurrences, preserved the Keep Behavior/schedule and current note,
and applied imported note, timing, and provenance records. The subsequent
Behavior view still showed `1m 41s`. Normal occurrence generation and native
reminder reconciliation ran after the commit.

Selected-day review opened through the Behavior calendar without leaving the
native app. Its Review disclosure exposed status, Note, and timing controls.
Reset tracked time removed the tracked total. These changes affect only the
known synthetic Behavior; the full export remains available in the QA folder.

Actual WKWebView rendering at 406×800 showed the mobile navigation drawer,
Behavior analytics, selected-day review, and expanded Timeline controls without
horizontal clipping. The drawer closed after navigation. Primary navigation
initially retained the previous scroll offset. The rebuilt app resets scroll
on explicit screen navigation; Settings and Behaviors opened at the top after
leaving a scrolled Export view. Space toggled the focused Occurrence
disclosure. Tab traversal did not advance during Computer Use; keyboard
traversal remains unverified. Wry already enables the public tab-focus setting.

Screenshots: [Behaviors at 406px](images/2026-08-30-desktop-behaviors-narrow.jpg)
and [expanded Timeline at 406px](images/2026-08-30-desktop-timeline-narrow.jpg).

Native archive and restore passed. Archiving the synthetic Behavior removed
it from Active and placed it in Archived. Settings verified zero retained and
zero eligible reminders at 18:09:44 EDT. Restoring it returned the Behavior
and its `1m 41s` history. Native readback then reported a shorter horizon
(27 of 29 requests); the UI displayed Limited coverage and its first gap.
The retention cause is under investigation. The interface did not claim
complete coverage.

Show setup guide reopened the checklist. It showed the local import step as
Started, notifications Enabled, and timezone Confirmed. Open import navigated
to Export and scrolled to the loaded BehaviorLog import controls. Settings
also displayed `Signed updates are not configured for this build.` without
offering installation or contacting an update feed.

Three actual TypeScript-to-Rust SQLite tests cover tracking/restart, all export
formats and sensitive defaults, timezone changes/no-op saves, reminder capacity
repair, status cancellation, denied permission, and failed cancellation retry.
Reminder tests use a simulated OS adapter and the real SQLite transaction layer.
Native storage tests separately cover rollback, history, ownership, revision
conflicts, Unicode limits, and export cutoff precision.

The local signing keychain reported zero valid code-signing identities.
The initial `--no-sign` build had only a linker-generated ad hoc signature.
The reproducible `desktop:native:build` command now uses `tauri.local.conf.json`
with ad hoc signing identity `-`. Strict `codesign` verification passes; the
signature binds the `app.cadence.desktop-spike` identity, `Info.plist`, and
sealed resources. It has no TeamIdentifier or Developer ID release signature.
Developer ID application/DMG signing, notarization,
Gatekeeper acceptance, updater signatures, update preservation, and migration
recovery remain pending. No public release occurred.

At this checkpoint, read-only asset review found local license evidence for
Fontsource IBM Plex
Sans and Lucide, including its Feather notices. Required product PNGs, the
completion MP3, and packaging icons remain excluded from the repository's MIT
grant pending provenance confirmation. This is already recorded in
`README.md` and `docs/OPEN_SOURCE_DECISION_PACKET.md`. Local implementation may
continue, but redistribution rights and packaged notices remain release gates.

### Final identity, adoption, and reminder repair

The final `Cadence.app` opened at 19:55 EDT with bundle identifier
`app.cadence.desktop`. The native adoption copied the existing spike database
without removing its original file. Read-only SQLite comparisons confirmed
identical profile, timing session, five status events, six import runs, fifteen
import mappings, and one imported Note. SQLite integrity returned `ok`.
The profile UUID stayed unchanged. The archived Behavior retained its revised
title, Fitness category, Monthly day-31 schedule, and `1m 41s` history.
This proves the local identity transition, not a signed installed-app upgrade.

The final identifier initially reported Not requested, then Denied after the
request. The denial's cause was not established. Enabling Cadence in macOS
System Settings and refreshing returned Allowed and verified zero pending
requests at 19:57:19 EDT. Permissions did not silently transfer from the spike.

Restoring the synthetic Behavior and saving Daily at 18:30 scheduled all thirty
eligible requests. Readback verified 30/30 at 19:58:20, again after manual
refresh at 19:58:52, and after full quit/reopen at 19:59:16 EDT. The last check
verified coverage through September 29 at 19:59:15 EDT. The app therefore no
longer reproduced the previous repair's shrinking inferred capacity. The
original macOS retention loss remains unexplained; capacity is still observed,
not hardcoded or guaranteed. Archive cleanup verified 0/0 at 19:59:31 EDT.
The synthetic Behavior remains archived; its history and backups remain.

Show setup guide, Dismiss, Behaviors, then Timeline no longer reopened setup.
A full quit/reopen also preserved dismissal. The final app bundles the fixed
parent request reset. Earlier native Note checks also preserved an unsaved
draft through a status refresh, saved it, cleared it, and verified the empty
Note after navigation. The original synthetic Note was then restored.

Native form checks exercised Weekly interval two with selected weekdays,
Exact time, Morning and custom ranges, adding/removing a second time and a
second schedule, and Cancel restoring saved values. A subsequent Monthly
day-31 save changed the title/category/schedule while retaining historical
status, Note, and timing. These are representative actual WKWebView workflows;
they do not establish every interaction variant or whole-app keyboard access.

The final app metadata declares macOS 14.0 minimum and arm64 only. Strict deep
code-signature verification passes with an ad hoc runtime signature, sealed
Info.plist and resources, and no TeamIdentifier. Developer ID signing,
notarization, Gatekeeper release acceptance, live signed updater installation,
actual product notification activation/focus, sleep/wake, and macOS 14 runtime
remain separate acceptance gates.

### Final packaged keyboard and artifact checks

The final bundle corrected a native WebKit focus bug: pointer activation did
not focus the Needs decision launcher, so dismissal restored focus to the body.
The shared dialog now prefers its connected launcher. Web and desktop drawer
launchers explicitly focus before opening for the same reason. Executable DOM
regressions reproduce the old failure and pass with these changes.

Actual final WKWebView checks passed: Escape closed Needs decision and restored
focus to its launcher; Tab moved to Show more days; Return expanded Timeline
through September 13. Tab then reached the app brand and primary navigation.
Return opened Behaviors, Tab reached Create behavior, and Space expanded its
form. The earlier Tab blocker no longer reproduces from restored focus. These
checks establish representative keyboard access, not an exhaustive screen-reader audit.

The standard Tauri CI build produced Cadence.app and
Cadence_0.1.0_aarch64.dmg at 20:07:05 EDT. An earlier sandboxed DMG attempt failed
with `hdiutil: create failed - Device not configured`. The identical CI wrapper
succeeded with authorized disk-image service access and skipped Finder
AppleScript customization. No fallback script or release bypass was added.

The DMG is 13,828,759 bytes, UDZO/HFS+, and passed CRC verification. Its read-only
mount contained the exact verified app manifest, Applications link, and volume
icon. The verification detached its temporary mount cleanly. The app has a
valid ad hoc runtime signature; the DMG is unsigned. Neither is notarized.
DMG SHA-256: `8849b023dfa760b08c81e6c878f068bfd89df2a989a3d885382ac2cab1c8d810`.
Executable SHA-256: `acc9f1f4c5d1e5e1e895c530934ebfe55e381b1679330cbe8855f635583caa8c`.

Minisign 0.12 is installed for subsequent real updater-artifact verification.
No production updater keys were generated at this checkpoint. Release preflight rejected
missing Developer ID/notarization credentials and an owner-controlled updater
key/feed. Brand and audio redistribution rights were unverified at that checkpoint.

A single product reminder, Cadence activation QA, was scheduled for August 30
at 20:11 EDT. Settings verified exactly one retained request. Cadence was fully
quit before that time and remained quit when checked afterward. No click was
observed. A manual launch at 20:14:46 read the actual macOS delivered request
`cadence.local.331232a4-9433-442d-816f-a6c037a214bb` and recorded `delivered`.
This establishes OS delivery while quit, not visible presentation or activation.
Archiving that synthetic Behavior verified zero retained and zero eligible
requests at 20:15:09 EDT; reconciliation also verified removal of its delivered
Notification Center entry. Both synthetic Behaviors remain archived.

The final narrow drawer also passed actual focus QA: pointer opening focused
its first button; Escape closed it and restored focus to Open navigation.
The original desktop and shared-dialog focus failures are fixed in the DMG.

### Concurrent source changes after packaging

At 20:09 EDT, the separate Audit Cadence feature parity task began changing
BehaviorLog exports to 0.3.0-draft. This is authorized parallel work outside the
verified DMG snapshot. A later complete-suite attempt passed 1,255 tests,
skipped 15, and failed four newly introduced export assertions. The subsequent
real SQLite run passed five tests and failed eight while the exporter referenced
a helper that the other task had not yet finished. These results describe a
moving source tree, not a diagnosed regression in the packaged 0.2 snapshot.
No parallel edits were reverted or weakened. Full repository, both adapter
contracts, and native/web builds must rerun after that task's source freeze.
