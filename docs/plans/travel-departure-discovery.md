# Travel context and departure advice discovery — Ticket 160

Research date: September 21, 2026. Scope: discovery only.

## Accepted direction and implementation state

The owner corrected the initial proposal on September 21, 2026. Cadence will
plan travel proactively from usable location pairs, using the current device
position by default when location permission is enabled. Behaviors gain optional
locations. A saved base is optional: its absence suppresses only final-return
advice and leaves return time unknown. Current-location-to-event and event-to-event
recommendations remain available whenever their location points are usable.
Walking, cycling, transit and driving belong in the planned scope.

Departure, attendance, onward travel and return contribute to occupied time.
Timeline and collision detection must retain all known expanded segments even
when final return timing is unknown. Reuse the existing magenta span, overlap
borders and Calendar inspection UI. Show Calendar locations
with Google Maps or the user's supported preferred-navigation link.

These requirements supersede the initial manual-only, driving-only, per-request
and advisor-only recommendations. Tickets 162–165 divide implementation and
release acceptance. This revision completes planning, not runtime implementation.
Provider setup, credentials, actual location access, private routing, deployment
and live transmission have not occurred. Provider-use and release evidence remain
necessary; the product direction no longer awaits approval.
The owner's later correction withdraws the global saved-base requirement in the
preceding revision. Base presence is never a prerequisite for other usable legs.

Ticket 160 remains independent of the initial Daily Brief rollout. Tickets
156–159 and 161 must not claim travel support before the follow-ups implement it.
This brief follows [the integration playbook](../INTEGRATION_PLAYBOOK.md).
Provider claims are **Documented support**, checked on September 21, 2026.
Repository findings are **Source check**. Examples use synthetic route durations.
Native runtime, live provider, deployed behavior and public approval are unverified.

## Existing boundary and ownership

| Finding | Source check and consequence |
|---|---|
| Calendar display already receives locations and conference details. | `lib/services/google-calendar-provider.ts`, `EVENT_FIELDS` and `adaptGoogleCalendarItem`: location is sanitized, bounded free text. Field availability distinguishes missing and restricted data. |
| Scheduling and briefing intentionally omit locations. | `projectExternalEventSchedulingEvent` and `projectAdvisorCalendarConnector` project intervals and provenance. `AdvisorDayContextV1` has no address fields. Do not widen it to carry raw locations. |
| Travel advice is currently forbidden. | `lib/services/daily-brief-consumer.ts` explicitly rejects invented travel times and departures. `BriefingPlanResult` has no travel evidence contract. |
| Tracking data has no origin or route model. | `docs/DATA_MODEL.md` separates tracking, Calendar connection state and private briefing admission. No schema change follows from this discovery. |
| No routing adapter or native location implementation exists in the inspected paths. | Searches covered `lib/services`, shared core types and `apps/desktop/src`/`src-tauri`. Installed agent connectors and Cloud account configuration were not inspected. No usable connector is assumed. |

Cadence's authenticated user ID owns permissions and requests. Reuse the current
Google Calendar same-account binding; never identify an owner by email. Maps
requests use Cadence's project credential, not the user's Calendar OAuth token.
There is no Maps user account link in the proposed slice.

Google Calendar owns event locations and scheduled intervals. Cadence owns
user-entered Behavior locations, base location, mode preference and corrections.
A device sample observes the present position; a schedule predicts a future stop.
Those facts are never interchangeable. Pure core code owns precedence, itinerary,
occupancy and collision rules. Services own location/provider I/O and consent.

Editing a Behavior location or base is an ordinary user-authorized Cadence write.
Routing itself changes no Behavior, Occurrence status, timer or Calendar event.
Travel spans are derived occupancy, not stored Calendar events or new Behaviors.
Navigation opens only when clicked. Background tracking, autonomous navigation,
Calendar editing and automatic rescheduling remain outside scope.

## Location precedence

Precedence depends on the role of the point. There is no single ordering that
lets a device position overwrite a destination.

| Role | Rule, highest priority first |
|---|---|
| Immediate departure origin | A user's explicit trip correction, if present; otherwise a fresh permitted device position; otherwise an available saved base. Current device position takes precedence over a predicted scheduled origin for the next departure. A prior scheduled event does not prove the present position. |
| Future leg origin | The preceding usable commitment destination in the planned itinerary. The first leg starts from the current-origin rule. Label future origins as planned, not observed. Unknown intervening commitments interrupt automatic chaining. |
| Behavior destination | A specific user correction for the journey, otherwise that Behavior's optional designated location. Missing location remains unknown; never substitute the device or base as the Behavior's destination. |
| Calendar destination | A specific user correction for the journey, otherwise the event instance's usable physical location. A Behavior location cannot override an unrelated Calendar event. |
| Onward destination | The next usable commitment in chronological order. Calculate the direct A → B leg once; do not insert an automatic trip through base. |
| Final return destination | Route the last event → saved base only when a usable base exists. Otherwise withhold only final-return advice and leave return time unknown. Never substitute the outbound origin or insert a base detour between successive events. |

A usable point has a resolved position, source, revision and unambiguous meaning.
A usable leg also needs mode, relevant timing and permission to send its endpoints.
Two usable points permit proactive routing and supported advice for that leg,
with or without a saved base. A missing base affects only final-return advice.
Preserve known outbound and event-to-event recommendations, occupied segments and
collisions. Leave final return and complete-trip availability unknown.
Do not infer a personal address from IP, timezone, account profile or free text.
A failed device read uses an available base and discloses that fallback. If neither
exists, request a base for the immediate origin; known event-to-event legs remain
available. Do not fabricate an origin. Permission grant alone cannot
make a denied, stale or inaccurate sample current.

For future travel, a current sample anchors the itinerary; it does not prove
where the user will be hours later. A new foreground sample corrects the immediate
origin and invalidates affected future legs. For A → B → C, plan each leg from
event locations, times and mode. Recalculate affected legs when those inputs
change, without automatically inserting a return to base. Uncertain attendance
produces conditional estimates. Overlapping or unknown commitments prevent a claim that
the whole itinerary is feasible, but do not suppress an otherwise valid route
between two known points.

## Onboarding, saved locations and location freshness

Travel onboarding explains automatic routing before enabling it: Cadence uses
location points, mode and timing to obtain estimates, expands Timeline occupancy,
and may disclose derived timing to the advisor under its separate permission.
Offer device location for the current outbound origin and an optional saved base
for final return and origin fallback. If device location is declined or unavailable,
request a base to establish the immediate origin. Without one, that origin and
final return remain unknown; known event-to-event routes still work. Users can
leave travel disabled and keep ordinary tracking.
Explain denied, revoked and unavailable states without repeatedly prompting.

After initial permission and routing consent, acquire current position in the
foreground when travel context opens or becomes relevant. Do not require a new
explicit-origin action or confirmation for every route. Recompute affected legs
when meaningful inputs change. No continuous watch, hidden location history or
closed-app tracking is required by proactive routing.

| Data | Meaning and lifetime |
|---|---|
| Base and Behavior location | Saved user-authored configuration. Remains until edited or removed. Dismissing a briefing, navigating away or a route expiring does not erase it. Ticket 162 covers web/desktop storage, account sync, portability and deletion. |
| Trip correction | Optional override, not the default routing path. Applies to the specific journey and source revision until changed, cleared or that journey ends. A changed event requires revalidation; it does not erase unrelated saved locations. |
| Device position | Temporary observed coordinates, sample time and accuracy. Never save as a base automatically. Clear on sign-out, account switch or location withdrawal. |
| Route estimate | Temporary result with mode, inputs, evaluated time and freshness. Expiry withdraws timing certainty and permits a bounded automatic refresh; it does not delete location configuration. |

Candidate device thresholds are 60 seconds of age and 100 metres horizontal
accuracy. These are implementation defaults to validate, not accepted precision
guarantees. Route freshness and location freshness are separate. Sample age,
coarse accuracy and uncertainty about an entrance must remain observable.

Web can use foreground `getCurrentPosition`, with a secure context and platform
permission. Browser permission lifetime varies. No `watchPosition` loop is needed.
[W3C Geolocation](https://www.w3.org/TR/geolocation/).
macOS needs a Core Location adapter, purpose disclosure and packaged permission,
denial, revocation and restart tests. Tauri webview parity is unverified.
[Apple authorization](https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services),
[one-shot location](https://developer.apple.com/documentation/corelocation/cllocationmanager/requestlocation()).

## Destination audit and navigation links

Calendar location is optional free text. Conference links may coexist with a
physical address. The current Calendar adapter receives those fields but does not
receive working-location metadata. No inferred home address follows from either.
[Calendar event resource](https://developers.google.com/workspace/calendar/api/v3/reference/events).

| Input | Routing and presentation |
|---|---|
| Resolved Behavior location or Calendar address | Use proactively after initial consent. Show its source and permit correction. No per-route approval gate for an unambiguous saved point. |
| Postal address not yet resolved | Resolve under routing consent. A single sufficiently precise, non-partial result can become usable. Multiple, coarse or partial results need correction; never silently choose the first ambiguous result. |
| Venue name, room or shorthand | Resolve through a supported place lookup if authorized, or ask for a full address. Initial implementation can require a full address; it cannot invent coordinates. |
| Conference-only event | No physical destination or travel span. Keep the event interval. |
| Physical address plus conference link | Attendance is ambiguous. Request an in-person/remote choice once for that instance; do not guess. |
| Missing/restricted destination | Show unknown and a correction path. Two genuinely usable points are required; empty text never means base. |
| All-day event or unknown end | A route can be conditional, but no precise full-day travel envelope without arrival/end timing. Do not invent midnight or a return departure. |
| Cancelled/declined event | Exclude from prospective travel. Tentative attendance remains conditional. |
| Recurring instance changed | Invalidate affected legs by instance revision. A series title is not identity. |
| Same resolved point | Zero inter-location travel can be established, while explicit transition/indoor buffers remain. Equal free-text strings are insufficient. |

Google Geocoding accepts postal addresses and reports matches and precision.
Treat malformed, partial or broad-area results as unresolved. Limit displayed
candidates to five; overflow requests clarification. It is not a general venue
search API. No additional Places service is assumed or enabled.
[Geocoding contract](https://developers.google.com/maps/documentation/geocoding/guides-v3/requests-geocoding).

Calendar inspection must show available location text with a navigation link.
Generate the link from structured location data through an allowlisted provider
builder; never execute arbitrary event text as a URL. Google Maps is the fallback
when no supported navigation preference exists. Match the selected transport mode
where the destination app supports it; otherwise disclose that app-side choice.
An unresolved text address may offer Search in maps, but cannot imply a verified
route. Conference URLs remain meeting links, not navigation destinations.

Google Maps URLs support search/directions across platforms without an API key.
They use `api=1` and URL-encoded parameters. A clicked link opens navigation; it
does not provide Cadence with a verified duration.
[Maps URLs](https://developers.google.com/maps/documentation/urls/get-started).
Preferred-navigation links must use user-authored or Calendar source locations,
not export Google's computed route content into another provider. Verify each
provider's documented link format and terms during Ticket 164. Do not guess a
custom URL scheme. Disclose which navigation app receives the clicked location.

## Provider capabilities, terms and credentials

### Google Routes and Geocoding

Routes accepts addresses, coordinates or place IDs. Prefer confirmed place IDs
after resolution; no Places autocomplete dependency is necessary for this slice.
[Waypoint contract](https://developers.google.com/maps/documentation/routes/reference/rest/v2/Waypoint).

`computeRoutes` is a single request, without pagination. It needs a response field
mask. `duration` uses traffic with a traffic-aware preference; `staticDuration`
does not. A future driving query accepts `departureTime`. `arrivalTime` applies
only to transit, so subtracting one driving estimate is not an arrive-by API.
Responses expose fallback information, which must not become verified traffic.
[Routes reference](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes).

Support walking, cycling, public transit and driving. The user chooses a default
mode during setup and may override a leg. Do not default silently to driving or
query every mode to choose for them. Drive uses traffic-aware estimates. Walking
and cycling need the provider's beta warnings. Unavailable modes remain unknown;
never replace transit with driving. Vehicle pickup or parking requirements can
make a mixed-mode itinerary infeasible and must remain explicit.
[Travel modes](https://developers.google.com/maps/documentation/routes/reference/rest/v2/RouteTravelMode).
Transit supports arrival or departure queries and walking connections. Its
scheduled services and waiting time require itinerary-aware timing. Return
availability can differ from outbound availability; check the return independently.
[Transit routing](https://developers.google.com/maps/documentation/routes/transit-route).

Billing must be enabled. Routes bills each query; matrix routing bills elements.
Traffic-aware requests trigger Pro. Published Compute Routes capacity is 3,000
queries/minute and 25 intermediate waypoints. This proposal uses none.
Project quotas can stop requests; budget notifications alone are not admission
controls. Actual project quotas and billing eligibility are unverified.
[Routes billing and limits](https://developers.google.com/maps/documentation/routes/usage-and-billing).
Geocoding publishes 3,000 queries/minute across client and server calls.
[Geocoding billing and limits](https://developers.google.com/maps/documentation/geocoding/usage-and-billing).

Use one dedicated Maps project, separate from sign-in and Calendar OAuth.
Keep credentials server-only. Restrict each key to its required API and approved
server egress; never use browser referrer restrictions for server calls.
Google recommends OAuth for supported server services. Stable hosted egress and
workload credentials are unverified; approve one enforceable server credential
path before deployment. Do not ship an unrestricted key to bypass that gap.
Geocoding URLs and headers need redaction in server/hosting telemetry.
[Google security guidance](https://developers.google.com/maps/api-security-best-practices).

### Terms gate and alternative

Maps terms restrict caching and creating content from Maps content, including
using it to improve AI models. They require prior, revocable location consent.
Google may retain request data to provide and improve services. The terms also
limit supplying personal data outside normal service operation. Confirm the
proposed Calendar-address transfer and derived departure display against the
applicable agreement; user consent alone does not settle those restrictions.
[Maps terms, §§3.2.3 and 4.4](https://cloud.google.com/maps-platform/terms).

Routes permits display without a map. Its explicit 30-day caching exception
covers returned coordinates, not a general duration cache. Place IDs have a
separate exception. Grounding Lite has distinct LLM-output permissions and
restrictions; those do not automatically extend to Routes results.
[Service terms, §§A.3, B.10 and B.19](https://cloud.google.com/maps-platform/terms/maps-service-terms).

The proposed UI must distinguish Maps content and keep Google Maps attribution
visible beside it. Public Terms/Privacy need the required Google references.
Different terms apply to EEA billing addresses; the operator's billing region
has not been verified. Do not infer eligibility from the user's timezone.
[Routes display policy](https://developers.google.com/maps/documentation/routes/policies).
Address candidates also require compliant attribution.
[Geocoding display policy](https://developers.google.com/maps/documentation/geocoding/policies).

Maps Grounding Lite is a real documented MCP service, but not an installed or
authorized Cadence connector. Its route tool accepts origin, destination and
drive/walk mode, returning duration, distance and attribution. It has no departure
or arrival-time input. The overview excludes real-time traffic and navigation.
It therefore cannot replace a traffic-aware departure estimate.
[Grounding Lite route contract](https://developers.google.com/maps/ai/grounding-lite/reference/mcp/compute_routes),
[capability limits](https://developers.google.com/maps/ai/grounding-lite).

Recommendation: use one Routes adapter for the accepted multimode plan after
provider-use clearance, with shared deterministic timing and collision evidence.
Do not feed Routes results, even derived timing, to OpenAI without
separate clearance and disclosure. Grounding Lite is an alternative only if the
owner accepts static estimates and its distinct output contract. No second
provider or generic connector framework is proposed.

## Disclosure, retention and revocation

Calendar permission, routing consent, device permission and model disclosure are
separate. Existing Calendar or Daily Brief consent does not authorize the new
transfers. Setup enables proactive routing; it does not require approval per trip.

Workspace Limited Use permits necessary transfers for prominent user-facing
features with consent. Review travel-specific verification and disclosure before
release; existing Calendar approval does not establish approval of the new purpose.
[Workspace data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy).

| Recipient | Data for the planned feature | Excluded data |
|---|---|---|
| Cadence | Owned base/Behavior locations, mode preference, temporary device sample, selected Calendar locations/intervals and journey corrections. | No background position history. Separate saved configuration from transient routing state. |
| Google Geocoding | Endpoint address, optional country constraint and project credential. | No event titles, IDs, schedules, notes, attendees, Cadence owner ID or Calendar token. |
| Google Routes | Resolved endpoints, selected mode, supported departure/arrival instant, routing options and project credential. | No titles, notes, emails, account IDs, raw Calendar payload or model prompt. Each outward, onward and return leg has its own time. |
| Browser/OS location service | Foreground location request after platform permission. Cadence consumes coordinates, sample time and horizontal accuracy. | No requested altitude, heading, speed, continuous watch or reverse geocoding. |
| OpenAI, only after provider-use clearance and revised model disclosure | Opaque commitment references, derived leg times, mode, expanded occupancy, collision evidence, assumptions and freshness. | Raw addresses, coordinates, place IDs, provider responses and device history. Until clearance, deterministic travel presentation remains separate from model input. |

Google also receives service metadata, including project identity and server IP.
Do not forward the user's IP or browser identity to Maps. Endpoints can reveal
sensitive venues even without names. Navigation links disclose their recipient
and transmit locations only when opened.

Saved user-authored base and Behavior locations remain until edited or removed.
Ticket 162 must cover owner access, local/hosted storage, account synchronization,
Cadence backup/restore and account deletion. Older imports without locations must
remain valid. Do not invent BehaviorLog fields or silently export temporary device
coordinates. Provider geocodes, route results and position samples are excluded
from sync, exports, backups, logs, traces and analytics. Saving an address does not
grant permission to persist Google's resolved coordinates.

A proposed route freshness window is five minutes, subject to earlier input,
source or permission invalidation. This is a display proposal, not a caching
license. Confirm permitted active-display treatment before integration. Expiry
removes timing certainty and triggers a bounded refresh when relevant; it never
erases saved locations or requires an explicit-origin workflow again.

**Provider retention differs from Cadence retention.** Reviewed sources establish
no Routes-specific log lifetime or per-request erase API. Google's general policy
varies by purpose; it does not promise erasure when Cadence disconnects.
[Google retention policy](https://policies.google.com/technologies/retention).
The data terms describe independent controllers. Contractual retention/deletion
remains a release question; do not promise a fixed provider erase deadline.
[Controller terms](https://business.safety.google/controllerterms/).

| Transition | Required behavior |
|---|---|
| Finish travel setup | Explain automatic routing and recipients. Require current grants and chosen mode. Offer an optional base; its absence affects only final-return advice when the other leg endpoints are usable. |
| Location, commitment, mode or buffer changes | Invalidate affected legs, coalesce changes and recompute proactively within budget. Validate source revisions before delivering results. |
| Dismiss brief | Preserve saved configuration and Timeline travel. Abort obsolete brief work without treating dismissal as withdrawal of routing consent. |
| Disable device location | Clear device samples. Use a disclosed saved base for the immediate origin or request one. Missing immediate origin does not block known event-to-event legs. |
| Remove or change base | Invalidate final return and any leg that actually used base as an endpoint. Preserve otherwise valid device-origin and event-to-event advice, occupancy and collisions. |
| Disable travel | Fence provider work and clear transient results. Keep saved user configuration until removal; ordinary tracking remains available. |
| Calendar disconnect | Clear Calendar-derived legs. Independently authorized Behavior travel can continue. Reconnect revalidates dependent grants. |
| Sign-out, account switch or deletion | Abort work, clear client memory and reject stale server responses. Other clients recheck on focus/expiry; do not promise instant remote erasure. Successful deletion removes owned saved configuration. |
| Offline | Keep tracking and saved locations available. Mark route estimates unavailable/stale; never claim verified travel from a previous online session. |

## Proactive contract and execution bounds

Use a versioned travel-evidence projection alongside existing advisor facts.
Keep raw locations out of `AdvisorDayContextV1`. Services resolve addresses and
query providers; pure shared resolvers choose origins, construct itinerary legs,
calculate occupancy and detect collisions. No resolver reads location or secrets.

A foreground context refresh routes usable pairs automatically after setup.
Triggers include opening the relevant Timeline, changed device position, source
revision, mode or buffers, and relevant estimate expiry. Route the bounded
itinerary, not every possible pair. Plan successive events directly. Include final
return only when a usable saved base exists, even when that return crosses midnight.
Missing timing may yield a conditional route but no precise occupancy for that
leg. Missing/ambiguous endpoints yield unknown for affected legs, with a correction
path; retain valid evidence for the others.

Validate ownership, source membership, grants and revisions before every call and
result. The server derives owner/day/timezone. Reject arbitrary provider URLs,
unknown modes, non-finite coordinates, invalid instants and negative durations.
Location text is data, never instructions. Navigation uses allowlisted builders.

Evidence identifies leg role (outbound/onward/return), endpoint provenance through
opaque references, mode, evaluated time, route duration, arrival/departure instants,
buffers, observation/expiry, source/grant revisions, attribution and uncertainty.
A validated response is an estimate for those inputs, not guaranteed arrival.
A missing return route must not become zero time or a complete trip estimate.
It must not invalidate known outbound/onward recommendations or collision evidence.

Proposed pilot bounds, to tune in Ticket 163: eight legs per recomputation, six
recomputations per owner/local day, one active recomputation per owner across
installations. Coalesce unchanged inputs. Budget up to two nominal route calls
per leg and one additional transient retry per batch. Use five-second per-call
and 45-second batch deadlines; partial results identify omitted/unknown legs.
Debits persist across server restarts. A provider quota or cap yields unavailable
estimates, not fabricated durations or repeated permission prompts. Configure
atomic global API caps for the actual pilot size. No continuous polling, matrix
routing, alternate-route search or cross-user result sharing is needed.

Request only fields needed for timing, warnings, fallback and attribution.
Transit additionally needs itinerary departure/arrival and connection timing;
do not strip those fields and treat transit as driving. Validate response bounds
and provider fallbacks. Never label fallback traffic as verified live traffic.
Route refresh must not regenerate an already attempted Daily Brief or reset its
daily admission/dismissal policy. Fresh deterministic context can update Timeline;
Ticket 164 defines how existing brief text becomes stale without extra model calls.

## Full-trip timing and collision rules

Use Temporal instants with the user's timezone and injected `now`. Keep original
Calendar and Occurrence scheduled times intact. Travel adds derived occupied
segments; it never moves a commitment or changes its status.

For an isolated event with a usable saved base and verified return route:

```text
arrivalTarget = eventStart - arrivalBuffer
leaveBy = verified departure that reaches arrivalTarget with contingency
returnDeparture = eventEnd + exitBuffer
returnArrival = returnDeparture + independently evaluated returnDuration
availableAgain = returnArrival + settlingBuffer
occupiedSpan = [leaveBy, availableAgain)
```

Without a usable base, final return time and complete-trip availability are
unknown. Keep the known outbound and event segments in occupancy and collision
detection. An unknown return is not zero duration, free time or a reason to hide
valid leave-by advice. Apply the same per-leg rule to an unavailable route.

The outward estimate must match its evaluated departure. For driving, probe at
the future target time, derive a candidate, then query at that candidate. Floor
each query at readiness and the current service time plus ten seconds, allowing
for provider receipt within the five-second call timeout. Keep the evaluated
candidate only when it still reaches the target; otherwise report uncertainty or
conflict. Never subtract another duration and present an unevaluated departure.
A candidate before `now` cannot be sent as a future driving query. Report a late
or uncertain arrival instead of telling the user to leave in the past.

Transit uses provider itinerary times, including access walking, connections and
waiting. Query arrival-target outbound and departure-time return independently.
No return service means an incomplete trip; never reuse the outward duration.
Walking/cycling retain their provider warnings. User buffers cover indoor movement,
parking or settling assumptions, not provider-verified facts. Apply each buffer
once; do not also add Ticket 159's generic transition allowance for the same leg.

For A → B → C, compute A → B and B → C once from event locations, times and mode.
Add C → base only when a usable base exists. Never automatically insert A → base
→ B or B → base → C, even during a gap. Recalculate affected legs on input changes.
Chain only usable consecutive commitments; unknown intervening stops prevent a
complete itinerary claim. If the user explicitly supplies a base stop between
commitments, include it and leave any known intervening free interval free.
Collision detection uses the union of occupied segments, not a blanket
first-departure-to-last-return span
across known free gaps. Merge overlapping segments for capacity calculations.

Compare expanded spans against eligible Behavior intervals and other commitments,
excluding each span's own source and shared-leg duplicates. Preserve existing
completed-work, duration-source and uncertainty rules. Partial/stale Calendar
coverage, unknown Behavior duration or unknown travel cannot prove a day is free.
A route between known points can still be shown conditionally when conflicts make
the proposed itinerary infeasible. Distinguish route evidence from day feasibility.

All examples use anonymous fixtures, not real addresses. Buffers are example
inputs, not owner-approved defaults. Intervals use half-open boundaries.

| Example | Expected evidence |
|---|---|
| Event 2:30–4:30 p.m.; outbound 50 min plus 10 min arrival buffer; 10 min exit; return 100 min plus 10 min settling | Leave 1:30 p.m.; event remains 2:30–4:30; depart event 4:40; reach return point 6:20; available 6:30. Occupancy is 1:30–6:30. |
| Behavior 1:45–2:00 or 5:30–6:00 during that trip | Travel creates collisions that scheduled-event-only overlap misses. A Behavior starting at 6:30 does not overlap. |
| Device at A, saved base B, event C | Immediate outward leg starts A → C. Return is C → B; explain that different return destination. |
| Event A then Behavior at B, both located | Route A → B directly using planned origin provenance. Detect an infeasible transition without moving either commitment. |
| Transit outbound works, last return service unavailable | Show outbound evidence and unknown return. No complete availability time or conflict-free claim. |
| Location denied, base supplied | Route from base proactively. Without base or another usable immediate origin, that departure remains unknown; known event-to-event legs still work. |
| Hybrid event, unknown location or unknown end | Ask only for the missing fact. Do not fabricate destination, attendance or return timing. |
| New position, changed event or revoked grant arrives during routing | Reject late evidence for the old revision; refresh eligible legs or stop if consent ended. |
| Travel crosses midnight or DST | Calculate elapsed time on instants; clip visual segments per local day without dropping next-day collisions. Label dates/offsets when needed. |
| Device and first-event locations exist, but no usable saved base | Recommend outbound travel and keep its occupied span/collisions. Suppress only final-return advice; return time remains unknown. |
| Event A → B → C, no base | Plan A → B and B → C using each leg's locations, times and mode. Keep both legs in occupancy/collisions. No invented return or base detour. |
| B changes location/time, or a leg's mode changes | Recompute affected A → B / B → C legs and dependent timing. Reject old-revision results; preserve unaffected evidence. |
| Schedule predicts A, fresh device position is D, next event is B | Use D → B for the immediate departure. Future legs may still use planned event origins. |
| Base removed while an itinerary exists | Invalidate the final return and any base-origin leg. Retain otherwise valid device-origin and event-to-event advice and collisions. |

## Timeline and advisor presentation

Reuse `components/timeline/DayProgressTimeline.tsx`, its CSS module and
`components/timeline/ExternalEventDetails.tsx`. Keep scheduled markers at event
start. The existing temporary magenta span and magenta Behavior overlap borders
must reflect active travel-expanded occupancy. Preserve left-side Calendar
context, right-side occurrence ledger and reserved preview space. Do not add a
second timeline lane, persistent travel fill or separate collision panel.
Unknown final return does not hide known outbound/onward spans or their collisions.

Inspection shows departure, event time, onward/return time, mode, destination,
source assumptions and freshness. An active collision identifies travel as its
cause in text; color alone is insufficient. Preserve hover/focus and tap/click
inspection, keyboard access, touch targets and narrow-screen behavior. Behavior
locations belong in the existing Behavior form. Travel setup belongs with existing
Calendar/briefing settings, without changing the main navigation.

The advisor can say: “Leave at 1:30 for the 2:30 event; back around 6:20 and available
again around 6:30. That conflicts with the 5:30 Behavior.” It must reference current
derived evidence and identify the selected mode and return assumption when material.
If provider/model terms do not permit that projection, show the same deterministic
travel facts beside the briefing without sending them to the model. Do not imply
that legal review is already complete.

Use shared `day-progress.resolver.ts`, `timeline-context.resolver.ts` and
`briefing-plan.resolver.ts` under `packages/core/src/resolvers` for one occupancy
contract. Both Timeline collisions and advisor findings must consume that contract.

Existing evidence: `INT-CALENDAR-001`–`007`, `INT-BRIEF-001`–`005`,
`composite.behavior-form`, `module.day-progress-timeline`,
`composite.external-event-details`, `module.daily-brief-bubble`,
`module.daily-brief-settings-panel` and `module.google-calendar-panel` in the
interaction registry and design-system catalog. Register new interactions and
states when implemented in Tickets 162/164; discovery adds no implemented controls.

## Cost estimate

Documented global pay-as-you-go rates, USD, checked September 21, 2026:

| SKU | Monthly free usage | Price per 1,000 after free usage, through 100,000 |
|---|---:|---:|
| Compute Routes Essentials | 10,000 | $5 |
| Compute Routes Pro | 5,000 | $10 |
| Geocoding | 10,000 | $5 |
| Maps Grounding Lite, alternative only | 10,000 | $7 |

[Google global pricing table](https://developers.google.com/maps/billing-and-pricing/pricing).
Traffic-aware driving triggers Pro. Check the actual SKU for each mode/options;
this conservative illustration prices every route as Pro. Free allowances are
shared project usage, not per-user allowances. Confirm regional eligibility,
other usage, quotas and billing before spending. Excludes tax, hosting, models,
Places, maps and support.

Assume 30 days and one isolated round trip per user per recomputation. Budget four
route queries (two outward, up to two return) and two fresh address lookups. No
cache savings or retries. For totals below 100,000 per API:

```text
routes = users × 30 × recomputations × 4
geocodes = users × 30 × recomputations × 2
costUSD = max(0, routes - 5000) × 0.01 + max(0, geocodes - 10000) × 0.005
```

| Daily users | Recomputation/day | Routes / geocodes per month | Estimated cost |
|---|---:|---:|---:|
| 10 | 1 | 1,200 / 600 | $0 |
| 100 | 1 | 12,000 / 6,000 | $70 |
| 500 | 1 | 60,000 / 30,000 | $650 |
| 100 | 4 | 48,000 / 24,000 | $500 |
| 100 | 8, sensitivity above proposed pilot cap | 96,000 / 48,000 | $1,100 |

Return legs and proactive refresh materially increase costs. The eight-leg pilot
ceiling allows larger itineraries than this one-round-trip illustration. Size
hard API caps against the maximum admitted workload, not only this average.
Endpoint reuse can reduce geocoding if permitted, but budget without that saving.

## Platform impact and implementation follow-ups

| Platform | Implementation reference or explicit limit |
|---|---|
| Web | Tickets 162–164 add locations/onboarding, browser position, hosted routing, shared occupancy, existing Timeline presentation, briefing evidence and navigation links. Ticket 165 verifies deployed acceptance. |
| Desktop | Tickets 162–164 add local saved locations and linked sync, a foreground macOS location adapter, the same core rules/UI and hosted routing for linked online users. Ticket 165 verifies installed permission/denial/restart/account-switch behavior. Offline/account-free tracking remains available; hosted routing is unavailable without the required account/network. |
| Marketing | Ticket 165 updates canonical Privacy/Terms and factual user guidance before release. No capability claim follows from discovery; homepage promotion requires deployed evidence. |
| Future mobile | Shared location/timing contracts remain portable. Native permission, lifecycle and navigation implementation is deferred; Tickets 162/164 verify narrow mobile web. |

Implementation sequence:

1. **Ticket 162:** saved locations, mode preference, device permission and travel onboarding.
2. **Ticket 163:** bounded multimode provider routing, full-trip occupancy and collision evidence.
3. **Ticket 164:** existing Timeline/briefing presentation and navigation links.
4. **Ticket 165:** provider-use clearance, disclosures and web/installed-desktop release acceptance.

Provider-use review must precede live provider calls even though final release
acceptance is collected in Ticket 165. Synthetic implementation can proceed first.
Required coverage includes no-base outbound and A → B → C advice/occupancy,
device-over-predicted-origin precedence, affected-leg recalculation, absence of
automatic base detours, invalid/partial results, asymmetric return, transit
connections, DST/midnight, stale sources, grants/account races, quota exhaustion,
exact outbound fields and zero automatic tracking/Calendar mutations. Run all
repository checks plus relevant desktop, design and interaction checks. Record
provider-free, authorized public-landmark, private-account, hosted and installed
evidence separately. Discovery itself needs no live private routing test.

Rollback disables travel first, fences requests and clears transient results.
Preserve user-authored locations unless explicitly removed. Credential removal
must not affect Calendar or sign-in. Schema work requires migrations, ownership,
RLS, types, data-model updates and deletion/compatibility tests in Ticket 162.

Remaining implementation choices are buffer defaults, freshness thresholds,
spending limits and supported preferred-navigation apps. A missing base suppresses
only final-return advice; there is no outbound-origin return fallback.
None reopens the accepted proactive, multimode, full-trip or existing-Timeline
product direction.
