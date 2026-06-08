# Route Map

This file keeps route names stable across agents. Add routes here before or during implementation so UI, tests, docs, and navigation do not drift.

## Current app routes

| Route | Status | Purpose | Notes |
|---|---|---|---|
| `/` | implemented | Auth-aware entry route | Redirects authenticated users to `/timeline` and unauthenticated users to `/login`. |
| `/login` | implemented | Google sign-in screen | Uses Supabase OAuth and returns through `/auth/callback`. |
| `/auth/callback` | implemented | Supabase OAuth code exchange route | Exchanges the OAuth code for a cookie-backed Supabase session and redirects to a sanitized local `next` path. |
| `/timeline` | implemented, protected | Primary screen for today's occurrences, prior unresolved Needs decision items, and future preview | This is the main screen. |
| `/behaviors` | implemented, protected | Behavior and category management | Keep CRUD simple. |
| `/analytics` | implemented, protected | Basic completion counts, adherence, heatmaps, and selected-day Not Completed inspection | No gamified streak language. |
| `/export` | implemented, protected | JSONL, CSV, full JSON backup, and Markdown AI-readable summary export | Export logic belongs in `export.resolver.ts`; the page supports range and archived-behavior options. |
| `/settings` | implemented, protected | Profile, timezone, and browser notification permission/subscription settings | Browser notification permission is requested here; category editing and any global email settings remain future Settings work. |

## Auth route protection

Next.js 16 uses `proxy.ts` instead of the deprecated `middleware.ts` convention. This app uses root-level `proxy.ts` to refresh Supabase auth cookies and redirect unauthenticated requests for the protected app routes listed above.

The protected app layout also verifies the Supabase user server-side before rendering the app shell. Do not rely on client-only checks for protected app screens.

## Forbidden route

Do not create `/dashboard` in v1. The locked primary route is `/timeline`.

## Planned API routes

| Route | Earliest ticket | Purpose | Required ownership |
|---|---:|---|---|
| `/api/push/subscribe` | implemented in 009 | Store browser push subscriptions | Route validates request shape, requires the authenticated Supabase user, and calls a service/repository. |
| `/api/reminders/process` | implemented in 010; Vercel Cron GET support added in 013 | Protected process route for due email reminder deliveries | Route validates `REMINDER_PROCESS_SECRET` or `CRON_SECRET`, supports Vercel Cron `GET` and manual protected `POST`, and calls `reminder.service.ts`. |
| `/api/export/jsonl` | implemented in 012 | JSONL export | Route calls export service/resolver. |
| `/api/export/csv` | implemented in 012 | CSV export | Route calls export service/resolver. |
| `/api/export/json` | implemented in 012 | Full JSON backup | Route calls export service/resolver. |

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
