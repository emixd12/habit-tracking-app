# Desktop account-sync release acceptance — 2026-09-01

Ticket 122 is complete. Preview.19 is the live updater feed and installed
desktop version. Preview.14 supplied the accepted schema 9-to-10 updater
migration before preview.15 corrected preview authentication and preview.19
completed first hydration. Hosted migrations remain deployed and congruent
through `20260902052213`; hosted account-sync smoke, including serialized
same-account plans, cross-account entity identities, and bounded receipt replay,
and the 92-check hosted RLS smoke pass. Hosted disposable-fixture cleanup also passed.

## Preview.14 migration acceptance, superseded

The existing `desktop-preview` prerelease received exactly three immutable
preview.14 assets:

- Archive SHA-256: `102601e06b172817ba9570e76697a25ea152fe6df09ed61c3b406ed08d2e9212`.
- Signature SHA-256: `677888d8a709d65d0d9d0d890dbaca869007611e94d758e2305b42341179048b`.
- DMG SHA-256: `04d3ee5ebda24532aa02f2aa3ba06e975368940cf0ff65063a8db7181a6c2123`.

The updater stages passed in the reviewed invalid-signature, unavailable-
download, final-valid order. Each stage passed remote readback and produced the
expected Cadence result. The final-valid preview.14 `latest.json` checkpoint had SHA-256
`98cd47d6c3cda522331474f370ba3a00089f931eb48b4e8cb806c0c2e860b649`.
The release remains prerelease and not latest.

The real updater installed and restarted `/Applications/Cadence.app` at
`0.1.1-preview.14`. Strict deep code-sign verification passed. The installed
executable SHA-256 is
`47f35e8918782eee7f0f6d4ed71df9e87ef3b748f6ff0827e286aacbbc40d97b`.
Settings exposes enabled **Sign in with Google**, shows no missing-configuration
warning, and reports no newer version.

Postinstall acceptance passed schema 9-to-10 migration. Stable profile identity
and all owner-data counts were preserved or increased. SQLite integrity was
`ok` with zero foreign-key violations. The installed app, database, and
acceptance scope contained zero authenticated-session or service-role findings.

## Immutable local evidence

- Candidate: `0.1.1-preview.3`, `app.cadence.desktop`, Apple Silicon.
- Updater feed target: `https://github.com/emixd12/habit-tracking-app/releases/download/desktop-preview/latest.json`.
- Candidate updater archive SHA-256: `bf7901d9011c60835a98588d4bff3332aa8faa610c8eaf23620186a0c12c6ddc`.
- Candidate updater signature SHA-256: `530e058b950f8f0d437571381718eab810cdde7f9a670714c91a0431034210cc`.
- Candidate DMG SHA-256: `377db9e2e7a9d3bf5fa065f996d6ba7b68e22b6d924c1bdee9b8297c6117fbf0`.
- Candidate executable SHA-256: `32ec15f85d19ce4d52088997db4a459b98f7f7691aaaa65242da8b3557cefed9`.
- Unpublished publication packet: `apps/desktop/.release/preview/0.1.1-preview.3/publication/`.
- Packet feed: version `0.1.1-preview.3`, date `2026-09-01T06:33:02.426Z`, archive URL `https://github.com/emixd12/habit-tracking-app/releases/download/desktop-preview/Cadence_0.1.1-preview.3_aarch64.app.tar.gz`.
- System: Apple Silicon, macOS 26.5.2. macOS 14 execution remains unverified.
- Protected pre-migration database: `~/Library/Application Support/app.cadence.desktop/Backups/<protected-backup>.sqlite3`.
- Protected database SHA-256: `8a620af4d576baaacb4521829ef6b2baa9a5ac8679e38e325d866cc53496b97c`.
- Live database: `~/Library/Application Support/app.cadence.desktop/cadence.sqlite3`.

The candidate passed strict sealed ad hoc signing, hardened runtime, arm64 and
compiled macOS 14 minimum checks. The DMG matched the app. The persistent Tauri
signature verified the updater archive. The archive matched the app. Nothing
was published or installed.

The packet contains only three staged versioned artifacts plus the reviewed
`latest.json` remote asset. `SHA256SUMS`, `publication-plan.json`, `APPROVAL.md`,
and `release-notes.md` remain local instructions. The upload order is archive,
signature, DMG, remote hash verification, then three controlled `latest.json`
states: invalid signature (`ad1cd9df271ad28b1e94cadfdefd897dad9c7300e0d7bb60b203d7034c2d0247`),
unavailable download (`7d4fb192fea7b4f0973d612036024683b1c2de5bb21ea484dbf28110a68ae69e`),
and final valid (`83a87dd88bf75d38f3dfab1ea47faca0266d8b8ae9d80248fb396d15553aed21`).
Each state requires remote readback before the next test. The final feed signature
exactly matches the staged `.sig`; the feed URL names the staged archive. The
packet reuses the preview.1/.2 persistent public key with file SHA-256
`9d9ad9583f13e0b0a69f0369a7f0b409c26b73785a6886d4c0a7811d9b51823f`.

## Remote publication checkpoint

The owner approved the exact packet. GitHub authentication resolved to
`emixd12`. The existing public release remained tag `desktop-preview`, release
ID `RE_kwDOSy66iM4Wpw8l`, prerelease `true`, draft `false`, and not GitHub's
latest release. GitHub returned no latest non-prerelease release.

Only these immutable preview.3 assets were uploaded on 2026-09-01:

- Archive asset `RA_kwDOSy66iM4gKXMX`, 7,866,182 bytes,
  SHA-256 `bf7901d9011c60835a98588d4bff3332aa8faa610c8eaf23620186a0c12c6ddc`.
- Signature asset `RA_kwDOSy66iM4gKXMZ`, 404 bytes,
  SHA-256 `530e058b950f8f0d437571381718eab810cdde7f9a670714c91a0431034210cc`.
- DMG asset `RA_kwDOSy66iM4gKXMW`, 7,683,530 bytes,
  SHA-256 `377db9e2e7a9d3bf5fa065f996d6ba7b68e22b6d924c1bdee9b8297c6117fbf0`.

GitHub's remote digest and size matched each local allowlisted file. A separate
download to `/private/tmp/cadence-preview3-remote.t0uVNR` matched every byte.
The reviewed release notes were read back exactly. No packet metadata, database,
backup, key, log, or unrelated working-tree file was uploaded.

The public `latest.json` remained the valid preview.2 feed with SHA-256
`fa6bfcf661b2746272356a98200d26d23730ada596b873c4a23b3e22ba1104c1`.
At the immutable-asset checkpoint, no preview.3 feed stage had started. Root then
prepared the installed preview.2 app and protected database backup.

Root then installed published `0.1.1-preview.2`, restored and inspected the
representative schema-6 data, and created owner-only backup
`~/Library/Application Support/app.cadence.desktop/Backups/<pre-update-backup>.sqlite3`.
The backup has mode `0600`, integrity `ok`, and SHA-256
`9128472e821e81fc5cff2e48d1ac68c14d8807fa9144c8f56f516ba75df1235e`.

The approved invalid-signature feed became remote `latest.json` asset
`RA_kwDOSy66iM4gKXxm`. GitHub reported 809 bytes and SHA-256
`ad1cd9df271ad28b1e94cadfdefd897dad9c7300e0d7bb60b203d7034c2d0247`.
A separate download to `/private/tmp/cadence-preview3-feed01.tZ8L0I/latest.json`
matched the local feed byte-for-byte. The release remained prerelease `true`,
draft `false`, and not GitHub's latest release. The unavailable-download and
final-valid feeds have not been published.

The native invalid-signature gate passed after action-time confirmation.
Cadence found preview.3 but rejected Download and install. `/Applications/Cadence.app`
remained `0.1.1-preview.2`. The live database retained integrity `ok`, schema 6,
and the complete pre-update owner dataset. Only normal launch/reconciliation
outbox entries were added. Retry remained available and the feed note still identified the
wrong-signature test.

The approved unavailable-download feed then became remote `latest.json` asset
`RA_kwDOSy66iM4gKips`. GitHub reported 811 bytes and SHA-256
`7d4fb192fea7b4f0973d612036024683b1c2de5bb21ea484dbf28110a68ae69e`.
A separate download to `/private/tmp/cadence-preview3-feed02.y7HHto/latest.json`
matched the local feed byte-for-byte. The release remained prerelease `true`,
draft `false`, and not GitHub's latest release. The final-valid feed has not
been published.

The native unavailable-download gate passed. Cadence reported, “Cadence could
not confirm the update was installed. Check for updates to retry.” The installed
app remained `0.1.1-preview.2`. The live database retained integrity `ok`, schema
6, and the complete pre-update owner dataset.

The final-valid feed then became remote `latest.json` asset
`RA_kwDOSy66iM4gKj2v`. GitHub reported 908 bytes and SHA-256
`83a87dd88bf75d38f3dfab1ea47faca0266d8b8ae9d80248fb396d15553aed21`.
A separate download to `/private/tmp/cadence-preview3-feed03.Pit7la/latest.json`
matched the local final feed byte-for-byte. The three immutable preview.3 asset
IDs, sizes, and hashes remained unchanged. The release remained prerelease
`true`, draft `false`, and was not the repository's latest release.

## Real updater migration accepted

The valid updater UI reported that the update installed and offered **Restart
Cadence**. Restart launched `/Applications/Cadence.app` as
`0.1.1-preview.3`, bundle identifier `app.cadence.desktop`. Strict macOS
`codesign` verification passed.
After restart, Settings → Check for updates reported, “No newer version is
available.” The final-valid preview.3 feed remained effective.

The exact pre-update backup remained
`~/Library/Application Support/app.cadence.desktop/Backups/<pre-update-backup>.sqlite3`,
mode `0600`, SHA-256
`9128472e821e81fc5cff2e48d1ac68c14d8807fa9144c8f56f516ba75df1235e`.
The installed updater migrated schema 6 through schema 9. Post-restart SQLite
integrity was `ok` with zero foreign-key violations. The stable profile identity
hash matched the protected backup; the private value is not recorded here.

The migration preserved every pre-existing owner data collection. Normal launch
reconciliation advanced the outbox. Schema 9 added account-link metadata without
creating a baseline or first-link attempt.

`npm run desktop:release:acceptance` passed against the exact installed app,
pre-update backup, and post-update database. It found zero authenticated-session
or service-role secrets. This proves the real published updater migration,
restart, identity, and representative-data preservation gate. It does not prove
the remaining two-working-copy synchronization matrix.

The protected schema-6 database and live schema-9 database both passed SQLite
integrity and foreign-key checks with mode `0600`. The stable local profile hash
matched. The migration preserved every pre-existing owner data collection and
outbox row. The schema-9 working copy retains one
nonsecret account-link row. It has no common baseline or cursor yet because a
hosted synchronization has not completed.

`npm run desktop:release:acceptance -- <app> <protected-before.sqlite3>
<after.sqlite3>` requires `CADENCE_DESKTOP_RELEASE_EXPECTED_SCHEMA_VERSION` and
a nonempty JSON array in `CADENCE_DESKTOP_RELEASE_SECRET_CANARIES`. It rejects
databases outside owner-only mode `0600`, requires an actual advance to the
expected schema, and scans the app and both databases for exact canaries,
authenticated JWTs, and Supabase secret or service-role key formats. Keychain
values were not read or printed.

## Read-only secret evidence

The expanded scanner inspected 156 unique files. It scanned four installed app
bundle files; eleven Application Support files; 105 native QA files; twelve
Ticket 122 snapshot files; two Cadence diagnostic/sample logs; and 22 existing
Cadence-named QA log/output files. The Application Support scope included the
live SQLite database, sidecars, every existing protected backup, and backup
sidecars.

The native QA scope included six existing `.behaviorlog.zip` exports. The
scanner inspected both the archive bytes and decompressed contents. That scope
also contained 27 JSON files, 21 text files, and 51 other QA artifacts. No new
export or backup was created.

The installed app, live database, Application Support backups, Ticket 122
snapshots, all six exports, diagnostic report, process sample, and 20 of 22 QA
log/output files contained zero authenticated-session JWT or service-role key
patterns. Two findings remain:

- `/private/tmp/cadence-supabase-recovery.log`: one service-role key pattern.
- `/private/tmp/cadence-supabase-start.log`: one service-role key pattern.

The scanner printed only file, category, and count. It did not print either
matching value. These are local Supabase operational QA logs, not app runtime
logs, app bundle content, SQLite, backups, or exports. They still fail the
literal no-secret-in-logs acceptance boundary until the owner authorizes safe
removal or another approved remediation. Keychain values were intentionally not
read. The second desktop working copy does not exist yet and remains unscanned.

The owner confirmed no process held either finding file and removed exactly
`/private/tmp/cadence-supabase-recovery.log` and
`/private/tmp/cadence-supabase-start.log`. The scanner reran the same logical
156-file scope. It reported those two explicit paths absent, scanned the 154
remaining files, and found zero authenticated-session or service-role patterns.
No app, database, backup, export, or other log changed during this read-only
recovery check.

## Local preview.4 replacement candidate

This section is retained as historical local evidence. Preview.4 and the later
preview.5 are superseded local-only candidates. Preview.6 and preview.7 are
also superseded. Preview.7 built and passed review but predates later migration,
test, and documentation changes. None changes published owner preview.3.

Current source produced the smallest replacement candidate as
`0.1.1-preview.4`. The release overlay owns this prerelease version, so no base
package version changed. The local packet is
`apps/desktop/.release/preview/0.1.1-preview.4/publication/`. Nothing in this
packet was installed or published.

The candidate is Apple Silicon with identifier `app.cadence.desktop`. It uses
the established ad hoc macOS signature, hardened runtime, macOS 14 minimum, and
persistent Tauri updater key. The app contains ten SQLite migrations through
`0010_first_link_attempt_baseline.sql`. Independent `preview-verify` confirmed
that the read-only DMG matches the app, the updater archive matches the app, and
the updater signature verifies. Independent review reported no P1 or P2
findings.

The publication packet preserves the preview.3 packet format. Its exact remote
asset candidates are:

- Archive: 7,859,693 bytes, SHA-256
  `47fe8eac46faa848f2b1960aa59466a793add9b2354f19364b558874a3603860`.
- Signature: 404 bytes, SHA-256
  `14c95abf23ff3ec6ba87c45c6e11bdb4869eff62b30c9c10f9cc490bd7203bb1`.
- DMG: 7,678,921 bytes, SHA-256
  `94835834be8a4e0465a67c792eb65f7436a03050ed55ba003f33696b08d0ea35`.
- Final-valid `latest.json`: 914 bytes, SHA-256
  `ac511c4293b12a8a0081f495bcd611053dd59335c85f4e891b695b78f7f55224`.

The invalid-signature feed SHA-256 is
`0329aea782bb41107f188bf042d00079bfb7030e008eeb199c11af9fec8b9e05`.
The unavailable-download feed SHA-256 is
`916585c16a9d1e904da3c080bf7b48c47cc64e5814a61ed0f4fa7a102b6df191`.
The final-valid test feed exactly matches the packet `latest.json`. The complete
packet tree digest is
`38fab15d4cc6156602e7c79bc999e65687e4d7bae43071bde7b861ab89426097`.

The artifact scan covered the staged app and publication packet, including the
decompressed updater archive. It inspected 15 files and found zero
authenticated-session JWT or service-role patterns. `SHA256SUMS` passed, every
publication JSON file parsed, and governance plus diff checks passed.

A separate read-only GitHub comparison confirmed `desktop-preview` remains
prerelease `true` and draft `false`. No preview.4 asset exists remotely. Remote
`latest.json` remains preview.3 with SHA-256
`83a87dd88bf75d38f3dfab1ea47faca0266d8b8ae9d80248fb396d15553aed21`.
The preview.3 local tree digest remains
`5d6a0bd96576d91879c50543c78b09c8119ba8f73ee0a89f9bafefd7576604e0`.
The preview.4 `APPROVAL.md` states that it grants no publication approval.

## Local and automated matrix already passed

- Tickets 117–121 cover backup/Restore boundaries, authentication replay,
  first-link choices, planner/apply contracts, conflicts, retries, revoked
  sessions, and disconnect transaction behavior.
- A clean loopback Supabase reset applied the account-sync migration.
- `smoke:account-sync:local` passed two-account isolation, stale/conflicting
  apply rejection, replay, fingerprint, timestamp, and cleanup checks.
- `smoke:rls:local` passed 92 ordinary-user ownership checks and cleanup.
- The complete repository, TypeScript, test, build, and native suites passed in
  Ticket 121 evidence. Ticket 122 adds the candidate build and preservation scan.

These checks do not replace the required web plus two independent desktop
working-copy matrix against the authorized hosted schema.

## Hosted schema acceptance

- Preflight showed only `20260901054332_add_account_sync_contract.sql` pending for project `qjodzutjxtmtzczbloxa`.
- The owner-authorized CLI push deployed only that migration. Postflight history matches through `20260901054332`.
- Hosted ordinary-user RLS smoke passed 92 ownership checks and cleaned three temporary users.
- Hosted account-sync smoke passed unauthenticated, isolation, stale-write, cross-owner, replay, merged-fingerprint, timestamp, and idempotency-substitution checks with cleanup.
- No desktop client received a service-role credential.

Later corrective migrations through `20260901203000` are also deployed and
congruent. Hosted account-sync smoke passed after the canonical entity ordering
and half-even timestamp fixes. Hosted RLS passed 92 checks. The obsolete
unguarded `auth_complete_first_link` function is removed. The corrected QA A
and QA B binary hashes are
`051b963faf26e262dba241e8e96a21b8304c94d165d5d3719514830ee5c9873c`
and `317ff0a011d0e92ad56e9b270e52ca1fcc214e008eea6d84b7bdf0c7bfb4d598`.
The root QA
`cadence.sqlite3` was moved outside the repository.

## Remaining release gates

The first disposable two-copy attempt reproduced a hosted expected-null insert
failure after both working copies hydrated the untouched account. The failure
left hosted state seed-only and advanced no local baseline. Follow-up migration
`20260901182100_fix_account_sync_insert_compare.sql` corrects the function
definition. That migration and the later corrections through `20260901203000`
are deployed and congruent. The hosted smokes pass. Native matrix execution is
completed the hosted contract. Migration `20260901200000` supplied the initial
Occurrence-lineage guard; migration `20260901203000` scoped it to account-sync
and restored the existing trigger semantics. The hydration revision and native
status transition passed. Branched status history rejected before review.

Preview.4 through preview.7 are superseded local-only candidates. Preview.7
built and passed review but was not published. Preview.8 must include all later
migration, test, and documentation changes. Published preview.3 remains
unchanged.

## Local preview.8 release candidate

Preview.8 includes the source, migration, test, and latest QA-ledger changes
through hosted migration `20260901203000`. The ignored local packet is
`apps/desktop/.release/preview/0.1.1-preview.8/publication/`. Nothing was
published, installed, or changed on GitHub.

The candidate is `app.cadence.desktop` version `0.1.1-preview.8` for Apple
Silicon. It uses ad hoc signing, hardened runtime, the macOS 14 minimum, and the
persistent updater key. Local release verification passed strict code-signing,
DMG/app parity, updater archive/app parity, and updater signature checks.

The publication packet contains only these versioned upload candidates:

- Archive: 7,843,056 bytes, SHA-256
  `ea3c7e2e8371e095aa81036aeb5ba64abcf53b3f2acc2feceab086b69562d06f`.
- Signature: 404 bytes, SHA-256
  `9870c267f49facb3111e2b45c08d969c67db08db8db982aa6b1b8f9a68e8d841`.
- DMG: 7,658,712 bytes, SHA-256
  `52eeee0a1e6179fc8e66121228ce4703c398f0c233c8052a01ab5e37196667db`.

The invalid-signature feed SHA-256 is
`452c757d4b0c85e73a171a810e7f6741ae0e2ecb6e0d26f7fa3a81cd8fbcd082`.
The unavailable-download feed SHA-256 is
`78eaa909cba39ad70d55c52c4f4da96f23961802693e8228b76c9a0cb9332afa`.
The final-valid feed and packet `assets/latest.json` are byte-identical with
SHA-256
`75e65d66cac83a2b8b5385630a23223c75b4d2910e33bfa7a383abf21e2f1030`.
The executable inside the final archive has SHA-256
`424e6920785b48b6142657b368408a8fddd2fab852c08cb84a3e093fc044767e`.

Preview.8 and preview.9 are superseded local-only candidates. Neither was
published or installed. A later candidate must include the final classifier and
ledger state.

## Published preview.10 release candidate

Preview.10 includes the final classifier, native revoked-session acceptance,
source, migration, test, and QA-ledger state. Its reviewed packet is
`apps/desktop/.release/preview/0.1.1-preview.10/publication/`. Its three
versioned assets are published and immutable, its final-valid feed was live,
and the real updater installed it.

The candidate is `app.cadence.desktop` version `0.1.1-preview.10` for Apple
Silicon. It uses ad hoc signing, hardened runtime, the macOS 14 minimum, and the
persistent updater key. Local release verification passed strict code-signing,
DMG/app parity, updater archive/app parity, and updater signature checks.

The publication packet contains only these versioned upload candidates:

- Archive: 7,843,038 bytes, SHA-256
  `448a41f6df657ec081220426d32f0ebd2a031ab6dd9325bab30bd0a2c55d8d29`.
- Signature: 404 bytes, SHA-256
  `dca3bacb27b52088d57994a15343afe6fc63c0365813cd79bcdc524cf32ae104`.
- DMG: 7,658,664 bytes, SHA-256
  `909e8b4ab7611a9e36930006ebb0f63262a188a624db29900107b0f4c0d083ae`.

The invalid-signature feed SHA-256 is
`b54e96be383a750ffdae885d9a155e36f3f56c08b2f43bcb6886d4162ede2008`.
The unavailable-download feed SHA-256 is
`bbadc96cbbed50212f956a3a46c55c7447d94733b5e2a8feecf0237a55873b03`.
The final-valid feed and packet `assets/latest.json` are byte-identical with
SHA-256
`3fabdb1ad53563546367d1ae9ceded6b1523982e992526fa33cd12e991ca44c2`.
The executable inside the final archive has SHA-256
`6607af6a5a9052c1b09495eb2bb3653a65a3a94202bfc61fa0c019bd1ae306bb`.

Preview.8 and preview.9 remain unchanged, superseded, and unpublished.
Preview.10 is published, installed-defective, superseded, and retained.
Installed acceptance found that its bundle omitted the required public Supabase configuration and
displayed `Account sign-in is not configured in this build.` Future preview
builds fail preflight unless the HTTPS URL and public publishable or legacy anon
key are present. Its immutable assets remain remote. The final feed moves to
preview.11 only after corrected acceptance.

## Local preview.11 public-auth candidate

Preview.11 attempted to supersede preview.10 for release acceptance. The release
preflight accepted the public HTTPS Supabase URL and publishable key, but Vite
did not replace the dynamic whole-object `import.meta.env` access. The staged
binary omitted both values. Its ignored local packet is
`apps/desktop/.release/preview/0.1.1-preview.11/publication/`. Nothing from this
packet was published, installed, or changed on GitHub.

The publication packet contains only these versioned upload candidates:

- Archive: 7,843,056 bytes, SHA-256
  `b1d7c231548ed10810b5e875793145e14cafc9c013cd1ad519cf7bb3bfd30599f`.
- Signature: 404 bytes, SHA-256
  `35051705a24008ede56d1d743994dd36462f00318db577e7831a211a90ffdbb5`.
- DMG: 7,658,659 bytes, SHA-256
  `530162e9a4e1d00cb975455249420e8c3257bec2c12879f34de4b718bb5bdc26`.

The invalid-signature feed SHA-256 is
`ee32c0a9e4b35506eae44568ea0926021b928b67061e12d0c14d62359650da27`.
The unavailable-download feed SHA-256 is
`264c3e9046ed2a0c462115e0486d0e0dc0ff3af7432eecd48bcb5a55e5301933`.
The final-valid feed and packet `assets/latest.json` are byte-identical with
SHA-256
`fa2985629878503ab5dfa2413f5b3443e0cecfac89913d81f58d1e912c36d3dd`.
The executable inside the final archive has SHA-256
`1cf7aaf1da116d3f3a46d7174487c7e66bd37362acef17c334603c6f73dbf611`.

Preview.10 remains unchanged, immutable, and published. Preview.11 is local-only,
superseded, unpublished, and retained unchanged. Preview.12 is also local-only,
superseded, unpublished, and retained unchanged because Tauri's nested frontend
build omitted its reviewed public configuration. Preview.13 was required after
release-owned frontend construction and packaged-marker verification. Preview.13 then failed configuration-only local
verification because raw scanning cannot inspect Tauri-compressed frontend
assets; it produced no immutable bundle. Preview.14 then supplied the corrected
candidate. The release
guard now checks exact markers in fresh frontend output before Tauri runs, while
native configured-state acceptance was the packaging and runtime gate.

## Revoked-session classifier checkpoint

The post-classifier completion matrix passes. Vitest passed 1,463 tests with 23
skipped. All 59 native tests passed. All required agent, interaction, resolver,
lint, type, desktop type, web build, and desktop build checks passed. Only the
existing lint and chunk-size warnings remain.

The unique disposable build is
`/private/tmp/cadence-ticket122-matrix-build/revoked/target/release/bundle/macos/Cadence QA Revoked.app`.
Its bundle ID is `app.cadence.desktop.qa-revoked`. Strict deep code-sign
verification passed. The corrected revoked-session classifier is present in the
compiled app. The executable SHA-256 is
`7a28021b858cbc37702d0655bdf1e4fa70b7cf7a4ec917c051ff7ee988081d60`.
The app-owned FIFO delivered the disposable session. The native app displayed
the exact revoked-session guidance and preserved revoked state on Sync now.
Baseline `ccbb6584…` remained unchanged, pending local mutations remained
unacknowledged, and hosted product counts stayed unchanged. Keep a local copy
then disconnected the account, retained all local product data with integrity
`ok` and zero foreign-key violations, cleared link and baseline rows, and
removed the isolated Keychain item.

At this checkpoint, preview.14 superseded preview.10 as the final-valid updater
feed. Preview.19 later superseded it. The GitHub release remains prerelease,
draft false, and not latest. Ticket 115 still owns Apple-trusted distribution.
The hosted fixture user and its product rows were removed and verified absent.
The exact QA-A and QA-B legacy Keychain items were also removed and verified
absent.

Apple Developer ID signing, notarization, Gatekeeper acceptance, and macOS 14
execution remain deferred with Ticket 115. The owner has no Apple Developer
account. This preview uses the approved temporary legacy-Keychain QA path and
does not weaken that boundary.

## Preview.15 sign-in correction and publication

Installed preview.14 exposed a release-only authentication defect. macOS logged
`NSOSStatusErrorDomain` code `-34018`: the ad hoc app lacked the application
identifier and Keychain access-group entitlements required by the Data
Protection Keychain path. The local database remained healthy.

Preview builds now set the existing `CADENCE_LEGACY_KEYCHAIN_QA` compile flag.
Release verification reads the built executable and rejects an ad hoc preview
without the `app.cadence.desktop.auth.legacy-qa` marker. Production candidates
remain on the Data Protection Keychain path. Tauri string rejections now retain
their native message instead of falling back to a generic local-write error.

Preview.15 passed the focused release and authentication tests, desktop build,
artifact verification, installation, and installed Google PKCE round trip. The
installed app showed the expected signed-in account. Its immutable assets are:

- Archive SHA-256: `4e80c077238da38059f1917883ac16c1f90c4418adb0bef1329f5a1b64a65b44`.
- Signature SHA-256: `f381493d378f1c3025c0f1d0f557a24dfc7d6779c63881b5f9ab5e6b8ee2c2c4`.
- DMG SHA-256: `3de0cf0bf6f5be7cc4eaf30f1fe7d8c165e9406784f3bf3b5777845904e2c519`.
- Final feed SHA-256: `aab3b9dfe4151e8544453969545181c099479f4889d39fbdb9c8bf835b4b5e1e`.

Independent GitHub downloads matched all local hashes. `desktop-preview`
remained prerelease, draft false, and not latest. At that checkpoint, the
production marketing site linked directly to the preview.15 DMG.

The real owner account then exercised the existing branched-history safety
gate. Its hosted snapshot contained pre-existing duplicate same-status root
events. Cadence stopped before hydration and changed no hosted product data.
Resolving that historical compatibility case required an owner choice; this
record did not authorize rewriting append-only hosted history.

Post-publication verification passed `agents:check`, `interactions:check`,
`resolvers:check`, lint with seven existing warnings, typecheck, 1,468 Vitest
tests with 23 skipped, all 59 native tests, the web build, `marketing:check`,
and the marketing build. The sandboxed Vitest attempt could not bind its local
fake-Sequenzy listener; the unrestricted loopback rerun passed.

## Preview.19 first-hydration completion

The owner selected compatibility handling for same-status hosted history.
Preview.16 through preview.18 were unpublished local-only diagnostics.
Preview.16 exposed retry gating. Preview.17 exposed 31 status revisions whose
parent UUID sorted later. Preview.18 exposed one applied import run whose
accepted preview UUID sorted later. Preview.19 orders both dependency chains
before their children and rejects cycles before writes.

Installed preview.19 hydrated the expected signed-in account and reached
**Account data is current**. The local database retained the complete hosted
product snapshot, every hosted status event, and the required synchronization
metadata, with no pending first-link attempt. SQLite integrity passed and
`foreign_key_check` returned no rows. The pre-existing same-status branches
remained unchanged in both copies. Hosted verification used the signed-in
user's JWT through RLS and made no hosted write.

Preview.19 immutable hashes:

- Archive: `6407fca3f6d2a4ba78b7a308a24a21c1dc15daf394f7b1e2110da05dc1424fe4`.
- Signature: `c21e4eef58d1642c252686f735dce16d0bdc0a283cf92906eb939af5641287b1`.
- DMG: `6515948348401cd146e1155a79d2ebc7c6a6e5f310a97da1a69ccb7044a6a11c`.
- Final feed: `489b076d61bd848399aaa42b76991f3ef52219415dbf33e367817605678eec58`.

Independent GitHub downloads matched all three artifact hashes. Remote
`latest.json` was byte-identical to the packet and preview.19 reported **No
newer version is available**. `desktop-preview` remains prerelease, draft
false, and not latest. Production marketing deployment
`dpl_Euzkkoi8VZraWNJ37y5bAvUXk8Wo` is Ready and its macOS link returns the
preview.19 DMG.

Final verification passed `agents:check`, `interactions:check`,
`resolvers:check`, `core:check`, typecheck, lint with seven existing warnings,
1,470 Vitest tests with 23 skipped, all 60 native tests, the web build,
`marketing:check`, and the marketing build. The sandboxed full test attempt
could not bind the loopback fake Sequenzy server. One unrestricted run timed
out its portability subprocess; the isolated retry and full retry passed.
