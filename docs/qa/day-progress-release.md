# Day-progress release acceptance

Release status: not accepted. Tickets 133–137 have local implementation and
regression coverage. Live Google and installed native acceptance remain open.
Ticket 132's seventh-revision layout baseline was accepted on 2026-09-16.

## Local implementation evidence, 2026-09-16

Web and desktop use `components/timeline/DayProgressTimeline.tsx` with shared
pure layout/context resolvers. Needs decision retains its existing presentation.
Both Timeline services supply bounded historical Occurrence timing totals for
estimates. Calendar failures do not disable manual tracking.

`docs/EXTERNAL_EVENT_CONTRACT.md` defines schema 1.0.0, its runtime validator,
provider mapping, scheduling projection, capabilities, errors, examples, and
compatibility policy. The server broker owns same-account OAuth and encrypted
refresh credentials. Desktop stores complete event snapshots in a separate,
owner-only disposable SQLite file. Web uses session memory only.

Local Supabase clean replay succeeded with
`20260917002649_google_calendar_connector.sql`; generated types match that schema.
The rollback-only SQL contract verifies two synthetic accounts, RLS/privileges,
one-use callback state, wrong-subject refusal, stale installation/disconnect
rejection, and credential deletion. Local service ports used loopback-only bindings. The task-owned validation
containers and proxy were stopped afterward; their volumes remain preserved.
No hosted schema or provider configuration changed.

Native tests verify account/range isolation, incomplete snapshot refusal,
replacement fences, cache cleanup, and offline out-of-range eviction. Existing
real SQLite store/portability contracts pass: 20 tests, one skipped. The cache
uses exact displayed-range matching; an offline range change requires a new
complete refresh before Calendar context returns. It does not manufacture empty
coverage or retain past-range details.

Browser QA used the shared production components with synthetic data at
`http://127.0.0.1:4322/design-system`. Checks covered 390px and 1280px widths,
44px status actions, expanded rows, preview/details, repeated DST-hour labels,
Escape/focus return, all-day dismissal/restore, Settings visibility/save,
manual refresh, and disconnect. The narrow gutter, ambiguous repeated-hour label,
and dismissal leaving an empty open dialog were corrected and regression-tested.
These checks do not establish real Google or WKWebView behavior.

## Verification

Required checks ran with Node 24. Final result counts and independent review
are recorded in the final verification checkpoint below. Lint retains seven
pre-existing unused-variable warnings in the BehaviorLog reference fixture.
Builds retain existing bundle-size warnings.

| Acceptance gate | Local evidence | Remaining evidence |
|---|---|---|
| Timeline mapping, empty/same-time days, expanded rows | Pure/DOM regressions and narrow/wide shared-component browser checks | Installed WKWebView parity |
| Dot, midnight, resume, range extension | Injected-clock and resolver/DOM regressions; hidden/blur timer cancellation | Native lifecycle and multi-day resume |
| Consent and account ownership | OAuth/service fixtures, real SQL isolation/replay, live web consent and native disconnect/reconnect | Live wrong-account rejection; final native cancellation disclosure |
| Rich event contract and pagination | Versioned schema, validator, provider fixtures, scheduling projection | Live provider field coverage |
| Event preview/details, all-day dismissal | Browser focus/dismissal regressions; installed native preview/details, focus return, source link | Native synthetic all-day/touch matrix |
| Estimates, unknown and stale overlap | Shared resolver tests and both persisted-history adapters | Combined live/native acceptance |
| Offline cache and cleanup | Native cache tests, installed disconnect cleanup, and preview.37 offline restart with stale events | Installed account-switch acceptance |
| Exports/sync/backups exclude events/credentials | Separate cache/Keychain boundary, real SQLite contracts, protected installed upgrade and row comparisons | Final distribution evidence |
| Performance | Minute-only visible dot and bounded shared refresh logic; automated hidden-timer checks | Prior-app idle/visible/hidden/minimized comparison |

## Release gates

Provider setup requires a separate Calendar-only Google Cloud project and the
reviewed scope/custody configuration in `google-calendar-capabilities.md`.
Real-account Calendar access, hosted rollout, protected installed-app acceptance,
and distribution require authorization and acceptance evidence. The owner approved
provider setup and protected installed-app acceptance on 2026-09-16, then hosted
rollout, live consent, and similar task actions on 2026-09-17. The hosted rollout
and live same-account Calendar reads succeeded. Historical checkpoints below
retain the state at their respective dates; the final section records current evidence.

Protect existing desktop data before upgrade/native acceptance. Both platforms
must pass before the combined release closes. Ticket 115 retains Apple-trusted
distribution requirements; an ad hoc preview does not prove notarization.
Marketing has no connector runtime. Shared privacy/help copy describes the
conditional feature and its limits. Future native mobile remains deferred.
Minor visual polish remains separate from release acceptance.

## Authorized provider/native follow-up, 2026-09-16

The owner approved provider setup and protected native acceptance.
Google Cloud project `cadence-calendar-498717` (Cadence Calendar) now exists,
separate from sign-in project `habit-tracker-498717`.
The Calendar API service `calendar-json.googleapis.com` is enabled.
The owner authorized account access and explicitly selected the Identity Scaffolding
Chrome profile. Google Cloud confirms `info@identityscaffolding.com` and the separate
Calendar project in that profile. The saved branding contains Cadence Calendar,
external testing audience, and the owner's business email for support/contact.
The owner approved Google's User Data Policy and creation/private storage of the
confidential web OAuth client, named Cadence Calendar broker. Google confirmed
client creation with the sole redirect
`https://cadence-blush-three.vercel.app/auth/google-calendar/callback`.
Declared scopes are exactly `openid`, `calendar.calendarlist.readonly`, and
`calendar.events.readonly` (the latter two use the full Google API scope prefix).
The owner selected `emibache@gmail.com`; Google lists that account as the sole
test user. The app remains in Testing and has no live grant.
The client secret and generated 32-byte encryption key are saved in git-ignored
`.env.local`, mode 0600. The downloaded credential duplicate was removed after
verified import. The production configuration parser and an encryption roundtrip
pass without provider requests or secret output. Hosted environment configuration,
migration deployment, and web deployment remain pending. No personal Calendar
content was accessed.

The existing Vercel CLI account and `cadence` project are verified. Production
currently has no Google Calendar environment variables. A linked Supabase dry
run found both the unrelated BehaviorLog capacity migration and the Calendar
migration pending. An isolated directory at
`/tmp/cadence-calendar-hosted-preflight` retains tracked migration history and
only the new Calendar migration. Its linked dry run would apply only
`20260917002649_google_calendar_connector.sql` to `qjodzutjxtmtzczbloxa`.
Neither dry run applied a migration. Web release preparation must also exclude
the unrelated workspace changes before requesting hosted rollout approval.

A protected online SQLite backup includes committed WAL data and passes integrity
and foreign-key checks. A copy of installed preview.32 is preserved beside it in
`~/Library/Application Support/Cadence Release/calendar-20260916-220925/`.
Native preflight found the production CSP blocked the Calendar broker. Production
and development CSP now allow the exact verified Cadence broker origin,
`https://cadence-blush-three.vercel.app`; the production whitelist regression passes.
Node 24 is available through the bundled Codex runtime.
The parent inspected the CSP diff and reran required checks. All 1,737 tests pass
(29 skipped); the first sandboxed run hit five loopback permission errors and the
permission-enabled rerun passed. Web build and desktop TypeScript pass.
Preview.33 builds with the exact broker origin and existing public Supabase config.
Its signature, hardened runtime, DMG/archive equality, and updater signature checks
pass. A fresh read-only review of this follow-up returned ship with no findings.
Runtime model/effort and API-equivalent cost remain unobservable.
Preview.33 was installed from the verified staged candidate after a normal quit.
The original installed app and a fresh `before-install.sqlite3` backup are protected
beside the initial backup. Strict installed code-signature verification passes.
Launch reached a macOS Keychain prompt, which Computer Use cannot operate.
The owner completed it. Installed Timeline opens with existing tracking controls
and the factual Calendar-unavailable state. An expanded Occurrence exposes Note,
Track Time, and explicit unknown duration without changing tracking records.
The initial post-launch snapshot retains every pre-install table fingerprint;
integrity and foreign-key checks pass. Broader UI/lifecycle acceptance remains open.

Prior preview.32 process-group CPU means (sum across the app and its owned WebKit
processes): visible 0.420%, hidden 0.000%, minimized 0.010%, unfocused idle 0.000%.
Visible/hidden samples used 60 two-second intervals; minimized/idle used 30.
The native UI performed the corresponding visibility actions. Raw evidence is
`/tmp/cadence-calendar-preview32-{visible,hidden,minimized,idle}.json`.
These are baseline measurements, not a completed before/after comparison.

Hosted migration/deployment and public distribution remain separate gates.

## Final verification checkpoint

Pass: `agents:check`, `interactions:check`, `resolvers:check`, `lint`,
`typecheck`, `test` (1,737 passed; 29 skipped), `build`, `core:check`,
`desktop:typecheck`, `desktop:build`, `desktop:parity:check`,
`design-system:check`, `desktop:native:test` (100 passed), `marketing:check`,
`marketing:build`, and `git diff --check`. The real SQLite contract and local
SQL migration evidence above also passed. Logs are local `/tmp/cadence-final-*.log`;
the real SQLite run is `/tmp/cadence-calendar-contract.log`.

Parent review corrected account/range response fences, native callback Settings
refresh, invalidated cache eviction, empty provider text handling, minute-clock
mutation gaps, narrow gutter sizing, repeated-hour labels, and modal dismissal.
The first independent review returned fix-first for native Settings refresh
propagation, collapsed provider error codes, and stale documentation. The parent
fixed each issue, added a native hook regression and typed-error service cases,
and reran checks. Untitled event controls also retain accessible names.
A second review found a late Settings callback could cancel a newer account/range
refresh. Coordinator callbacks now capture their scope and ignore obsolete scopes
before mutating hook state. Both account-change and range-change regressions pass;
removing the guard makes both regressions fail. The final fresh read-only review
returned `ASTRA REVIEW — VERDICT: ship`, with no findings. It independently ran
20 focused tests. Runtime model/effort and token usage were unobservable.
The parent accepts the local implementation. Release gates above remain open.

## Native follow-up after Keychain completion, 2026-09-16

The owner completed preview.33’s Keychain prompt. Timeline opened, preserved
Needs decision, displayed Calendar unavailable, and exposed Note/time controls
and explicit unknown duration in an expanded row. No tracking mutation was made
by this QA session.

Preview.33 aggregate CPU means: visible 0.000%, hidden 0.013%, minimized 12.387%.
A longer minimized repeat averaged 5.328% and settled near zero after about a
minute. This did not pass minimized acceptance. The native stack sample mostly
waited for events; it did not establish the cause. Source inspection found the
60-second SVG `cy` transition could outlive timer cancellation. The parent removed
that interpolation; the dot retains visible minute updates and resume refresh.
This is a suspected cause pending native comparison, not a proven diagnosis.

Shared browser computed style now reports transition `none`, duration `0s`, and
animation `none`. Eight focused DOM/clock tests and all 1,737 suite tests pass.
Agents, interactions, resolvers, lint, TypeScript, web build, desktop TypeScript,
design-system and desktop parity pass. Preview.34 passed native artifact checks.
A fresh read-only review returned ship with no findings. Logs use
`/tmp/cadence-motion-*.log` and `/tmp/cadence-calendar-preview34-build.log`.
The parent installed preview.34 after a normal quit and preserved preview.33 plus
a fresh consistent backup in the protected directory’s `preview34/` subdirectory.
Preview.34 opens and restarts without another Keychain prompt. Native Settings
shows the Google Calendar unavailable state, and returning to Timeline preserves
Needs decision. The app was left on Timeline. Its repeated 120-second
minimized sample averages 0.0017% CPU across the app and owned WebKit processes,
versus preview.33’s 5.3283% comparable repeat (the initial 60-second sample was
12.3867%). The prior preview.32 baseline was 0.0100%. This comparison supports
the SVG transition as the cause of the measured post-minimize rendering work.
No new per-frame work or visibility state was added; the existing minute clock
and blur/visibility cancellation remain covered by the DOM tests.

The preview.34 post-launch database passes integrity and foreign-key checks.
No Occurrence or status-history row was deleted. Existing status-history rows
remain byte-equivalent; synchronization appended two status-history rows and
updated two Occurrences during QA. Other changed tables contain synchronization
and native reminder bookkeeping. This is not a claim that the live database
remained byte-identical while synchronization ran. The pre-upgrade backup remains
protected. QA did not submit statuses, Notes, timing changes, or Calendar grants.

Raw samples are `/tmp/cadence-calendar-preview33-*.json` and
`/tmp/cadence-calendar-preview34-minimized.json`. The native stack sample is
`/tmp/cadence-preview33-native-sample.txt`. These short observations do not prove
absence of all Keychain/network work. Preview.34’s full four-state comparison,
multi-day lifecycle, synthetic native Calendar controls, and live Calendar
acceptance matrix remain open. Google testing setup is complete; hosted rollout
and real-account consent remain pending.

Additional preview.34 samples on 2026-09-16 cover 120 seconds each, excluding
the first `top` interval. The visible Timeline sample averaged 4.985% aggregate
CPU and contained a brief burst late in the sample. Its cause is not verified.
After the native Hide command, aggregate CPU averaged 0.005%; WebContent CPU
remained zero, while reported WebContent footprint grew from 185M to 639M.
The footprint increase is not explained by these short samples. These results
do not close native performance acceptance. Raw evidence is
`/tmp/cadence-calendar-preview34-visible.json` and
`/tmp/cadence-calendar-preview34-hidden.json`. Cadence reopened normally on
Timeline after the visibility checks. No tracking edits were submitted.

### Wrong-account recovery review correction

The shared Settings panel links to Google Account connections and explains project-wide revocation. It never revokes a mismatched grant automatically. Web and native callback source preserve the fixed mismatch result. Installed preview.34 predates this correction; native installation and live acceptance remain open. Candidate desktop wiring is excluded.

Parent verification after the cleanup correction: 1,739 tests passed and 29 skipped in the full workspace. Governance, resolver, lint, TypeScript, web build, design-system, shared-core, desktop TypeScript, and desktop build checks passed. The isolated web candidate passed the same applicable web checks plus public-source checking, with 1,681 tests passed and 26 skipped. Logs: `/tmp/cadence-calendar-revision-main`, `/tmp/cadence-calendar-revision-main-final`, and `/tmp/cadence-calendar-revision-candidate`. The first run exposed a corrected interaction marker count, corrected test literal type, and sandbox loopback restriction; the final runs passed.

The final native callback correction uses account/connection lifecycle ownership rather than the refresh lease. A regression pauses the one-time callback, performs a resume refresh, and verifies that the mismatch disclosure and panel refresh survive. All checks in `/tmp/cadence-calendar-callback-final` passed, including 1,739 tests (29 skipped), native TypeScript, and native build. Preview.34 does not contain this fix.

## Authorized hosted rollout and live acceptance, 2026-09-17

The owner explicitly approved hosted rollout, live consent, installed desktop acceptance, and similar task approval requests. The isolated Calendar migration applied to `qjodzutjxtmtzczbloxa`; a post-apply isolated dry run reports up to date. The unrelated BehaviorLog capacity migration remains unapplied.

The five validated Calendar settings now exist as private Production secrets on Vercel project `cadence`. Reviewed source patch `ac1d998dc500e06d20fdc935059e793a28968decbd1e3072011cbe65804fe291` deployed as `dpl_4VbtFaFa4qEYQ2WJPdPo5fWWw9Vs`, aliased to `https://cadence-blush-three.vercel.app`. The upload contained tracked source and one generated TypeScript build-info file, with no private environment files. The previous Ready deployment remains the rollback target.

Unauthenticated Calendar endpoints return 401 with no-store; Settings redirects to login; the development bench returns 404. Approved native origins pass CORS preflight. Identity Scaffolding Chrome retained the Google Cloud owner profile while Cadence signed into `emibache@gmail.com`. Google consent requested only identity association, calendar listing, and event viewing. The user-approved grant succeeded. The primary calendar is selected; save and refresh succeed. Web Timeline shows seven markers, current freshness, preview/details, and focus return. At 390px the document has no horizontal overflow and all seven markers have 44px targets.

Protected preview.35 passed artifact verification and installed with a consistent SQLite backup and preserved preview.34 in the protected `preview35/` directory. Account synchronization worked, but Calendar remained unavailable. Source inspection found the native transport called browser fetch with the broker as its receiver. The correction explicitly supplies globalThis. The transport regression enforces this receiver. All required affected checks and 1,739 tests (29 skipped) passed; independent read-only review returned ship. Installed preview.36 refreshed successfully and displayed seven live Calendar markers. This runtime result confirms the fetch receiver defect. Preview/details, close/focus return, and native source-event opening pass. The source link uses the macOS default browser profile; Google Cloud and consent automation use Identity Scaffolding. The separate Calendar cache has mode 0600, passes SQLite integrity, and holds one complete snapshot. Native disconnect succeeds and clears both complete snapshots and pending refreshes. Native reconnect/cancellation and remaining lifecycle/performance checks continue.

Native preview.36 reconnect succeeded through Identity Scaffolding Chrome and the macOS application handoff. Primary-calendar selection reset on disconnect and was explicitly restored; refresh returned Calendar current. Cancellation and success exposed a stale Settings handoff message. The shared panel now clears that message when refreshed connection data arrives, while preserving web callback messages. Its regression covers cancellation and success. Fresh independent review returned ship. Governance, lint, TypeScript, 1,740 tests (29 skipped), web build, desktop TypeScript, and desktop build pass. The initial sandbox-only test attempt could not bind loopback; the authorized rerun passed. Evidence: `/tmp/cadence-calendar-message-fix/`.

Preview.36 visible Timeline measurement covered 60 two-second intervals (134.44 seconds elapsed including sampling overhead). Aggregate mean CPU was 0.145%, compared with preview.34's 4.985% visible sample and preview.32's 0.420% baseline. The WebContent footprint changed from 160M to 162M. This is one short sample, not a proof against all future bursts. Evidence: `/tmp/cadence-calendar-preview36-visible.json`. The installed database passes integrity and foreign-key checks. All 1,638 Occurrences, 1,226 status events, 12 time sessions, and existing Behavior/schedule/history records matched the protected preview.36 pre-install backup without deletion or modification.

Preview.37 passed all 11 artifact checks and installed after normal quit with a consistent database backup and preserved preview.36 rollback app in the protected `preview37/` directory. Online restart restores Calendar context without another Keychain prompt. An installed offline restart with Wi-Fi temporarily off showed seven cached markers and an explicit saved-data/stale/last-refreshed label. Wi-Fi was restored in a finally block and confirmed connected. No tracking data changed during the test.

Native CPU comparison now includes visible preview.36 (120-second requested sample; 0.145% aggregate mean), hidden preview.37 (60 seconds; 0.020%), minimized preview.37 (60 seconds; 2.147% including an initial transition burst), settled minimized repeat (60 seconds; 0.000%), and unfocused preview.37 (60 seconds; 0.123%). The minimized burst was concentrated in the first two intervals, with one smaller fifth-interval burst; its settled repeat measured zero for every owned process. These are short observed samples with different durations, not identical-workload benchmarks or proof that every Keychain/network operation is absent. Raw evidence is `/tmp/cadence-calendar-preview37-{hidden,minimized,minimized-settled,unfocused}.json`.

The owner supplied a second test identity for wrong-account and account-switch acceptance. The dedicated Google OAuth Testing audience now includes that identity. Identity Scaffolding Chrome does not have that Google session; the profile choice is pending so Google Cloud operations remain in the requested profile. No second-account grant or account switch has occurred.

Online recovery after the Wi-Fi test passed through Settings refresh. A later native consent flow completed server-side after a prolonged profile-selection pause, but Settings retained the browser-handoff message. Navigating Timeline then Settings recovered authoritative connected state; primary-calendar selection and current refresh were restored. The native callback-failure recovery path is under focused correction. The second-account browser-profile choice remains pending; no second-account grant or desktop account switch has occurred.

The callback-failure correction preserves validation, advances the Settings refresh version, and reads current state through the authenticated broker. It does not trust rejected callback data. A regression covers rejected-callback recovery, alongside account/range fences and shared-panel message clearing. The five-minute expiry is suspected, not proven, as the cause of the delayed installed callback. Fresh read-only review returned ship. All required affected checks pass with 1,740 tests (29 skipped), web and native TypeScript, web build, and desktop build. Logs: `/tmp/cadence-calendar-callback-recovery/`.

Final installed candidate: preview.38. Its 11 artifact checks pass, including strict code signing, updater signature, archive/DMG matching, arm64, and macOS minimum. Installation preserved preview.37 and a consistent SQLite backup under the protected `preview38/` directory. The app remains an ad hoc preview, not Apple-trusted public distribution. The primary Calendar grant, selection, and current refresh were restored before upgrade. No further second-account operations will occur until the pending Chrome-profile choice is answered.

Preview.38 launch verification passed: Timeline renders Calendar context, Settings reports connected with the primary calendar selected, and the hosted Timeline reports Calendar current. Cadence was left on Timeline. The rejected-callback correction is covered by regression tests; a new installed rejected-callback trial remains unverified. Final governance and whitespace checks pass.


### Second-account acceptance and Ignore isolation, 2026-09-17

The owner explicitly selected the signed-in second identity in the Emi Chrome profile. Google Cloud administration remains in Identity Scaffolding. Installed preview.38 rejected the second Calendar identity while retaining the primary Cadence login. The hosted web flow also rejected the second identity and displayed the same-account requirement plus manual grant-cleanup guidance. No product account switch or tracking edit occurred in these tests. The mismatch path does not revoke the unused Google grant automatically.

Account-switch preflight found an existing first-link race: Ignore used general reconciliation after re-reading local data. Concurrent primary-only rows could become hosted writes to the new account. Live switching paused before any account replacement. The correction rejects changed local snapshots, uses the existing replacement-only planner, enforces zero hosted writes, and rejects legacy reviewed Ignore plans. Focused regression and fresh independent review precede a new protected native installation.


The Ignore correction passed fresh independent review and all required checks: 1,743 tests passed, 29 skipped; governance, interactions, resolver boundaries, lint, both TypeScript checks, web build, and desktop build passed. Logs: `/tmp/cadence-first-link-ignore-checks/`. Preview.39 passed 11 artifact checks and installed with a consistent backup and preserved preview.38 under protected `preview39/`. Primary account synchronization was current before switching.

Keep a local copy succeeded. Secondary Google sign-in succeeded in Emi Chrome. Ignore created a protected backup but the native transaction rejected a data constraint; the secondary account replacement did not complete. The parent cancelled that attempt and signed back into the primary account. Primary Ignore then rejected a changed local snapshot without hosted writes. Read-only comparison shows unchanged product tables; native reminder bookkeeping changed. Integrity and foreign keys pass. Both failures remain under correction before account-switch acceptance can pass. The primary hosted Calendar grant and primary selection were restored, with web refresh reporting Calendar current.


Google Cloud Verification Center still reports Testing mode; public verification is not submitted. In the approved Identity Scaffolding profile, branding now saves the existing public Cadence marketing homepage and hosted privacy/terms URLs, plus their two exact authorized domains. Google confirmed “Branding changes saved!”. No OAuth scope, client callback, client secret, testing audience, or publishing status changed in this step. Domain ownership verification and Google's sensitive-scope review remain unverified.


After cancelling the pending account link, the separate native Calendar cache contains zero complete snapshots and zero pending refreshes. This directly verifies cache cleanup across account cancellation. The primary hosted Timeline remains available and reports Calendar current.


Preview.40 corrects both installed first-link failures. Replacement validates the full plan, deletes children before parents, inserts parents before children, and defers foreign-key checks within the existing atomic transaction. The first-link fingerprint now covers synchronized product entities, excluding OS reminder bookkeeping; the final native domain revision guard remains. Legacy pending attempts were cancelled before retrying. Full-graph success and retained-child cascade rollback regressions pass. Independent review returned ship. All required affected checks pass (1,743 tests, 29 skipped); the full native library passes 103 tests. The temporary copied-private-database harness could not start because its runner attempted unavailable registry access; no native processing result was inferred, and its disposable files were removed.

Preview.40 passed 11 artifact checks and installed with preserved preview.39 plus a consistent database backup under protected `preview40/`. Binary SHA-256: `4ed8c47979fa604d92fdf34a91f95bf6f3343a14607db9ed8afc9d4bc26a743c`. Live account-switch acceptance continues on this candidate.


Installed preview.40 secondary account replacement passed. The native app shows the approved secondary identity, Account data connected, a protected backup, and Account data is current. Read-only SQLite inspection finds eight secondary categories and zero Behaviors, Occurrences, status events, or timing sessions. Primary tracking rows were not merged into the secondary account. Integrity and foreign-key checks pass. The parent is checking Calendar isolation and restoring the primary account next.


Automatic approval review initially rejected optional secondary Calendar consent because account-switch authorization did not explicitly authorize reading secondary Calendar data. The owner then explicitly approved read-only Calendar-list/event consent and cleanup. The secondary grant completed. Chrome held the application handoff in a separate window; after opening Cadence, native UI inspection timed out. A one-second stack sample showed the AppKit main thread idle and no native deadlock. Normal Quit succeeded, and relaunch restored UI inspection. Settings then showed the secondary identity, current account synchronization, and Google Calendar connected. This proves authoritative connection recovery after restart; immediate callback UI delivery was not observed.


Secondary Calendar isolation passed after explicit consent. Native Settings listed only the secondary primary calendar. Selection/save/refresh succeeded and reported no events in range with Calendar current. The separate cache held exactly one complete snapshot, selected only the secondary calendar, and contained zero events; integrity passed. Secondary Calendar disconnect succeeded and cleared both complete snapshots and pending refreshes. The parent then kept the secondary local copy and began primary-account restoration.


There-and-back installed account-switch acceptance passed on preview.40. After keeping the empty secondary local copy, primary sign-in automatically hydrated the primary hosted data. Settings reports `emibache@gmail.com`, Account data is current, the original primary Calendar selected, and Calendar refreshed/current. Native Timeline again shows seven Calendar markers and two prior unresolved Occurrences. No status, Note, timer, schedule, or source-event edit was submitted.

Primary preservation check against protected preview40/before-install.sqlite3: all IDs/counts match across eight categories, 34 Behaviors, 35 schedules, 36 slots, 35 definition events, 38 configuration events, 1,638 Occurrences, 1,226 status events, and 12 time sessions. Values match after the existing microsecond/half-even timestamp normalization and excluding synchronization `updated_at` metadata. This is not byte-identical database preservation. The three import runs, 34 mappings, one imported Note, seven imported interventions, and empty Note shortcut state match exactly. All 1,600 reminder-delivery IDs remain; only three `updated_at` fields differ. SQLite integrity and foreign-key checks pass. The protected backups remain available.

The app is left on the restored primary Timeline. Secondary Calendar consent and cleanup are complete; no approval remains pending for that operation. Google public verification, controlled provider-failure/Workspace fixtures, and remaining synthetic/multi-day native acceptance still prevent closing Tickets 133–137. No Workspace test account was supplied during this run.


Installed preview.40 future-range extension passed. Show more days extended Timeline from September 17–24 through October 1. The complete native cache range changed from `2026-09-17`–`2026-09-24` to `2026-09-17`–`2026-10-01`. No source-event or tracking-status edit was submitted.

Normal quit/relaunch restored the default primary Timeline with seven Calendar markers and Needs decision. The attempted hide/resume step did not produce sufficient visibility evidence and is not counted as a new lifecycle pass.

An isolated ad hoc `Cadence Calendar QA.app` (`app.cadence.desktop.calendarqa`, scheme `cadence-calendar-qa`) rendered the existing production `CalendarTimelineBench` in WKWebView. The app loaded only the loopback Next development bench on port 4324. Existing servers on 4321–4323 were left untouched. The temporary Tauri config is `/tmp/cadence-calendar-native-qa.conf.json`; the app lives under `apps/desktop/src-tauri/target/debug/bundle/macos/`. Bundle identifier and strict signature verification passed. No repository fixture or production app configuration changed.

The actual shared Timeline displayed Conference on November 1 and 2, excluding November 3. Its details showed two calendar days. Dismissal removed both labels and exposed Restore All Day Events; restoration returned both labels. DST review preview and details displayed `1:30 AM EDT–1:30 AM EST` and a 60-minute duration. Escape closed details, returned a visible focus outline to the Calendar marker, and reopened its focus preview. These are bounded shared-component WKWebView results, not installed desktop transport/cache/lifecycle acceptance. The fixture lacks dense and overnight events, so those cases remain open. No narrow-window or native touch claim is made. The isolated app quit normally and the temporary development server stopped after inspection.

## Tickets 138–141 initial execution checkpoint, 2026-09-17

Historical pre-cutover checkpoint. The authorized continuation below supersedes
its DNS, ownership, deployment, branding-link, and publication blockers.

The parent preserved the pre-existing working tree before this task. Vercel
readback confirmed the existing `cadence` and `cadence-marketing` projects.
The owner-requested custom domains are now attached to those exact projects:
`app.cadence-me.com` and `cadence-me.com`, respectively. CLI 59.7.0 returned
`76.76.21.21` as each requested A-record target. Cloudflare nameservers remain
`pam.ns.cloudflare.com` and `vick.ns.cloudflare.com`. Public apex A/AAAA/MX/TXT
and app/www CNAME checks returned no records; this does not replace a complete
authenticated DNS inventory.

The Cloudflare bootstrap installed its zone-bound wrapper, package commands,
service registry, capability/catalog/checker, and ignored evidence path.
Credential verification fails because the owner has not staged Cloudflare
access. Local pathway health passes and grants no mutation authority. No DNS
record was written. Search Console created a pending Domain property using the
Identity Scaffolding account; its manual TXT challenge remains in the retained
browser dialog. No ownership success, DNS delegation, or Google approval is claimed.

Local callback migration code supports one exact primary and one exact legacy
HTTPS callback. Connection and callback routes retain their request origin for
consent, code exchange, and Settings return. Tests preserve host-only cookie
requirements and reject unconfigured origins before state consumption/provider
access. Primary/legacy endpoints must both remain registered while in use.
The current deployed broker, native CSP, native callback schemes, Google scopes,
and hosted configuration remain unchanged. Live dual-origin acceptance is open.

Ticket 139 now describes the real Testing audience, subscribed-calendar list,
selected-event reads, same-account consent, data custody, disconnect versus
sign-out, and offline cache cleanup. Privacy adds the Limited Use policy link
and provider/retention corrections. The owner approved the September 17 text and
recorded review scope for publication. This supersedes the separate September 17
new-review publication blocker as an owner decision, not an independent legal
review. The August 31 baseline remains approved. Domain, deployment, technical,
and Google gates remain. No Terms copy or duplicate marketing legal page was
added. Public homepage, FAQ, Privacy, and generated Markdown/llms mirrors received
local checks.

Google console readback still shows Calendar project `cadence-calendar-498717`
in Testing, branded `Cadence Calendar`, with `info@identityscaffolding.com` and
existing Vercel homepage/privacy/terms links. The owner retained this address as
the support/developer inbox; the named human monitor still must be recorded.
The owner approved creating a dedicated Gmail test identity with only a known
name and harmless Calendar data. A human must choose its password, complete
verification, and accept account terms. Password reuse and invented personal
details are prohibited. The destination YouTube channel must be identified before
an unlisted upload. Research, a timed recording script, scope justifications, and
review fields are in `google-calendar-capabilities.md#tickets-140141-research-recording-script-and-submission-preparation`.
No recording, upload, submission, or Google approval occurred. Tickets 138–141
remain blocked on their recorded external prerequisites; none is complete.

Parent verification passed with Node 24.19.0: `agents:check`,
`interactions:check`, `resolvers:check`, `lint`, `typecheck`, `test`, `build`,
`core:check`, `desktop:typecheck`, `desktop:build`, `desktop:parity:check`,
`design-system:check`, `marketing:check`, and `marketing:build`.
The suite passed 1,748 tests, with 29 skipped. The first sandboxed suite hit five
loopback permission errors; the permission-enabled full rerun passed. Lint has
no errors and ten warnings: eight existing warnings and two unused imports in
the unchanged upstream service-operation checker. Existing build size warnings
remain. No schema or native storage code changed, so migration replay and native
storage suites were not required for this task.


The parent tightened optional Cloudflare zone-ID binding and added one synthetic
read/write mismatch regression. The wrapper performs account/zone-name readback
before using an explicitly supplied zone ID. Final public-page QA used dedicated
loopback servers at 4325 (marketing) and 4326 (web). Homepage, expanded Calendar
FAQ, and Privacy remained readable at 390px without horizontal page overflow.
The new Google policy link is keyboard reachable with a visible focus outline.
Desktop-width public pages also passed. These checks are local; DNS, final
consent links, real dual-origin OAuth, and installed native handoff remain open.

Fresh read-only review returned `ship` with no findings. The reviewer inspected
only this task's delta against the captured starting tree and passed 24 focused
tests. This accepts the local patch, not publication or completion of Tickets
138–141. The September 17 owner copy approval is recorded above. DNS/TLS, live
dual-origin OAuth, recording, submission, the named inbox monitor, and Google
approval remain open.


## Tickets 138–141 authorized continuation, 2026-09-17

DNS, TLS, Search Console ownership, public publication, and Google branding
links now pass. Real sign-in/Calendar/native acceptance still requires the
owner's dedicated Gmail account. Domain ownership is not Google OAuth approval.

The owner chose the signed-in Cloudflare dashboard. Authenticated inventory
showed zero records in `cadence-me.com`. Only apex/app A records to Vercel's
confirmed `76.76.21.21` target and the Google verification TXT were added.
Both A records are DNS-only with Auto TTL. Public DNS readback, Vercel domain
configuration, certificate issuance, and HTTPS 200 checks passed. Search
Console displayed **Ownership verified** for Identity Scaffolding. Keep its TXT.
Nameservers, other zones, and old Vercel aliases remain unchanged. No Cloudflare
credential was created; the optional CLI route remains unlinked.

Supabase added `https://app.cadence-me.com/auth/callback` and changed Site URL
to `https://app.cadence-me.com`. All six existing redirect entries remain,
including old web and native redirects. The separate Calendar client added
`https://app.cadence-me.com/auth/google-calendar/callback` and retained the old
Vercel callback. Its authorized domains now include `cadence-me.com` alongside
legacy domains. Google saved/readback confirmed homepage `https://cadence-me.com`,
Privacy `https://app.cadence-me.com/privacy`, and Terms
`https://app.cadence-me.com/terms`. The sign-in project and provider callback
remain separate and unchanged. Calendar publishing remains Testing.

The owner explicitly approved the September 17 Privacy text and recorded scope
for publication. This is owner approval, not an independent legal review or
Google approval. The August 31 baseline approval remains. Homepage and FAQ state
the test-user audience. Legal text remains on canonical app routes. The public
footer now uses the same configured marketing URL helper as login.

The initial isolated web release was `dpl_8JcKNgDYhcff9WYGP5XnvvNKTHiE`.
The marketing release is `dpl_5WtNGHwxYgRpfrGMuR4tKYhaivrg`. The stages preserve
the previous reviewed release baselines and overlay only this task's files;
the unrelated dirty workspace was not deployed. See `VERCEL_WORKFLOW.md` for
source provenance and rollback. No schema, native package, or private provider
credential changed.

Public HTTPS checks passed for homepage, FAQ, sitemap, agent text, Privacy,
Terms, and Trust. Both legacy aliases still answer without blanket redirects.
Unauthenticated Calendar APIs return 401 with no-store on new and legacy app
origins. Google sign-in reached its account chooser; authentication did not
complete. These public checks do not prove live OAuth or native compatibility.

GitHub's protected `public-trust-production` origin variables now match the
new app and marketing domains. The app's public marketing-deployment reference
now identifies the Ready marketing release. No Trust workflow was dispatched:
these isolated source overlays have no matching committed source revision.
Fresh commit-bound evidence remains required. Do not label stale/unverified
Trust results Passed or substitute deployment success for Trust evidence.

Gmail signup received only the owner's known name. The retained setup page asks
for birthday and gender. The owner must supply missing details, enter a new
password, complete verification, and accept required agreements. No Gmail
account, Calendar import, demonstration recording, upload, or Google review
submission has completed. The harmless three-event ICS and 3:25 recording
script are ready. Existing YouTube channel `brittlebeliefs` was identified;
`info@identityscaffolding.com` has no channel. The support/developer inbox remains
`info@identityscaffolding.com`; record the human monitor before submission.

Automatic approval review rejected a proposed sign-in through the owner's
existing personal Google account. It identified private-data access outside
the dedicated-test-account scope. The chooser was closed; no workaround or
personal-account sign-in was used. Continue acceptance with the dedicated
account after the owner completes signup.


Continuation verification used Node 24.19.0. Required `agents:check`,
`interactions:check`, `resolvers:check`, `lint`, `typecheck`, `test`, and `build`
all pass. The suite passed 1,748 tests with 29 skipped. Lint has zero errors
and ten existing warnings. Typecheck first caught a missing `NODE_ENV` in the
synthetic Cloudflare wrapper test; adding `NODE_ENV: "test"` fixed that fixture.
Typecheck and both affected test files then passed (six focused tests).
`design-system:check` passes. Isolated Vercel production builds also passed.
The live homepage and expanded Calendar FAQ are readable at 390px; DOM readback
shows 390px document and scroll widths. Earlier public-page keyboard and narrow
layout checks remain applicable because the final footer change only changes
its URL through the existing helper.


The final pre-promotion review returned `fix-first`: the isolated stage had not
included this task's legal-link registry changes. The operator added only the
`LegalContent.tsx` marker count and `INT-LEGAL-002` entry to the staged registry,
plus the empty legacy callback setting in `.env.example`. No unrelated registry
changes were included. Candidate-local dependency links initially resolved
workspace versions of Cadence packages; candidate checks now resolve only the
isolated stage's own packages. Vercel excludes `node_modules` and built from
isolated source throughout.

After those corrections, all seven required commands passed in the isolated
candidate itself: `agents:check`, `interactions:check`, `resolvers:check`, `lint`,
`typecheck`, `test`, and `build`. The candidate passed 1,685 tests, with 26
skipped. Candidate lint has zero errors and seven existing warnings. This count differs from the dirty workspace's 1,748 because unrelated
workspace work is excluded. The new Ready candidate is
`dpl_CHQVE4LWvUPG6LN4dpW3YwTTAgua`. Its actual Privacy response includes the
canonical marketing footer and Limited Use disclosure. Manifest hashes and
separate workspace/candidate evidence are stored under
`/private/tmp/cadence-domain-release-20260917`.


Fresh read-only review of the corrected candidate returned `ship` with no
blocking findings. The operator promoted `dpl_CHQVE4LWvUPG6LN4dpW3YwTTAgua`
to production. Marketing remains `dpl_5WtNGHwxYgRpfrGMuR4tKYhaivrg`.
Post-promotion Privacy returned 200 on both new and legacy app origins without
redirects; both render the canonical `https://cadence-me.com` overview link.
The live browser verified that link and the external Google policy link.
Both unauthenticated Calendar APIs still return 401 with no-store.

Ticket 139 is complete. Ticket 138 remains blocked on real web/native account
acceptance. Ticket 140 remains blocked on human Gmail completion and actual
recording/upload. Ticket 141 remains blocked on its prerequisites and Google's
actual review decision. Owner approval, technical checks, and Google approval
remain distinct. No Google review correspondence was sent.


### Dedicated test-account continuation, 2026-09-17

The owner reported completing `cadence.testing.is@gmail.com`. Computer Use
verified the identity in Google Account and Calendar. A private `Cadence
demonstration` calendar now contains three harmless events: Demo planning
(13:00–13:30 Eastern), Demo afternoon walk (16:00–16:30 Eastern), and Demo
workshop (all day September 17–18). Each has a synthetic-event description and
no guests, location, or reminder. Calendar displayed each saved event.

The Calendar OAuth Testing audience now includes this dedicated identity while
preserving both existing test users. Google publishing remains Testing. New-domain
Cadence `/login` is retained for the next step. Its continuation accepts Cadence
Terms and acknowledges Privacy, so Computer Use requested action-time confirmation
for that agreement and the dedicated account's new read-only Calendar grant.
No new-account Cadence sign-in, Calendar grant, native account switch, recording,
upload, or review submission completed during this checkpoint.

Chrome rejected the ICS upload because the extension lacks file-URL access.
Direct event creation completed through Calendar UI instead. The operator did
not change extension permissions. The user received the supported upload-enablement
instructions. No application runtime code or deployment changed. `agents:check` and
`git diff --check` passed after the checkpoint edit.


### Dedicated account web acceptance and desktop preparation, 2026-09-17

The owner completed Cadence sign-in and reported completion of the pending step.
Settings confirmed `cadence.testing.is@gmail.com`. Google consent requested only
the calendar-list and event read permissions, in addition to OpenID association.
The dedicated account granted them and returned to the new-domain Settings page.
Only `Cadence demonstration` was selected; its primary calendar and Holidays in
the United States remained unselected. Save and refresh succeeded. Timeline showed
Calendar current, both timed demo markers, and Demo workshop on September 17 and
18 only. Demo afternoon walk preview showed 16:00–16:30 Eastern. Its read-only
details showed the synthetic description, 30-minute duration, America/New_York,
and no attendees, location, conference, or attachments. No source-event or
Behavior mutation occurred during this acceptance check. Demo workshop details
also showed `2026-09-17 through 2026-09-19 (exclusive)` and `2 calendar days`.

The owner explicitly approved backing up the installed desktop database,
temporarily switching to the dedicated test account, and restoring the primary
account afterward. Settings Back Up created the private local file
`/private/tmp/primary-before-demo-20260917.sqlite3` outside the repository and
release candidate. Its mode is owner-only and SQLite `PRAGMA quick_check` returned
`ok`. The native automation timed out after saving; normal Quit/relaunch restored
inspection. Keep a local copy disconnected the primary account and displayed the
retained app-managed SQLite path. The hosted primary account was not deleted.

The first desktop OAuth attempt opened in the other Chrome profile. Moving its
already-generated Google URL between profiles failed with HTTP 400 and did not
link an account. The operator cancelled it and restarted the native flow after
selecting Identity Scaffolding in Chrome. The dedicated-account chooser then
remained pending. Native Chrome controls repeatedly reported active user
interaction, preventing inspection of the external-app handoff. The operator
requested an uninterrupted Chrome window before continuing. This checkpoint does
not claim desktop sign-in, restoration, native Calendar acceptance, recording,
upload, or Google submission. Existing owner approval and eventual Google approval
remain separate.

Documentation validation after this checkpoint: `npm run agents:check` and
`git diff --check` passed. No runtime code or deployment changed in this continuation.


### Installed dedicated-account acceptance continuation, 2026-09-17

The owner requested completion of the approved desktop test. A fresh native
Google sign-in opened in Identity Scaffolding Chrome. The operator selected
`cadence.testing.is@gmail.com` and accepted Chrome's Open Cadence.app prompt.
Native accessibility timed out after the callback. Normal Quit/relaunch restored
inspection, and Settings confirmed the dedicated identity with first-link review
still pending. Immediate callback rendering is not claimed.

The operator chose Ignore local data and use account data. Cadence created a
protected backup before replacement and reported Account data is current.
Read-only SQLite checks found eight categories, zero Behaviors, and zero
Occurrences; integrity and foreign keys passed. Primary data did not enter the
dedicated account. The original private backup remains available.

Installed preview.40 read the existing dedicated Calendar grant and selected
only Cadence demonstration. Native Refresh Calendar succeeded. Timeline displayed
both timed demo markers and Demo workshop on September 17 and 18, excluding
September 19. Native details showed a two-calendar-day duration and the exclusive
September 19 end. No tracking or source-event mutation was submitted.

Native global Calendar disconnect succeeded. Web reload showed Calendar is not
connected and removed all event markers/labels. Native calendar-cache.sqlite3
contained zero complete snapshots and zero pending refreshes; integrity passed.

A fresh native Calendar flow reached the preserved legacy broker's English
consent screen with the dedicated identity and the same calendar-list/event
read-only scopes. Automatic approval review rejected scope selection because
Google grants account-wide calendar reads, while the reviewer interpreted the
existing authorization as limited to harmless test-calendar data. The operator
left both scope boxes unchecked and asked for explicit approval of those two
account-wide read-only permissions for the dedicated identity. No workaround or
new grant occurred after rejection. Native reconnection and primary-account
restoration are pending at this checkpoint. No recording, upload, or Google
review submission occurred.


The owner subsequently explicitly approved both account-wide read-only Google
Calendar scopes for the dedicated account and requested reuse of that approval
for equivalent operations. The operator selected both permissions and activated
Continue. The prior approval gate is resolved. Callback completion remains
unverified because native Chrome controls repeatedly reported user interaction
and changing foreground tabs. The operator requested a brief uninterrupted
Chrome handoff, not another permission approval.


### Native reconnection and primary restoration completed, 2026-09-17

The approved fresh Calendar grant completed through the installed preview.40
legacy broker. Settings confirmed the dedicated identity and Calendar connected.
The operator selected only Cadence demonstration, saved, and refreshed. Timeline
showed both timed demo events and the two-day workshop. Read-only cache inspection
found one complete snapshot, one selected calendar, and the September 17–24 range;
SQLite integrity passed. Immediate callback rendering was not observed.

Keep a local copy disconnected the dedicated account. Normal Google sign-in then
restored emibache@gmail.com. Settings reports Account data is current and the
primary account's existing Calendar selection is restored. No Calendar permission
or selection was changed for that primary account.

Read-only comparison against the private pre-demo backup verified identical IDs,
counts, and every stored value across categories, Behaviors, schedules, slots,
definition/configuration history, 1,638 Occurrences, 1,226 status events, 12 time
sessions, import runs/mappings, imported notes/interventions, and shortcut states.
All 1,600 reminder IDs remain. One reminder advanced from pending to sent, changing
only its status, processing_started_at, sent_at, and updated_at. Both databases
pass quick_check and have zero foreign-key violations. The backup remains outside
the repository at its previously recorded private path.

Ticket 138's domain/native compatibility acceptance is complete. Ticket 140's
actual recording/upload remains in progress. No recording, upload, or Google
submission is claimed. Owner approval, technical verification, and Google's
future review remain distinct. No runtime code or deployment changed.


Recording preparation still requires uninterrupted native screen control. No video
was recorded or uploaded. Screenshot/QuickTime/BetterCapture controls failed or
timed out; the Chrome recorder opened, but foreground changes prevented safe
local-storage setup. The dedicated demo page remains ready. Emiliano Bache
Rodriguez is the owner-named monitor for info@identityscaffolding.com. Final
Branding URLs and all three declared scopes were read back; Google remains
Testing with no submission. See the recording readiness checkpoint in
docs/qa/google-calendar-capabilities.md for evidence.


### Demonstration captured and second restoration verified, 2026-09-17

A four-minute continuous production web demonstration is recorded. Privacy masks
cover unrelated account identities and transient OAuth parameters. Full playback,
all one-second visual samples, and full-file decoding pass. The recording retains
the real test identity, scopes, client ID, selection, refresh, details, and
disconnect. Native acceptance remains separate evidence for the same Calendar
client. The actual consent label is cadence-me.com while brand review is pending.

YouTube Studio confirmed brittlebeliefs. Unlisted upload is paused at YouTube's
agreement notice; action-time confirmation and signed-out playback remain open.
Google remains Testing with no review submission or approval. The second native
account switch/restoration matches every row in all 15 tracking tables, including
reminders. Primary Settings reports Account data is current. A stale disconnect
notice clears after normal restart; no runtime fix was made. Full artifact,
checksum, redaction, and backup evidence is in google-calendar-capabilities.md.


### Video published, 2026-09-17

Ticket 140 is complete. The owner confirmed YouTube’s agreement. The reviewed
four-minute MP4 is Unlisted at https://youtu.be/FFlbGp-_6bE on brittlebeliefs.
YouTube found no copyright issues. Chrome Incognito showed Sign in and advancing
video playback, proving signed-out reviewer access. The upload contains only the
privacy-reviewed export. Google’s production-audience confirmation remains open;
Ticket 141 has no submission or approval yet. Primary desktop restoration remains
verified. No runtime code changed in this upload continuation.


### Verified branding continuation — September 17, 2026

The owner confirmed the production-audience expansion at the open Google dialog.
The Calendar project `cadence-calendar-498717` now reports In production. Google
found that the consent name Cadence Calendar did not match the homepage. Changing
the consent name to Cadence resolved the finding. Google verified the branding,
and publishing it produced the confirmation that verified branding is shown to
users. The project and client IDs, callbacks, scopes, and separate sign-in project
remain unchanged. This is Google's branding approval, not Calendar-access approval.

The scope justification and submission summary are saved. Final submission remains
at the unanswered Verification Questionnaire. Google's current video requirements
require matching app name and branding. The existing unlisted video shows the
previous domain label, so Ticket 140 is reopened for actual updated footage. No
consent labels will be replaced or simulated in the recording. The dedicated test
account remains disconnected; the primary desktop account remains restored.

The owner retained info@identityscaffolding.com and named Emiliano Bache Rodriguez
as the human monitor. The September 17 Privacy approval remains owner approval,
not independent legal review. No Calendar data-access submission or approval has
occurred. Reference: https://support.google.com/cloud/answer/13464321 .


### Calendar review-copy publication — September 17, 2026

Marketing deployment `dpl_8t2tdswkbtotmut2Pbs5B44uA1BE` is Ready and promoted.
Its isolated source stage is `/private/tmp/cadence-domain-release-20260917/marketing`.
Only three previously reviewed marketing copy files changed for this continuation:
`src/pages/index.astro`, `src/data/faq.ts`, and `src/data/routes.ts`. They replace
the obsolete Testing-only limit with pending Calendar-access review. The public
homepage and FAQ both return the new copy and no longer state the old test limit.
The authenticated candidate check also verified the canonical Cadence URL.
Deployment protection remains enabled. Marketing checks and build pass.

The application deployment remains `dpl_CHQVE4LWvUPG6LN4dpW3YwTTAgua`. Its
Production `CADENCE_TRUST_MARKETING_DEPLOYMENT_ID` setting now names the new
marketing deployment. This affects subsequent builds; the running app retains
its old build-time reference. Fresh commit-bound Trust evidence remains pending.
No new Trust Passed claim or app release was made for this copy correction.
Rollback for this correction: promote marketing
`dpl_5WtNGHwxYgRpfrGMuR4tKYhaivrg` and restore its deployment-reference setting.

Repository user-guide copy now describes the same pending-review state.
`agents:check`, `interactions:check`, `resolvers:check`, and `git diff --check`
pass. Full app lint/typecheck/tests/build from the preceding isolated release
remain the code evidence; this continuation changes copy and records only.
Logs are under `/private/tmp/cadence-domain-release-20260917/logs`.

The recording page is isolated and signed into the dedicated test account.
Chrome focus changed before recorder startup completed. No new recording was
confirmed. The page and unsubmitted Google questionnaire remain open for
continuation when Chrome can remain on Cadence during capture.
