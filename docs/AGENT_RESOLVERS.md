# Agent Resolver Registry

This project uses resolver-first development. Every future agent should identify the owning resolver before touching UI, API routes, cron/process routes, or provider integrations.

Run this drift check before considering resolver-affecting work complete:

```bash
npm run resolvers:check
```

## Registry

| Domain | Owner resolver | Allowed callers | Forbidden bypasses | Source docs | Required test | Drift check |
|---|---|---|---|---|---|---|
| Recurrence expansion | `lib/resolvers/recurrence.resolver.ts` | `lib/services/occurrence.service.ts`, resolver tests | React components, API routes, Supabase repositories, provider adapters, direct `Date` arithmetic | `docs/RECURRENCE_RULES.md`, `docs/DATETIME_STRATEGY.md` | `tests/recurrence.resolver.test.ts` | Resolver must not import React, Next, Supabase, browser globals, provider clients, or env vars. |
| Occurrence generation planning | `lib/resolvers/occurrence.resolver.ts` | `lib/services/occurrence.service.ts`, resolver tests | Database inserts inside resolver, UI deciding future occurrence windows, API routes deduplicating occurrences, UI expanding multiple daily schedule slots | `docs/DATA_MODEL.md`, `docs/RECURRENCE_RULES.md` | `tests/occurrence.resolver.test.ts` | Generated occurrence plan must be pure; repository owns persistence and unique constraints. Multiple schedule slots generate multiple occurrence rows, never a stored partial status. |
| Timeline grouping | `lib/resolvers/timeline.resolver.ts` | `lib/services/timeline.service.ts`, Timeline UI via service output, resolver tests | Components deriving Needs decision, components filtering prior unresolved items, components calculating multi-time grouped completion labels, stored `needs_decision` or partial status | `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`, `docs/DATETIME_STRATEGY.md` | `tests/timeline.resolver.test.ts` | UI must receive grouped data or call a service; no `/dashboard` model. Multi-time behavior groups keep row-specific statuses and do not show progress labels. |
| Status transitions | `lib/resolvers/status.resolver.ts` | `lib/services/occurrence.service.ts`, resolver tests | Buttons mutating status rules directly, automatic missed state, repositories deciding status semantics | `docs/USER_FLOWS.md`, `docs/DATA_MODEL.md`, `docs/DECISIONS.md` | `tests/status.resolver.test.ts` | Stored status remains `unresolved`, `completed`, or `not_completed`; Needs decision remains derived; status-event semantics are planned by the resolver and persisted by the service. |
| Reminder delivery planning | `lib/resolvers/reminder.resolver.ts` | `lib/services/reminder.service.ts`, resolver tests | Sending email/push in resolver, provider SDK imports, API routes calculating delivery offsets | `docs/NOTIFICATION_SPEC.md`, `docs/SEQUENZY_WORKFLOW.md` | `tests/reminder.resolver.test.ts` | Resolver returns delivery records only; services send and record results idempotently. |
| Analytics calculations | `lib/resolvers/analytics.resolver.ts` | `lib/services/analytics.service.ts`, Analytics UI via service output, resolver tests | Components calculating adherence, unresolved counted as failed completion, gamified streak logic | `docs/UI_SPEC.md`, `docs/PRODUCT_SPEC.md`, `docs/DATA_MODEL.md` | `tests/analytics.resolver.test.ts` | Unresolved is separate and excluded from final adherence unless docs change. |
| Export formatting | `lib/resolvers/export.resolver.ts` | `lib/services/export.service.ts`, export API routes via service output, resolver tests | API routes hand-formatting CSV/JSONL/BehaviorLog files, UI building export records, repositories deciding export shape | `docs/EXPORT_FORMATS.md`, `docs/DATA_MODEL.md` | `tests/export.resolver.test.ts` | JSONL, CSV, full JSON, BehaviorLog bundle, and AI summary stay doc-compatible. |
| BehaviorLog import validation | `lib/resolvers/behaviorlog-import.resolver.ts` | `lib/services/behaviorlog-import.service.ts`, resolver tests | Database writes, destructive restore/merge logic, API routes parsing JSONL or deciding conflicts, treating occurrence `current_status` as history | `docs/EXPORT_FORMATS.md`, `docs/DATA_MODEL.md` | `tests/behaviorlog-import.resolver.test.ts` | Import validation is dry-run only; status history comes from `status_events.jsonl`, while `current_status` remains a snapshot. |

## Current implementation state

The registry is authoritative even before the resolver files exist. Ticket 001 created the scaffold only. Future tickets should add resolver files and paired tests as they reach each domain.

`npm run resolvers:check` currently enforces the registry shape and becomes stricter as resolver files appear.

## Layer ownership

Repositories in `lib/db`:

- Query and mutate Supabase.
- Enforce SQL-level constraints through migrations and RLS.
- Do not perform business calculations.

Services in `lib/services`:

- Orchestrate repositories and resolvers.
- Enforce auth and user scoping.
- Prepare data for UI, API routes, and cron/process routes.
- Own external side effects such as Sequenzy and Web Push adapters.

Resolvers in `lib/resolvers`:

- Own calculations, grouping, state planning, and formatting.
- Are pure or nearly pure.
- Receive clock/timezone context explicitly.
- Are unit-tested.

UI components and pages:

- Display data.
- Call server actions/services.
- Do not duplicate recurrence, reminder, analytics, export, or status logic.

API and cron/process routes:

- Validate request/auth/secret.
- Call services.
- Return responses.
- Do not duplicate business logic.

## Review rule

Before finalizing a task, inspect whether logic was duplicated across:

- UI
- API routes
- Services
- Cron/process routes
- Repositories

If duplicated, centralize in a resolver or service and update tests.

## Source-of-truth resolution

When files disagree, resolve in this order:

1. `AGENTS.md`
2. `STATUS.md` for current implementation state only
3. `docs/DECISIONS.md`
4. `docs/DATETIME_STRATEGY.md`
5. `docs/SUPABASE_WORKFLOW.md` and `docs/SEQUENZY_WORKFLOW.md` for provider operations
6. `docs/PRODUCT_SPEC.md`
7. `docs/DATA_MODEL.md`
8. `docs/RECURRENCE_RULES.md`
9. `docs/UI_SPEC.md`
10. `docs/USER_FLOWS.md`
11. `docs/NOTIFICATION_SPEC.md`
12. `docs/EXPORT_FORMATS.md`
13. Existing tests
14. Existing implementation
15. Current ticket prompt, when it intentionally changes scope

`docs/FUTURE_UPDATES.md` describes deferred work and must not override v1 source-of-truth docs unless a future task explicitly moves that work into scope.

If a current user prompt intentionally changes the product, update the relevant docs in the same task.

## Adding a resolver

When adding a resolver:

1. Create the resolver file listed in the registry.
2. Create the paired test file listed in the registry.
3. Keep inputs/outputs serializable unless Temporal values are explicitly part of the local resolver contract.
4. Keep Supabase calls, provider SDK calls, browser APIs, and env reads out of the resolver.
5. Add or update service/repository code only after the resolver contract is clear.
6. Run `npm run resolvers:check`, `npm run test`, `npm run typecheck`, and `npm run build`.
