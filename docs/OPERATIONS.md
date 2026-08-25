# Agent Operations Runbook

Use this file after `AGENTS.md` and `STATUS.md` to run the repository consistently.

## Current state

The repository contains the complete numbered implementation sequence through
Ticket 063, including the authenticated web app, BehaviorLog portability,
public-launch hardening, performance and UX follow-ups, the Astro marketing
site, the export prompt library, and the locally actionable P3
interaction-audit cleanup. IA-024 remains product-decision-gated; no other
interaction-audit item is open. `STATUS.md` remains the detailed implementation
ledger and should be checked before starting or continuing any ticket.

Cadence's product posture has moved from private-only usage to a public
open-source product with multiple surfaces. The current implemented surfaces
are the authenticated Next.js web app and the sibling Astro marketing site. See
`docs/PUBLIC_PRODUCT_ARCHITECTURE.md` before starting public-product,
marketing-site, workspace, desktop, or mobile work.

## Setup

```bash
npm ci
npm run agents:check
npm run interactions:check
npm run resolvers:check
npm run lint
npm run typecheck
npm run test
npm run build
```

Use Node.js 22.12 or newer. Node.js 24 is the preferred local release runtime
because both Vercel projects use Node.js 24.x. The root `package.json` enforces
the minimum supported version.

If local `npm` or `node` is not on the shell path in an agent environment, use the user's local binary path or a login shell. On this machine, npm and node are available under `/Users/emi/.local/bin`.

## Installed CLIs

Project-local CLI tools:

```bash
npm run supabase -- --version
npm run sequenzy -- --version
npm run agentmail:version
```

The Supabase and Sequenzy CLIs are dev dependencies so agents do not need global installs.
AgentMail is also installed as a dev dependency for agent-owned test inbox QA.

## Standard verification

Before marking a coding task complete, run:

```bash
npm run agents:check
npm run interactions:check
npm run resolvers:check
npm run lint
npm run typecheck
npm run test
npm run build
```

For UI changes, also run the app and inspect at least:

- `/timeline`
- the affected route
- a desktop viewport
- a narrow mobile viewport around 390px wide

### Codex local timing QA action

The project-local Codex environment includes **Run Local Timing App**. Stop any
other app process on port 3000 before starting it from the Codex action menu.
The action starts or reuses local Supabase, applies pending local migrations
without resetting local data, loads the local runtime keys into the app process,
and starts Next.js with the temporary local test-login route enabled. It overrides
hosted values from `.env.local` only for that app process.
The action delegates the full sequence to `scripts/run-local-timing-app.mjs` so
interactive CLI commands cannot consume the remaining terminal input.

On `/login`, choose **Continue as temporary test user**, create a Behavior
scheduled for today, and open its Timeline Occurrence to test **Track Time**,
**Stop**, and **Reset tracked time**. Local Supabase still requires Docker or a
compatible container runtime.

For many-independent-user RLS smoke QA, point the Supabase environment variables
at the intended local or hosted project and run:

```bash
npm run smoke:rls
```

The command uses service-role credentials only to create and clean up temporary
auth users. Data access checks run through ordinary signed-in publishable-key
clients.

## Local Locust protocol smoke

Ticket 063's Locust harness is local-only. It refuses non-loopback Cadence and
Supabase URLs, even when `.env.local` contains valid hosted credentials. Docker
and the project-local Supabase stack must already be running.

Install the pinned Python environment and run its governance tests:

```bash
npm run load:install
npm run load:manifest:check
npm run load:python:test
```

Start the supervised one-user Locust web UI:

```bash
npm run load:web
```

Run the bounded one-user authenticated protocol proof:

```bash
npm run load:protocol:smoke
```

Both modes use `scripts/load-test-protocol-smoke.mjs` to create exactly one
run-scoped `cadence-load-...@example.invalid` account, seed only synthetic
owned data, inject the local Supabase configuration, start the local app, and
remove the exact account and session file on exit. Locust receives ordinary
auth cookies, never the service-role key. Do not invoke Locust directly for an
acceptance run because that bypasses target preflight, persistence checks, and
verified cleanup.

Session material and generated CSV/HTML output live under ignored
`load-tests/.runs/`; the session file and directory are owner-only. Never copy
cookies, passwords, tokens, keys, Auth user IDs, product row IDs, emails,
fixture text, notes, response bodies, or provider payloads into reports. Only
sanitized aggregate summaries and the synthetic run ID may be committed. A
cleanup failure is a failed run and blocks later load tickets.

The exact architecture, assertion contract, and Ticket 064–066 provider gates
are in `docs/LOAD_TESTING_PLAN.md`.

## Local many-account read-load lifecycle

Ticket 064 extends the one-account protocol proof into a disposable
many-account read baseline. It is still local-only: target classification must
be exactly `local`, and both the Cadence and Supabase endpoints must be
loopback. Never use a hosted application, hosted Supabase project, Vercel
deployment, or production data as a fallback.

Use `docs/LOAD_TESTING_RUNBOOK.md` for the exact setup, preflight, run, abort,
integrity, cleanup, and recovery sequence. Use one of the canonical supervised
commands:

```bash
npm run load:read:smoke
npm run load:read:baseline
npm run load:read:ramp
npm run load:read:full
```

Each command is an independent run with its own identities, artifacts, and
exact cleanup. `load:read:smoke` runs the three-minute read smoke and two-minute
warm calibration. `load:read:baseline` adds the 5-user and 10-user 10-minute
baselines. `load:read:ramp` also runs the four-minute 10/25/50/100-user
plateaus and five-minute recovery. `load:read:full` adds the separately tagged
five-user, five-minute Heavy schedule stage and is the complete Ticket 064
sequence. Do not substitute a raw Locust invocation that bypasses the
supervisor.

The reusable local lifecycle is:

1. Pass Ticket 063's manifest, Python, and authenticated protocol checks.
2. Validate local endpoints, declared run ID, ignored owner-only artifact
   paths, profile, durations, user ceiling, and abort ceilings before creating
   an account.
3. Provision exact run-scoped `cadence-load-...@example.invalid` identities and
   seed the requested Empty, Typical daily, Review-heavy, Export-heavy, or
   explicitly tagged Heavy schedule cohorts.
4. Sign in and prepare sessions before statistics. Assign one unique ordinary
   session and cookie jar to every active virtual user, including while it
   selects a public-document task; fail if the pool is exhausted.
5. Run pre-load integrity, the 1-user three-minute smoke, 1-user two-minute
   warm calibration, 5- and 10-user 10-minute baselines, four-minute
   10/25/50/100-user plateaus, and the five-minute return-to-10-user recovery
   stage.
6. Apply the nominal latency, failure, ownership, provider-isolation, and
   resource gates before advancing at every plateau.
7. Run post-load integrity and the local two-user RLS smoke against the local
   target.
8. Remove every exact run-created Auth user, owned product row, private session
   artifact, and sensitive report copy. Verify zero residuals. Retain only
   inspected aggregate JSON/CSV/HTML evidence.

The service-role key is restricted to server-side exact setup and cleanup,
including their pre/post aggregate boundary checks. It must not reach a Locust
worker. Every timed protected request uses an ordinary signed-in session and
product RLS. Account creation, password sign-in, and cookie generation are
outside normal route statistics.

Default read profiles do not mutate product data, enable email delivery, create
push subscriptions, invoke reminder/occurrence process routes, contact
providers, or submit import, restore, account-deletion, or other destructive
actions. Heavy schedule data is excluded from the default mix and runs only in
an explicitly tagged capacity profile. A full default 100-user fixture may
hold five additional inactive Heavy schedule identities for that separate
stage; they are not part of the default 100-user ramp.

Stop immediately for a non-local target, identity sharing or exhaustion,
service-role exposure, cross-account data, an unexpected `5xx`, provider or
process traffic, a mutation attempt, a breached declared ceiling, failed
integrity, or loss of guaranteed cleanup. Abort still requires safe post-run
inspection and exact cleanup. Cleanup refuses empty, malformed, wildcard, or
broad run selectors and is safe to retry for the same exact run ID.

The supervisor builds and runs Next.js in local production mode and records the
mode, hardware, runtime, Supabase mode, cohort mix, warm/cold state, RPS,
p50/p75/p95/p99, failure ratio, response bytes, integrity results, and cleanup
outcome. Local persistent-Node results do not represent Vercel's instance
lifecycle, autoscaling, cold starts, regional network path, or platform limits
and must not be reported as hosted or production capacity.

The supervisor obtains local Supabase connection values from
`npm run supabase -- status -o env` without trusting `.env.local`, builds the
production app, writes aggregate evidence under
`load-tests/.runs/<run-id>/`, and runs post-load integrity, the same ownership
proof exposed by `npm run smoke:rls`, artifact inspection, and exact cleanup
automatically. A database reset is not required for Ticket 064 and must not be
used as fixture cleanup.

## Local mutation, contention, and operator load lifecycle

Ticket 065 remains local-only and uses the same supervised exact-account
lifecycle. Install and verify the pinned harness first, then select one
independent command:

```bash
npm run load:mutation:smoke
npm run load:mutation:baseline
npm run load:mutation:ramp
npm run load:mutation:spike
npm run load:mutation:soak
npm run load:mutation:breakpoint
npm run load:mutation:timezone
npm run load:mutation:contention
npm run load:mutation:operator
npm run load:mutation:full
```

The default mixed task-selection declaration is 65% protected/export GET-read
tasks and 35% rendered Server Action mutation tasks; reports record the
achieved HTTP ratio after preparation and verification reads. The
representative calibration and mixed stages use the declared 2–5-second think
time, which must appear in both declaration and summary evidence. `timezone`
is a separately tagged, low-frequency changed-timezone profile; `contention`
coordinates two ordinary sessions on the same synthetic occurrence; and
`operator` is the only profile that overlaps protected occurrence/reminder
processing. The supervisor keeps the process secret outside Locust and directs
synthetic email sends only to its loopback fake Sequenzy server. It creates no
active push subscription and must never contact real Sequenzy, Web Push,
OAuth, or another provider.

The Daily tracker owns a dedicated past Needs decision fixture. It completes
that row and clears it back to Unresolved through the selected behavior/day
review's bounded 90-day server-rendered occurrence actions. Separate Timeline
reads and integrity checks retain the Needs decision derivation evidence. The
associated due/past evidence must reconcile seven nonnegative integer fields:
`tracked_occurrences > 0`,
`tracked_deliveries === tracked_occurrences`,
`exercised_occurrences <= tracked_occurrences`,
`clear_events >= exercised_occurrences`,
`unresolved_occurrences === tracked_occurrences`,
`cancelled_deliveries === exercised_occurrences`, and
`reactivated_deliveries === 0`. `exercised_occurrences` counts unique tracked
rows while `clear_events` counts every Clear, so repeated clears may make the
event count larger; both counts must be zero or nonzero together. Suites that
complete `smoke-1` or `mixed-calibration-1` require positive final exercise.
Standalone changed-timezone and contention suites require zero exercise,
Clear, and cancellation counts because they do not execute this path.
Definition-history integrity allows at most five seconds of absolute positive
or negative clock skew and requires nondecreasing revision timestamps.

Before changed-timezone traffic, the supervisor privately fingerprints every
then-past or then-resolved occurrence, including rows resolved by earlier
stages, and requires exact aggregate reconciliation afterward. Before any
protected operator mutation and before every operator request, the local Auth,
profile, sync-owner, and reminder-owner sets must be isolated to the exact run.
The operator plan reserves one non-Locust identity and must causally prove its
private stale state became a newer fresh horizon after occurrence sync.
Retained evidence contains counts only.

Zero **real-provider** sends are permitted. The operator profile intentionally
sends bounded synthetic deliveries to the loopback fake provider; those fake
sends are expected and must reconcile. Non-operator suites require zero
fake-provider requests.

Capacity-oriented mutation sequences establish their latency reference with
one three-minute `mixed_calibration` user. That composite user exposes the
same 100-point task-selection weights as the ordinary Daily tracker, Behavior
maintainer, reflective reviewer, and exporter roles, but it is still one
synthetic identity and a small request sample. Its aggregate p95 is therefore
only a coarse, provisional task-mix reference. The two-times p95 rule is a
local stop/go gate for the same supervised run; it is not a regression
threshold, service-level objective, hosted-capacity estimate, or substitute
for the full cohort and stable-name coverage gates.

Interpret ramp, spike, and breakpoint outcomes without weakening safety:

- A ramp stage that breaches only the exact calibrated-p95 gate is recorded
  with `plateau_passed: false` and
  `recorded_ramp_latency_breach: true`. It forces an integrity checkpoint but
  does not skip a later ramp: all 10/25/50/100-user plateaus execute.
- An unexpected request-failure ratio or any semantic, safety, `5xx`,
  exception, resource, runtime, duration/user, or ceiling failure is fatal.
  It is never converted into a recorded ramp latency breach.
- Breakpoint remains bounded: its first nominal performance failure may be
  retained as a non-passing terminal boundary and skip later breakpoint
  plateaus after the required integrity checkpoint.
- A p95-only breach during `spike-hold-100` may be recorded as expected stress.
  The spike baseline, spike recovery, unexpected failures, `5xx` responses,
  exceptions, resource or ceiling breaches, and every semantic or safety
  failure remain fatal. Require both the primary `spike-recovery-10` gate and
  the distinct `spike-recovery-comparison` gate; the latter records the
  mandatory latency and failure-ratio return to within 10% of the baseline.
- Before the supervisor continues from a ramp latency breach, expected
  breakpoint terminal, or expected stress result, it must run an immediate
  mutation-integrity checkpoint.
  Any violation aborts the suite. Later independent groups do not convert the
  terminal stage into a passing plateau.
- `soak-25` requires all four same-run ramp plateaus and a passing ramp-25.
  It must be strictly below the lowest integrity-clean recorded ramp latency
  boundary; when no ramp boundary was observed, a passing plateau strictly
  above 25 users supplies the boundary. The standalone soak command includes
  calibration, all four ramps, and the 60-minute soak. Final reconciliation
  also checks the later breakpoint boundary.

The soak's app-memory gate uses retained monotonic five-second observations,
not a cold first sample and one hot terminal sample. It compares the median of
the warmed `[5 minutes, 10 minutes)` window with the median of the final five
minutes. Each window requires at least 50 valid app-RSS samples, boundary
coverage within 15 seconds, and no gap over 15 seconds. The terminal median may
grow by no more than the larger of 128 MiB or 25% of the warmed median.
Invalid or incomplete raw evidence fails closed, the instantaneous 4 GiB
process ceilings remain unchanged, and the exact-run checker independently
recomputes the window result. This is a bounded-growth assertion for the
declared workload, not a general memory-leak diagnosis.

Never combine a calibration, plateau, integrity checkpoint, or cleanup result
from different run IDs. Report capacity as the highest executed
`plateau_passed` user count and its achieved requests per second, together with
the first terminal boundary when one exists. If no complete run passes all
selected profiles, final integrity, local RLS smoke, fake-provider
reconciliation, artifact inspection, and exact cleanup, report no Ticket 065
capacity result.

After an authoritative ramp or full run finishes, audit the exact retained
evidence independently:

```bash
npm run load:mutation:evidence:check -- --run-id '<exact-run-id>'
```

This checker recomputes the canonical suite/stage contract, exact report
schemas, artifact inventory and digests, raw CSV/HTML/semantic totals, history
and RPS evidence, resources, integrity and due/past gates, provider/RLS
outcomes, sanitization, and exact cleanup. Both the supervised lifecycle and
the exact-run checker must pass; never edit or merge run directories to obtain
acceptance.

Use `npm run load:mutation:full` only when roughly three hours of uninterrupted
local machine time is available. Every mutation command builds the local
production app, creates a new exact run, runs integrity and RLS gates, stops
its local fake provider, and cleans up in `finally`. The first `SIGINT`,
`SIGTERM`, or `SIGHUP` is cooperative: it stops new stages and active Locust
traffic while allowing integrity, RLS, provider shutdown, artifact inspection,
exact cleanup, and `completion.json` to finish. A missing completion marker
means the lifecycle is incomplete and requires manual exact-run recovery. Do
not invoke raw Locust, run profiles in parallel, substitute a hosted target,
or tune ceilings during an evidence run.

Generic HTTP connection resets or refusals against the local app count as
ordinary request failures; they do not satisfy the repeated database-refusal
gate without explicit database context or an unambiguous database-capacity
message. A runtime-guard abort retains exactly one sanitized initiating reason
in the existing Locust exceptions CSV and then shuts down once. Any exception
row remains a failed stage.

Run the full sequence on an otherwise quiet machine. Host load is part of the
measured system, and a broad latency increase across unrelated request names
can indicate shared-host contention, but aggregate host load does not prove
which process caused it. Treat such a failed run as exploratory: preserve its
sanitized evidence, finish exact cleanup, stop unrelated builds or local load,
and retry from a new exact run with unchanged source, profiles, and gates.
Never raise a ceiling or reuse the earlier calibration to make a retry pass.
If the boundary repeats under controlled quiet conditions, treat it as product
or local-stack evidence rather than dismissing it as contamination.

## Ticket 066 hosted preflight

Ticket 066 hosted traffic is blocked. The repository has no dedicated Cadence
Vercel staging project or separate Supabase staging project. Vercel Enterprise
status and approval are not documented. The owner has not supplied the exact
hostname, authorization reference, approved traffic window and source IPs,
cost ceiling, or monitoring retention.

The static command below validates one owner-approved stage only:

```bash
chmod 600 load-tests/.hosted/ticket-066-stage.json
npm run load:hosted:preflight -- --manifest load-tests/.hosted/ticket-066-stage.json
```

The manifest must be a regular non-symlink file with owner-only permissions.
A repository-local manifest must live under ignored `load-tests/.hosted/`.
The validator rejects production target reuse, non-Enterprise Vercel plans,
missing approval, unsafe data/provider posture, expired windows, unmonitored
runs, broad or invalid sources, automatic stage advance, dirty or mismatched
commits, and missing hosted safety checks. Its output omits hostnames, project
refs, source IPs, and approval references.

The command performs no network request and starts no Locust worker. Do not
create a hosted target, deploy migrations, contact provider support, or run
hosted traffic without the owner's separate authorization. Follow the hosted
section in `docs/LOAD_TESTING_RUNBOOK.md` after every blocker is resolved.

For an interrupted run whose automatic cleanup failed—or whose
`completion.json` is missing—preserve the private exact run metadata and use
mutation mode for inspection and exact cleanup:

```bash
npm run load:integrity -- --run-id "$CADENCE_LOAD_RUN_ID" --mutation
npm run load:cleanup -- --run-id "$CADENCE_LOAD_RUN_ID" --mutation --dry-run
npm run load:cleanup -- --run-id "$CADENCE_LOAD_RUN_ID" --confirm-run-id "$CADENCE_LOAD_RUN_ID" --mutation
```

Never broaden the selector beyond the exact run ID or use a database reset as
recovery. The complete profile durations, fake-provider lifecycle, abort
gates, report inventory, and interrupted-run procedure are in
`docs/LOAD_TESTING_RUNBOOK.md`. Local mutation results describe only the
recorded machine, persistent-Node build, local Supabase Docker stack, synthetic
fixtures, and fake provider; they are not hosted or production capacity.

## Ticket 067 launch cost and surge operations

Ticket 067 local guardrails are implemented. Provider controls and the human
drill remain blocked until the owner approves exact budgets, contacts,
availability tradeoffs, and provider targets. Repository work does not
authorize provider-setting changes, production firewall publication, project
pauses, plan changes, purchases, limit increases, or real incident actions.

### Private cost policy and preflight

Keep the owner policy under the ignored `.launch-safety/` directory. Use a
regular, non-symlink JSON file with owner-only permissions. Do not store account
identifiers, invoice data, payment data, recipient addresses, project refs,
credentials, raw provider exports, or alert payloads in the policy.

The policy schema requires:

- normal monthly budget plus warning, urgent, emergency, and maximum unplanned
  USD thresholds in strictly increasing order;
- maximum accepted hard-stop outage and enabled-or-declined hard-stop posture;
- billing owner, incident owner, alert acknowledgement, emergency control,
  pause, limit-change, and resume roles;
- tested primary and backup notification roles and channel kinds;
- one sanitized plan and cost inventory for Vercel app, Vercel marketing,
  Supabase, Sequenzy, domain, and monitoring;
- fixed or metered dimensions, quotas, overage path, baseline, control coverage,
  and coverage gap for every provider;
- verified Vercel notifications, hard-limit posture, log-only firewall evidence,
  and OAuth/Cron tests;
- verified Supabase Spend Cap posture plus covered and uncovered item records;
- a verified Sequenzy account limit, alert, or manual review control;
- request, error, latency, function, database, Auth, egress, reminder backlog,
  and provider-send monitoring signals;
- separate anonymous, OAuth, authenticated-read, export, push-write, Server
  Action, reminder-process, and occurrence-sync controls;
- Levels 0 through 3 with entry, exit, owner, response time, evidence,
  prohibited actions, rollback, and escalation;
- explicit acknowledgement that alerts can lag, usage can already be incurred,
  provider controls can fail, and some billing categories remain uncovered.

Run the fail-closed static check:

```bash
mkdir -p .launch-safety
chmod 600 .launch-safety/ticket-067-policy.json
npm run launch:cost:preflight -- --manifest .launch-safety/ticket-067-policy.json
```

The command reads no payment data and makes no network request. It prints only
provider, monitoring, traffic-control counts, and the hard-stop posture. It
rejects stale reviews, missing owners, unordered thresholds, untested contacts,
missing costs, missing rollback, unacknowledged gaps, unsafe files, and private
recipient or credential fields.

### Runtime controls

The following server-only variables default to empty and preserve normal
product behavior:

| Variable | Stops | Preserves |
|---|---|---|
| `CADENCE_DISABLE_EMAIL_SENDS=1` | Sequenzy sends before due email rows are read or claimed | Browser push, pending email rows, Timeline, status, Notes, exports |
| `CADENCE_DISABLE_BROWSER_PUSH_SENDS=1` | Web Push sends before due push rows are read or claimed | Email, pending push rows, core tracking |
| `CADENCE_DISABLE_REMINDER_BATCHES=1` | The protected reminder batch before any channel work | Pending rows and all ordinary app access |
| `CADENCE_DISABLE_OCCURRENCE_SYNC_BATCHES=1` | The protected background occurrence batch before writes | On-demand owner-scoped freshness and ordinary decisions |
| `CADENCE_DISABLE_EXPORT_DOWNLOADS=1` | Structured export downloads before export reads | Export page review, Timeline, status, Notes, account access |

Set `CADENCE_LAUNCH_BREAKER_REASON_CODE` to one of `abuse`,
`application_regression`, `cost_surge`, `operator_drill`, or
`provider_incident`. Unknown text becomes `unspecified` and never enters logs.
Monitoring records only breaker, open state, reason, and aggregate blocked
invocation count.

Production environment changes and the deployment needed to apply them require
exact owner authorization. Capture the prior values and deployment first.
Enable only the proven cost source. Verify the new deployment, the expected
`503` plus `Retry-After` route response where applicable, privacy-safe breaker
event, unaffected core tracking, and unchanged queue counts. Roll back by
restoring the prior variables, deploying, and repeating those checks.

Structured exports also use an atomic Supabase-backed limit of six downloads
per account per 60 seconds across formats and application instances. The limit
returns stable `429` and `Retry-After` guidance before export reads. It does not
use IP address, block shared networks, or affect the Export page.

After a clean local migration reset, verify the database-owned decision and
direct-write boundary with:

```bash
npm run smoke:launch-rate-limit:local
```

The command uses only local Supabase. It permits six calls, rejects the seventh,
proves authenticated clients cannot overwrite the counter, and rolls back the
test account and counter.

### Monitoring lens

Use sanitized aggregates only:

- Vercel requests, statuses, latency, function invocations, duration, memory,
  CPU, transfer, builds, monitoring usage, and firewall actions;
- Supabase compute, disk, egress, Auth MAU, logs, database health, connections,
  project count, backups, and add-ons;
- Cadence `5xx`, `429`, breaker events, export-limit events, occurrence-sync
  results, reminder checked/claimed/sent/failed/cancelled counts, and queue age;
- Sequenzy plan allowance, current-cycle aggregate sends, provider failures,
  and account throttle or alert state;
- domain renewal and monitoring or alerting fixed costs.

Do not capture behavior titles, descriptions, Notes, account emails, user IDs,
push endpoints, request bodies, bundle contents, provider payloads, secrets, or
raw recipient data.

### Four-level response protocol

Level 0 — normal:

- Enter below the private warning threshold with stable usage and latency.
- Review usage and notification delivery daily during launch, then weekly.
- Test primary and backup alert delivery monthly without generating billable
  stress traffic.
- Exit when any warning threshold or anomaly is sustained.
- Owner: the private billing and incident owner roles.

Level 1 — warning:

- Enter at the private warning USD threshold or a sustained unexpected usage,
  error, latency, queue, Auth, egress, or send increase.
- Acknowledge within 30 minutes. Identify source, route, method, provider,
  deployment, and expected launch traffic.
- Increase observation. Do not change limits or availability without evidence.
- Exit after two stable observation windows below the entry signal.
- Escalate to Level 2 at the urgent threshold or proven cost amplification.

Level 2 — urgent:

- Enter at the private urgent USD threshold, proven abusive traffic, export
  amplification, reminder backlog, provider-send surge, or application
  regression that accelerates cost.
- Acknowledge within 15 minutes. Enable only the proven scoped breaker or a
  previously reviewed traffic control.
- Preserve Timeline decisions, Auth, RLS, audit history, and pending queues when
  safe.
- Exit after cost acceleration stops and two observation windows stabilize.
- Escalate at the emergency threshold, control failure, integrity concern, or
  unacceptable queue growth.

Level 3 — emergency:

- Enter at the private emergency threshold, maximum unplanned exposure risk,
  active attack beyond scoped controls, provider restriction, or integrity
  threat.
- Acknowledge within five minutes. The authorized owner decides on Attack
  Challenge Mode, provider support, or the approved spend hard stop.
- A Vercel hard stop can pause every production project on the team. A Supabase
  restriction can affect organization services. Confirm blast radius first.
- Publish user communication when availability changes.
- Exit only through the safe-resumption gate below.

Every level prohibits automatic plan upgrades, add-on purchases, compute
resizes, budget increases, unreviewed firewall publication, production data
inspection, broad IP blocking, secret disclosure, and silent mutation loss.

### Safe resumption

One named owner records the go decision only after:

1. cost stops accelerating;
2. traffic, error rate, latency, function, database, Auth, and egress signals
   stabilize;
3. pending, claimed, failed, and cancelled reminder queues are understood;
4. `npm run smoke:rls`, migration congruence, integrity checks, and one ordinary
   authenticated flow pass against the intended target;
5. OAuth callback, Vercel Cron, ordinary status and Note changes, exports below
   the limit, accessibility, and shared-network cases remain usable;
6. rollback steps and the next observation window are assigned.

Resume one scoped subsystem at a time. Start with one bounded request or batch.
Do not unpause unrelated Vercel projects automatically. Increasing a Vercel
spend amount does not resume paused projects.

### Drill

Run the zero-network technical tabletop at any time:

```bash
npm run launch:surge:drill -- --synthetic
```

It simulates a legitimate spike, anonymous abuse, export amplification,
reminder backlog, provider-send surge, hard-stop decision, and false-positive
throttle. Synthetic success proves only state-machine coverage. It does not
prove current provider settings, human alert delivery, owner response, or
production capacity.

After the private policy passes, run the same drill against that policy:

```bash
npm run launch:surge:drill -- --manifest .launch-safety/ticket-067-policy.json
```

Complete a non-production human tabletop with the billing owner and backup.
Record only sanitized outcomes under `docs/qa/launch-safety/`. Do not generate
billable load to test alerts or hard stops.

## Clean-session onboarding QA

Use the dev/test-only login route when a clean browser session needs to exercise
first-run onboarding but Google account access would block the test.

Enable it locally:

```bash
CADENCE_ENABLE_TEST_LOGIN=1
```

If the local app points at a hosted Supabase project, also set:

```bash
CADENCE_ALLOW_HOSTED_TEST_LOGIN=1
```

Safety gates:

- `/auth/test-login` is blocked unless `CADENCE_ENABLE_TEST_LOGIN=1`.
- The route is blocked when `NODE_ENV=production` or `VERCEL_ENV=production`.
- The route only accepts localhost request hosts.
- Hosted Supabase projects require `CADENCE_ALLOW_HOSTED_TEST_LOGIN=1`.
- The service-role key is used only server-side to create a temporary confirmed
  Supabase Auth user. The route then signs in through the ordinary Supabase
  password flow so app code still uses normal auth cookies and RLS.
- One app process reserves at most 10 successful temporary-user creations.
  Creation and successful failure-cleanup release unused reservations. Restart
  the local app after the quota is reached; the quota is intentionally not a
  distributed production control and does not weaken the environment gates.

Clean up stale temporary test users:

```bash
npm run test-login:cleanup
```

The cleanup command deletes only `cadence-test-*@example.invalid` users older
than `CADENCE_TEST_LOGIN_MAX_AGE_HOURS`, defaulting to 24 hours, and reports
counts without printing emails, ids, or auth responses.

Run cleanup after every clean-session QA run. While test login remains enabled,
also run cleanup at least once per day. Disable test login when QA ends. Cleanup
removes database users; restarting the local app resets the separate per-process
creation quota.

## Auth route protection

Protected-route proxy gating uses Supabase Auth `getClaims()` to validate the
cookie-backed access token and refresh cookies when needed. This follows the
current Supabase SSR guidance for page protection and avoids using
`getSession()` in server code.

The proxy matcher also includes `/api/export/*` so long-running authenticated
download clients receive refreshed Supabase cookies. Export APIs are not
treated as protected app-screen routes: an anonymous or invalid export request
continues to its route handler and returns the documented JSON `401` response
instead of redirecting to Login.

Keep strict `getUser()` lookups where the app needs the full Auth user record
or security-sensitive account actions. Ordinary app-route user id and account
label reads should use verified Supabase Auth claims through the shared current
user helper; RLS-backed database access still runs through the ordinary
authenticated Supabase client.

Authenticated sessions can preview the login screen without ending the session
at `/login?preview=1`. The explicit preview URL works in every environment. The
app shell links to it only outside production, so it does not become a normal
production navigation destination. Requests to `/login` without `preview=1`
keep the standard authenticated redirect behavior.

## Source-of-truth order

1. `AGENTS.md`: operating rules and architecture constraints.
2. `STATUS.md`: current implementation state and handoff notes.
3. This runbook plus provider workflow docs.
4. Product docs under `docs/`.
5. Tests and implementation.
6. Current user prompt, when it intentionally changes scope.

If docs conflict, report and fix the conflict before implementing product code.

## Provider workflows

- Supabase: `docs/SUPABASE_WORKFLOW.md`
- Sequenzy: `docs/SEQUENZY_WORKFLOW.md`
- Vercel: `docs/VERCEL_WORKFLOW.md`

## AgentMail Test Inboxes

AgentMail is the repo-standard test inbox layer for agent-led email QA. Use it
to create disposable or task-scoped inboxes for login, auth email,
transactional reminder, SMTP/provider, and app-runtime email testing. It is not
the production sender for auth email or app-runtime communication.

The CLI is repo-scoped and loads `AGENTMAIL_API_KEY` from `.env.local` when the
process environment does not already provide it. Use the project wrapper rather
than a global AgentMail install:

```bash
npm run agentmail:version
npm run agentmail -- --help
npm run agentmail -- inboxes list --limit 20 --format json
npm run agentmail -- inboxes create --display-name "Cadence QA Login" --username cadence-qa-login --domain agentmail.to --format json
npm run agentmail -- inboxes:messages list --inbox-id inb_xxx --limit 10 --format json
npm run agentmail -- inboxes:messages get --inbox-id inb_xxx --message-id msg_xxx --format json
npm run agentmail -- inboxes:threads list --inbox-id inb_xxx --limit 10 --format json
```

General QA loop:

1. Create or reuse an AgentMail inbox and keep the inbox ID plus generated email
   address in private task notes.
2. Use the AgentMail email address as the test recipient in the app flow.
3. Trigger the app flow through the owning auth, notification, or communication
   path.
4. Poll messages or threads, then retrieve the relevant message by ID.
5. Extract only the needed delivery evidence, such as subject, headers, or a
   reduced verification result.
6. Redact email addresses, raw tokens, links, message bodies, names, and
   provider identifiers before adding findings to reports.
7. For production-readiness claims, verify the actual owning email provider and
   app outbox too. AgentMail proves inbox receipt for a test recipient; it does
   not prove real customer delivery configuration.

AgentMail test inbox access belongs to service-access and operations work. It
must not become product, account, notification, export, or provider truth.
Auth and notification behavior still route through their owning contracts.

## Public-product operations

Before broad public launch, scope and verify:

- many-independent-user RLS smoke tests,
- account deletion and export/account portability,
- basic abuse protections and validation,
- monitoring/error reporting without sensitive behavior payloads,
- Terms of Service, Privacy Policy, and privacy/trust content,
- owner mapping for Vercel, Supabase, Sequenzy, VAPID, and cron secrets.

Implemented baseline:

- static RLS policy registry test for user-owned tables,
- Settings account deletion with export acknowledgement and typed confirmation,
- public `/terms`, `/privacy`, and `/trust` routes,
- auth-failure rate limiting for push subscription and reminder processing
  routes,
- bounded reminder processing batch size,
- protected occurrence horizon sync at `/api/occurrences/sync`, scheduled daily
  through Vercel Cron and guarded by `REMINDER_PROCESS_SECRET` or `CRON_SECRET`.
- behavior create/edit/archive/restore marks occurrence sync state stale and
  defers heavy occurrence/reminder repair to the next freshness-aware read
  route or the protected sync process; Settings timezone changes still sync
  immediately because timezone, active behavior schedules, and future
  unresolved occurrences must change together.

Completed public-launch sign-off:

- Ticket 034 fixed the restore-apply readiness defect, verified hosted schema
  congruence, passed hosted multi-user RLS smoke QA, audited hosted
  Auth/provider settings, and recorded sanitized results in `STATUS.md`.

Remaining owner decisions before broader launch:

- decide whether to disable hosted email/password authentication, because the
  product UI exposes Google login only;
- decide whether localhost callback URLs remain allow-listed for development;
- treat CAPTCHA and leaked-password protection as conditional follow-up based
  on the final Google-only provider posture and accepted launch risk.

Implemented follow-up:

- first-run onboarding for behavior creation, notification permission, optional
  import, and timezone through a dismissible Timeline setup pop-up,
- privacy-safe monitoring/error reporting through structured runtime logs that
  avoid sensitive behavior payloads.

## Gated schedule-integrity repair deployment

Ticket 060's schedule repair is a normal git-tracked Supabase migration, but it
mutates existing product rows. Complete the following sequence before and
after hosted deployment:

1. Run `npm run supabase -- db reset` and
   `npm run smoke:schedule-integrity:local`. The smoke is rollback-only and
   covers idempotent repair, preserved statuses, atomic form create/update,
   stale-write refusal, cross-owner refusal, and rollback after a forced slot
   failure.
2. Obtain explicit owner authorization for the linked hosted project, create a
   fresh user-owned export/backup, and compare local and hosted migration
   history. Do not use Dashboard SQL or Table Editor repair.
3. Deploy only with `npm run supabase -- db push`.
4. Run the protected occurrence sync/reminder-planning path once for affected
   stale accounts. The migration itself never creates past reminders.
5. Record only aggregate proof: active empty schedules, orphan/cross-owner
   slots, repaired slot/occurrence counts, duplicate counts, past reminder
   counts, and freshness outcome. Do not record user, behavior, schedule,
   occurrence, provider, email, or note identifiers.
6. Browser-QA Timeline, Behaviors, Needs decision, and behavior review without
   changing preserved resolved occurrences. Recheck migration congruence and
   the Supabase security advisor afterward.

Marketing cookies and analytics are not launch scope, but any future addition
should include consent and documentation updates.

## Marketing site operations

The public marketing site lives in `apps/marketing` as a sibling Astro app. It
does not run inside the authenticated Next.js app shell.

Project-local commands:

```bash
npm run marketing:dev
npm run marketing:build
npm run marketing:check
npm run marketing:preview
```

`npm run marketing:build` runs `astro check`, builds the static site, and
generates the sanitized example BehaviorLog bundle under the marketing public
directory before Astro copies assets into `dist`.

`npm run marketing:check` runs `astro check` and verifies the built agent
readability outputs in `apps/marketing/dist`: Markdown mirrors, `llms.txt`,
`llms-full.txt`, route manifest, sitemap, robots, metadata markers, and the
example bundle path.

The current marketing crawl policy is recorded in `docs/CRAWL_POLICY.md`.
Update that document before changing robots or Content-Signal behavior.

Use those files instead of searching repeatedly for provider setup.

## Design workflow

For UI/design tasks, use the project-local impeccable workflow:

```bash
node .agents/skills/impeccable/scripts/context.mjs
```

Then read `.agents/skills/impeccable/reference/product.md` for app UI guidance. If a specific impeccable command is relevant, read its reference before implementing.

`DESIGN.md` is seeded. After real UI exists beyond the scaffold, run the impeccable `document` workflow or otherwise update `DESIGN.md` from actual code rather than from intentions.

The local design-system bench is also the cross-surface catalog surface:

- `design-system.surfaces.json` owns the canonical surface list, component
  families, shared contracts, and per-surface implementation mappings.
- `design-system.manifest.json` and `design-system.usage.json` remain the
  current strict live inventory for the authenticated Next.js web app.
- `/design-system` renders foundations, global surface/component-family
  mappings, and fixture-backed web-app trace cards.

When changing reusable UI, tokens, surface contracts, component-family
inventory, or bench mapping, update the relevant design-system files and run:

```bash
npm run design-system:check
```

## Interaction registry

`interaction-registry.json` is the canonical machine-readable inventory of
implemented user interaction intents across the marketing site, public
account-information surfaces, login, and authenticated app. Its contract and
maintenance rules live in `docs/INTERACTION_REGISTRY.md` and
`interaction-registry.schema.json`.

Update the registry whenever a user-facing interaction is added, removed,
renamed, moved to another route, gated differently, or given a materially
different side effect or test-coverage posture. New interactive UI source files
must also be added to the registry's `source_inventory`.

Run:

```bash
npm run interactions:check
```

The interaction validator is also invoked from `npm run agents:check`, so new
interactive source files cannot silently bypass the inventory.

## Public repository release audit

Ticket 098 is an evidence-only gate. It never changes repository visibility,
rewrites history, rotates credentials, or deploys application or database
changes.

Run the local source and database checks with:

```bash
npm run public-source:check
npm run public-database:audit:local
npm run smoke:rls:local
```

Run `public-source:check` in addition to a genuine history-aware secret scanner
across every Git ref. Keep raw scanner reports in a private temporary directory.
Never print or commit matches, fingerprints, provider identifiers, or private
repository metadata.

For the browser-boundary proof, build both applications with unique synthetic
values for every documented public setting and server-only credential setting.
Pass only the synthetic value lists to `public-artifacts:check` through
`CADENCE_TICKET_098_PUBLIC_CANARIES` and
`CADENCE_TICKET_098_SERVER_CANARIES`. The public list maps each value to its
single allowed artifact root. The check fails if a server value appears, a
public value crosses surfaces, or a declared public value is absent from its
allowed build.

Record only sanitized aggregate evidence in
`docs/PUBLIC_REPOSITORY_RELEASE.md`. A pass applies only to the exact reviewed
commit, deployed application version, hosted migration boundary, and GitHub
metadata snapshot. Any unresolved high or critical production dependency,
undeployed security fix, real credential, cross-account path, or incomplete
surface review keeps the gate at fail.

## Source license and private security reporting

Cadence source code, repository documentation, and synthetic samples use the
root MIT `LICENSE`, with Identity Scaffolding LLC as the 2026 copyright holder.
`README.md` owns the exact split-scope statement. Tracked binary non-code assets
remain outside that grant pending provenance review. Cadence names and logos
remain reserved as trademarks; the MIT license is not trademark permission.

`THIRD_PARTY_NOTICES.md` preserves the pinned BehaviorLog validator's upstream
MIT notice. Do not remove or replace that notice when updating the snapshot.
Recheck the upstream license at the new pinned commit during any snapshot
update.

`SECURITY.md` owns the public disclosure contract. The primary private route is
`security@identityscaffolding.com`. GitHub private vulnerability reporting is a
secondary route only after Ticket 100 enables it. Never direct reporters to a
public issue for credentials, user data, behavioral content, or an unpatched
vulnerability.

The repository owner monitors the inbox. The owner authorized exactly one
harmless synthetic test email to the approved address. The sender accepted and
retained that one message with sent status on 2026-08-25. Recipient-side
inspection confirmed receipt at the approved mailbox. The message landed in the
junk folder. Monitor junk and quarantine folders or maintain appropriate
allowlisting so filtered private reports receive review. Do not repeat the send.
Record only delivery and acknowledgement outcome; never commit screenshots,
message content, message headers, sender details, recipient internals, or
provider identifiers.

Self-hosters own secret storage, provider accounts, access controls, upgrades,
backups, monitoring, and incident response. Browser configuration may include
documented `NEXT_PUBLIC_` values and the VAPID public key. Service-role keys,
OAuth secrets, provider keys, VAPID private keys, process secrets, database
credentials, and provider tokens remain server-only.

## Secrets and local files

- Never commit `.env`, `.env.local`, `.env.*.local`, CLI auth config, service-role keys, API keys, approval codes, or generated secrets.
- `.env.example` is names only plus safe default URLs.
- If a tool prints credentials, redact them in final summaries.

## Status updates

Update `STATUS.md` when a ticket starts, completes, becomes blocked, is reopened, or materially changes scope. Record verification commands with real pass/fail results.

Do not use `STATUS.md` to expand v1 product scope. Put future ideas in `docs/FUTURE_UPDATES.md` unless the user explicitly changes v1 scope.
