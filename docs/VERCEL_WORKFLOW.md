# Vercel Workflow

This repository deploys to the existing Vercel project `cadence` under team
`Emi's projects`. Do not create a duplicate Vercel project for this app.

The current Vercel project `cadence` owns the authenticated web app. The Astro
marketing site is deployed separately as the Vercel project
`cadence-marketing`, currently aliased to
`https://cadence-marketing-two.vercel.app`. Do not change production routing
casually: authenticated app routes, marketing canonical URLs, and Supabase OAuth
redirects must remain stable.

Authoritative upstream docs used for this workflow:

- Vercel deployments: `https://vercel.com/docs/deployments/overview`
- Vercel Git integration: `https://vercel.com/docs/git`
- Vercel environment variables: `https://vercel.com/docs/environment-variables`
- Vercel Cron Jobs: `https://vercel.com/docs/cron-jobs`

The root `package.json` requires Node.js 24.x. Keep local release verification,
GitHub Actions, and both Vercel projects on that major so Next.js and Astro
build under the deployed runtime.

## Current Project

Verified on 2026-06-08 with the Vercel plugin:

- Project: `cadence`
- Team slug: `emis-projects-4c886aeb`
- Team ID: `team_BxWfRYU1gqrl6Ba6t7Vm3wp1`
- Project ID: `prj_9tZKRXZ6IdT56ZLKVSmoJH5AAYhs`
- Framework: Next.js
- Repository: `emixd12/habit-tracking-app`
- Production branch: `main`
- Repository root/build entrypoint: `.`
- Node runtime setting: `24.x`
- Build command observed in production logs: `npm run build`
- Canonical production URL: `https://cadence-blush-three.vercel.app`
- Secondary production alias: `https://cadence-emis-projects-4c886aeb.vercel.app`

The production deployment observed during Ticket 013 was
`dpl_3t9JNdQxUEZsR5MnYpVumE4Tc4aJ`, ready at commit
`64fa1045492b8f0fc3a89babd470a043174b5227`.

## Marketing Project

The public Astro marketing site is deployed separately:

- Project: `cadence-marketing`
- Current production alias: `https://cadence-marketing-two.vercel.app`
- Git repository: `emixd12/habit-tracking-app`
- Production branch: `main`
- Workspace root: `apps/marketing`
- Build command: `npm run marketing:build`
- Node runtime setting: `24.x`
- Canonical URL source: `MARKETING_SITE_URL`

Keep this project separate from the authenticated app unless a future scoped
workspace/routing ticket changes the deployment model.

## Environment Variables

Set these in Vercel for both Production and Preview unless a preview environment
intentionally uses separate Supabase or Sequenzy resources:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CADENCE_ACCOUNT_DELETION_FAILURE_CANARY_USER_ID=
SEQUENZY_API_KEY=
SEQUENZY_REMINDER_TEMPLATE_SLUG=habit-reminder
SEQUENZY_API_URL=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
REMINDER_PROCESS_SECRET=
CRON_SECRET=
NEXT_PUBLIC_MARKETING_SITE_URL=
MARKETING_SITE_URL=
PUBLIC_CADENCE_APP_URL=
CADENCE_PERF_LOG=0
CADENCE_TRUST_MARKETING_DEPLOYMENT_ID=
```

Rules:

- `NEXT_PUBLIC_SITE_URL` should be the canonical production URL in Production.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is preferred. Keep
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` only for legacy Supabase projects that still
  need it.
- `SUPABASE_SERVICE_ROLE_KEY`,
  `CADENCE_ACCOUNT_DELETION_FAILURE_CANARY_USER_ID`, `SEQUENZY_API_KEY`,
  `VAPID_PRIVATE_KEY`, `REMINDER_PROCESS_SECRET`, and `CRON_SECRET` are
  server-only. Never prefix them with `NEXT_PUBLIC_`.
- Keep `CADENCE_ACCOUNT_DELETION_FAILURE_CANARY_USER_ID` unset except during
  the exact authorization-gated Ticket 100 procedure in `docs/OPERATIONS.md`.
- For Vercel Cron, set `CRON_SECRET` to the same value as
  `REMINDER_PROCESS_SECRET` unless there is a deliberate secret rotation plan.
- `SEQUENZY_API_URL` can be omitted when using the default
  `https://api.sequenzy.com`.
- `NEXT_PUBLIC_MARKETING_SITE_URL` belongs to the authenticated app project and
  should point at the matching marketing deployment.
- `MARKETING_SITE_URL` and `PUBLIC_CADENCE_APP_URL` belong to the Astro
  marketing project. Preview values must point at the intended Preview targets;
  omission falls back to Production domains.
- `CADENCE_PERF_LOG=1` is an optional short-term Production sampling flag for
  privacy-safe server timing spans. It is not a secret, but it should be enabled
  deliberately and reviewed through sanitized Vercel runtime logs.
- `CADENCE_TRUST_MARKETING_DEPLOYMENT_ID` belongs to the application project
  and names the current Ready marketing deployment. The app combines it with
  Vercel's source-commit and application-deployment system variables before a
  Trust check can remain Passed.

## Supabase Auth

In Supabase Auth URL configuration, keep the production site URL and redirect
URL aligned with the Vercel production alias:

```text
Site URL: https://cadence-blush-three.vercel.app
Redirect URL: https://cadence-blush-three.vercel.app/auth/callback
```

Only add preview callback URLs when preview OAuth QA is intentionally supported.
Do not use wildcard preview redirects for this single-player public app unless
the Supabase project owner accepts that operational tradeoff.

## Cron Processing

`vercel.json` owns both scheduled triggers:

```json
{
  "crons": [
    {
      "path": "/api/reminders/process",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/occurrences/sync",
      "schedule": "5 0 * * *"
    }
  ]
}
```

Vercel Cron calls the route with `GET`. The route also supports protected
manual `POST` calls. Both paths require an `Authorization: Bearer ...` header
or the manual `x-reminder-process-secret` header. The accepted secret can be
either `REMINDER_PROCESS_SECRET` or `CRON_SECRET`.

Hourly reminder processing keeps sends reasonably close to their planned
`scheduled_send_at`. Daily occurrence processing runs at 00:05 UTC and extends
each bounded account batch's generated horizon using the account timezone.
Both routes use the same protected GET/manual POST contract. If the Vercel plan
cannot run the declared schedules, switch to a plan that supports them or
document an external scheduler that calls the same routes with the same bearer
secret.

Production verification on 2026-06-19 found hourly production
`GET /api/reminders/process` invocations returning 200 for the prior 24 hours,
from 2026-06-18T01:00:03Z through 2026-06-19T00:00:03Z, with no production
warning, error, or fatal runtime logs in the preceding seven days. The latest
deployment at that time became ready at 2026-06-19T00:46:32Z, after the
00:00Z cron tick, so its first post-deploy hourly tick still needed the next
cron boundary.

Manual production check, with a user-approved send plan if due email or browser
push deliveries may exist:

```bash
curl -X POST \
  -H "Authorization: Bearer $REMINDER_PROCESS_SECRET" \
  "https://cadence-blush-three.vercel.app/api/reminders/process?limit=1"
```

## Deployment

Normal production deployment is via the Git integration:

1. Push `main` to `emixd12/habit-tracking-app`.
2. Confirm the production deployment is `READY`.
3. Confirm deployment metadata points at the intended commit.
4. Inspect build logs for warnings or failures.

If using the Vercel CLI locally, link to the existing project only:

```bash
vercel link --yes --project cadence --scope emis-projects-4c886aeb
vercel deploy --prod
```

Do not commit `.vercel/project.json`; `.vercel/` is gitignored.

### Ticket 100 public-release deployment

Verified on 2026-08-25 at release commit
`cb82e0014fc12d6dbf18fb4719e102a2b5908662`:

- `cadence` deployment `dpl_FzvK2siMz4VwkCQ5hCxSTCcKa1bH` is READY.
- `cadence-marketing` deployment `dpl_DMAQ4o6u1QkqxtGC2WZ9YramCe42` is READY.
- The existing production aliases remained unchanged.
- Marketing reported no runtime error during the verification window.
- The application recorded one Node `url.parse()` deprecation warning from
  the browser-push dependency during a successful isolated send. The request
  completed and synthetic cleanup passed.
- A bounded synthetic raw HTTP deletion probe returned 500 before application
  logic because it could not invoke Next's encrypted server action. All
  temporary accounts and profiles were removed. A production browser check then
  kept an intentionally invalid deletion behind the disabled client gate; the
  account, session, and visible behavior inventory remained intact.

Those two initial checks did not exercise production account-deletion failure
recovery. The bounded canary procedure later passed on 2026-08-26 through the
deployed browser Server Action.

- Canary deployment `dpl_HFhFd4T5Z4YjbVFbzkmGTrXybvEB` was READY from reviewed
  Git tree `916eafe3ef34190b47bd4338a1ddcae52dcc4999`.
- Settings returned the recoverable error. The disposable session and records
  remained intact.
- The canary variable was removed and read back as absent.
- Clean deployment `dpl_7TUcDZSMsonnLnhte8cvwCes5gHD` was READY from the same
  tree and restored normal deletion.
- Normal deletion removed the disposable account. Auth plus all 18 user-owned
  tables reported zero remaining rows.

Ticket 100 is `complete`. The evidence retains no disposable identifier, email,
token, payload, secret, or user data.

The final check temporarily set only the bounded canary variable, then removed
it. No lasting Vercel domain, environment variable, secret, billing, plan,
project, or installed integration changed.

## Production Smoke QA

Unauthenticated checks:

- `/login` renders without server errors.
- `/timeline`, `/behaviors`, `/settings`, `/export`, and the compatibility
  `/analytics` redirect route redirect unauthenticated users to
  `/login?next=...`.
- `/api/reminders/process` rejects missing or wrong secrets.

Authenticated checks:

- Google login completes through `/auth/callback`.
- Behavior create/edit/archive still syncs occurrences.
- Timeline status marking and notes work.
- Settings shows browser notification support and can save a push subscription
  when browser permission allows it.
- Behaviors shows behavior settings plus adherence and behavior-date review.
- Export download links respond.

Check both a desktop viewport and a narrow viewport around 390px wide.

## Public launch additions

Before broad public launch, add smoke checks for:

- new-user signup through Google,
- first-run onboarding,
- account deletion,
- Terms, Privacy, and Trust public route rendering,
- export/account portability,
- rate-limit or abuse-protection behavior where implemented,
- monitoring/error-reporting capture without sensitive behavior content,
- hosted many-user RLS isolation with `npm run smoke:rls` pointed at the
  production Supabase project.

The first monitoring implementation uses privacy-safe structured runtime logs
captured by Vercel. Do not add a third-party monitoring SDK or send behavior
titles, notes, email addresses, push endpoints, request bodies, uploaded
bundles, or reminder message bodies unless a later ticket defines a privacy
model and consent posture.

## Hosted load testing

Ticket 066 may target only a dedicated, synthetic-only staging deployment.
It must never use the current public production hostname as a fallback.

Vercel's current load-testing policy permits load testing only on Enterprise
plans and requires approval before traffic starts. The approval request must
state the exact start and end time, maximum requests per second, target
hostname, source geography, source IPs, distributed or localized posture, and
Fluid Compute posture. Record the Vercel approval reference in private task
notes. Confirm the cost ceiling and available request, function duration,
invocation, memory, CPU, and cost evidence before the first request. Configure
the required log drains before the approved window when the plan needs them.

Run the repository's static gate only after the owner supplies those facts:

```bash
chmod 600 load-tests/.hosted/ticket-066-stage.json
npm run load:hosted:preflight -- --manifest load-tests/.hosted/ticket-066-stage.json
```

The manifest directory is ignored. The command prints only a sanitized
single-stage limit summary. It does not contact Vercel or start Locust. A
passing result is not provider approval and does not authorize automatic stage
advance. Review current policy again when the recorded review is more than 30
days old.

Policy reference:
<https://vercel.com/kb/guide/what-s-vercel-s-policy-regarding-load-testing-deployments>

## Launch spend and traffic controls

Vercel's Spend Management, Firewall, DDoS, and WAF pricing documentation was
rechecked on 2026-08-01. The current team plan, Spend Management setting,
threshold, notification recipients, webhook, and pause posture remain
unverified. Read-only project discovery found 14 projects in the team,
including the Cadence app and marketing projects. Store project identifiers and
the unrelated project inventory only in private operator notes.

Spend Management is currently documented for Pro teams. It applies one spend
amount per billing cycle across the team. Web and email notifications can fire
at 50%, 75%, and 100%; SMS can fire at 100%. Vercel checks spend every few
minutes, so alerts and pauses cannot prevent already-incurred usage. The spend
amount covers metered usage beyond included allocations. It does not include
seats, Marketplace integrations, or separate add-ons.

The optional hard limit pauses production deployments for every project on the
team. It returns a Vercel `503 DEPLOYMENT_PAUSED` response. Raising the amount
does not resume projects automatically; an operator must resume each project.
Because the current team has non-Cadence projects, the owner must approve this
team-wide blast radius explicitly. Do not enable a hard limit, webhook, project
pause, or resume action as part of repository implementation.

Automatic DDoS mitigation remains available on all plans. Vercel does not bill
traffic it classifies and blocks as DDoS. Successfully served traffic before
mitigation, or abusive traffic not classified as DDoS, can still incur usage.
Current May 2026 Vercel guidance says WAF-denied, challenged, or rate-limited
traffic has CDN request and transfer charges waived. Recheck the current plan
and dashboard before relying on any WAF price or feature.

### Route-control inventory

| Traffic class | Current application control | Provider-edge posture |
|---|---|---|
| Static public and legal documents | Static rendering and crawl policy | Observe bursts. Do not challenge ordinary readers or verified crawlers without evidence. |
| Google OAuth start and callback | Server route, sanitized local return path, Supabase provider controls | Observe start-route bursts. Do not apply one broad IP limit to the callback. Test Google completion before enforcement. |
| Protected app reads | Supabase Auth and RLS | Observe aggregate request, error, and latency signals. Do not broad-limit shared networks. |
| Structured export downloads | Auth, RLS, atomic six-per-minute account limit, export breaker | Log path volume only. Account-aware enforcement remains in the application. |
| Push subscription writes | Auth, validation, RLS, supplemental in-memory failed-auth limit | Edge enforcement requires measured abuse and a rule that preserves shared-network access. |
| Next.js Server Actions | Auth, validation, action-specific services, RLS | Use server-action-aware observation. Do not group every action under one IP limit. |
| Reminder and occurrence process routes | Constant-time secret checks, failed-auth limit, batch ceiling, independent breakers | Do not rate-limit Vercel Cron until its bypass is proven. |

The in-memory failed-auth limits remain defense in depth for one runtime. They
are not distributed enforcement. Provider-edge controls own anonymous abusive
traffic when the current plan supports them. The Supabase-backed export limit
owns authenticated export amplification across application instances.

### Candidate log-only rules

These commands are templates. They stage provider settings. Do not run them
without authorization for the exact project. Do not publish them until a human
reviews the draft, production log evidence, preview enforcement, OAuth, Cron,
ordinary tracking, accessibility, and shared-network behavior.

```bash
vercel firewall rules add "Cadence observe OAuth start bursts" \
  --condition '{"type":"path","op":"eq","value":"/auth/google"}' \
  --condition '{"type":"method","op":"eq","value":"GET"}' \
  --action log --yes

vercel firewall rules add "Cadence observe export bursts" \
  --condition '{"type":"path","op":"pre","value":"/api/export/"}' \
  --condition '{"type":"method","op":"eq","value":"GET"}' \
  --action log --yes

vercel firewall rules add "Cadence observe process-route traffic" \
  --condition '{"type":"path","op":"inc","value":["/api/reminders/process","/api/occurrences/sync"]}' \
  --action log --yes
```

After staging, inspect every rule and the complete draft:

```bash
vercel firewall rules inspect "<exact rule name>" --json
vercel firewall diff --json
```

The owner publishes a reviewed draft. Agents must not publish production
firewall rules. Start with log-only production evidence, enforce in Preview,
return to production log-only observation, then request a separate human
production publish decision. Roll back a false positive by returning the exact
rule to `log` or disabling it, reviewing the diff, and having the owner publish
that rollback.

Never pause system mitigations during a cost incident. That action removes
automatic protection and can make the owner responsible for usage that Vercel
would otherwise block.

References:

- <https://vercel.com/docs/spend-management>
- <https://vercel.com/docs/vercel-firewall>
- <https://vercel.com/docs/vercel-firewall/ddos-mitigation>
- <https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing>
- <https://vercel.com/changelog/web-application-firewall-mitigated-traffic-is-free-on-vercel>

## Rollback

Rollback through Vercel by promoting or rolling back to a previous ready
production deployment. The latest known rollback candidate before Ticket 013 was
`dpl_BkZ4Xmh2CCSzhan2zZQ1jqg29Hxp`, but verify the current deployment list
before choosing a target.

## Public repository release verification

Making the GitHub repository public does not authorize a Vercel setting,
environment, domain, or deployment change. Before publication, merge only a
pull request whose `CI / verify` check passed on a non-default branch and
confirm the resulting production deployments identify the intended commit.

After publication, verify Google login, cross-account RLS isolation, Timeline
read and status mutation, Export, account-deletion failure recovery, reminder
processing, and one bounded owner-approved browser-push delivery. Do not send a
notification or create production test data without the separate approval and
cleanup plan required by the owning workflow.

## Public Trust deployment evidence

The release evidence workflow owns Trust collection after both named Vercel
deployments report Ready. It validates output with
`schemas/public-trust-evidence.schema.json` and
`lib/resolvers/public-trust-evidence.resolver.ts`. Vercel deployment IDs and
public deployment URLs are sanitized subjects, not proof by themselves.

Publish each valid snapshot at an immutable commit- or workflow-run-pinned
public URL and retain it indefinitely. A GitHub Pages snapshot path must contain
the workflow run and both deployment IDs. A mutable `latest.json` pointer may
name the newest snapshot only. Never overwrite a snapshot or copy an old Passed
result into evidence for a newer application or marketing deployment.

Consumers compare the snapshot's source commit and both deployment IDs with
the current production release. A mismatch or expired deadline makes a Passed
result Stale. The fixed policy is 24 hours for provenance, public artifact,
application route, marketing route, and hosted migration checks. It is seven
days for dependency, code-scanning, secret-scanning, and cross-account RLS
checks. Ticket 101 performs no Vercel mutation or production collection.
## Ticket 102 provenance collection

The Public Trust workflow reads named deployments through the Vercel API.
Both must report `READY`. Both public Git commit fields must equal the snapshot
source commit. A mismatch is Failed. This evidence covers only the named
Git-to-deployment association. It does not cover private function bundles,
later environment changes, aliases, or provider internals. The workflow keeps
Vercel Git deployment unchanged and needs only a protected read token plus the
existing project and team identifiers.

Preview collection creates a one-hour Vercel share bypass for each named
protected deployment. The collector uses the resulting cookie only while
requesting the allowlisted Preview routes. It never stores the bypass in the
snapshot, details file, Actions artifact, logs, or GitHub secret inventory.
Production collection does not create a bypass.

Production collection requests each configured public Production origin only
after the Vercel API confirms that origin is an alias on the exact named Ready
deployment. It does not follow an immutable deployment host across origins.
