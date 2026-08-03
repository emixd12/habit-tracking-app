# Cadence Local Load Runbook

## Scope

This runbook is the operator procedure for Ticket 064's disposable
many-account read baseline. It applies only to a local production build of the
Next.js app connected to the project-local Supabase stack. It does not authorize
hosted staging, hosted production, Vercel, real providers, Auth-capacity tests,
mutating swarms, destructive actions, or process-route traffic.

Ticket 063's authenticated protocol smoke and interaction-manifest validation
must pass before this lifecycle begins. Ticket 064 provisions Auth users,
ordinary signed-in sessions, and owned product data before Locust statistics
start. Timed traffic then uses one unique ordinary session and cookie jar per
active Locust user, including users while they select public-document tasks.
The service-role key is restricted to exact setup and cleanup, including their
pre/post aggregate boundary checks; it must never be available to a Locust
worker.

The canonical lifecycle is implemented by
`scripts/load-test-read-suite.mjs` and exposed through the
`load:read:smoke`, `load:read:baseline`, `load:read:ramp`, and
`load:read:full` package scripts. Each command owns one independent run from
fail-closed preflight through exact cleanup.

Ticket 065's mutation suites use the same local-only, exact-cleanup posture
through `scripts/load-test-mutation-suite.mjs`. Their procedure appears after
the Ticket 064 read lifecycle below. A mutation command does not relax any
read-lifecycle target, credential, privacy, RLS, or cleanup control.

## Non-negotiable safety rules

- Target classification must be exactly `local`.
- Both the Cadence base URL and Supabase URL must resolve to loopback local
  services. A valid credential does not make a hosted URL safe.
- Do not trust `.env.local` as evidence that the target is local. Resolve and
  validate local URLs and keys explicitly before provisioning.
- Use only exact run-scoped `cadence-load-...@example.invalid` Auth identities.
  Never select users by domain alone, a broad prefix, an empty value, a
  wildcard, or an operator-supplied SQL fragment.
- Create one identity and one cookie jar for each active Locust user, including
  users that select a public-document task. Fail before load starts if the
  unique identity pool is smaller than the configured user ceiling. Never
  share an identity silently.
- Keep passwords, cookies, access tokens, refresh tokens, service-role keys,
  Auth user IDs, emails, fixture selectors, and recovery selectors in
  run-specific owner-only files in validated untracked locations. Do not print
  them or copy them into the report directory.
- Provisioning, password sign-in, initial cookie generation, fixture seeding,
  and integrity checks stay outside Locust statistics.
- Timed protected requests use ordinary authenticated product access and Row
  Level Security (RLS). The service-role key is never passed through the
  Locust environment, command line, session file, report directory, or worker
  process.
- Default and capacity read profiles keep email reminders disabled, create no
  push subscriptions, invoke no reminder or occurrence process route, and
  contact no provider.
- Do not submit Server Actions or other mutations in Ticket 064. Import,
  restore, account deletion, status/note changes, behavior changes, timezone
  changes, provider processing, and destructive interactions are excluded.
- Never use production data, a hosted project, or a hosted application as a
  fallback when local preflight fails.

## Run directory and artifact classes

Use one ignored report directory for the entire run under
`load-tests/.runs/<run-id>/`, and make it accessible only to its owner. Keep
the session file in a run-scoped owner-only operating-system temporary
directory outside tracked source unless the supervised lifecycle supplies
another validated, untracked path. Create a new exact run ID for each
independent result set. Its canonical form is
`YYYYMMDDtHHMMSSz-<12 lowercase hexadecimal characters>`. The lifecycle
implementation must reject a blank, malformed, wildcard-bearing, path-like, or
overly broad run ID before any Auth or database operation.

Treat artifacts in two classes:

1. **Private transient artifacts** contain session material or exact recovery
   selectors. They use owner-only permissions in the validated temporary
   location, stay outside tracked source, are never copied into CSV/HTML
   output, and are deleted during cleanup even after a failed workload.
2. **Retainable aggregate artifacts** contain only normalized request names,
   aggregate cohort counts, statistics, sanitized failures/exceptions, runtime
   metadata, and gate outcomes. They may include Locust CSV history, failures,
   exceptions, and the HTML report after sensitive-content inspection.

Retained output must not include Auth user IDs, product row IDs, emails,
cookies, tokens, keys, behavior titles, notes, fixture text, response bodies,
provider payloads, exact export contents, or uploaded bundles. The synthetic
run ID is the only retained lifecycle identifier. If a tool emits any private
value, treat that copy as private transient material and delete it during
cleanup.

## Five fixture cohorts

Provision the requested account count across these cohorts. The provision
summary reports only cohort names and aggregate counts. Canonical machine names
are `empty`, `typical_daily`, `review_heavy`, `export_heavy`, and
`heavy_schedule`.

### Empty

- Profile and default categories exist.
- No behaviors or occurrences exist.

### Typical daily

- 8-12 active behaviors and 1-2 archived behaviors.
- Daily, weekly, every-N-day, every-N-week, and monthly recurrence coverage.
- Exact and range schedule slots.
- Current Completed, Not Completed, and Unresolved occurrences.
- Prior Unresolved occurrences that render in Needs decision.
- Sparse synthetic notes.
- Email reminders disabled and no push subscription.

### Review-heavy

- At least 90 local days of occurrence and status history.
- Valid status-correction chains through `revises_event_id`.
- Behavior-definition history.
- Behavior-date review data across 7-, 30-, and 90-day ranges.

### Export-heavy

- Active and archived behaviors.
- One bounded year of synthetic history.
- Non-trivial status-event, note, reminder-history, and definition-history data
  for JSONL, CSV, full JSON, BehaviorLog, and Markdown export generation.
- No real personal data and no provider data.

### Heavy schedule

- 30-50 behaviors with multiple schedule slots.
- Only supported recurrence and schedule contracts.
- Excluded from the default workload mix. Use it only in an explicitly tagged
  capacity profile.

Provisioning must be idempotent for one exact run ID. Repeating provision or
seed steps must reconcile the requested fixture set rather than create
uncontrolled duplicate users, behaviors, slots, occurrences, or history.

## Initial workload assumptions

These weights and think times are initial product assumptions derived from the
documented personas and journeys. They are not observed analytics and must not
be described as customer behavior.

There is one combined reader mix. Every active reader has a unique ordinary
session, including while it selects a public-document task. Initial task
selection totals 15% public documents and 85% protected reads.

The initial identity-cohort assignment is:

| Cohort | Initial share | Default active mix |
| --- | ---: | --- |
| Empty | 10% | Included |
| Typical daily | 60% | Included |
| Review-heavy | 20% | Included |
| Export-heavy | 10% | Included |
| Heavy schedule | 0% | Dedicated tagged profile only |

The single reader uses a 2-6-second think time. Its initial task weights sum to
100:

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

These weights apply across the assigned data cohorts; the cohort changes the
owned data shape, not the normalized route selection contract. Review-range
requests select the prepared 7-, 30-, and 90-day states without fragmenting
their request name. Dynamic dates and IDs likewise use normalized request names
from the workload manifest.

For a full default 100-user ramp fixture, reserve five additional
`heavy_schedule` identities outside the 100-user default pool. Those identities
remain inactive during the default smoke, baseline, ramp, and recovery. A
separately tagged heavy-capacity stage may use them; it must not mix them into
or relabel the default 100-user evidence.

## Load shapes

Every duration, spawn rate, user ceiling, plateau duration, and abort threshold
must be fixed in the run declaration before load starts. Do not raise a limit
mid-run to force a passing result.

| Stage | Required shape | Purpose |
| --- | --- | --- |
| Protocol prerequisite | Ticket 063 one-user smoke | Prove current-build public, protected, export, and rendered-form semantics before the read baseline. |
| Read smoke | 1 user for 3 minutes; spawn rate 1 user/second | Validate the selected read profile, artifact paths, assertions, and cleanup. |
| Warm calibration | 1 user for 2 minutes; spawn rate 1 user/second | Establish the one-user warm p95 reference used by the provisional latency gate. |
| Baseline A | 5 users for 10 minutes; spawn rate 1 user/second | Record the first steady local baseline. |
| Baseline B | 10 users for 10 minutes; spawn rate 1 user/second | Record the second steady local baseline and the pre-ramp reference. |
| Read ramp | 10, 25, 50, then 100 users; 4 minutes each | Apply the stop/go gates before advancing; spawn rates are 2, 3, 5, and 10 users/second. |
| Recovery | Return to 10 users for 5 minutes; spawn rate 2 users/second | Compare latency and failure ratio with the pre-ramp 10-user baseline. |
| Tagged Heavy schedule | 5 reserved Heavy schedule users for 5 minutes; spawn rate 1 user/second | Keep the capacity-tagged data shape separate from the default 100-user evidence. |

The reserved heavy-schedule identities are absent from the default smoke,
baseline, ramp, and recovery mix. Run them only under a separately tagged
read-capacity profile with its own result label.

## Local production-mode caveat

The supervisor builds and runs the Next.js app in local production mode and
records the source commit, dirty-working-tree state, and runtime.
A local production build runs as a persistent Node process on the operator's
hardware and network alongside local Supabase. It does not reproduce Vercel's
deployment topology, Fluid/serverless instance lifecycle, autoscaling,
concurrency controls, cold starts, regional network path, or platform limits.

Therefore Ticket 064 results describe only the recorded local hardware,
runtime, Next.js mode, and Supabase mode. They must not be presented as Vercel,
hosted Supabase, staging, production, or customer-capacity evidence. Record
warm/cold state and any shared-machine contention with every report.

## Exact operator lifecycle

### 1. Prepare local dependencies

1. Start Docker and the project-local Supabase stack. The current migrations
   must already be applied.
2. Install the pinned Python/Locust environment.
3. Run the workload-manifest and Python tests.
4. Run Ticket 063's bounded authenticated protocol proof against the same local
   stack.

```bash
SUPABASE_TELEMETRY_DISABLED=1 npm run supabase -- start
SUPABASE_TELEMETRY_DISABLED=1 npm run supabase -- status
npm run load:install
npm run load:manifest:check
npm run load:python:test
npm run load:protocol:smoke
```

Do not require or perform a database reset for Ticket 064. A clean reset is a
separate migration-verification workflow, and it is never a substitute for
exact fixture cleanup.

### 2. Select one cumulative suite

Each command below creates a new exact run ID and owns setup, measurement,
inspection, and cleanup. The suites are cumulative; do not run them as separate
steps while expecting them to share identities or results.

| Command | Identities | Included timed stages |
| --- | ---: | --- |
| `npm run load:read:smoke` | 1 default | 3-minute smoke; 2-minute warm calibration |
| `npm run load:read:baseline` | 10 default | Smoke and warm; 5-user and 10-user 10-minute baselines |
| `npm run load:read:ramp` | 100 default | Smoke, warm, both baselines; 10/25/50/100-user 4-minute plateaus; 10-user 5-minute recovery |
| `npm run load:read:full` | 100 default + 5 reserved Heavy schedule | Every ramp stage plus a tagged 5-user, 5-minute Heavy schedule stage |

Use `npm run load:read:full` for the complete Ticket 064 acceptance sequence.
The shorter commands support bounded harness verification and partial local
measurement.

### 3. Let the supervisor perform preflight and setup

The selected command performs these operations without separate operator
commands:

1. Validate Docker, Locust, Python, Next.js, the fixed loopback app URL, a free
   app port, the generated exact run ID, and the project-local Supabase stack.
2. Resolve local Supabase values from
   `npm run supabase -- status -o env`; do not source a potentially hosted
   `.env.local`.
3. Create an owner-only report directory, build the exact local production
   app, and blank provider/process secrets from the app environment.
4. Provision the declared exact synthetic identities and seed their
   deterministic cohorts through ordinary RLS.
5. Store passwords, cookies, Auth/product IDs, and selectors only in the
   owner-only private run directory under the operating-system temporary
   directory.
6. Start the app, prewarm each ordinary session, and verify every deterministic
   public/protected/query/export route contract.
7. Require the pre-load fixture, export-ownership, and ordinary-RLS integrity
   checks to pass.

Preflight failure occurs before account creation whenever possible. After
provisioning starts, every exit path still attempts post-failure integrity,
local RLS smoke, process shutdown, exact fixture cleanup, and artifact
sanitization.

The supervisor writes `declaration.json` with the fixed stages, cohort counts,
identity ceilings, resource ceilings, abort thresholds, git commit,
hardware/runtime versions, local production mode, and warm-state caveat. It
does not copy private session material into the report directory.

### 4. Observe the timed stages and gates

The supervisor refreshes only the sessions needed by each stage before timing,
then starts a new Locust process and statistics set for that stage. It assigns
one unique ordinary identity to each active virtual user and stops if the pool
is exhausted. The default stages exclude Heavy schedule identities; only the
tagged Heavy schedule stage selects the reserved pool.

At every stage and ramp plateau it captures:

- achieved requests per second;
- p50, p75, p95, and p99 latency;
- unexpected failure ratio and unexpected `5xx` count;
- response bytes;
- normalized request-name breakdown;
- actual cohort mix and achieved peak user count;
- host load, available memory, and app/Locust RSS observations;
- achieved duration, warm state, and local-runtime caveats.

It evaluates each stop/go gate before advancing. An exhausted identity pool,
short stage, resource breach, Locust exception, or critical nonzero Locust
exit is a failed stage, not permission to relax the declaration. Ordinary
non-`5xx` request failures are retained in Locust statistics and evaluated
against the declared ratio gate at the end of the plateau.

The fixed resource ceilings are host one-minute load no greater than `2` per
logical CPU, at least `512 MiB` available memory, no more than `4 GiB` app RSS,
and no more than `4 GiB` Locust RSS. The supervisor samples during each stage
and stops that stage on a breach. The full suite also requires every one of the
15 normalized request names to record timed traffic across the completed
stages.

### 5. Apply nominal gates

A nominal local stage requires:

- zero cross-account data exposure;
- zero unexpected `5xx` responses;
- less than `0.5%` unexpected request failures;
- p95 latency no worse than twice the calibrated one-user warm baseline;
- exports containing only synthetic data owned by the assigned account;
- no provider, process-route, mutation, or destructive traffic.

The supervisor immediately stops on critical boundary failures such as a
cross-account marker, unexpected `5xx`, identity-pool violation, or worker
exception. Other unexpected request failures may pass only when their
aggregate ratio remains strictly below `0.5%`; their safe status or semantic
failure category remains in the failure report.

After returning from the ramp to 10 users, both latency and failure ratio must
recover to within `10%` of the pre-ramp 10-user baseline. If a baseline value is
zero, report the absolute observed value and treat any unexpected failure as a
failed recovery rather than dividing by zero.

Do not tune code, schema, indexes, infrastructure, or limits during the same
evidence run. A gate failure is a result to record, not authorization for
performance remediation.

### 6. Verify automatic inspection and cleanup

After timed stages stop, the supervisor automatically requires:

- zero duplicate occurrences;
- zero invalid or cross-owner relationships;
- zero false-fresh occurrence horizons;
- zero unexpected reminder deliveries;
- exports observed by assertions contain only the assigned synthetic owner's
  data;
- no fixture growth outside the declared run and cohort bounds;
- a passing local two-user RLS smoke;
- removal of every exact run-created Auth user and owned product row;
- removal of the private metadata/session directory;
- zero residual product rows;
- deletion of every retained artifact that fails the sensitive-content scan.

A performance-looking pass with an integrity, RLS, cleanup, or artifact-scan
failure is a failed run. Cleanup runs after success, stage-gate failure,
application failure, abort, and handled interruption.

### 7. Review the sanitized report

The owner-only report directory is
`load-tests/.runs/<run-id>/`. Review:

- `declaration.json` for the fixed shape, environment facts, and ceilings;
- `progress.json` for completed-stage results and gates;
- `summary.json` for the final stage metrics, route coverage, integrity, RLS,
  cleanup, resource ceilings, caveats, and failure state;
- `completion.json` for the concise lifecycle outcome;
- each stage's sanitized Locust CSV, history, failures, exceptions, and HTML
  artifacts.

Only `status: "passed"` with all required stages and cleanup evidence supports
a baseline claim. This is local persistent-Node evidence, not Vercel, hosted,
staging, production, or customer-capacity evidence.

## Standalone lifecycle commands

The package also exposes `load:provision`, `load:seed`, `load:integrity`, and
`load:cleanup` for lifecycle development and exact failed-run recovery. They
are not a replacement for a supervised acceptance suite. Before using them,
export the same explicitly validated loopback Supabase URL, local publishable
key, local service-role key, `CADENCE_LOAD_TARGET=local`, and loopback
`CADENCE_LOAD_BASE_URL` used by the supervisor. Never let these commands fall
back to hosted values in `.env.local`.

`load:provision` creates the exact identities and also seeds them; `load:seed`
reconciles an existing private run; `load:integrity` checks that run; and
destructive cleanup requires the exact run ID twice:

```bash
npm run load:cleanup -- --run-id "$CADENCE_LOAD_RUN_ID" --dry-run
npm run load:cleanup -- --run-id "$CADENCE_LOAD_RUN_ID" --confirm-run-id "$CADENCE_LOAD_RUN_ID"
```

Do not recover by broad email/domain selection, direct Dashboard deletion, or
database reset.

## Abort conditions

Stop new requests immediately when any of these occurs:

- target classification or either endpoint is not demonstrably local;
- a service-role credential appears in a worker environment or artifact;
- identity allocation would share or reuse one account concurrently;
- cross-account data appears in a page, export, assertion, or integrity check;
- any unexpected provider, process-route, mutation, or destructive request is
  attempted;
- an unexpected `5xx` occurs;
- the predeclared failure, latency, runtime, resource, traffic, or duration
  ceiling is crossed;
- the session/artifact permission boundary cannot be maintained;
- a cohort or integrity invariant fails;
- the supervisor can no longer guarantee exact cleanup.

An abort does not skip integrity inspection or cleanup.

## Failure recovery

1. Stop the swarm and prevent further stage advancement.
2. Keep the run directory private. Do not publish or commit raw artifacts.
3. Run `npm run load:integrity -- --run-id "$CADENCE_LOAD_RUN_ID"` if local
   services are still safe and reachable and the private run metadata remains.
4. With the same explicitly validated local environment, dry-run and then run
   the exact `load:cleanup` commands above.
5. Verify cleanup by exact run ID and aggregate residual counts.
6. If cleanup fails, preserve only the minimum private exact selector needed to
   retry. Do not broaden the selector or manually delete by prefix/domain.
7. Restore the local app and Supabase processes to a known local state, then
   rerun exact cleanup verification.
8. Inspect retained aggregate output for sensitive values and delete any unsafe
   copy.
9. Record the stage, gate, integrity, or cleanup failure without identifiers.
10. Start a new run ID only after the previous run has zero residual fixtures
    and no private session artifact.

If exact cleanup cannot be verified, stop. Do not proceed to another load
ticket, a hosted target, or a destructive database reset as an improvised
recovery step.

## Ticket 065 local mutation lifecycle

This procedure covers common status, note, Behavior, unchanged-timezone, and
export traffic plus separate changed-timezone, same-account contention, and
operator-overlap profiles. It authorizes only the fixed loopback Next.js app,
project-local Supabase Docker stack, synthetic accounts, and supervisor-owned
fake Sequenzy server. It does not authorize a hosted hostname, production data,
real Sequenzy, Web Push, Google OAuth, import apply, restore apply, account
deletion, or raw process-route load.

### 1. Prepare and verify dependencies

Start Docker and the existing project-local Supabase stack. Install the pinned
Locust environment, then verify the registry companion manifest, Python
harness, Ticket 063 protocol, and Ticket 064 read foundation as applicable:

```bash
SUPABASE_TELEMETRY_DISABLED=1 npm run supabase -- start
SUPABASE_TELEMETRY_DISABLED=1 npm run supabase -- status
npm run load:install
npm run load:manifest:check
npm run load:python:test
npm run load:protocol:smoke
```

A database reset is not a mutation-load prerequisite and is not an acceptable
cleanup mechanism. The supervisor resolves local Supabase values from the
running CLI stack and rejects hosted values from `.env.local`.

### 2. Select one independent mutation suite

Every command creates a new exact run ID, private session directory, report
directory, fixture set, production app process, and loopback fake provider.
Profile commands are not cumulative unless the table says so. Comparable
ordinary mixed commands prepend a new 3-minute representative mixed
calibration; they never reuse smoke or a prior run as their latency reference.

| Command | Timed profile and human expectation |
| --- | --- |
| `npm run load:mutation:smoke` | One mixed Daily tracker user for 3 minutes. This is a functional lifecycle proof only and never establishes a latency reference. Allow additional time for build, fixture setup, checks, and cleanup. |
| `npm run load:mutation:baseline` | 3-minute representative mixed calibration, then 5 mixed users for 10 minutes and 10 for 10 minutes. Declared timed portion: 23 minutes. |
| `npm run load:mutation:ramp` | 3-minute representative mixed calibration, then all four 10/25/50/100 mixed-user plateaus for 4 minutes each. Declared timed portion: 19 minutes. A p95-only breach is recorded as non-passing and does not skip a later ramp plateau. |
| `npm run load:mutation:spike` | 3-minute representative mixed calibration, then a 10-user baseline, rapid 100-user hold, and mandatory 10-user recovery for 5 minutes each. Declared timed portion: 18 minutes. |
| `npm run load:mutation:soak` | 3-minute representative mixed calibration, all four 10/25/50/100-user ramp plateaus for 4 minutes each, then a 25-user soak for 60 minutes. Declared timed portion: 79 minutes. The included ramps supply same-run support, so the command can pass when a passing ramp plateau above 25 users and all soak gates reconcile. |
| `npm run load:mutation:breakpoint` | 3-minute representative mixed calibration, then 10/25/50/75/100 mixed users for 4 minutes each. Declared timed portion: at most 23 minutes; the first performance-terminal plateau is retained and later breakpoint plateaus are skipped. |
| `npm run load:mutation:timezone` | 5 low-frequency changed-timezone users for 5 minutes. Each user waits 45–75 seconds and performs at most four changes. |
| `npm run load:mutation:contention` | 1 paired collision actor for 5 minutes. It owns exactly two independent ordinary sessions for one synthetic account and discovers one stable prior-day occurrence through the server-rendered selected behavior/day review. |
| `npm run load:mutation:operator` | 3-minute representative mixed calibration, then 10 mixed users for 5 minutes while the supervisor invokes protected occurrence and reminder processing every 20 seconds against synthetic rows and the loopback fake provider. Declared timed portion: 8 minutes. |
| `npm run load:mutation:full` | 20 declared stages in strict order: smoke, mixed calibration, 2 baselines, 4 ramp plateaus, 3 spike stages, soak, 5 breakpoint plateaus, changed-timezone, contention, and operator overlap. Declared timed duration: 9,120 seconds (2 hours 32 minutes), plus build, provisioning, prewarm, integrity/RLS checks, report inspection, and exact cleanup. Allow more than three hours on an otherwise quiet local machine. |

Do not run raw `locust`, pass an arbitrary host, or launch profile commands in
parallel. Raw execution bypasses the supervisor's target classification,
private artifact creation, process-secret isolation, integrity checkpoints,
fake-provider reconciliation, and exact cleanup.

### 3. Let the supervisor own preflight and fixtures

The selected command:

1. Requires the pinned Python/Locust and Next.js executables, Docker, a healthy
   local Supabase stack, a free fixed loopback app port, and a valid exact run
   ID.
2. Starts a loopback-only fake Sequenzy server with a generated key and a
   10,000-request ceiling.
3. Builds the local production app with explicit local Supabase values and
   injects the fake provider plus a generated process secret into the app
   process only.
4. Provisions mutation fixtures containing 70% Typical daily, 20%
   Review-heavy, and 10% Export-heavy accounts at the 100-account scale. Empty
   and Heavy schedule are excluded.
5. Signs in ordinary accounts before timing, creates unique cookie jars, and
   creates the exact paired session jars needed by contention.
6. Writes session cookies and exact selectors only to an owner-only private
   operating-system temporary directory. Contention records the exact
   Behavior, local date, and occurrence needed by the selected-day review.
   The ignored report directory receives aggregate declarations only. In the
   full suite, the changed-timezone stage refreshes and leases the final five
   identities. The later operator stage leases the first ten and reserves the
   eleventh for causal occurrence repair.
7. Starts the app, prewarms Timeline, Behaviors, and Settings through every
   ordinary session, and requires the mutation-classified pre-load integrity
   checkpoint to pass.

When an operator stage is selected, the plan reserves one additional exact
identity beyond the ten Locust users. Before operator preparation and before
every protected process-route request, the supervisor requires local Auth,
profiles, occurrence-sync owners, and reminder owners to match the exact run.
The first protected loop waits one 20-second readiness interval so Daily
tracker startup transitions cancel their due/past reminders before global
reminder processing begins. Later loops run every 20 seconds.
Any unrelated local account, profile, or owner aborts before the global
operator mutation.

The fixture contains only bounded synthetic text and fixed owner-scoped
mutation slots. Email-capable reminder rows are synthetic; there are no active
push subscriptions. Locust receives ordinary cookies and private selectors,
but no service-role key, process secret, fake-provider key, or real provider
configuration.

### 4. Understand timed request behavior

The mixed task-selection declaration is 65% GET-read tasks and 35% Server
Action mutation tasks with 2–5-second think time. Preparation and verification
reads make the achieved HTTP ratio an observed report value rather than a
fixed 65/35 result. Reads include Timeline, future Timeline, Behaviors,
selected-day review, and JSONL/full JSON/BehaviorLog downloads. Writes include
Completed, Not Completed, Clear decision, notes, bounded Behavior lifecycle
and updates, selected-day status/note changes, and unchanged-timezone saves.
The Daily tracker also exercises a dedicated Needs decision row whose reminder
is already due/past: it completes the row and clears it back to Unresolved
through the selected behavior/day review's bounded 90-day, server-rendered
occurrence actions,
reloads that review, and requires the cancelled reminder to remain cancelled.
Separate Timeline reads and integrity checks retain the Needs decision
derivation evidence; the client-mounted Needs decision dialog is not treated
as a raw server-rendered form surface.

The retained due/past checkpoint uses seven exact nonnegative integer fields.
Require `tracked_occurrences > 0`,
`tracked_deliveries === tracked_occurrences`,
`exercised_occurrences <= tracked_occurrences`,
`clear_events >= exercised_occurrences`,
`unresolved_occurrences === tracked_occurrences`,
`cancelled_deliveries === exercised_occurrences`, and
`reactivated_deliveries === 0`. `exercised_occurrences` counts unique tracked
occurrences, while `clear_events` counts every Clear event, so repeated clears
may make the latter larger. The two counts must also be zero or nonzero
together. A final positive exercise count is mandatory for suites containing
`smoke-1` or `mixed-calibration-1`. Standalone changed-timezone and contention
suites do not run this path and must retain zero exercise, Clear, and
cancellation counts instead.

Each Server Action is discovered from the current rendered page and submitted
through the user's ordinary cookie jar. The harness then reloads the affected
Timeline, Behaviors, selected-day, or Settings state and requires the expected
status, note, active state, bounded field, or timezone. Dynamic IDs and dates
remain private while Locust aggregates the nine stable interaction-ID POST
names listed in `docs/LOAD_TESTING_PLAN.md`.

The representative calibration is `mixed-calibration-1`: one ordinary mixed
user for 3 minutes. It runs before each comparable baseline, ramp, spike,
soak, breakpoint, or operator sequence and establishes the warm p95 used by
their 2× latency gate. It is not a smoke stage or capacity plateau and is
excluded from representative aggregate request-mix and capacity selection.
Functional smoke, calibration itself, changed-timezone, and contention do not
receive that p95 comparison.

Network-level transport failures on protected and structured-export `GET`
requests are recorded as Locust failures and rescheduled without quitting the
runner. They still count toward the less-than-0.5% stage failure-ratio gate.
This tolerance is transport-only. A `5xx`, authentication or rate-limit
response, invalid document/export semantics, owner-marker mismatch, or any
other semantic `GET` failure stops the stage. Every mutation `POST` transport,
Server Action protocol, and semantic failure also stops the stage.

Do not diagnose a generic loopback HTTP refusal or reset as a database
refusal. It remains a request failure under the ordinary ratio gate. The
three-consecutive-refusal runtime gate requires explicit Postgres, Supabase,
PostgREST, PgBouncer, driver, or SQLSTATE context, except for an unambiguous
database-capacity refusal. A guarded abort writes one sanitized initiating
reason to the stage's existing `_exceptions.csv`, then defers runner shutdown
until the triggering request event can reach Locust statistics. Any exception
row still fails the stage; repeated callbacks cannot add another reason or
request another quit.

The changed-timezone command is deliberately separate and low frequency. The
supervisor privately snapshots every then-past or then-resolved occurrence
immediately before the stage, including future occurrences resolved by earlier
stages, and compares the existing schedule-preservation fingerprints
immediately afterward. Only captured, verified, and violation counts enter
the required `timezone-dynamic-preservation` gate.

Timezone resync may replace a future Unresolved occurrence after its reminder
became due. The reminder planner intentionally does not recreate missing
due/past deliveries. The integrity gate therefore checks future reminder
eligibility and preserves reminder identities attached to past or resolved
baseline occurrences instead of imposing a monotonic total reminder count.

Definition-history integrity allows no more than five seconds of absolute
positive or negative skew between `recorded_at` and the equal
`created_at`/`updated_at` timestamps. Recorded times must also be
nondecreasing through each semantic definition revision chain.

The contention command releases independently rendered Completed and Not
Completed forms together and requires exactly one success, one documented
stale result, and matching readback from both sessions. The operator command
is the only suite that may call the protected process routes. Those calls come
from the fixed Node supervisor rather than Locust. It marks the reserved
identity stale through ordinary RLS, invokes occurrence sync, and immediately
proves that exact private account changed from stale to a newer fresh horizon.
The retained `operator-isolation-and-causal-repair` gate contains counts, not
IDs.

### 5. Fake-provider lifecycle

No manual provider login or environment setup is required or permitted.

1. The supervisor creates a generated fake API key and binds the fake server
   to `127.0.0.1`.
2. The app receives only that loopback URL and generated key. Real
   `SEQUENZY_API_KEY`, VAPID, and unrelated provider secrets are blanked.
3. The fake accepts only its transactional-send path and strictly bounded
   synthetic reminder payload. It records only aggregate counts and delivery
   fingerprints, rejects duplicates, and rejects Web Push paths.
4. Non-operator commands must finish with zero fake-provider requests.
5. The operator command reconciles claim/send/cancel counts, requires zero
   failed deliveries and duplicate attempts, then performs one final
   reminder-process replay that must not send again.
6. The supervisor stops the fake in its `finally` path and includes only the
   sanitized aggregate snapshot in `summary.json`.

Every command requires zero real-provider sends. Loopback fake sends are
expected only for the operator command and must reconcile with its synthetic
delivery evidence. Any request to a real provider is an immediate abort. Do
not point the fake URL at a LAN address, hosted mock service, real Sequenzy
host, or user-controlled proxy. Do not create an active push subscription for
these fixtures.

### 6. Observe gates and checkpoints

Every stage records achieved RPS, p50/p75/p95/p99, failure ratio, response
bytes, achieved read/write mix, stable request-name coverage, peak users,
duration, local host/app/Locust resources, cohort mix, and gate results.
Integrity runs before load, at declared stage boundaries, after failures when
safe, and after the final timed stage. A recorded p95-only ramp breach, an
expected terminal breakpoint, or an expected-stress spike hold forces a full
integrity checkpoint immediately, even when the declared stage was not
otherwise a checkpoint. The supervisor awaits that result before another
plateau, independent group, or spike recovery; a checkpoint violation aborts.

Combined sequential-stage RPS is calculated from the combined request count
divided by the combined achieved duration. The same calculation is applied per
stable request name; do not add the individual stage RPS values.

Stop automatically for a cross-owner effect; an undeclared method or write;
semantic mutation failure; real-provider or destructive-action attempt;
session-pool or cleanup-selector failure; date-anchor rollover; false-fresh
horizon; integrity failure; Locust exception; local resource breach; or the
declared limit of 100 users, 3,600 seconds of traffic per profile, 10,800
seconds per suite, 200,000 Locust requests per timed stage, or 60 Locust RPS.
The soak traffic duration remains exactly 3,600 seconds; its runtime watchdog
alone allows bounded shutdown and sampling grace through 3,900 seconds. The
supervisor also checks a finite selected-suite ceiling—200,000 multiplied by
the number of declared stages—after each stage, counting both Locust and
protected operator requests. Three consecutive 30-second windows above 0.5%
unexpected `5xx` or three consecutive database connection refusals also stop
the run.

The stage gate is stricter than the sustained runtime breaker: it requires zero
unexpected `5xx`, less than 0.5% unexpected failures, full declared duration
and users, no resource breach, and—for comparable ordinary mixed stages—p95
no worse than twice the representative mixed calibration p95.

For ramp, only the exact calibrated-p95 failure can be converted into recorded
latency-boundary evidence. Retain that stage with `plateau_passed: false` and
`recorded_ramp_latency_breach: true`, exclude it from capacity selection, run
the forced integrity checkpoint, and continue through every remaining
10/25/50/100 ramp plateau. An unexpected request-failure ratio or any safety,
semantic, runtime, duration/user, `5xx`, exception, resource, or ceiling
failure aborts.

Breakpoint remains bounded and may stop after its first nominal performance
failure. Retain the non-passing terminal plateau, run its integrity checkpoint,
and skip only later breakpoint plateaus. Independent later groups may continue
when that checkpoint and all safety gates pass.

Only the `spike-hold-100` stage may treat the exact calibrated-reference p95
failure by itself as expected stress. It remains non-passing and proceeds,
after its forced integrity checkpoint, to the mandatory 10-user recovery.
Request-failure threshold breaches, combined failures, or any non-reference
p95 message abort. Recovery must return latency and failure ratio to within
10% of its pre-spike 10-user baseline. Review both the primary
`spike-recovery-10` stage gate and the distinct
`spike-recovery-comparison` gate; neither may be missing or non-passing.

Soak admission requires the same run to execute all four ramp plateaus and
ramp-25 itself to pass. The 25-user soak must be strictly below the lowest
integrity-clean recorded ramp latency boundary; when no ramp boundary was
observed, it must be strictly below a passing ramp plateau. The standalone
soak command meets the provenance shape because it includes calibration and
all four ramps. After breakpoint execution, final reconciliation also checks
the completed soak against the strictest breakpoint boundary and executed
passing headroom. Missing, equal, or lower proof fails the suite.

Soak inspection compares covered steady-state app-RSS windows, open local
database connections, and failure halves. The warmed RSS baseline is the
median of `[5 minutes, 10 minutes)`; the terminal value is the median of the
last five minutes before the declared duration. Raw resource observations use
monotonic stage-relative milliseconds and a nominal five-second cadence. Each
window must contain at least 50 valid app-RSS samples, start and end within 15
seconds of its bounds, and contain no gap over 15 seconds. Invalid, null,
out-of-order, sparse, or missing window evidence fails closed. The terminal
median may grow by no more than the larger of 128 MiB or 25% of the baseline
median. The instantaneous 4 GiB process ceilings remain separate and
unchanged. Both database-connection samples are mandatory; if either sample
cannot be read, the soak gate fails. This proves growth stayed within the
declared bound for that workload; it does not prove the presence or absence of
a memory leak. A bounded terminal result is not permission to raise a ceiling
or tune the app during the evidence run.

### 7. Review retained evidence and cleanup

Review the owner-only directory at `load-tests/.runs/<run-id>/`:

- `declaration.json` records the fixed stages, 65/35 weights, declared
  2–5-second `think_time_seconds`, per-stage and cumulative request-ceiling
  scope, local runtime, fake-provider mode, source state, and caveats.
- `progress.json` records its run-evidence schema version, completed stages,
  stop/go gates, integrity checkpoints, aggregate operator request count, and
  cumulative request usage.
- `summary.json` retains the declared think time and records final request mix,
  local plateau selection when applicable, cumulative request usage,
  due/past reminder non-reactivation, dynamic timezone preservation, operator
  isolation/causal repair, fake-provider reconciliation, integrity, RLS smoke,
  raw monotonic resource samples plus aggregate diagnostics, exact cleanup, and
  any privacy-safe failure. A post-stage reconciliation failure retains its
  structured failing gate before the supervisor exits.
- `completion.json` records the concise lifecycle outcome.
- Per-stage CSV/history/failure/exception/HTML files contain sanitized Locust
  aggregates.

After an authoritative ramp or full command finishes, independently verify its
exact retained directory:

```bash
npm run load:mutation:evidence:check -- --run-id '<exact-run-id>'
```

The checker requires the canonical suite and stage order; exact
declaration/summary/completion schemas; the complete artifact inventory and
matching digests; reconciled raw CSV, HTML, and semantic counts; valid history,
RPS, resource, session-renewal, integrity, due/past, fake-provider, RLS,
sanitization, and cleanup evidence. Do not edit or combine run directories to
make this audit pass. A result is not authoritative unless both the supervised
lifecycle and this exact-run audit pass.

Mutation declaration, progress, summary, and completion evidence uses run
schema `1.1.0`; per-stage semantic-verification artifacts retain their separate
`1.0.0` schema. Legacy mutation run schema `1.0.0` lacks the raw resource
series needed to reconstruct the steady-state RSS windows. Treat those
directories as diagnostic only and rerun the canonical suite instead of
synthesizing or backfilling observations.

The supervisor inspects retained files for cookies, tokens, keys, IDs, emails,
owner markers, fixture text, response bodies, provider payloads, private paths,
and other session material. An unsafe artifact is deleted and fails the run.
A passing performance gate does not override failed integrity, RLS,
fake-provider reconciliation, artifact inspection, or cleanup.

The loopback fake provider is the only permitted reminder-delivery target.
Every exit path stops it, shuts down local app/Locust processes, attempts the
local RLS and post-failure integrity inspections when safe, deletes the exact
run-owned Auth users and rows, removes private session artifacts, and verifies
zero residual fixtures. A partial or unverified cleanup is a failed lifecycle,
not a usable performance result.

Only `status: "passed"` plus all selected stages and verified exact cleanup is
a usable local result. Even then, describe it only as evidence for the
recorded local persistent-Node app, local Supabase Docker stack, synthetic
fixture mix, and fake provider. Do not label it Vercel, hosted, production, or
customer capacity.

### 8. Exact interrupted-run recovery

The first `SIGINT`, `SIGTERM`, or `SIGHUP` is cooperative. The supervisor stops
new stages and interrupts active Locust traffic, but it does not immediately
terminate the app or itself. It remains alive to attempt post-failure
integrity, local RLS inspection, fake-provider shutdown, artifact inspection,
exact cleanup, and a terminal `completion.json` in `finally`. If completion
records verified cleanup, no manual recovery is needed.

If `completion.json` is absent, the lifecycle is incomplete even when the
terminal appears quiet or individual stage artifacts look healthy. Treat a
missing completion marker as a hard interruption and perform exact-run manual
inspection and recovery from the owner-only private metadata. Never infer
cleanup or acceptance from `progress.json`, a Locust CSV, or process exit
alone.

If exact cleanup failed and the private run metadata still exists:

1. Stop any leftover app, Locust, or fake-provider process associated with that
   exact run. Do not kill unrelated local services.
2. Keep the exact run directory and private metadata owner-only. Do not publish
   or commit them.
3. Re-establish the same explicit loopback Supabase and app environment used
   by the supervisor. Do not source hosted values from `.env.local`.
4. Set only the exact printed run ID:

   ```bash
   export CADENCE_LOAD_RUN_ID='<exact-run-id>'
   ```

5. If the local app and Supabase stack are safely reachable, inspect that
   mutation fixture:

   ```bash
   npm run load:integrity -- --run-id "$CADENCE_LOAD_RUN_ID" --mutation
   ```

6. Preview cleanup without deleting:

   ```bash
   npm run load:cleanup -- --run-id "$CADENCE_LOAD_RUN_ID" --mutation --dry-run
   ```

7. Require the preview to match only the exact private run metadata. Then
   confirm the same run ID twice:

   ```bash
   npm run load:cleanup -- --run-id "$CADENCE_LOAD_RUN_ID" --confirm-run-id "$CADENCE_LOAD_RUN_ID" --mutation
   ```

8. Repeat the exact dry run or integrity/cleanup verification until aggregate
   residual counts are zero, then remove any remaining private session
   directory and unsafe report copy.
9. Start a new run ID only after the prior exact run has zero residual users
   and rows and no private session artifact.

Never recover by an email domain, broad prefix, wildcard, empty selector,
Dashboard bulk deletion, hosted database change, or database reset. If private
exact selectors are missing or cleanup cannot be verified, stop and treat the
run as unresolved; do not proceed to another load ticket or hosted testing.

## Ticket 066 hosted staging procedure

### Current execution state

Ticket 066 is blocked before traffic. No dedicated Cadence Vercel staging
project or separate Supabase staging project exists in the discovered provider
state. The exact Vercel plan, Vercel approval, owner authorization, staging
hostname, traffic window and sources, cost ceiling, and monitoring evidence
are not documented.

The repository implements only a static hosted preflight. It has no hosted
traffic launcher and does not adapt the local supervisor's loopback-only
provisioning or cleanup commands. Do not invoke raw Locust, weaken the local
guards, or point local lifecycle scripts at hosted credentials.

### Provider approval request templates

Send the following facts to Vercel before scheduling traffic. Keep the response
and approval reference in private task notes.

```text
Subject: Prior approval for synthetic staging load test
Account/team and exact plan:
Dedicated staging hostname:
Deployment environment and deployment ID:
UTC start and end:
Maximum RPS and maximum total requests:
Maximum virtual users and runtime:
Source geography and every literal source IP:
Localized or distributed; worker count:
Fluid Compute enabled or disabled:
Runtime and regions:
Workload stages and HTTP methods:
Synthetic-only and no production/provider traffic confirmation:
Monitoring/log-drain and retention plan:
USD cost ceiling and stop owner:
Abort, rollback, and exact-cleanup plan:
```

If the selected Supabase staging project uses Team or Enterprise and the load
is heavy or prolonged, send the following at least two weeks ahead. Record the
support reference privately. Under the current production checklist, Pro does
not require this support reference, but it still requires every staging,
monitoring, RLS, migration, cost, and cleanup gate.

```text
Subject: Coordination for synthetic staging load test
Organization plan and staging project ref:
Confirmation that production uses a different project:
Region and compute tier:
UTC start and end:
Expected RPS, virtual users, runtime, and total requests:
Read/mutation/export/contention workload mix:
Synthetic identity and fixture counts:
Migration, RLS, index, and advisor verification:
Connection, CPU, memory, I/O, Auth/PostgREST, and slow-query monitoring:
Abort threshold, exact-cleanup plan, and recovery smoke:
```

### Private single-stage manifest

Create one JSON manifest per stage. Keep it outside the repository or under
ignored `load-tests/.hosted/`. Use a regular non-symlink file and owner-only
permissions. Never add credentials, cookies, tokens, email addresses, real
user IDs, provider payloads, or production data selectors.

The exact schema version is `1.0.0`. It contains these sections:

- `target`: staging and production application origins, deployment and Vercel
  identifiers, environment, regions/runtime, Fluid Compute, distinct staging
  and production Supabase refs, compute tier, dedicated synthetic isolation,
  source-IP allowlisting, and unrelated-traffic blocking.
- `approvals`: recent policy review, owner authorization, Vercel Enterprise
  plan and approval, approved UTC window, Supabase plan, and conditional
  support coordination.
- `traffic`: one canonical stage, prior-stage evidence when applicable, human
  checkpoint, users/RPS/runtime/request/cost ceilings, source geography and
  literal IPs, worker posture, and `automatic_stage_advance: false`.
- `data`: synthetic-only flags, no real users/recipients/push/OAuth/destructive
  work, an isolated provider stub, and five fixture cohort counts covering the
  authorized virtual-user ceiling.
- `monitoring`: Locust, Cadence, Vercel, and Supabase collection flags plus
  retention through at least 24 hours after the approved window.
- `verification`: matching 40-character local/deployed commits, clean source,
  repository/local checks, hosted RLS and migration checks, advisors, route
  smokes, exact-cleanup dry run, and monitoring collection test.

The first stage is `public_read_baseline` and has a null prior-stage evidence
reference. Later canonical stages are `authenticated_read_baseline`,
`authenticated_read_ramp`, `mixed_mutation_ramp`, `spike_recovery`, `soak`,
`contention_operator`, and `breakpoint`. Every later stage requires the prior
stage's aggregate evidence and a new human checkpoint.

Run the static check only after every field reflects current private evidence:

```bash
chmod 600 load-tests/.hosted/ticket-066-stage.json
npm run load:hosted:preflight -- --manifest load-tests/.hosted/ticket-066-stage.json
```

The check fails closed before network traffic. It prints only the authorized
stage and aggregate limits. A pass does not contact a provider, create a
resource, launch Locust, or approve another stage.

### Preflight order

1. Record the exact owner authorization and provider approvals.
2. Confirm the target and database are dedicated staging resources with no
   production data, real users, active push subscriptions, or real recipients.
3. Pin one clean Git commit. Confirm the deployment uses that exact commit.
4. Compare the staging migration history to git. Review Supabase advisors.
5. Run repository verification and the local protocol and integrity checks.
6. Run hosted unauthenticated, one-user authenticated, and many-user RLS
   smokes outside timed statistics.
7. Prove the provider stub is isolated. Do not configure real Sequenzy or push
   delivery credentials on the target.
8. Pre-provision one ordinary session per maximum active user. Verify the five
   synthetic cohort counts.
9. Dry-run exact hosted cleanup with the private run selectors. It must reject
   broad selectors and show only the intended synthetic fixture.
10. Test all monitoring collection and retention. Confirm the cost stop owner.
11. Validate the single-stage manifest during the unexpired approved window.

No current command completes steps 6-9 against hosted staging. Implement and
test a hosted-specific supervised lifecycle after the target and approvals are
available. Do not reuse loopback-only commands by bypassing their guards.

### Human checkpoints and stage order

One accountable human records a stop or go decision after every stage. The
checkpoint reviews achieved RPS, p50/p75/p95/p99, failures and status codes,
timeouts, application timing, Vercel functions and cost, Supabase resources
and slow queries, RLS/integrity, provider no-send proof, and remaining approved
time and cost.

The next stage needs a new manifest with the prior evidence reference. Do not
prepare an automatic queue. Do not enter breakpoint traffic from a baseline
checkpoint. Stop when the approved ceiling, policy, cost, monitoring,
application, database, provider, privacy, integrity, RLS, or cleanup gate is
uncertain.

### Abort and rollback

Stop new traffic at the first gate breach. Stop every Locust worker and
operator request. Disable the staging source-IP access after evidence capture.
Keep raw artifacts private. Record the exact last completed stage and the abort
reason without response bodies or identifiers.

An abort does not waive cleanup. Run post-failure integrity and RLS checks when
safe. Stop the isolated provider stub. Use only the exact private run selectors
to remove synthetic sessions, Auth users, and owned rows. Never use production,
a broad prefix/domain, a wildcard, a database reset, or a Dashboard bulk edit.

Do not tune, resize, migrate, index, cache, redeploy, or change application
code inside a measurement run. If the staging deployment itself is defective,
end the run. Roll back or redeploy it through the normal Vercel workflow only
after measurement has ended. Re-establish migration congruence through tracked
migrations. Start a new approved run and new run ID after the target is clean.

### Post-run cleanup and report

After the final stage or any abort:

1. Stop all load and provider-stub processes.
2. Run hosted integrity, many-user RLS, migration congruence, and provider
   no-send checks.
3. Preview exact synthetic cleanup, then confirm the same exact run selector.
4. Verify zero residual run users and product rows.
5. Remove private sessions and recovery selectors after cleanup is proven.
6. Run a final one-user recovery smoke with a separately tracked synthetic
   user, then delete that user exactly.
7. Disable staging load ingress and review final provider cost.
8. Retain raw artifacts privately for the declared period. Commit only an
   aggregate privacy-safe report.

The report states maximum tested and sustainable users, achieved RPS, route
and interaction percentiles, failure/status distribution, first breached
gate, likely owning layer, recovery and headroom, cleanup proof, and staging-
to-production limitations. It creates separate remediation tickets for proven
bottlenecks. Ticket 066 does not implement fixes during measurement.
