# Travel routing release evidence

Updated September 22, 2026. Ticket 165 remains open. The owner authorized USA
billing, the existing Cadence Google Cloud project, an initial US$20 routing
allowance, credential setup and live testing. This record separates that setup
from deployed-web and installed-desktop travel acceptance.

## Authorized setup — September 22, 2026

Google confirmed the existing billing account upgrade and the CLI verified
`billingEnabled: true` for Cadence (`habit-tracker-498717`). The separate
Cadence Calendar project remains unchanged. A US$20 custom-period budget starts
September 22 without automatic renewal. Alerts trigger at 50%, 90% and 100%,
excluding credits. [Cloud budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets)
are notifications, not spending caps.

The dedicated local server key permits only Routes and Geocoding APIs, from
the machine's observed IPv4 and IPv6 egress addresses. The ignored `.env.local`
holds the key. The first unused key was revoked after the CLI unexpectedly
included it in operation output; the replacement value was captured privately.
Provider readback confirms 120 requests/day and 30/minute for Compute Routes
and Geocoding. Other API quotas remain unchanged. Hosted egress clearance is
still required; this local key cannot serve arbitrary Vercel egress.

The database admission function now enforces a nonrenewing initial allowance
of 40 refreshes. It reserves US$0.50 before provider work and retains failed or
partial reservations. A global transaction lock protects the lifetime sum of
the permanent daily counters. A refresh makes at most 19 geocodes and 18 route
calls, including driving refinement and retry. At the verified
[global pricing](https://developers.google.com/maps/billing-and-pricing/pricing),
the conservative upper bound is US$0.365 before tax and without free credits.
US$0.50 is a reservation, not observed billing. Recheck prices before raising
the allowance or changing call bounds. The local ledger has reserved one slot
for public-landmark acceptance; preserve that reservation across any later
hosted rollout. Never reset or prune a live allowance ledger.

The owner confirmed USA billing. The applicable non-EEA
[service terms](https://cloud.google.com/maps-platform/terms/maps-service-terms/)
permit Routes and Geocoding content without a corresponding map and prohibit
combining that content with a non-Google map. Cadence's reviewed boundary is
transient, attributed timing display without a map. Navigation links use
user-authored destination text. Route content and raw endpoints remain excluded
from model input; this review grants no model projection or training use.
Provider retention is governed by Google; Cadence does not promise provider erasure.

The project Supabase executable has an invalid code signature. The installed
official CLI 2.109.1 works through `SUPABASE_CLI_BINARY_OVERRIDE`. A clean local
reset replayed all pending migrations, including travel and the concurrent
historical-completion snapshot. The reset recreated the database with a broad
port binding; the operator stopped it immediately and restored `127.0.0.1`
with the existing volume. The original stopped container remains for rollback.
Generated public/GraphQL types now come from that replayed schema. The real SQL
smoke verifies 40 reservations, six per owner/day, no day-boundary renewal,
and denied unauthorized resets. No hosted migration has run in this phase.

## Documentary support

| Requirement | Official support | Implementation boundary |
|---|---|---|
| Route request | [Compute Routes](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes) requires a response field mask and supports origin, destination, selected mode, departure time, arrival time, warnings, and fallback information. | The adapter requests duration, static duration, warnings, transit stop times, and fallback only. It requests only step mode, duration and transit timing for access/egress calculation; never polylines, route tokens or alternatives. |
| Selected transport mode | [Routes travel modes](https://developers.google.com/maps/documentation/routes/reference/rest/v2/RouteTravelMode) defines walking, bicycle, transit, and drive. | Cadence maps only the saved selected mode. It never probes another mode as a fallback. |
| Transit timing | [Compute Routes](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes) limits `arrivalTime` to transit and permits either arrival or departure time. | Transit requires provider itinerary times. Missing schedule times fail as unavailable. |
| Geocoding | [Geocoding policies](https://developers.google.com/maps/documentation/geocoding/policies) restrict caching and require attribution when results display without a Google map. | Address resolution is transient and bounded to five candidates. Cadence stores no geocodes. |
| Route display | [Routes policies](https://developers.google.com/maps/documentation/routes/policies) require attribution for Routes content without a Google map. | The narrow route result carries `Google Maps` attribution for later approved presentation. |
| Credential handling | [Google Maps security guidance](https://developers.google.com/maps/api-security-best-practices) recommends API and application restrictions. Server web-service keys use IP restrictions where enforceable. | The adapter reads only a server environment credential and is disabled without the explicit clearance value. It has no browser credential path. |
| Terms and region | [Maps service terms](https://cloud.google.com/maps-platform/terms/maps-service-terms) apply outside the EEA. [Geocoding policies](https://developers.google.com/maps/documentation/geocoding/policies) state that EEA billing has separate terms. | The owner confirmed USA billing on September 22. The non-EEA deterministic-display boundary is recorded above; model projection remains disabled. |

## Open operator gates

- Complete private-account Calendar-location and current-device acceptance under
  the separate routing consent. Model projection remains disabled.
- Establish fixed hosted egress or another approved server credential method.
  The verified local IP-restricted key is not a hosted deployment credential.
- Deploy the verified budget admission migration before enabling hosted routing,
  carrying forward the one live-test reservation. Preserve the lifetime ledger.
- Review provider retention and deletion terms. Cadence does not retain route
  requests, geocodes, device samples, or route responses, but this does not
  establish provider erasure.
- Public-landmark acceptance passed below. Private-account, deployed-web and
  installed-desktop travel acceptance remain open.

## Repository evidence

- The server adapter has an explicit `CADENCE_TRAVEL_PROVIDER_CLEARANCE=approved`
  gate. Its default state rejects before it reads a request body, source data, or
  provider data. The server reads its environment configuration without transmitting it.
- The adapter uses `cache: "no-store"`, a five-second call limit, an eight-leg
  batch cap, two concurrent calls, a 45-second batch deadline, and one transient
  retry per batch.
- The service requires an owner/grant/source freshness fence before each call and
  after each response. A late response is rejected.
- Quota records contain counters and dates only. They contain no endpoints,
  device samples, geocodes, or route results.
- Focused provider-free tests cover disabled clearance, selected-mode projection,
  transit schedule rejection, retry bound, late-response rejection, and malformed
  quota decisions.

## Local synthetic acceptance — September 22, 2026

The Codex browser used `http://127.0.0.1:4324/design-system` with synthetic
fixtures. Desktop-width and 390px-wide checks verified the existing preview,
details dialog, keyboard dismissal/focus return, map URL projection and Settings.
No browser or native permission prompt ran. The denied-location Settings fixture
used a stub. No map navigation or provider call occurred.

The complete-trip fixture retains the 2:30–4:30 event marker and attendance,
shows 1:30 departure and 6:30 availability, and highlights the 5PM Behavior
collision. The no-base fixture retains outbound timing and span, reports unknown
full-trip availability, and removes only return occupancy. A DOM regression also
verifies travel inspection for a located Behavior without Calendar events.

Native storage tests passed 108/108, including reopen, CAS, outbox, existing
backup/restore and account-sync paths. This is synthetic storage evidence, not
installed macOS permission acceptance. The native foreground adapter compiled;
real OS denial/revocation, cold start and navigation remain unverified.

At initial repository acceptance, the invalidly signed Supabase binary blocked
clean replay and generated types. The September 22 setup above resolved those
local checks using the installed official CLI. Hosted deployment remains open.

No rollout version exists. Routing remains disabled by default. Rollback first
removes `CADENCE_TRAVEL_PROVIDER_CLEARANCE=approved`, disables travel and clears
transient route state. Preserve user-authored locations, additive schema and
independent tracking, Calendar, sign-in and Daily Brief behavior. Follow
`docs/OPERATIONS.md` before any separately authorized rollout.

Repository checks passed: agent, interaction and resolver contracts; TypeScript;
ESLint with no errors; full Vitest with two workers; web and desktop builds;
shared-core portability; design-system validation; and diff whitespace checks.
The default-concurrency full run hit one unrelated release-CLI test timeout;
the two-worker run passed. Five integration files (29 tests) remain skipped under
the existing suite configuration. Final counts and review disposition are recorded
in `STATUS.md`.

Initial parent Vitest run: 262 files passed, five skipped; 2,111 tests passed,
29 skipped. The initial final run overlapped edits to two unrelated briefing
workbench tests. The subsequent settled run passed. Lint reports ten existing
warnings and zero errors. The travel changes add no lint warnings.
The post-review full run needed loopback access for the existing synthetic
reminder-server tests. Its authorized rerun passed; no external email was sent.

Marketing verification passed: `marketing:check` (28 files, zero diagnostics) and
`marketing:build` (five pages). This verifies the canonical disclosure output;
it does not establish a released travel capability.

Independent review found two defects, both corrected before the next review.
First account link now recognizes saved travel preferences and imports private
travel data through the existing atomic account-sync path. It matches category
identities, retains location history, and uses existing conflict review and retry
guards. Provider-free regressions cover interrupted local commits and conflicting
saved bases. Located exact Behaviors retain inbound routing when their duration
is unknown; return timing and complete availability remain unknown.

Final independent code review returned `ship` with no findings after both corrections.
This accepts the repository implementation behind its disabled provider gate.
It did not close the database, provider, deployed-web or installed-macOS gates.
The authorized setup subsequently completed local database and public-provider
checks. Deployed-web and installed-macOS travel gates remain open.

## Live public-landmark acceptance — September 22, 2026

The production adapter passed walking, cycling, transit and driving for outbound
and return requests between public New York landmarks. Each successful result
had positive duration, ordered timestamps and Google Maps attribution. A short
transit trip without transit steps stayed unavailable; an imprecise landmark
stayed ambiguous. Neither case silently changed the selected mode or guessed a
location. No private account data or device position entered these calls.

Live testing exposed a driving timestamp defect. The first traffic request used
`readyAt`, which had become past by provider receipt. Google returned
`INVALID_ARGUMENT`. The adapter now probes the future requested time and, for
arrival targets, refines once at the candidate departure. Regression tests cover
both departure targets and the 18-call bound with a failed refinement retry.
Denied geocoding responses now report provider failure instead of no location.
Final review also found that an already-late candidate could remain in the past.
Both driving queries now use readiness and a fresh service-clock floor, allowing
ten seconds for receipt. The estimate preserves the evaluated departure and late
arrival. Clock-controlled regressions cover past/equal candidates, elapsed fencing
and immediate departures without adding provider calls. These edge cases have
provider-free evidence; the earlier live future-trip evidence remains separate.

All probes together used eight geocode requests and 18 route requests, within
one reserved slot. The conservative list-price ceiling is US$0.31 without free
credits; actual billed cost is not yet verified. The local lifetime ledger has
one reservation, leaving 39 slots (US$19.50 reserved capacity). Requests and
provider results remained transient; the evidence contains pass/fail counts only.

After the live corrections, agent, interaction and resolver checks, TypeScript,
lint, all tests and the web build passed. Vitest passed 2,135 tests across 262
files; 29 tests across five integration files remain skipped. Lint retains ten
existing warnings and no errors. Independent acceptance review returned `ship`
with no findings. The quota smoke passed against real local Postgres before the
live reservation; do not reset that ledger to repeat the empty-database smoke.

The local app update is independent: preview.42 comes from released main commit
`362eb97e`, without the unreleased travel changes. Existing account Daily Brief
and Calendar timing consent were already enabled. Installed advisor acceptance
resumed after manual Mac unlock and existing-login Keychain approval. The app
opened its linked account, but Calendar and Daily Brief were unavailable because
the build omitted `VITE_CALENDAR_BROKER_ORIGIN`. The corrected preview.42 uses
`VITE_CALENDAR_BROKER_ORIGIN=https://cadence-blush-three.vercel.app` during the
existing `release.mjs preview-build 0.1.1-preview.42` invocation. Keep this public
setting explicit in future builds: the release helper treats it as optional,
and the root `.env.local` did not supply it.

The corrected build passed all 11 release checks, strict deep code signing and
installed/candidate equality. Its binary SHA-256 is
`4ec4d436a356aeaf20884abf19c4f90993faca6569802a6d56cd6f226da915e9`.
The fresh pre-replacement backup passed integrity and foreign-key checks.
Installed Settings confirms Daily Brief and selected Calendar timing enabled.
Calendar events load; linked-account synchronization reports current data.
The first automatic briefing showed an error; Vercel records HTTP 409 from
`POST /api/advisor/brief` at 13:53:08 UTC on September 22. The response's specific
error code was not exposed in runtime logs, so the cause remains unverified.
After navigating to Settings and back, the existing attempted-state guard hid
the bubble. No attempt, dismissal or preference state was reset to force another
generation. Enablement is verified; successful installed generation remains open.
The previous preview.41 and integrity-checked data backups remain available.

## Daily Brief recovery — September 22, 2026

The normal browser retry returned HTTP 200 and `state: ready` after the isolated
production hotfix `dpl_6JTeeGQ7kZFdZ252AfoGMnHydu9L`. The visible horse bubble
displayed the briefing. Released `362eb97e` plus one context predicate correction
and its regression comprise the hotfix. Preserved occurrences may retain old or
null configuration lineage after a valid fenced sync; rejecting their count caused
`context_incomplete`. Final revision checks and stale-state fencing remain intact.
The original regression failed twice; fixed tests passed. Required checks, 1,896
tests (29 skipped), production build and independent review passed. No presentation
or consent state was reset. Installed preview.42 retains its enabled default setup.

## Hosted routing setup — September 22, 2026

The authorized hosted migration push applied travel settings, travel quota, and
`20260922143000_carry_travel_pilot_reservation.sql` only. Readback confirms one
lifetime reservation and 39 remaining slots. The rollback-only local SQL smoke
admits exactly 39 further refreshes, rejects renewal on a new day, and protects
the ledger from authenticated resets. The live ledger remains unchanged.

Vercel uses its existing team-mode OIDC issuer. Google workload identity pool
`vercel-cadence` and provider `cadence-production` require the immutable Cadence
team/project IDs, production environment, exact subject and audience. The
`cadence-travel` service account has only Service Usage Consumer in the project;
only that exact production subject may impersonate it. No service-account key or
paid static-IP add-on was created. Production configuration is saved with the
routing clearance disabled until candidate acceptance.

Hosted calls use short-lived OAuth for Routes and Geocoding v4. The local
IP-restricted key retains Geocoding v3. Provider readback confirms the separate
v4 GeocodeAddress quota is 120/day and 30/minute. The runtime restricts address
resolution to one precise result. v4 lacks v3's partial-match signal; the two
parsers are not semantically identical. Multiple or coarse results remain
ambiguous. No private location or hosted routing request has run in this phase.

