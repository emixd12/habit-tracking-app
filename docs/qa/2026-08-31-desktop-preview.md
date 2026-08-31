# Cadence unnotarized preview and updater acceptance

## Published preview continuation

The owner approved publication of the eleven-asset packet and five feed stages.
The original proposed tag baseline existed only locally. The owner separately
approved remote commit `02a69374122f6492e5fb6414e76a9fb34b040aef`; no source push ran.
The prerelease published at 21:00:02 UTC on 2026-08-31:
[desktop-preview](https://github.com/emixd12/habit-tracking-app/releases/tag/desktop-preview).
Release ID `380047141` is a prerelease, not latest. GitHub's eleven asset digests
matched the approved local hashes before publication. The source-archive mismatch
remains disclosed; the local build-input inventory remains unchanged.

Safari downloaded the `.1` DMG from the public release. Its SHA-256 matched the
approved artifact, and Safari attached `com.apple.quarantine`. Finder installed
the app into `/Applications/Cadence.app`, retaining quarantine. Every installed
file matched the staged app and strict code signature validation passed.
macOS blocked first launch with its unverified-app warning. System Settings →
Privacy & Security → Open Anyway, followed by the per-app confirmation, allowed
launch. No global Gatekeeper change or quarantine removal ran. Settings displayed
`0.1.1-preview.1`, Allowed notifications, and zero retained/eligible reminders.
The initial live feed correctly reported no newer version.

A fresh protected SQLite backup precedes hosted testing:
`/Users/emi/Library/Application Support/Cadence Release/backups/pre-hosted-updater-20260831T205540Z.sqlite3`.
It passed integrity and foreign-key checks at schema 6. The previous local app
is preserved beside that backup as `Cadence-before-downloaded-preview.app`.

The approved invalid-signature, tampered-archive, and unavailable-download feeds
were served over HTTPS in sequence. Cadence displayed each feed's exact QA notes
and offered `.2`. Every Download and install attempt returned a retryable error.
The installed executable retained `.1`'s SHA-256 after every failure.

The approved valid feed then installed `.2`. Cadence reported that installation
was complete and required a separate restart. Before restart, the running UI
still displayed `.1`, while the installed app matched the staged `.2` bundle and
passed strict code-signature validation. Restart Cadence quit and relaunched the
app. Process evidence captured the new `.2` process before GUI inspection.
Settings displayed `0.1.1-preview.2`; a new check reported no newer version.

Coherent post-failure and post-upgrade SQLite comparisons preserved all 22
domain tables exactly. They include the stable profile, Behaviors, Notes,
Occurrences, histories, timing, provenance, migration ledger, cursors, and
tombstones. Original outbox rows remained exact; only new routine rows appended.
Reminder state changed only verification timestamps and coverage metadata.
Integrity returned `ok`, foreign-key errors were zero, and schema remained 6.
Both previews use schema 6, so shipped-migration testing is not applicable to
this release. Forty-one native tests cover migration rollback and reopen. The
first future schema-changing desktop update must upgrade an older installed
version through the real updater after a protected database backup. Raw private UI evidence is under
`/private/tmp/cadence-native-qa/hosted-*`.

Ticket 113 is complete for this preview milestone. Ticket 115 separately owns
deferred Apple Developer Program access, Developer ID signing, notarization,
stapled artifact verification, quarantined notarized-DMG Gatekeeper acceptance,
and macOS 14 execution. None of those Apple requirements passed here.

## Protected key and data baseline

One persistent encrypted Tauri updater key was generated after checking existing
key locations and environment. Its password is retained in login Keychain.
Owner-only directories and files passed permission checks. An empty password
failed; the retained password signed a fixture that real Minisign verified.
Paths, fingerprint, and password-manager instructions are in
[Desktop release](../DESKTOP_RELEASE.md#persistent-updater-key-handoff).
Password-manager backup still requires the owner.

Before installing either preview, SQLite online backup produced:
`/Users/emi/Library/Application Support/Cadence Release/backups/pre-preview-20260831T050924Z.sqlite3`.
The adjacent JSON contains private table counts and hashes. Both are outside
the repository and publication assets. Integrity returned `ok`; foreign-key
errors were zero. The baseline has one profile, four archived Behaviors, six
Occurrences, six status events, twenty configuration events, five definition
events, and six applied migrations. No user data was reset.

## Preparation checkpoint and hosting boundary

The following section records the approved pre-publication checkpoint. The
published continuation above supersedes its statements about current hosting.

Read-only GitHub checks verified authenticated owner access to the existing
public `emixd12/habit-tracking-app` repository. No releases existed.
The immutable-releases API returned `enabled: false`, `enforced_by_owner: false`.
The prepared channel uses tag `desktop-preview` and a versioned asset set.
Its feed URL is
`https://github.com/emixd12/habit-tracking-app/releases/download/desktop-preview/latest.json`.
No repository token enters the app or feed. Publishing the concrete files,
creating the tag/release, and exposing the feed require owner approval.

The concrete packet is `apps/desktop/.release/preview/hosting/APPROVAL.md`.
`publication-plan.json` lists eleven allowed public assets and their hashes.
Five prepared feed variants cover initial `.1`, invalid signature, tampered
archive, unavailable download, and valid `.2`. Only `latest.json` changes during
the controlled acceptance sequence. The tampered archive is labeled QA ONLY.
Local validation accepted both valid feeds and rejected both cryptographic
failure cases. The unavailable-download filename does not exist. These are
prepared test inputs, not evidence of installed updater behavior.

The packet discloses that binaries include uncommitted desktop work. The proposed
tag baseline is `f65832d72120462b3c5f9f67379aa0362ad660fb`; GitHub's automatic source
archive at that commit will not reproduce these binaries. The packet includes
a build-input hash inventory. No commit, source push, tag, release, or upload ran.

## Local results

Both `0.1.1-preview.1` and `0.1.1-preview.2` built successfully using the same
persistent updater key. Each staged bundle passed strict sealed ad hoc signing,
hardened runtime, arm64, plist and compiled macOS 14 minimum, read-only DMG
integrity/content comparison, real Minisign verification, and full updater
archive comparison. Build logs confirm Apple credential absence and skipped
notarization. No Apple acceptance is claimed.

| Candidate | DMG SHA-256 |
|---|---|
| `0.1.1-preview.1` | `39f716fdff864b1a4203f5c05a1cadbadf295608d75f387364e53aab717c54b2` |
| `0.1.1-preview.2` | `0efe7fe186c111237a415ed05b5b6db899d8cb483db5adb9ab1fbdef0e61e774` |

Artifacts and per-version reports live under
`apps/desktop/.release/preview/<version>/`. The DMG is under `bundle/dmg/`;
the app, updater archive, and signature are under `bundle/macos/`.
The staged `.1` artifacts remained unchanged after the `.2` build.
Both real archives passed additional tampered-byte and invalid-signature
rejection through the release verifier. No protected key/password value or
database file was found in either staged app or the publication allowlist.

The verified local `.1` DMG installed to `/Applications/Cadence.app` after the
debug app quit. Installed files matched the verified bundle, and strict codesign
passed. Computer Use launched it and Settings displayed `0.1.1-preview.1`,
notifications Allowed, and zero retained/eligible reminders. A manual update
check returned a safe error with the retry control still available while the
feed was unpublished. This does not establish network recovery after hosting.
No quarantine attribute or Gatekeeper setting changed. This was a local DMG,
not a downloaded DMG; no downloaded-launch result is claimed.

A coherent SQLite snapshot matched the backup across twenty-two tables,
including profile identity, Behaviors, Notes, Occurrences, status/configuration/
definition history, timing, provenance, and migration ledger. Existing outbox
rows remained identical. Only routine reminder coverage, appended outbox rows,
and native reminder verification timestamps changed. Native reminder states and
delivery evidence remained intact. Integrity returned `ok`; foreign-key errors
were zero. Raw local evidence is under `/private/tmp/cadence-native-qa/preview-1-*`.
Cadence remains installed and open as `.1` for the future real `.2` update.

Verification passed: agents, interactions, resolvers, core portability, design
system, lint, web/desktop TypeScript, and web/desktop builds. The full suite passed
1,374 tests with 17 environment-gated skips. Forty-one Rust tests and fifteen real
SQLite contracts passed. Native migration tests verify DDL/ledger rollback,
history/provenance/outbox preservation, and successful reopen after recovery.
Twenty-five focused release/updater tests and independent tooling review passed.
Lint retained seven pre-existing vendored-validator warnings; desktop Vite
retained its chunk-size warning. A later strict production check loaded the
existing updater endpoint, key, and protected password successfully. It stopped
only on the unavailable Developer ID and notarization inputs now owned by
Ticket 115. An initial double-encoding of the already canonical public-key file
was corrected in the invocation without changing code. The desktop parity gate
passes all 64 applicable intents.

## Remaining acceptance limits

Downloaded launch, signature/tamper rejection, unavailable-download recovery,
user-controlled installation/restart, and data preservation pass. Shipped-
migration testing is not applicable because both versions use schema 6. Native
rollback tests remain current evidence for migration safety.

Reuse the prior [offline, notification-click, and sleep/wake evidence](2026-08-30-desktop-lifecycle-release.md)
where unchanged. The available host runs Apple Silicon and macOS 26.5.2.
Ticket 115 defers Developer ID signing, notarization, stapled app/DMG validation,
downloaded notarized-DMG Gatekeeper acceptance, and Apple Silicon macOS 14
execution. Marketing must not claim notarized or generally available distribution.
