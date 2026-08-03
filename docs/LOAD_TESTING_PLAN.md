# Load Testing Plan

## Status and scope

Ticket 063 establishes Cadence's load-test contract and a bounded authenticated
protocol proof. It does not establish a capacity number. The implemented
protocol runs against a local Next.js app and local Supabase only, uses one
disposable account, and exercises real public, authenticated, export, and
Server Action HTTP paths.

Tickets 064-066 extend this foundation in strict sequence:

1. Ticket 064 adds many-account fixtures, read profiles, and a local baseline.
2. Ticket 065 adds mutations, contention, operator overlap, and local
   breakpoint evidence.
3. Ticket 066 adds an approval-gated hosted-staging capacity run.

No command in Ticket 063 is authorized to target hosted staging or production.
An environment label in the workload manifest describes future eligibility; it
does not grant permission to execute a request there.

## Purpose

The load suite answers infrastructure questions through Cadence's real HTTP
boundary:

- Can an ordinary authenticated session reach a protected document?
- Can it download a structured export through normal Auth and Row Level
  Security (RLS)?
- Can it replay the current build's rendered Next.js Server Action form?
- Do semantic application results and persisted database state agree?
- Can the harness classify every registered interaction without turning the
  product registry into a load-tool configuration file?

The suite is also the safety contract for later capacity work. It keeps
service-role access in fixture setup and cleanup, while every timed product
request uses an ordinary signed-in session and normal RLS.

## Non-goals

Locust is an HTTP client, not a browser. This suite does not claim to verify:

- rendering, hydration, client-side routing, focus, keyboard behavior, mobile
  layout, accessibility, sound, clipboard behavior, or notification prompts;
- JavaScript-triggered requests or static asset loading unless a later profile
  models them explicitly;
- Google OAuth, Supabase Auth capacity, real email delivery, Web Push, or any
  other provider's capacity;
- import, restore, account deletion, or another destructive swarm;
- Vercel, hosted Supabase, or production capacity;
- a performance regression threshold before Ticket 064 records a calibrated
  one-user local baseline.

The harness must not add a permanent test API, stable mutation API,
service-role browser route, RLS bypass, or production authentication shortcut.

## Architecture

The load-test boundary has five parts:

1. `interaction-registry.json` remains the canonical user-intent inventory.
2. `load-tests/scenarios/interaction-map.json` adds execution metadata keyed by
   stable interaction ID.
3. `scripts/check-load-test-interactions.mjs` checks that the companion map and
   live registry remain congruent.
4. `load-tests/` is an independently installable, pinned Python/Locust tree
   containing HTTP assertions, rendered-form discovery, session loading, and
   focused unit tests.
5. `scripts/load-test-protocol-smoke.mjs` supervises the local disposable
   account lifecycle, app and Locust processes, persistence verification, and
   cleanup.

The Node supervisor may use a service-role key during setup, verification, and
cleanup. It writes only the minimum session material needed by Locust. The
Locust process never receives a service-role key and reaches product data only
through the assigned account's cookie jar.

The protocol flow is:

```text
local preflight
  -> create one disposable Auth user
  -> wait for profile/default-category onboarding
  -> seed owned protocol records
  -> sign in through ordinary Supabase Auth
  -> write one owner-only session artifact
  -> start the local app and one Locust user
  -> assert four real request types and one stale rejection
  -> verify occurrence and status-event persistence
  -> delete the exact disposable user and session artifact
  -> verify cleanup
```

Fixture creation, password sign-in, app startup, database verification, and
cleanup are outside Locust statistics. Later capacity profiles must continue to
exclude Auth setup unless a separate, explicitly authorized Auth test is
created.

## Registry companion manifest

Every live interaction ID has exactly one load classification:

- `loadable_http`: one or more application HTTP requests can represent the
  interaction.
- `browser_only`: the behavior requires rendering or client/browser state that
  `HttpUser` does not provide.
- `external_provider`: the meaningful request crosses into a provider-owned
  system.
- `destructive_serial_only`: the action must never enter an ordinary mixed
  workload and may run only in an explicitly isolated serial procedure.
- `not_load_bearing`: the interaction creates no distinct useful application
  load or is already represented by its owning request.

A `loadable_http` request records:

- a normalized request name beginning with its stable interaction ID and HTTP
  method;
- repository-relative route and method;
- semantic expected-result type;
- eligible environments;
- data preconditions;
- cleanup owner;
- named profiles that may select it.

Non-loadable entries contain a concise classification reason. They do not copy
the registry's intent, risk, effects, success/failure, or user-guidance prose.
The validator rejects missing, duplicate, and unknown IDs; incomplete request
metadata; unknown classification values; duplicate request names; and any
destructive interaction placed in an ordinary loadable profile.

One interaction may map to several requests, and equivalent variants may share
one normalized request. Variable IDs and dates use placeholders in the
manifest and stable names in Locust statistics. For example, selected-day
review uses
`/behaviors?range=30&behavior=:behavior_id&day=:local_date`; concrete values
must not fragment the result table or enter logs.

The companion manifest describes execution only. Product interaction changes
still update the canonical registry and its source/test evidence. Run both
governance checks after either file changes:

```bash
npm run interactions:check
npm run load:manifest:check
```

## Environment safety levels

The manifest recognizes `local`, `hosted_staging`, and `hosted_production` so
future tickets can state where a request could run. The Ticket 063 supervisor
accepts `local` only and fails closed before creating an account when any of
these conditions is false:

- target classification is exactly `local`;
- the application base URL is loopback HTTP;
- the Supabase URL is a loopback local-stack URL;
- all required local keys are present and internally consistent;
- the session and artifact paths resolve outside tracked source;
- the requested mode is one of the bounded Ticket 063 modes.

Do not trust `.env.local` to imply a local target; it may intentionally point at
a hosted project for other workflows. Load commands must inject or resolve the
local Supabase URL and keys explicitly, and the supervisor must reject a hosted
URL even when valid credentials are available.

`hosted_production` is a classification vocabulary value, not a supported load
target. Ticket 066 remains staging-only unless a later, separately documented
product decision changes that rule.

## Threat model and controls

| Threat | Required control |
| --- | --- |
| An operator accidentally targets hosted data | Local-only classification plus loopback app and Supabase checks run before fixture creation or requests. No default command accepts an arbitrary host. |
| A Locust worker gains administrative database access | Service-role credentials remain in the Node supervisor. The Python session artifact contains only one ordinary account's cookies and owned fixture selectors. |
| A session, password, or user identifier enters git or a report | Sensitive material lives in an owner-only run-specific temporary file outside tracked source, is ignored by git, is never printed, and is removed in `finally` cleanup. |
| A successful HTTP status hides a redirect or application error | Assertions check final route, content type, semantic document/export markers, and Server Action result content. An HTTP `200` alone is never success. |
| A generated Server Action identifier changes between builds | Fetch the current rendered page and discover all `$ACTION_*` fields immediately before submission. Never hard-code or cache an action identifier across builds. |
| A stale rendered form mutates newer data | Replay the exact previously rendered form after its first successful transition. The submitted `expected_status` no longer matches the owner-scoped snapshot, so the service rejects it before the RPC; verification then proves no second event was appended. |
| An interrupted run leaves an account or secret file | The supervisor owns provision-to-cleanup as one lifecycle, handles normal exit and interruption, deletes the exact captured Auth user, and verifies both data cascade and artifact removal. |
| Cleanup matches an ordinary account | Use a unique run-scoped `cadence-load-...@example.invalid` identity and the exact captured Auth user. Never delete by an empty value, wildcard, broad prefix, or domain alone. |
| The protocol becomes an accidental load test | Ticket 063 fixes one Locust user, one disposable account, one protocol sequence, and a bounded headless runtime. The UI mode remains supervised and preserves the same ceiling. |
| Real providers receive traffic | Do not enable email reminders, create push subscriptions, call process routes, automate Google OAuth, or configure a real provider endpoint. |
| Sensitive fixture content leaks through error handling | Fixture text is synthetic and bounded. Logs and failures contain only normalized request names and privacy-safe reason categories, never response bodies or fixture values. |

Cookies, passwords, access and refresh tokens, service-role keys, user IDs,
emails, behavior titles, occurrence notes, push endpoints, provider payloads,
and uploaded bundles are sensitive. They must not appear in Locust names,
exceptions, CSV/HTML output, console summaries, committed documentation, or
test snapshots. Only sanitized aggregate results may be retained.

## Server Action replay contract

Cadence mutations use generated Next.js Server Action forms. The protocol
replays the user-facing form rather than inventing a mutation endpoint:

1. Fetch the authenticated Timeline document from the current app build.
2. Find the exact `POST` form whose hidden `occurrence_id`, `expected_status`,
   and `status` match the prepared owned occurrence and requested transition.
3. Preserve every rendered hidden field, including every generated
   `$ACTION_*` name and value.
4. Submit the form as `multipart/form-data` to the rendered same-page action
   with the same cookie jar and a same-origin `Origin` header.
5. Do not add a `Next-Action` header, hard-code a generated action identifier,
   or substitute URL-encoded form data.
6. Require the semantic `Occurrence updated.` result. Next.js may return an
   HTTP-successful React Server Components response for either application
   success or failure.
7. For the rejection proof, replay that same freshly discovered form after the
   successful transition. Its `expected_status=unresolved` is now stale, so
   require `Occurrence status changed. Review the latest status and try again.`

The supervisor then verifies persistence directly outside the timed request:

- the owned occurrence changed from `unresolved` to `completed`;
- exactly one append-only status event was added for that occurrence;
- the event records the expected explicit user mark and previous/current
  status relationship;
- the stale submission changed no occurrence and appended no event.

If the current React/Next.js output cannot be discovered and replayed with this
contract, the smoke fails. The fallback is a documented design decision, not a
test-only product route.

## Protocol request and assertion matrix

The headless smoke proves these request types through one cookie-preserving
`HttpUser`:

| Request type | Current proof | Required semantic assertion |
| --- | --- | --- |
| Public document | `GET /terms` | Successful HTML document containing its Terms marker. |
| Protected document | `GET /timeline` | Final URL is not `/login`, body is not the login document, content is HTML, and the expected authenticated Timeline marker is present. |
| Structured export | `GET /api/export/json?...` | Attachment disposition, JSON content type, non-empty valid body, `.json` filename, and required top-level product keys. |
| Server Action | Rendered Timeline status form `POST` | Generated form metadata is present; semantic success appears in the RSC response; persisted occurrence and event state match. |
| Rejection control | Exact rendered form replayed after the first transition | Semantic stale-state result appears and persistence remains unchanged. |

Redirect following does not turn login into a protected success: validation
checks the final URL and rejects either login content or the Google sign-in
control. Export and Server Action assertions likewise reject status-only
success.

## Independent Python and Locust tree

`load-tests/requirements.txt` pins Locust so this harness can be installed
without adding Python dependencies to the Next.js workspace. Python modules
under `load-tests/cadence_load/` must remain small, testable, and free of
service-role access. Python tests use the project-local environment created by
the installation command.

Use:

```bash
npm run load:install
npm run load:manifest:check
npm run load:python:test
```

Changing the selected Locust version requires an intentional requirements
update and a passing protocol smoke. Do not replace the pinned version with an
unbounded range.

## Local operator workflow

### Prerequisites

1. Start Docker and the project-local Supabase stack.
2. Confirm the running local stack already has the complete migration set and
   is healthy. A destructive database reset is not a load-test prerequisite.
3. Ensure the load wrapper resolves explicit local Supabase credentials. Do not
   reuse a hosted `.env.local` value.
4. Install the isolated Python environment and run the governance/unit checks.
5. Ticket 063 starts the app in local development mode. The Ticket 064
   supervisor builds and starts the app in local production mode and records
   the persistent-Node/Vercel difference.

Project-local setup and checks:

```bash
SUPABASE_TELEMETRY_DISABLED=1 npm run supabase -- start
SUPABASE_TELEMETRY_DISABLED=1 npm run supabase -- status
npm run load:install
npm run load:manifest:check
npm run load:python:test
npm run load:protocol:smoke
```

Use `npm run supabase -- db reset` when independently verifying migrations
from a clean database, such as after a schema change. Ticket 064 changes no
schema, and a reset is neither required before load nor an acceptable
substitute for exact fixture cleanup.

### Supervised web UI

For protocol exploration, run:

```bash
npm run load:web
```

The wrapper performs local preflight and provisioning before starting the app
and Locust web UI. The mode remains limited to the Ticket 063 identity and user
ceiling. Exit through the supervising process so it can verify persistence and
clean up. Treat an unhandled termination or cleanup error as a failed run and
follow the exact recovery instruction printed by the wrapper; never improvise
a broad user deletion.

### Bounded headless smoke

Run:

```bash
npm run load:protocol:smoke
```

This is the pull-request-safe protocol proof. The wrapper owns the full
provision -> app -> Locust -> semantic verification -> cleanup lifecycle and
must exit nonzero if any stage fails. The default remains one user and one
protocol sequence against loopback services. Do not invoke `locust` directly
for the acceptance smoke because doing so bypasses target validation,
persistence verification, and guaranteed cleanup.

### Abort and cleanup

The wrapper must attempt cleanup in a `finally` path after provisioning,
including when app startup, Locust, or semantic verification fails. A successful
run requires all of the following:

- the exact disposable Auth user is absent;
- all rows owned by that user were removed through the schema's account
  cascade;
- the owner-only session artifact is absent;
- no sensitive copy exists in the run/report directory;
- the console contains only aggregate cleanup counts.

If cleanup cannot be verified, stop. Preserve only the private exact recovery
selector long enough to rerun the wrapper's scoped cleanup path, then remove it.
Do not continue to Ticket 064 with an unresolved Ticket 063 fixture.

## Gates and result interpretation

Ticket 063 passes only when:

- the live-registry companion manifest validates;
- Python form, session, and response-assertion tests pass;
- all four required request types pass their semantic assertions;
- the status snapshot and append-only event prove the requested transition;
- the stale request is rejected without a product-data change;
- no unexpected request reaches a provider or process route;
- exactly one disposable account is created and completely removed;
- no sensitive value appears in retained output;
- the repository's required checks pass.

The provisional gates for later capacity profiles are:

- zero cross-account data;
- zero unexpected `5xx` responses;
- less than `0.5%` unexpected request failures;
- p95 latency no worse than twice the calibrated one-user warm baseline;
- recovery within `10%` of the pre-ramp baseline;
- zero duplicate occurrences, invalid owner relationships, false-fresh
  occurrence horizons, unexpected reminder deliveries, or residual fixture
  rows.

Ticket 063 does not claim those capacity gates passed. Ticket 064 must calibrate
and report them with local hardware, runtime, Next.js mode, Supabase mode,
response-byte, warm/cold, and persistent-Node caveats.

## Ticket 064 local read baseline

Ticket 064 turns the one-account protocol proof into a disposable,
many-independent-account read workload. It remains local-only. Its result is a
repeatable local baseline, not a claim about Vercel, hosted Supabase, staging,
production, or customer capacity.

### Identity, session, and RLS model

Each active Locust user receives one exact run-scoped Supabase Auth identity
and one cookie jar, including while it selects a public-document task. A user
fails fast if the pool has no unique identity; users must not share an identity
silently.

Provision identities, sign them in, generate cookies, and seed fixtures before
Locust statistics start. Auth endpoint and IP limits are therefore outside the
normal route-capacity measurement. Auth-capacity testing would require a
separate ticket and authorization.

Privileged access is split from timed product access:

- A server-side lifecycle process may use the local service-role key for exact
  setup and cleanup, including their pre/post aggregate boundary checks.
- Session artifacts contain only ordinary signed-in account material and owned
  fixture selectors.
- No Locust worker receives a service-role key.
- Every timed protected request uses an ordinary session through product RLS.
- `npm run smoke:rls` runs against the local target after the load lifecycle.

Ticket 064 must not weaken `/auth/test-login`, add an authentication shortcut,
or create a permanent load API. Session material lives in a run-specific
owner-only file outside tracked source and is deleted during cleanup even when
the workload aborts.

### Exact synthetic lifecycle

The lifecycle is:

```text
local fail-closed preflight
  -> exact run-scoped account provisioning
  -> cohort seeding
  -> ordinary password sign-in and session preparation
  -> pre-load ownership and fixture integrity
  -> read smoke and one-user warm calibration
  -> 5-user and 10-user baselines
  -> bounded 10/25/50/100 read ramp
  -> return to 10 users and measure recovery
  -> post-load ownership and fixture integrity
  -> local two-user RLS smoke
  -> exact account/data/session cleanup and cleanup verification
  -> retain sanitized aggregate results only
```

Provisioning is idempotent for one exact run ID. Repeating setup reconciles the
declared cohort/account set instead of producing uncontrolled duplicates.
Cleanup must refuse a blank, malformed, wildcard, path-like, or overly broad
run ID; operate on the exact captured `cadence-load-...@example.invalid`
identities and their owned rows only; be safe to repeat; and report counts
without identifiers. A failed, interrupted, or aborted load still runs
post-load inspection and cleanup.

The full setup, preflight, run, abort, integrity, cleanup, and failure-recovery
procedure is in `docs/LOAD_TESTING_RUNBOOK.md`. The canonical supervisors are:

```bash
npm run load:read:smoke
npm run load:read:baseline
npm run load:read:ramp
npm run load:read:full
```

Each command creates an independent exact run, builds and starts the local
production app, provisions and seeds its own identities, performs deterministic
route and integrity checks, refreshes ordinary sessions outside timed
statistics, applies stop/go gates, runs the local RLS smoke, and executes exact
cleanup in a `finally` path. `load:read:full` is the complete Ticket 064
sequence, including the separately tagged five-user Heavy schedule stage.
Operators must not improvise an unsupervised raw Locust command around the
target, identity, integrity, or cleanup guards.

### Fixture cohorts

| Cohort | Machine name | Required data shape | Default use |
| --- | --- | --- | --- |
| Empty | `empty` | Profile and default categories; no behaviors or occurrences. | 10% of active identities. |
| Typical daily | `typical_daily` | 8-12 active and 1-2 archived behaviors; all supported recurrence families; exact/range slots; current Completed, Not Completed, and Unresolved occurrences; prior Unresolved Needs decision items; sparse synthetic notes; email off and no push. | 60% of active identities. |
| Review-heavy | `review_heavy` | At least 90 local days; valid status-correction `revises_event_id` chains; definition history; 7/30/90-day and selected-day review data. | 20% of active identities. |
| Export-heavy | `export_heavy` | Active/archived behaviors; one bounded year of synthetic history; non-trivial event, note, reminder, and definition history for JSONL, CSV, full JSON, BehaviorLog, and Markdown outputs. | 10% of active identities. |
| Heavy schedule | `heavy_schedule` | 30-50 behaviors with multiple supported schedule slots. | 0% in the default mix; dedicated tagged capacity profile only. |

All fixture text is bounded and synthetic. Default fixtures disable email
reminders, omit push subscriptions, and contain no real personal or provider
data. Integrity checks require exact cohort counts, valid owner relationships,
bounded history, valid revision chains, and no unexpected reminder delivery.

### Initial read weights and think time

There is one combined reader task mix. Every active reader has a unique
ordinary session. Initial task selection totals 15% public documents and 85%
protected reads. These weights and the cohort mix above are initial product
assumptions derived from documented personas and journeys. They are not
observed analytics and must be labeled as assumptions in retained reports.

Initial task selection:

| Task | Weight |
| --- | ---: |
| Public Login | 6 |
| Public Terms | 3 |
| Public Privacy | 3 |
| Public Trust | 3 |
| Timeline today | 28 |
| Future-day Timeline | 10 |
| Behaviors | 12 |
| Behavior review range | 10 |
| Selected-day review | 7 |
| Export page | 4 |
| Settings | 6 |
| JSONL download | 3 |
| CSV download | 2 |
| Full JSON download | 2 |
| BehaviorLog download | 1 |

The single reader has a 2-6-second think time. The route weights apply across
the assigned cohort; cohorts change owned data shape rather than the normalized
route-selection contract. Review-range requests select prepared 7-, 30-, and
90-day states. Every concrete ID and date maps to a normalized manifest request
name. The route matrix covers public Login/Terms/Privacy/Trust documents;
protected Timeline, Behaviors, Export, and Settings documents; future-day
Timeline states; review range and selected-day reads; and JSONL, CSV, full
JSON, and BehaviorLog downloads.

### Shape and advancement contract

| Stage | Shape | Required interpretation |
| --- | --- | --- |
| Smoke | 1 user for 3 minutes | Validate profile assertions, artifacts, and lifecycle cleanup. |
| Warm calibration | 1 user for 2 minutes | Establish the one-user warm p95 reference. |
| Baseline | 5 users for 10 minutes, then 10 users for 10 minutes | Record steady local evidence; the 10-user stage is the pre-ramp recovery reference. |
| Read ramp | 10, 25, 50, and 100 users for 4 minutes each | Apply stop/go gates before advancing. |
| Recovery | Return to 10 users for 5 minutes | Compare latency and failure ratio with the pre-ramp 10-user baseline. |
| Heavy schedule | 5 tagged Heavy schedule users for 5 minutes | Keep the separately tagged capacity data shape out of the default ramp evidence. |

User ceilings, spawn rates, plateau/recovery durations, resource ceilings, and
abort thresholds are declared before the run. Do not raise them during a run to
force a pass. A full default 100-user ramp fixture may provision five additional
reserved `heavy_schedule` identities outside the active default pool. Those
identities do not enter the default stages; a separately tagged heavy-capacity
stage may use them and reports its evidence separately.

At each stage record achieved requests per second, p50/p75/p95/p99 latency,
failure ratio, unexpected `5xx` count, response bytes, normalized request
breakdown, actual cohort mix, local hardware/runtime, Next.js mode, Supabase
mode, and warm/cold caveats.

Advance only when:

- cross-account exposure is zero;
- unexpected `5xx` responses are zero;
- unexpected failures are below `0.5%`;
- p95 is no worse than twice the calibrated one-user warm baseline;
- exports contain only the assigned account's synthetic data;
- provider, process-route, mutation, and destructive traffic remain zero;
- the current stage remains within its predeclared resource, time, and traffic
  ceilings.

After the ramp returns to 10 users, latency and failure ratio must each recover
to within `10%` of the pre-ramp 10-user baseline. If the baseline failure ratio
is zero, any unexpected recovery failure is a failed recovery rather than a
percentage division.

### Integrity, artifacts, and abort behavior

Before and after timed load, require zero duplicate occurrences, invalid or
cross-owner relationships, false-fresh occurrence horizons, unexpected
reminder deliveries, or fixture growth outside the exact run. A performance
gate cannot override an integrity or RLS failure.

One ignored run directory contains Locust CSV statistics/history, failures,
exceptions, and the HTML report. Private session/recovery artifacts remain
owner-only and are removed. Retained reports contain only aggregate counts,
normalized names, statistics, environment facts, caveats, and gate outcomes.
They must not contain cookies, tokens, keys, Auth user IDs, product row IDs,
emails, fixture text, behavior titles, notes, response bodies, export contents,
or provider payloads. The synthetic run ID is the only retained lifecycle
identifier.

Abort immediately on a non-local target, service-role exposure to a worker,
identity exhaustion or sharing, cross-account data, unexpected provider/process
or mutating traffic, an unexpected `5xx`, a breached declared ceiling, an
integrity failure, or loss of guaranteed cleanup. Abort still proceeds through
safe post-load integrity inspection and exact cleanup. Cleanup failure blocks
another run.

### Local-versus-hosted interpretation

The supervisor builds and runs Next.js in local production mode and records the
exact mode. The local build runs as a persistent Node process on operator
hardware next to local Supabase. It does not model Vercel's deployment topology,
Fluid/serverless instance lifecycle, autoscaling, concurrency controls, cold
starts, regional network path, or platform limits.

Ticket 064 evidence is therefore valid only for the recorded local machine,
runtime, build, Supabase mode, workload assumptions, and warm/cold state. It
must not be extrapolated into a Vercel, hosted Supabase, staging, production, or
customer-capacity statement. Hosted eligibility remains blocked until Ticket
066's separate approvals and isolated-staging controls are satisfied.

## Ticket 065 local mutation, contention, and operator profiles

Ticket 065 extends the disposable many-account lifecycle with common product
writes, two-session same-account contention, and protected operator overlap.
It remains local-only. The supervisor is
`scripts/load-test-mutation-suite.mjs`; the checked-in workload declaration is
`load-tests/scenarios/mutation-profiles.json`; and the Locust entrypoint is
`load-tests/mutation_locustfile.py`.

The supervisor owns the complete lifecycle:

```text
local fail-closed preflight
  -> start a loopback fake Sequenzy server
  -> build the local production app with explicit local Supabase values
  -> provision mutation-classified synthetic fixtures and ordinary sessions
  -> prewarm protected pages outside timed statistics
  -> pre-load mutation integrity checkpoint
  -> run functional smoke, then representative mixed calibration when selected
  -> run the selected bounded Locust stages
  -> classify stop/go outcomes and run required integrity checkpoints
  -> admit soak only with same-run ramp headroom
  -> reconcile completed soak against final ramp/breakpoint evidence
  -> reconcile operator and fake-provider evidence when selected
  -> run the local two-user RLS smoke
  -> stop local processes
  -> remove the exact users, rows, and private artifacts
  -> retain sanitized aggregate evidence only
```

The first `SIGINT`, `SIGTERM`, or `SIGHUP` is cooperative: it stops admission
of new stages and interrupts the active Locust stage, but leaves the supervisor
alive long enough to attempt post-failure integrity, local RLS inspection,
fake-provider shutdown, artifact inspection, exact cleanup, and a terminal
completion record. Absence of `completion.json` means the lifecycle is
incomplete; it is never evidence that cleanup or acceptance succeeded.

An authoritative ramp or full result also requires an independent exact-run
audit after the supervisor finishes:

```bash
npm run load:mutation:evidence:check -- --run-id '<exact-run-id>'
```

The audit reads only that retained run directory and recomputes the canonical
suite and stage contract, declaration/summary/completion schemas, stage
artifact inventory and digests, raw CSV/HTML/semantic totals, history and RPS
evidence, resource gates, integrity and due/past evidence, fake-provider and
RLS outcomes, sanitization, and exact cleanup. A supervisor exit or summary
status cannot substitute for this independent pass.

Every timed user mutation crosses the real rendered Next.js Server Action
boundary with an ordinary authenticated cookie jar and normal RLS. The
Locust worker discovers the current build's rendered action reference and
bound fields immediately before submission. It receives neither the Supabase
service-role key nor the occurrence/reminder process secret. Fixture setup,
integrity inspection, session refresh, protected operator calls, and exact
cleanup remain in the Node supervisor and outside ordinary Locust statistics.

The mutation smoke is a functional lifecycle proof only. It never establishes
or supplies the latency reference. Comparable ordinary mixed suites instead
run `mixed-calibration-1`, one representative mixed user for 3 minutes, before
their baseline, ramp, spike, soak, breakpoint, or operator stages. That
calibration exercises the ordinary mixed role surface, records the warm p95,
and runs an integrity checkpoint, but is excluded from representative
request-mix and capacity-plateau evidence. Smoke, calibration itself,
changed-timezone, and contention never receive the 2× latency comparison.

### Final mixed workload

The default mixed task-selection weights total 100 and use a 2–5-second think
time. They are initial product assumptions, not observed customer analytics.
GET-read tasks total 65%; user-mutation tasks total 35%. Preparation and
semantic-verification reads mean the achieved HTTP ratio is measured rather
than assumed. The report records both the declared weights and the achieved
request count, percentage, and requests per second by stable name. Every
completed mixed stage must contain both reads and writes, and achieved GET
reads must remain dominant.

The declared 2–5-second range is retained as `think_time_seconds` in both the
run declaration and final summary so a report cannot silently lose the pacing
assumption used by its calibration and capacity evidence.

For a report that combines sequential stages, aggregate and per-name requests
per second are each derived from summed request counts divided by the sum of
the stages' achieved durations. Stage rates are never added together because
the stages do not run concurrently.

| Task | Weight | Method and role |
| --- | ---: | --- |
| Timeline today | 30 | Protected GET |
| Future Timeline | 7 | Protected GET |
| Mark Completed | 6 | Server Action POST |
| Mark Not Completed | 4 | Server Action POST |
| Clear decision | 4 | Server Action POST |
| Save Timeline note | 4 | Server Action POST |
| Behaviors | 14 | Protected GET |
| Selected behavior/day | 6 | Protected GET |
| Create Behavior | 1 | Server Action POST |
| Update Behavior or schedule | 3 | Server Action POST |
| Archive Behavior | 2 | Server Action POST |
| Restore Behavior | 2 | Server Action POST |
| Change selected-day status | 3 | Server Action POST |
| Save selected-day note | 3 | Server Action POST |
| Save unchanged timezone | 3 | Server Action POST |
| JSONL export | 3 | Structured GET |
| Full JSON export | 3 | Structured GET |
| BehaviorLog export | 2 | Structured GET |

Mutation fixture allocation excludes the read-only Empty cohort and assigns
70% Typical daily, 20% Review-heavy, and 10% Export-heavy accounts for a
100-account run. Every active ordinary user leases one unique account and
cookie jar. Each account has fixed run-owned mutation slots, owner and
forbidden markers, preservation sentinels, reminder cases, horizon cases, and
bounded growth limits. Fixture selectors stay in the private session artifact
and never enter normalized statistics or retained reports.

### User state machines

Each write starts from freshly rendered owner-scoped state and is followed by
a protected read that proves the semantic result. An HTTP `200` without the
expected Server Action result and refreshed state is a failure.

A network-level transport failure on an ordinary protected or export `GET`
is recorded as a failed Locust request and reschedules that task without
stopping the runner. It still counts toward the stage failure-ratio gate. This
tolerance does not apply to an HTTP status or semantic failure: `5xx`,
authentication/rate-limit responses, invalid content, owner-marker mismatch,
and malformed exports fail closed. Every Server Action `POST` transport,
protocol, or semantic failure also stops the stage. Transport tolerance must
never turn a mutation, semantic, ownership, or safety failure into retry-only
traffic.

Generic HTTP connection refusal or reset against the loopback application is
an ordinary transport failure, not evidence that Postgres refused a
connection. The repeated-database-refusal runtime gate accepts only an
explicit database-context connection failure or an unambiguous database
capacity refusal. When a runtime guard does abort a stage, Locust retains one
sanitized, closed-vocabulary initiating reason in the existing
`_exceptions.csv` artifact before deferred shutdown. Reentrant callbacks
cannot replace that reason or request another shutdown. The triggering request
still reaches Locust's request accounting, and any retained exception row
continues to fail the stage.

| Role | Bounded state machine and verification |
| --- | --- |
| Daily tracker | Reads Timeline, moves one owned occurrence among `unresolved`, `completed`, and `not_completed`, and cycles a small set of synthetic notes. Clear decision first establishes a resolved state when necessary, then returns it to `unresolved`. A separate past Unresolved occurrence remains visible under Needs decision with a due/past pending reminder; setup completes it and clears it back to Unresolved through the selected behavior/day review's bounded 90-day server-rendered occurrence actions, then proves the cancelled reminder does not reactivate. Timeline reads and integrity checks independently preserve the Needs decision derivation evidence. Every transition or note save reloads the row and checks the stored status/note. |
| Behavior maintainer | Reads Behaviors, creates at most one minimal owner-marked Behavior, performs one bounded title change, then toggles one schedule-only exact time between two declared values. Archive first ensures the target is active; Restore first ensures it is archived. Each refreshed snapshot must retain the owner marker, expected active state, non-empty schedule graph, and expected bounded fields. The mixed role also submits the currently rendered timezone unchanged and requires the explicit no-change result. |
| Reflective reviewer | Opens one prepared behavior/date, toggles its occurrence between Completed and Not Completed, or cycles a bounded synthetic note. The selected-day page is reloaded after each write and must reconcile with the submitted result. |
| Exporter | Downloads JSONL, full JSON, and BehaviorLog at low weights while the other roles mutate data. Export assertions continue to prove structure and owner-only synthetic content. |

Behavior create/update/archive/restore is bounded by fixture growth limits.
The post-stage checks distinguish title/history changes from schedule-only
changes: schedule-only updates must not create behavior-definition events.
Definition-history timestamps must keep `created_at === updated_at`, allow at
most five seconds of absolute positive or negative app/database clock skew
between `recorded_at` and `created_at`, and remain nondecreasing across each
semantic revision chain.
Occurrence-horizon checks must remain false while a Behavior needs repair and
become fresh only after a successful occurrence-sync repair. Past and resolved
occurrences are immutable preservation sentinels for horizon and timezone
work.

### Stable request names

Concrete account, occurrence, Behavior, and date values are private selectors.
All timed writes are grouped under these interaction-ID names:

```text
INT-TIMELINE-005 POST /timeline server-action
INT-TIMELINE-006 POST /timeline server-action
INT-TIMELINE-007 POST /timeline server-action
INT-TIMELINE-008 POST /timeline server-action
INT-BEHAVIOR-019 POST /behaviors server-action
INT-BEHAVIOR-020 POST /behaviors server-action
INT-BEHAVIOR-022 POST /behaviors server-action
INT-BEHAVIOR-023 POST /behaviors server-action
INT-SETTINGS-003 POST /settings server-action
```

The full suite requires successful timed coverage of all nine names. The
stable-name gate rejects an undeclared name, method mismatch, UUID, local date,
email, owner marker, dynamic owner selector, or concrete identifier query.
Protected operator calls use two additional system names:

```text
SYS-OCCURRENCE-001 POST /api/occurrences/sync operator
SYS-REMINDER-001 POST /api/reminders/process operator
```

They are recorded as separate aggregate operator evidence rather than folded
into the ordinary user mix.

### Separate changed-timezone profile

The normal mixed profile submits only an unchanged timezone. Changed-timezone
synchronization runs separately as `timezone_changed`: 5 users for 5 minutes
at 1 user/second. Each user waits 45–75 seconds and performs no more than four
writes, toggling only between its fixture timezone and one fixed alternate
IANA timezone. A refreshed Settings page must expose the submitted value.
Immediately before the stage, the supervisor privately captures the IDs and
schedule-preservation fingerprints of every run-owned occurrence that is then
past or resolved. This dynamic set includes future rows resolved by earlier
stages. It is compared immediately after the timezone stage; retained evidence
contains only captured, verified, and violation counts. The required
`timezone-dynamic-preservation` gate proves every captured occurrence was
preserved, while the normal integrity checkpoint proves future Unresolved
occurrence synchronization remains owner-consistent and unique.

In a combined full suite, changed-timezone users lease a refreshed identity
window that is disjoint from the later operator-overlap users and its spare
repair account. Timezone resync may legitimately replace a future Unresolved
occurrence. The disjoint window prevents that replacement from invalidating a
later mixed user's exact Timeline selector while retaining the same cohort
allocation, user count, route traffic, and preservation checks.

### Same-account contention profile

The `contention` profile is one paired Locust actor for 5 minutes, spawned at
1 actor/second. That actor owns exactly two separately authenticated cookie
jars for one exact synthetic account; it represents two independent ordinary
sessions without treating them as two independently allocated virtual users.
Both sessions load the same run-owned prior-day occurrence from `unresolved`
through the server-rendered selected behavior/day review. The exact Behavior,
local date, and occurrence selectors remain private. The prior-day identity
survives changed-timezone regeneration, and the reserved active Behavior is
not owned by any mixed lifecycle mutation. Needs decision remains a
client-mounted dialog and is not used for raw-HTTP form discovery. If a prior
contention cycle resolved the occurrence, one valid Clear decision first
restores the prepared state and both sessions must converge before the next
race.

The two fresh rendered forms are released together: one requests Completed and
the other Not Completed with the same expected-status snapshot. Exactly one
must return the documented success and exactly one the documented stale-state
result. Both sessions must then reload the occurrence and agree on the winning
stored status. The paired-session pool is exact and exclusive; pool exhaustion,
cookie reuse, ambiguous results, two winners, two losers, or divergent
readback aborts the stage. Checkpoint integrity then proves the status-event
chain is append-only and ordered, with no lost event, invalid revision,
duplicate reminder cancellation, or cross-owner effect.

### Local fake provider and operator overlap

The `operator_overlap` profile runs a 10-user mixed workload for 5 minutes.
While it is active, one fixed-count supervisor loop invokes protected
occurrence sync and reminder processing every 20 seconds with a generated
process secret held only by the Node process. The occurrence result must
reconcile `checked = synced + skipped + failed`; the reminder result must
reconcile `checked = claimed + skipped` and
`claimed = sent + failed + cancelled`. Either operator must report zero
failed items.

The first protected loop starts after one bounded 20-second readiness
interval. Daily tracker users use startup to resolve and Clear their exact
due/past fixture occurrence, which must cancel its pending reminder without
reactivation. Starting the global reminder processor before those startup
transitions can race the proof and send a reminder that the run is explicitly
required to keep cancelled. Later operator loops retain the same 20-second
cadence.

Protected process routes are global to the local stack, so the supervisor
requires strict isolation before any operator mutation. Standalone operator
plans provision eleven exact run identities: ten may be leased by Locust and
one remains a spare repair target. Initial preflight, the pre-mutation check,
and every protected operator request require local Auth, profiles, and
occurrence-sync owners to equal the exact prepared run and require every
reminder-delivery owner to belong to it. Any unrelated account, profile, or
owner aborts before the global call.

The spare account is marked stale through its ordinary RLS session, and its
private stale state is retained only in memory. Immediately after the first
successful occurrence-sync operator response, the supervisor reads that exact
account and requires a newer successful-sync timestamp, `stale: false`, a null
stale reason, and the expected horizon. The aggregate
`operator-isolation-and-causal-repair` gate retains counts only, binding the
prepared stale account to the successful operator repair without reporting an
identifier.

The supervisor starts the fake Sequenzy server on `127.0.0.1` before the app.
It injects a generated fake API key and the loopback fake URL into the local
app only. The fake accepts only the transactional-send path, requires the
declared synthetic template and bounded synthetic payload, rejects a duplicate
delivery fingerprint, rejects Web Push, and has a fixed 10,000-request
ceiling. No real Sequenzy, Web Push, OAuth, or other provider credential is
available to the workload.

Every suite requires zero real-provider sends. Non-operator suites also
require zero fake-provider requests. The operator suite intentionally expects
loopback fake sends and requires them to reconcile with claimed/final delivery
state, with zero rejected or duplicate send attempts, zero active push
subscriptions, no stuck `processing` claims, and an explicit final
reminder-process replay that sends nothing again. The fake server is stopped
in the supervisor's `finally` path; retained evidence contains aggregate
counts only, never provider payloads, recipients, or credentials.

### Declared shapes and ceilings

| Profile | Declared shape |
| --- | --- |
| Smoke | 1 user for 3 minutes at 1 user/second |
| Representative mixed calibration | 1 mixed user for 3 minutes at 1 user/second; establishes the warm p95 reference but is not a capacity plateau |
| Mixed baseline | 5 users for 10 minutes, then 10 users for 10 minutes; 1 user/second |
| Ramp | 10, 25, 50, and 100 users for 4 minutes each; spawn rates 2, 3, 5, and 10 users/second |
| Spike | 10 users for 5 minutes at 2/second; 100 users for 5 minutes at 100/second; 10-user recovery for 5 minutes at 10/second |
| Soak | 25 users for 60 minutes at 5 users/second |
| Breakpoint | 10, 25, 50, 75, and 100 users for 4 minutes each; spawn rates 2, 3, 5, 8, and 10 users/second |
| Changed timezone | 5 users for 5 minutes at 1 user/second |
| Contention | 1 paired actor for 5 minutes at 1 actor/second; exactly 2 independent ordinary sessions for 1 synthetic account |
| Operator overlap | 10 mixed users for 5 minutes at 2 users/second plus the fixed supervisor loop |

The checked-in hard ceilings are 100 active users, 3,600 seconds of declared
traffic for one profile, 10,800 seconds for one suite, 200,000 Locust requests
per timed stage, and 60 achieved Locust requests per second. The one-hour soak
still declares exactly 3,600 seconds of traffic; only its runtime watchdog has
a bounded 3,900-second ceiling so Locust shutdown and sampling grace cannot
invalidate a correctly completed hour. Every other profile retains the
3,600-second runtime ceiling.

The supervisor also derives a finite cumulative selected-suite ceiling as the
per-stage request ceiling multiplied by the number of declared stages. It
counts completed Locust requests plus protected operator requests and checks
that ceiling after every bounded stage. Reaching a per-stage request, runtime,
or RPS ceiling, or the cumulative suite ceiling, aborts rather than being
reported as a successful plateau. Distributed Locust workers are forbidden. A
run also aborts if its local calendar date crosses the fixture anchor.

The full sequence declares 20 stages in this order: functional smoke,
representative mixed calibration, two mixed baselines, four ramp plateaus,
three spike stages, soak, five breakpoint plateaus, changed-timezone,
contention, and operator overlap. Its declared timed duration is 9,120 seconds
(2 hours 32 minutes), before build, provisioning, prewarm, checkpoints, RLS
smoke, report inspection, and cleanup.

Comparable standalone baseline, ramp, spike, breakpoint, and operator commands
prepend a new representative mixed calibration stage. Smoke,
changed-timezone, and contention do not. Standalone soak is a 79-minute
sequence: representative calibration, all four 10/25/50/100-user ramp
plateaus, then the 60-minute 25-user soak. Its included ramp supplies same-run
boundary evidence, so the command can pass when ramp-25 passes and either the
lowest integrity-clean recorded ramp latency boundary or a passing ramp
plateau is strictly above 25 users. Every command creates an independent
lifecycle and never reuses a prior run's identities, calibration, boundary,
or other evidence.

### Integrity and automatic abort gates

Every mutation checkpoint requires mutation-classified evidence, zero
aggregate violations, zero active push subscriptions, valid nonnegative row
and reminder-status counts, and zero for all of these fields:

- cross-owner rows;
- duplicate occurrences or reminder deliveries;
- invalid status-event or behavior-definition chains;
- definition-event skew beyond the symmetric five-second allowance or
  decreasing revision timestamps;
- definition events caused by schedule-only changes;
- invalid reminder states or stuck processing claims;
- reactivation of the dedicated due/past reminder after the exercised
  Completed-to-Unresolved Clear path;
- orphan or forbidden rows;
- false-fresh occurrence horizons;
- past/resolved preservation failures;
- growth beyond the per-account fixture bounds.

Reminder count is not monotonic. A timezone resync may replace a future
Unresolved occurrence whose reminder is already due, and the planner must not
recreate that due reminder. Integrity therefore requires every strictly future
eligible reminder, rejects duplicate or unexpected pending rows, and preserves
reminder identities attached to baseline past or resolved occurrences. It does
not require the total reminder count to stay at or above the fixture count.

The dedicated due/past evidence is an exact seven-field contract. All fields
are nonnegative integers:

- `tracked_occurrences` is greater than zero;
- `tracked_deliveries` equals `tracked_occurrences`;
- `exercised_occurrences` is the unique count of tracked occurrences that
  produced a Clear-to-Unresolved event and does not exceed
  `tracked_occurrences`;
- `clear_events` is at least `exercised_occurrences`, because one occurrence
  may be cleared repeatedly, and it is zero if and only if
  `exercised_occurrences` is zero;
- `unresolved_occurrences` equals `tracked_occurrences`;
- `cancelled_deliveries` equals `exercised_occurrences`, not the total tracked
  fixture count; and
- `reactivated_deliveries` is zero.

The final gate requires positive `exercised_occurrences` only when the selected
suite completed `smoke-1` or `mixed-calibration-1`. Standalone
changed-timezone and contention suites do not execute this Daily tracker path,
so their final evidence must retain zero `exercised_occurrences`,
`clear_events`, and `cancelled_deliveries` while still proving the tracked
fixtures remain Unresolved and unreactivated.

The soak comparison additionally requires bounded steady-state growth. The
supervisor retains each nominal five-second resource observation with monotonic
stage-relative time and nullable raw RSS readings. App RSS uses the median of
the half-open `[5 minutes, 10 minutes)` window as its warmed baseline and the
median of `[declared duration - 5 minutes, declared duration)` as its terminal
window. Each window requires at least 50 valid app-RSS samples, its first and
last valid samples must be within 15 seconds of the declared bounds, and no
adjacent valid samples may be more than 15 seconds apart. Missing, invalid,
out-of-order, or inadequately covered evidence fails closed. Terminal median
growth must not exceed the larger of 128 MiB or 25% of the baseline median;
the instantaneous 4 GiB app and Locust RSS ceilings remain unchanged. The
legacy single first/final/maximum RSS values remain diagnostics, not the
bounded-growth inputs.

Open local database connections may grow by at most two, each half must remain
below the 0.5% failure gate, and the second-half failure ratio may increase by
no more than 0.1 percentage points. Both the first and final
database-connection samples are mandatory; an unavailable sample fails the
soak evidence instead of silently skipping that growth check. This is bounded
growth evidence under the declared workload, not proof that a process does or
does not contain a memory leak.

Soak also has two fail-closed provenance gates. Before a soak starts, the same
run must have executed all four declared ramp plateaus and ramp-25 must pass.
The 25-user soak must be strictly below either the lowest integrity-clean
recorded ramp latency boundary or, when no ramp boundary was observed, a
passing ramp plateau. After breakpoint execution, final reconciliation checks
every completed soak against the strictest observed breakpoint boundary and
the executed passing plateaus above the soak. Missing, equal, or lower evidence
fails the suite; evidence from a different run is never admissible.

Stop new requests immediately for cross-owner exposure or write, an
undeclared method or POST, a real-provider attempt, any import apply, restore
apply, or account deletion, loss of the private artifact/cleanup selector,
session sharing or exhaustion, a semantic Server Action failure, a false-fresh
horizon, an integrity failure, or a local resource breach. Three consecutive
30-second windows above a 0.5% unexpected `5xx` ratio or three consecutive
database connection refusals also abort at runtime. The ordinary stage gate
still requires zero unexpected `5xx`, less than 0.5% unexpected failures,
adequate duration and peak users, no Locust exceptions, the declared
host/app/Locust resource ceilings, and—for comparable ordinary mixed stages—
p95 no worse than twice the representative mixed calibration p95.

A ramp gate containing only the exact calibrated-p95 failure is retained with
`plateau_passed: false` and `recorded_ramp_latency_breach: true`. It forces an
integrity checkpoint, but all four ramp plateaus still execute. An unexpected
request-failure ratio, safety, semantic, runtime, duration/user, `5xx`,
exception, resource, or ceiling failure remains fatal and never becomes a
recorded ramp latency breach.

A breakpoint may terminate after its first bounded nominal performance
failure. That non-passing terminal plateau is retained, later breakpoint
plateaus are skipped, and later independent groups may continue only after the
required integrity checkpoint. No terminal or breached plateau is selected as
sustainable capacity.

Only `spike-hold-100` may classify the exact calibrated-p95 failure by itself
as expected stress. It remains a non-passing plateau and proceeds to the
mandatory 10-user recovery comparison. An unexpected request-failure breach,
any additional failure, or a non-reference p95 message aborts instead. Every
expected terminal or expected-stress outcome forces an immediate full
integrity checkpoint before another plateau, group, or recovery can run.
Checkpoint failure overrides the performance classification. Spike recovery
must still return latency and failure ratio to within 10% of its pre-spike
10-user baseline. The primary timed-stage gate remains
`spike-recovery-10`; the independently named
`spike-recovery-comparison` gate records this baseline comparison.

An abort is not a cleanup waiver. The supervisor still attempts post-failure
integrity, the local RLS smoke, process shutdown, exact fixture cleanup, and
sensitive-artifact inspection. An integrity, RLS, fake-provider,
sanitization, or cleanup failure fails the entire run even when latency gates
look healthy. A cooperative first signal follows the same path. If the process
is forcibly terminated before `completion.json` is written, the run is
incomplete and requires manual exact-run inspection and recovery from its
private metadata.

### Local-only interpretation

The result may identify the highest sustainable **local** plateau and achieved
requests per second under these declared assumptions and gates. That value
describes only the recorded source state, local hardware, persistent Next.js
production-mode Node process, project-local Supabase Docker stack, synthetic
fixtures, fake provider, and warm/cold state.

It is not Vercel capacity, hosted Supabase capacity, staging capacity,
production capacity, a customer concurrency claim, or a service-level
objective. It excludes Auth creation/sign-in capacity and all real provider
capacity. Ticket 066's separate staging isolation, plan, policy, coordination,
cost, and owner-authorization gates remain mandatory before any hosted load.

## Provider and hosted-capacity boundaries

### Ticket 064

Ticket 064 owns only the local many-account read baseline described above. It
does not time account creation or sign-in and does not authorize provider,
mutation, process-route, hosted, or destructive traffic.

### Ticket 065

Ticket 065 is limited to the supervised local mutation, contention, and
operator profiles above. Its provider evidence comes only from the loopback
fake Sequenzy server. It must not send real email or push traffic.

### Ticket 066

Ticket 066 has a fail-closed static preflight but no hosted traffic runner.
`npm run load:hosted:preflight -- --manifest <owner-only-json>` validates one
stage at a time. It does not contact the target, provision resources, run
Locust, or authorize the next stage.

The manifest requires an isolated synthetic staging application and Supabase
project, an exact clean deployment commit, Vercel Enterprise approval, an
unexpired traffic window, source IPs and geography, Fluid Compute posture,
cost and traffic ceilings, monitoring retention, fixture coverage, hosted RLS
and migration checks, provider isolation, exact-cleanup dry-run evidence, and
a human checkpoint. Supabase Team or Enterprise declarations also require a
support coordination reference. A Pro declaration records coordination as not
required under the current production checklist.

The validator authorizes only the named stage. Later stages require a
prior-stage evidence reference and a new human checkpoint. Automatic stage
advance is forbidden. Hard validator ceilings are 100 virtual users, 60
requests per second, 3,900 seconds, 200,000 requests, 100 workers, and 999
literal unique source IPs. The approved provider window and request envelope
can impose smaller limits.

Ticket 066 remains blocked before traffic. Read-only provider discovery found
no dedicated Cadence Vercel staging project and no separate Supabase staging
project. The Vercel plan and approval, exact staging hostname, owner
authorization reference, traffic window and sources, cost ceiling, and
monitoring evidence are also missing. Missing approval or staging isolation
does not permit production fallback.

Real Google OAuth, production user data, destructive import/restore/account
deletion swarms, and unapproved provider traffic remain out of scope for the
entire roadmap.
