# Ticket 067 cost and surge readiness — 2026-08-01

## Outcome

Local technical guardrails and the zero-network tabletop pass. Ticket 067 is
not complete. Provider configuration, owner risk policy, tested human alert
delivery, firewall preview, and the human drill remain blocked on explicit
owner facts and authorization.

No provider setting changed. No production firewall rule was staged or
published. No project paused. No plan, compute size, add-on, or budget changed.
No email or push message was sent. No billable stress traffic ran.

## Sanitized provider inventory

This table records every known launch provider and every missing field. It
contains no account identifier, project ref, invoice, payment data, contact
address, or raw provider payload.

| Provider | Current plan and cycle | Fixed costs | Metered dimensions | Included quota, overage, baseline | Billing owner | Control and gap | Official source |
|---|---|---|---|---|---|---|---|
| Vercel authenticated app | Not verified. Cadence uses one project in a team with 14 projects discovered read-only. | Team plan, seats, add-ons, integrations, project-related fixed items; amounts not verified. | Edge requests, fast data transfer, origin transfer, function invocation/duration/memory/CPU, builds, monitoring, firewall priced features. | Not verified for the current team. | Not named. | Spend notifications, webhook, hard limit, and WAF posture unverified. Spend checks can lag. A hard limit pauses every production project in the team. | <https://vercel.com/docs/spend-management> |
| Vercel marketing | Not verified. Separate Cadence marketing project in the same team. | Shares the team plan and any team-wide fixed items. | Static edge requests, transfer, builds, monitoring, and firewall usage. | Not verified. | Not named. | Shares team Spend Management blast radius. A Cadence hard-stop decision can affect unrelated projects. | <https://vercel.com/docs/pricing/manage-and-optimize-usage> |
| Supabase | Pro organization verified during Ticket 066 discovery. Billing-cycle dates are not recorded. | Pro subscription, compute, projects, custom domain, IPv4, PITR, log drains, replicas, added disk IOPS/throughput, MFA phone; amounts not verified. | Disk, egress, Edge Function invocations, logs, Auth MAU variants, Realtime, Storage size and transformations. | Current quotas, overage rates, baseline, compute size, disk, project count, and add-ons are not verified. | Not named. | Spend Cap state unverified. The cap covers specified variable items but not compute or listed add-ons. It has no per-item budget or threshold alerts. | <https://supabase.com/docs/guides/platform/cost-control> |
| Sequenzy | Account plan and billing cycle not verified. Public pricing is email-volume based. | Selected monthly or annual volume tier; amount not verified. | Transactional email sends and any selected SMS add-on. | Public free allowance is 2,500 emails monthly. Cadence account allowance, current sends, overage or upgrade path, and API rate limit are not verified. | Not named. | Account alert or send cap not verified. Public API throttling is not a monthly billing guarantee. Cadence can stop email sends independently. | <https://www.sequenzy.com/pricing> |
| Domain | Registrar, plan, renewal cycle, and domain inventory not supplied. | Registration, renewal, privacy, DNS, or certificate add-ons if any. | Usage dimensions unknown. | Not verified. | Not named. | No alert or manual renewal review is recorded. | Registrar source pending. |
| Monitoring and alerting | Vercel privacy-safe runtime logs are used. No separate vendor is in scope. Current Vercel monitoring plan and retention are not verified. | Plan or add-on cost not verified. | Log retention, queries, drains, monitoring, and alert volume where billed. | Not verified. | Not named. | Primary and backup delivery paths are untested. Raw alert payloads must remain private. | <https://vercel.com/docs/observability> |

## Current provider facts rechecked

- Vercel Spend Management is documented for Pro. Its amount is per billing
  cycle and team. Notifications can run at 50%, 75%, and 100%. The optional
  hard limit must be enabled and can pause all production deployments.
- Vercel checks spend every few minutes. Seats, Marketplace integrations, and
  separate add-ons remain outside that spend amount.
- Vercel automatic DDoS mitigation covers all plans. Successfully served
  traffic before mitigation or unclassified abusive traffic can still incur
  usage.
- Supabase Pro Spend Cap covers only the variable items listed in
  `docs/SUPABASE_WORKFLOW.md`. Compute and listed add-ons remain uncovered.
- Supabase Spend Cap provides neither per-item budgets nor cost-threshold
  notifications.
- Sequenzy public pricing is email-volume based. Current account controls were
  not inspected because private account and billing facts are not approved for
  capture in this run.

## Technical implementation evidence

- An atomic Supabase-backed rate limit permits six structured downloads per
  account per 60 seconds across formats and application instances.
- Limited exports return `429` and `Retry-After` before export reads. They do
  not return a partial artifact.
- Separate server-only breakers stop email sends, browser-push sends, reminder
  batches, occurrence-sync batches, or export downloads.
- Reminder channel breakers act before due rows are read or claimed. Pending
  idempotent work remains pending.
- Breaker logs contain only breaker name, state, allow-listed reason code, and
  aggregate blocked invocation count.
- Process batch breakers return `503` and `Retry-After` before service work.
- Ordinary Timeline status and Note changes have no broad launch rate limit.

Focused tests passed on 2026-08-01:

- `tests/launch-circuit-breakers.test.ts`
- `tests/launch-export-rate-limit-migration.test.ts`
- `tests/launch-rate-limits.repo.test.ts`
- `tests/export-download-route.test.ts`
- `tests/reminder-process-route.test.ts`
- `tests/occurrence-sync-route.test.ts`
- `tests/reminder.service.test.ts`
- `tests/launch-cost-preflight.test.ts`
- `tests/launch-surge-drill.test.ts`

Database verification also passed after a clean local migration reset:

- `npm run smoke:launch-rate-limit:local`
- six calls allowed, seventh call denied
- authenticated direct counter write rejected
- test transaction rolled back

## Synthetic tabletop

Command:

```bash
npm run launch:surge:drill -- --synthetic
```

Result:

- mode: `synthetic_non_production`
- performed at: `2026-08-01T05:23:14.683Z`
- network requests: 0
- billable traffic generated: false
- seven of seven declared scenarios detected, contained, rolled back, and
  recovered in the technical state model
- human owner drill: pending

Scenarios:

1. legitimate traffic spike;
2. anonymous abuse;
3. export amplification;
4. reminder backlog;
5. provider-send surge;
6. cost alert and hard-stop decision;
7. false-positive throttle.

Synthetic success does not prove current provider settings, alert delivery,
human response, firewall safety, hosted capacity, or the availability-versus-
cost decision.

## Exact blockers

The owner must supply and approve:

1. current Vercel, Supabase, Sequenzy, domain, and monitoring plans, cycles,
   included quotas, overage paths, baselines, and billing owner roles;
2. normal monthly budget, warning, urgent, emergency, and maximum unplanned USD
   thresholds;
3. maximum acceptable outage and Vercel team-wide hard-stop posture;
4. Supabase Spend Cap posture with compute and add-on exposure acknowledged;
5. tested primary and backup notification roles and channel kinds;
6. alert acknowledgement, emergency control, pause, limit-change, and resume
   authority;
7. exact authorization to configure or decline each provider control;
8. exact authorization to stage log-only Vercel rules on the intended projects;
9. a non-production human drill window and participants.

After those facts exist, place the private policy under `.launch-safety/`, run
`npm run launch:cost:preflight`, stage only owner-approved log rules, complete
Preview and human QA, run the policy-backed drill, and append sanitized results
here or in a new dated report.
