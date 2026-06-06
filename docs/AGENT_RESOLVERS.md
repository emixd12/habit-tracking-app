# Agent Resolver Guide

This project uses resolver-first development.

When implementing any task, identify the affected resolver before touching UI.

## Resolver map

### Recurrence work

Use:
- `/lib/resolvers/recurrence.resolver.ts`
- `/tests/recurrence.resolver.test.ts`
- `/docs/RECURRENCE_RULES.md`

Examples:
- Daily behavior scheduling
- Weekly recurrence
- Every N days
- Monthly recurrence
- Timezone behavior
- Midnight boundary

### Occurrence generation work

Use:
- `/lib/resolvers/occurrence.resolver.ts`
- `/lib/services/occurrence.service.ts`
- `/lib/db/occurrences.repo.ts`

Examples:
- Creating future occurrences
- Avoiding duplicate occurrences
- Refreshing upcoming occurrences after editing behavior

### Timeline work

Use:
- `/lib/resolvers/timeline.resolver.ts`
- `/components/timeline/*`
- `/docs/UI_SPEC.md`

Examples:
- Needs decision group
- Current-day ordered timeline
- Resolved items
- Future preview

### Status work

Use:
- `/lib/resolvers/status.resolver.ts`
- `/lib/services/occurrence.service.ts`
- `/components/timeline/StatusButtons.tsx`

Examples:
- Completed
- Not Completed
- Editing note
- Changing a previous decision

### Reminder work

Use:
- `/lib/resolvers/reminder.resolver.ts`
- `/lib/services/reminder.service.ts`
- `/lib/db/reminders.repo.ts`
- `/app/api/reminders/process/route.ts`
- `/docs/NOTIFICATION_SPEC.md`

Examples:
- Browser reminder
- Email reminder
- Reminder offset
- Cancelling pending reminders
- Failed reminder log

### Analytics work

Use:
- `/lib/resolvers/analytics.resolver.ts`
- `/components/analytics/*`
- `/docs/UI_SPEC.md`

Examples:
- Completion rate
- Category summary
- Done / not_done / unresolved counts

### Export work

Use:
- `/lib/resolvers/export.resolver.ts`
- `/app/api/export/*`
- `/docs/EXPORT_FORMATS.md`

Examples:
- JSONL export
- CSV export
- Full JSON backup
- AI-readable summary

### Future PWA/offline work

PWA caching and offline behavior are deferred from v1.

Use `/docs/FUTURE_UPDATES.md` before implementing this work.

Use:
- `/lib/resolvers/cache.resolver.ts`
- service worker / PWA config files
- `/docs/UI_SPEC.md`

Examples:
- Cached upcoming items
- Offline timeline
- Local pending action queue
- Sync conflict handling

## Development rule

Do not implement business logic in React components.

If a React component needs non-trivial logic, move the logic into a resolver and test it.

## Review rule

Before finalizing a task, inspect whether logic was duplicated across:
- UI
- API routes
- Services
- Cron jobs

If duplicated, centralize in a resolver or service.

## Source-of-truth resolution

When files disagree, resolve in this order:

1. `AGENTS.md`
2. `/docs/DECISIONS.md`
3. `/docs/PRODUCT_SPEC.md`
4. `/docs/DATA_MODEL.md`
5. `/docs/RECURRENCE_RULES.md`
6. `/docs/UI_SPEC.md`
7. `/docs/USER_FLOWS.md`
8. `/docs/NOTIFICATION_SPEC.md`
9. `/docs/EXPORT_FORMATS.md`
10. Existing tests
11. Existing implementation
12. Current ticket prompt

`/docs/FUTURE_UPDATES.md` describes deferred work and must not override v1 source-of-truth docs unless a future task explicitly moves that work into scope.

If a current user prompt intentionally changes the product, update the relevant docs in the same task.

## Service/repository separation

Repositories:
- Query and mutate Supabase.
- Do not perform business calculations.

Services:
- Orchestrate repositories and resolvers.
- Enforce auth/user scoping.
- Prepare data for UI/API routes.

Resolvers:
- Own calculations and state planning.
- Are pure or nearly pure.
- Are unit-tested.

UI:
- Displays data.
- Calls server actions/services.
- Does not duplicate business logic.

API/cron routes:
- Validate request.
- Call services.
- Return response.
- Do not duplicate business logic.
