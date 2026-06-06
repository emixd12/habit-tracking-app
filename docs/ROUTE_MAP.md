# Route Map

This file keeps route names stable across agents. Add routes here before or during implementation so UI, tests, docs, and navigation do not drift.

## Current app routes

| Route | Status | Purpose | Notes |
|---|---|---|---|
| `/` | scaffolded | Redirects or links into the app entry surface | Should lead to `/timeline` once auth flow is active. |
| `/timeline` | scaffolded placeholder | Primary screen for today's occurrences, prior unresolved Needs decision items, and future preview | This is the main screen. |
| `/behaviors` | scaffolded placeholder | Behavior and category management | Keep CRUD simple. |
| `/analytics` | scaffolded placeholder | Basic completion counts and adherence | No gamified streak language. |
| `/export` | scaffolded placeholder | JSONL, CSV, full JSON backup, and AI-readable summary export | Export logic belongs in `export.resolver.ts`. |
| `/settings` | scaffolded placeholder | Timezone, notification permission, email reminder settings, and categories as needed | Browser notification permission is requested here. |

## Forbidden route

Do not create `/dashboard` in v1. The locked primary route is `/timeline`.

## Planned API routes

| Route | Earliest ticket | Purpose | Required ownership |
|---|---:|---|---|
| `/api/push/subscribe` | 009 | Store browser push subscriptions | Route validates request and calls a service/repository. |
| `/api/reminders/process` | 010 | Protected process route for due reminder deliveries | Route validates secret/auth and calls `reminder.service.ts`. |
| `/api/export/jsonl` | 012 | JSONL export | Route calls export service/resolver. |
| `/api/export/csv` | 012 | CSV export | Route calls export service/resolver. |
| `/api/export/json` | 012 | Full JSON backup | Route calls export service/resolver. |

Do not add API routes that duplicate resolver logic. API routes are request/response adapters.

## Navigation source

`lib/navigation.ts` owns the scaffolded navigation list and default app route. If a route changes:

1. Update `lib/navigation.ts`.
2. Update this file.
3. Update `docs/UI_SPEC.md` and `docs/USER_FLOWS.md` if product behavior changes.
4. Update or add tests.
5. Run `npm run agents:check` and `npm run resolvers:check`.

## Route creation checklist

Before adding a new app or API route:

- Confirm it is in scope for the active ticket.
- Confirm it does not create a dashboard-centric product model.
- Identify the owning resolver/service if the route performs domain work.
- Add the route to this document.
- Keep UI pages thin. Move calculations and state planning into resolvers/services.
- Add tests for navigation or route behavior when practical.
