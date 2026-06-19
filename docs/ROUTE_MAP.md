# Route Map

This file keeps route names stable across agents. Add routes here before or during implementation so UI, tests, docs, and navigation do not drift.

The current implemented routes belong to the authenticated web app. Future
public marketing routes are scoped separately in
`docs/PUBLIC_PRODUCT_ARCHITECTURE.md` and should be implemented as an Astro
surface when ticketed.

## Current app routes

| Route | Status | Purpose | Notes |
|---|---|---|---|
| `/` | implemented | Auth-aware entry route | Redirects authenticated users to `/timeline` and unauthenticated users to `/login`. |
| `/login` | implemented | Google sign-in screen | Uses Supabase OAuth and returns through `/auth/callback`; links to Terms, Privacy, and Trust. |
| `/auth/callback` | implemented | Supabase OAuth code exchange route | Exchanges the OAuth code for a cookie-backed Supabase session and redirects to a sanitized local `next` path. |
| `/terms` | implemented, public | Public product terms | Sparse launch terms for the personal behavior tracker; not a marketing site. |
| `/privacy` | implemented, public | Public product privacy notes | Covers account data, behavior data, reminders, providers, export, and deletion. |
| `/trust` | implemented, public | Public trust and portability notes | Covers manual status truth, account isolation, portability, and reminder boundaries. |
| `/timeline` | implemented, protected | Primary screen for today's occurrences, a floating Needs decision modal for prior unresolved items, and future preview | This is the main screen. |
| `/behaviors` | implemented, protected | Behavior and category management | Keep CRUD simple. |
| `/analytics` | implemented, protected | Basic completion counts, adherence, heatmaps, and selected-day Not Completed inspection | No gamified streak language. |
| `/export` | implemented, protected | JSONL, CSV, full JSON backup, BehaviorLog bundle, Markdown AI-readable summary export, and BehaviorLog bundle import | Export logic belongs in `export.resolver.ts`; BehaviorLog import validation and merge preview belong in `behaviorlog-import.resolver.ts`; the page supports range and archived-behavior export options. |
| `/settings` | implemented, protected | Profile, timezone, browser notification permission/subscription settings, trust/legal links, and account deletion | Browser notification permission is requested here; account deletion requires export acknowledgement and typed confirmation; category editing and any global email settings remain future Settings work. |

## Planned marketing routes

These routes are not implemented in the current Next.js app. They are planned
for a future Astro marketing app.

| Route | Status | Purpose | Notes |
|---|---|---|---|
| `/` | planned for marketing | Combined landing page explaining Cadence and BehaviorLog | If marketing owns `/`, preserve the authenticated app's entry behavior through an app subdomain or app-specific route. |
| `/cadence` | planned for marketing | Simple product page for the tracker | Primary CTA: Try Cadence. |
| `/standard` | planned for marketing | BehaviorLog Bundle overview and adoption case | Primary CTA: Read the Standard. |
| `/docs` | planned for marketing | Docs/spec entry point | Mostly links to GitHub files at launch. |
| `/examples` | optional | Sample BehaviorLog bundle page or homepage section | Primary CTA: Download Example Bundle. |
| `/about` | optional | Philosophy, governance, privacy, or project page/section | Keep sparse and factual. |

## Internal development routes

| Route | Status | Purpose | Notes |
|---|---|---|---|
| `/design-system` | implemented, local/dev-only | Internal design-system bench for fixture-backed UI inspection and traceability | Not in primary navigation, not protected product UI, disabled with `notFound()` in production builds, and excluded from product usage scans. |

## Auth route protection

Next.js 16 uses `proxy.ts` instead of the deprecated `middleware.ts` convention. This app uses root-level `proxy.ts` to refresh Supabase auth cookies and redirect unauthenticated requests for the protected app routes listed above.

The protected app layout also verifies the Supabase user server-side before rendering the app shell. Do not rely on client-only checks for protected app screens.

## Forbidden route

Do not create `/dashboard` in v1. The locked primary route is `/timeline`.

## Planned API routes

| Route | Earliest ticket | Purpose | Required ownership |
|---|---:|---|---|
| `/api/push/subscribe` | implemented in 009; auth-failure rate limit added in 029 | Store browser push subscriptions | Route validates request shape, requires the authenticated Supabase user, rate-limits repeated unauthenticated attempts, and calls a service/repository. |
| `/api/reminders/process` | implemented in 010; Vercel Cron GET support added in 013; auth-failure rate limit and bounded `limit` added in 029; browser-push sending added after notification troubleshooting | Protected process route for due reminder deliveries | Route validates `REMINDER_PROCESS_SECRET` or `CRON_SECRET`, supports Vercel Cron `GET` and manual protected `POST`, rate-limits repeated auth failures, bounds batch size, and calls `reminder.service.ts` for email and browser-push channels. |
| `/api/export/jsonl` | implemented in 012 | JSONL export | Route calls export service/resolver. |
| `/api/export/csv` | implemented in 012 | CSV export | Route calls export service/resolver. |
| `/api/export/json` | implemented in 012 | Full JSON backup | Route calls export service/resolver. |
| `/api/export/behaviorlog` | implemented in BehaviorLog alignment milestone 1 | BehaviorLog `.behaviorlog.zip` interoperability bundle | Route calls export service/resolver and packages generated bundle files as a ZIP. |

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
