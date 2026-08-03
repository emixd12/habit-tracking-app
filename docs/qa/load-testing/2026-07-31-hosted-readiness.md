# Ticket 066 hosted readiness — 2026-07-31

Status: blocked before traffic. No hosted Locust request ran.

## Completed readiness work

- Tickets 063-065 passed their required local implementation, lifecycle,
  integrity, RLS, cleanup, evidence, and repository gates.
- The authoritative Ticket 065 full local run was
  `20260731t073716z-8108c309ba98`.
- `scripts/load-test-hosted-preflight.mjs` now validates a private, exact,
  single-stage approval manifest without contacting a hosted target.
- Focused tests cover provider approval, staging isolation, synthetic data,
  provider stubbing, traffic and cost limits, source IPs, monitoring,
  deployment congruence, RLS and cleanup evidence, secret rejection, and
  owner-only manifest handling.
- Provider policy was reviewed against current Vercel and Supabase guidance.

## Read-only discovery

- No dedicated Cadence Vercel staging project was found.
- No separate Cadence Supabase staging project was found.
- The discovered Supabase organization reports Pro.
- The exact Vercel plan was not verified.
- No Vercel load-test approval reference was found.

The report deliberately omits provider project refs, deployment identifiers,
hostnames, credentials, source IPs, and owner identities.

## Blocking gates

The owner must provide or authorize:

1. A dedicated synthetic-only Cadence Vercel staging deployment and hostname.
2. A separate synthetic-only Supabase staging project and compute tier.
3. The exact Vercel Enterprise plan evidence and prior approval reference.
4. An explicit owner authorization reference for the named staging target.
5. The approved start/end window, source geography, literal source IPs,
   worker posture, Fluid Compute posture, and maximum users/RPS/runtime/requests.
6. A positive USD cost ceiling.
7. Monitoring collection and retention through 24 hours after the window.
8. Clean commit/deployment congruence, migration comparison, hosted RLS,
   advisors, one-user smoke, isolated provider stub, and cleanup dry-run proof.

Supabase Team or Enterprise would also require a support coordination
reference for heavy or prolonged load under current guidance.

## Interpretation

Ticket 066 has no hosted capacity result. Ticket 065's local 50-user plateau,
24.6114 achieved RPS, spike, soak, breakpoint, contention, and operator results
describe only the recorded local machine and local Supabase Docker stack. They
do not estimate Vercel, hosted Supabase, staging, production, or customer
capacity.

References:

- [Vercel load-testing policy](https://vercel.com/kb/guide/what-s-vercel-s-policy-regarding-load-testing-deployments)
- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Supabase environment guidance](https://supabase.com/docs/guides/deployment/managing-environments)
