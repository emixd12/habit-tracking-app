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
| Export formatting | `lib/resolvers/export.resolver.ts` | `lib/services/export.service.ts`, export API routes via service output, resolver tests | API routes hand-formatting CSV/JSONL/BehaviorLog files, UI building export records, repositories deciding export shape | `docs/EXPORT_FORMATS.md`, `docs/DATA_MODEL.md` | `tests/export.resolver.test.ts` | JSONL, app-native CSV, full JSON, BehaviorLog core JSONL, optional BehaviorLog CSV views, optional BehaviorLog Intervention Profile records, and AI summary stay doc-compatible. |
| BehaviorLog import validation and merge preview | `lib/resolvers/behaviorlog-import.resolver.ts` | `lib/services/behaviorlog-import.service.ts`, `lib/services/behaviorlog-import-write.service.ts`, resolver tests | Database writes inside the resolver, destructive restore/merge logic, API routes parsing JSONL or deciding conflicts, treating occurrence `current_status` as history, using imported notes for status/adherence/reminder/analytics calculations, writing imported-intervention rows inside the resolver, writing reminder deliveries during import apply, provider calls from imported intervention rows | `docs/EXPORT_FORMATS.md`, `docs/DATA_MODEL.md`, `docs/NOTIFICATION_SPEC.md` | `tests/behaviorlog-import.resolver.test.ts`, `tests/behaviorlog-import-merge-preview.test.ts`, `tests/behaviorlog-import-interventions.test.ts`, `tests/behaviorlog-import-notes.test.ts`, `tests/behaviorlog-import-intervention-history.test.ts` | Import validation and merge preview are dry-run/plan-only; create-only and user-approved merge product writes are service/repository-owned and must consume a valid accepted preview. Merge preview emits deterministic `create_new`, `map_to_existing`, `skip_existing`, and `conflict_requires_decision` decisions plus stable conflict codes. Status history comes from `status_events.jsonl`, while `current_status` remains a snapshot. Optional notes preserve role, sensitivity, source metadata, source original id, timestamps, and attachment target; non-AI behavior, occurrence, status-event, and review notes may plan passive `imported_notes` rows. Occurrence notes may additionally plan inline safe-fill only when the target is safely identified and the local note is empty. High/restricted note sensitivity requires warnings and apply acknowledgement, and AI-generated notes are skipped. Optional interventions are parsed, hash/reference/channel/status validated, summarized by channel/status/linked behavior, and marked `preview_only`; preview shows passive `imported_interventions` storage decisions plus dropped/redacted sensitive fields. Accepted applies may write passive imported-intervention history through services/repositories, but must not create reminder deliveries, schedule/send/cancel/retry/claim reminders, or call Sequenzy/Web Push/provider APIs. Unknown core top-level fields are validation errors and app-specific fields must live under `extensions`. |
| BehaviorLog restore preview/apply | `lib/resolvers/behaviorlog-restore.resolver.ts` | `lib/services/behaviorlog-restore.service.ts`, Export restore UI via service output, resolver/service/UI tests | Merge preview standing in for destructive restore decisions, database writes inside the resolver, UI deciding create/replace/archive/delete/keep/skip actions, converting unresolved to `not_completed`, restoring auth/profile/provider/browser state, writing reminder deliveries, sending/cancelling reminders, provider calls | `docs/EXPORT_FORMATS.md`, `docs/DATA_MODEL.md`, `docs/USER_FLOWS.md` | `tests/behaviorlog-restore.resolver.test.ts`, `tests/behaviorlog-restore.service.test.ts`, `tests/behaviorlog-restore-apply.service.test.ts`, `tests/behaviorlog-restore-ui.test.tsx` | Restore preview is preview-only and separate from merge preview. It consumes a validated BehaviorLog import plan plus the current user-owned local graph and emits machine-readable create, replace, archive, delete, keep, and skip actions for behaviors, schedules, occurrences, status events, inline occurrence notes, passive imported notes, and passive imported interventions. Destructive actions are flagged explicitly. Preview includes non-restorable account/provider/browser fields, sensitivity warnings, redacted intervention summaries, status-history policy planning with `preserve_append_only_history` as default, local/bundle/preview fingerprints, and no product data mutation. Restore apply is service-owned, gated by a valid accepted preview, matching fingerprints, backup acknowledgement, typed confirmation, and sensitivity acknowledgement when relevant. CSV views do not drive restore decisions, status events remain authoritative, and occurrence `current_status` remains a snapshot only. |
| Imported intervention promotion | `lib/resolvers/imported-intervention-promotion.resolver.ts` | `lib/services/imported-intervention-promotion.service.ts`, resolver/service tests, future explicit UI or API contract via service output | Import preview/apply writing operational deliveries, UI deciding eligibility, repositories deciding current reminder setting matches, promotion routes calling providers or reminder processing routes, promotion of past/resolved/inactive/mismatched records | `docs/NOTIFICATION_SPEC.md`, `docs/DATA_MODEL.md`, `docs/EXPORT_FORMATS.md`, `docs/USER_FLOWS.md` | `tests/imported-intervention-promotion.test.ts` | Promotion is separate from BehaviorLog import apply. The resolver requires explicit selected imported-intervention ids and confirmation, filters to future pending reminder interventions, compares against current `resolveReminderDeliveries` output, and returns delivery plans with import provenance only. Services own user-scoped reads/writes and must not call Sequenzy, Web Push, browser APIs, provider SDKs, or notification-processing routes. |

## BehaviorLog Conformance Harness

`tests/behaviorlog-conformance.test.ts` materializes a BehaviorLog bundle
generated by `lib/resolvers/export.resolver.ts` as a temporary `.behaviorlog/`
directory, runs `scripts/behaviorlog-conformance.mjs`, and then confirms the
same files remain readable by the dry-run import resolver.

The script runs the pinned upstream `emixd12/BehaviorLog-Bundle`
`reference/validate.mjs` snapshot stored under
`tests/fixtures/behaviorlog-reference/`. The snapshot source commit and date are
recorded in `tests/fixtures/behaviorlog-reference/SNAPSHOT.md`; update that file
when intentionally adopting a newer upstream conformance contract.

## Current implementation state

The registry reflects the implemented resolver set in this repository. All
listed resolver files and paired tests exist, with restore apply covered at the
service/UI boundary because destructive database work is orchestration rather
than pure resolver logic.

`npm run resolvers:check` enforces the registry shape and resolver purity
constraints.

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
