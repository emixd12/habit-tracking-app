# Behavior Configuration History Implementation Plan

> **Execution:** implement task-by-task, dispatching a fresh subagent per task with review after each.

**Goal:** Preserve when a Behavior's schedule, reminders, category, active state, or timezone changed, then expose that history in rich exports.

**Architecture:** Keep the current Behavior and schedule tables as operational snapshots. Add append-only configuration events with complete normalized previous and next snapshots. Link generated Occurrences to the configuration event that governed their schedule so later schedule edits cannot rewrite historical export meaning.

**Tech Stack:** Next.js App Router, TypeScript, pure resolvers, Supabase Postgres/RLS, Temporal, Vitest, BehaviorLog Bundle.

---

## Settled product decisions

- This is generic Behavior configuration history. It does not add medication dose, supply, refill, or clinical semantics.
- Manual changes become effective immediately. Store the UTC instant, local date, and timezone in effect.
- Existing Behaviors receive an honest `history_capture_started` baseline at migration time. Do not claim the current configuration existed since Behavior creation.
- JSONL and CSV remain current-snapshot formats.
- Full JSON includes complete configuration-event history for included Behaviors.
- BehaviorLog emits historical schedule periods and keeps Occurrences linked to the schedule revision that governed them.
- Reminder, category, active-state, and timezone revisions remain app-native configuration history until BehaviorLog standardizes equivalent records.
- The feature is owner-scoped append-only personal history. It is not tamper-evident compliance logging.

## Ticket 078 prerequisite

**Objective:** Preserve earlier same-day and context-bearing unresolved Occurrences before adding historical configuration lineage.

**Files:**
- Modify: `lib/resolvers/occurrence.resolver.ts`
- Modify: `lib/services/occurrence.service.ts`
- Modify: `docs/DATA_MODEL.md`
- Test: `tests/occurrence.resolver.test.ts`
- Test: relevant occurrence service tests

**Steps:**
1. Add failing tests for earlier-today, future-today, note-bearing, and time-session-bearing unresolved Occurrences.
2. Run the focused tests and verify the new cases fail.
3. Narrow deletion eligibility using injected `now` plus note/time-session preservation inputs.
4. Run the focused tests and resolver checks.
5. Review the diff for accidental status, reminder, or adherence changes.

## Ticket 095: Configuration event contract and capture

**Objective:** Add the append-only event model and capture every current configuration mutation path atomically.

**Files:**
- Create: a migration from `npm run supabase -- migration new add_behavior_configuration_events`
- Create: `lib/types/behavior-configuration-event.ts`
- Create: `lib/resolvers/behavior-configuration.resolver.ts`
- Create: `lib/db/behaviorConfigurationEvents.repo.ts`
- Modify: `lib/db/behaviorDefinitionEvents.repo.ts`
- Modify: `lib/services/behavior.service.ts`
- Modify: `lib/services/settings.service.ts`
- Modify: import and restore write services/RPC migrations when they change existing configuration
- Modify: `lib/db/database.types.ts`
- Modify: `docs/AGENT_RESOLVERS.md`
- Modify: `docs/DATA_MODEL.md`
- Test: `tests/behavior-configuration.resolver.test.ts`
- Test: migration, repository, Behavior service, Settings, import, and restore tests

**Event shape:**

```ts
type BehaviorConfigurationEventPlan = {
  eventKind: "baseline" | "revision";
  previousConfiguration: BehaviorConfigurationSnapshot | null;
  nextConfiguration: BehaviorConfigurationSnapshot;
  changedFields: Array<
    | "category_id"
    | "schedule_graph"
    | "browser_reminder_enabled"
    | "email_reminder_enabled"
    | "reminder_offset_minutes"
    | "active"
    | "timezone"
  >;
  recordedAt: string;
  effectiveAt: string;
  effectiveLocalDate: string;
  timezone: string;
  source: "manual" | "import" | "system";
  reasonCode: string;
};
```

**Steps:**
1. Add resolver tests for baseline, normalized no-op, schedule, reminder, active-state, category, and timezone revisions.
2. Run the resolver tests and verify failure.
3. Implement normalization and event planning without clock, database, or environment reads.
4. Run resolver tests and `npm run resolvers:check`.
5. Create the migration through the project Supabase CLI.
6. Add the owner-scoped append-only table, indexes, constraints, RLS, and capture-start backfill.
7. Add failing migration-contract and RLS registry tests.
8. Extend atomic Behavior create/update functions to validate and insert the resolver-planned event.
9. Extend archive/restore, Settings timezone, import, and restore mutation boundaries so no current configuration write bypasses history.
10. Regenerate local database types after a clean reset.
11. Run focused service, migration, repository, and RLS tests.
12. Review for partial writes, forged previous snapshots, duplicate no-op events, and cross-owner access.

## Ticket 096: Occurrence configuration lineage

**Objective:** Preserve which configuration revision governed each generated Occurrence.

**Files:**
- Create: a migration from `npm run supabase -- migration new link_occurrences_to_behavior_configuration_events`
- Modify: `lib/resolvers/occurrence.resolver.ts`
- Modify: `lib/services/occurrence.service.ts`
- Modify: `lib/db/occurrences.repo.ts`
- Modify: `lib/types/database.ts`
- Modify: `lib/db/database.types.ts`
- Modify: `docs/RECURRENCE_RULES.md`
- Modify: `docs/DATA_MODEL.md`
- Test: `tests/occurrence.resolver.test.ts`
- Test: `tests/occurrence.service.test.ts`
- Test: migration and RLS tests

**Steps:**
1. Add failing tests for new, retained, regenerated, protected, resolved, and legacy Occurrence lineage.
2. Run the focused tests and verify failure.
3. Add the nullable owner-and-Behavior-scoped event reference for honest legacy handling.
4. Thread the governing event ID through generation plans and inserts.
5. Move retained future unresolved Occurrences to the new event only when the new schedule still generates the same Occurrence.
6. Preserve the old event for past, resolved, or Ticket 078-protected Occurrences that the new schedule no longer generates.
7. Keep pre-rollout Occurrences unlinked rather than inventing a revision.
8. Regenerate types and run focused tests after a clean reset.
9. Review duplicate merging and overlapping schedule-time semantics.

## Ticket 097: Export portability and disclosure

**Objective:** Export complete configuration history and historically correct BehaviorLog schedules.

**Files:**
- Modify: `lib/db/behaviorConfigurationEvents.repo.ts`
- Modify: `lib/services/export.service.ts`
- Modify: `lib/resolvers/export.resolver.ts`
- Modify: `lib/types/export.ts`
- Modify: `lib/export-prompts.ts`
- Modify: `components/export/ExportPanel.tsx`
- Modify: `docs/PRODUCT_SPEC.md`
- Modify: `docs/EXPORT_FORMATS.md`
- Modify: `docs/UI_SPEC.md`
- Modify: `docs/USER_FLOWS.md`
- Test: `tests/export.service.test.ts`
- Test: `tests/export.resolver.test.ts`
- Test: `tests/behaviorlog-conformance.test.ts`
- Test: `tests/export-panel-ui.test.tsx`

**Steps:**
1. Add failing Full JSON tests for all-time configuration history, archive filtering, stable ordering, and counts.
2. Add failing BehaviorLog tests for daily-to-weekly periods and Occurrence-to-revision linkage.
3. Add complete paginated owner reads with a loud ceiling, reusing Ticket 081's helper if available.
4. Extend Full JSON with `behavior_configuration_events`.
5. Segment BehaviorLog schedule records at schedule-changing revisions.
6. Emit exact effective instants and lineage IDs under Cadence extensions where BehaviorLog core has local-date bounds only.
7. Keep legacy unlinked Occurrences explicit with medium-confidence fallback notes.
8. Update Markdown guidance to segment analysis at configuration boundaries without causal or clinical claims.
9. Update Export disclosure copy without adding a new option or interaction.
10. Run export, conformance, UI, type, and resolver checks.
11. Review privacy, deterministic hashing, manifest counts, and archive filtering.

## Final integration verification

1. Run `npm run supabase -- db reset`.
2. Regenerate `lib/db/database.types.ts` from the clean local schema.
3. Run the local RLS smoke when its fixtures support the new table.
4. Run all focused resolver, service, migration, export, conformance, and UI tests.
5. Run `npm run agents:check`.
6. Run `npm run interactions:check`.
7. Run `npm run resolvers:check`.
8. Run `npm run lint`.
9. Run `npm run typecheck`.
10. Run `npm run test`.
11. Run `npm run build`.
12. Run `git diff --check` and review every changed file.
13. Update `STATUS.md` with real results and remaining hosted rollout work.

## Deployment boundary

Hosted Supabase migration deployment and application deployment require separate explicit authorization. Local implementation must not push either migration.
