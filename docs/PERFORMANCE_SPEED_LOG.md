# Performance Speed Log

This log tracks the Cadence web-app speed loop. It is evidence, not product
scope. Future changes should keep the app small, avoid major architecture
rewrites, and preserve the resolver/service/repository boundaries in
`docs/AGENT_RESOLVERS.md`.

## Primary Targets

- Production authenticated app: `https://cadence-blush-three.vercel.app`
- Local authenticated app: `http://localhost:3000` when a dev or production
  server is running
- Marketing site only when a change touches the Astro marketing surface

Production is the primary target for user-perceived speed. Local measurements
are used to isolate app/runtime changes from Vercel, Supabase, network, and
browser-session variance.

## Measurement Method

Use a repeatable browser harness for route and interaction timing:

- cold and warm navigation timings from the browser Performance APIs
- click-to-visible-update timings around buttons, form submits, and route links
- request count, transferred bytes, and slowest requests where the browser
  exposes them
- console errors and warnings
- desktop viewport around `1280x900`
- mobile viewport around `390x844`

Use Chrome with the user's existing session when authenticated production
coverage depends on the current browser profile. Use local browser automation
for repeatable local and unauthenticated checks. Do not inspect cookies,
passwords, local storage, or secrets.

## Initial Test Matrix

### Route Loads And Navigation

| Surface | Target | Measures |
|---|---|---|
| Login | `/login` | cold load, warm reload, Google button click start |
| App entry | `/` | auth-aware redirect latency |
| Timeline | `/timeline` | cold load, warm reload, sidebar nav from every primary route |
| Behaviors | `/behaviors` | cold load, warm reload, create-section open |
| Analytics | `/analytics` | cold load, warm reload, range changes, behavior-day review open |
| Export | `/export` | cold load, warm reload, range/archive option changes |
| Settings | `/settings` | cold load, warm reload, timezone panel interaction |
| Legal | `/terms`, `/privacy`, `/trust` | public static-route load |

### Feature Interactions

| Feature | User Action | Success Signal |
|---|---|---|
| App shell | Collapse/expand sidebar | layout settled, active route preserved |
| Mobile navigation | open/close drawer, nav click | drawer opens/closes, route changes |
| Behavior create | submit minimal valid behavior | behavior appears, occurrence sync visible |
| Behavior edit | change title or schedule | list updates, future timeline syncs |
| Behavior archive/restore | archive and restore a test behavior | active/archived sections update |
| Timeline status | mark Completed | row becomes Completed without page jank |
| Timeline status | mark Not Completed | row becomes Not Completed without page jank |
| Timeline note | save note | note is visible after save |
| Needs decision | open dialog, mark prior unresolved if present | count and row state update |
| Analytics correction | open behavior-day review and change status/note | report refreshes |
| Export links | JSONL, CSV, JSON, BehaviorLog downloads | response starts successfully |
| Export summary | copy/download Markdown summary | user-visible success or file response |
| Import preview | select invalid or fixture bundle when safe | validation feedback appears |
| Settings timezone | save unchanged or test-safe timezone value | panel refreshes without errors |
| Browser reminders | inspect permission/save path only | no automatic permission prompt |
| Account deletion | render only, no submit | confirmation controls remain guarded |

### API And Server Paths

| Path | Measure |
|---|---|
| `/api/export/jsonl` | TTFB, total response time, bytes |
| `/api/export/csv` | TTFB, total response time, bytes |
| `/api/export/json` | TTFB, total response time, bytes |
| `/api/export/behaviorlog` | TTFB, total response time, bytes |
| `/api/push/subscribe` | route rejects unauthenticated quickly; authenticated save timing if safe |
| `/api/reminders/process` | rejects missing/wrong secret quickly; no production send without approval |

## Initial Intervention Backlog

1. Add repeatable measurement harness and durable before/after records.
2. Inspect production deployment/runtime logs for slow or failing routes.
3. Measure route loads and interaction timings on production and local.
4. Reduce unnecessary client JavaScript in the app shell and feature screens.
5. Parallelize independent server reads in services/pages where safe.
6. Remove repeated occurrence sync or duplicate Supabase reads on navigation if
   measurements show they dominate.
7. Add cache/static headers for immutable local assets where safe.
8. Tune images, fonts, and route metadata for faster first paint.
9. Split or defer heavy client-only UI modules if bundle evidence supports it.
10. Add focused repository indexes through migrations only if query timing shows
    a clear need.
11. Re-run the full matrix after each batch and append measured deltas.
12. Move major architectural ideas that remain after low-risk fixes into a
    future-only recommendations section instead of implementing them here.

## Baseline Runs

### 2026-06-25 Production And Local Baseline

Environment:
- Production deployment: `dpl_JDDjTaehNbSyJsLfz8aJK8KmFpza`
- Production commit: `71dccde6608957864ae5b150aa5a605ac8839131`
- Vercel region: `iad1`
- Chrome authenticated production tab: signed in at `/timeline`
- Local authenticated Chrome tab: signed in at `http://localhost:3000`

Vercel observations:
- Latest production build completed successfully in about 20 seconds.
- App routes are dynamic server-rendered routes; legal routes are static.
- Last 7 days of warning/error/fatal logs showed old reminder-process
  deprecation warnings, but no current production app-route crash evidence.

Unauthenticated production HTTP timing from this machine:

| Route/asset | Status | Runs | Notes |
|---|---:|---:|---|
| `/` | 307 | 1.137s, 0.486s, 0.523s TTFB | redirects to login |
| `/login` | 200 | 1.047s, 1.186s, 0.561s TTFB | 13.9 KB HTML |
| protected app routes | 307 | ~0.50s TTFB warm | `/timeline`, `/behaviors`, `/analytics`, `/export`, `/settings` |
| legal routes | 200 | ~0.47-0.83s TTFB | `/terms`, `/privacy`, `/trust` |
| `/brand/cadence-logo.png` | 200 | 748 KB, ~1.07-1.40s total | raw source, not the app-shell optimized image |
| `/brand/cadence-timeline-horse-lines-dots-clear-background.png` | 200 | 165 KB, ~0.79-0.99s total | raw source |
| `/sounds/completion-chime.mp3` | 200 | 26 KB, ~0.60-0.72s total | used by Timeline status feedback |

Static asset headers:
- Raw `public/brand` and `public/sounds` assets currently return
  `cache-control: public, max-age=0, must-revalidate`.
- Chrome asset inventory shows the app shell uses optimized Next image URLs for
  the logo (`w=48`, about 1.2 KB) instead of downloading the 748 KB source.
- Timeline loads the banner through Next image optimization at `w=3840`, about
  37 KB in the measured optimized response.

Authenticated production full route loads in Chrome:

| Route | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| `/timeline` | 2882ms | 2272ms | 2246ms |
| `/behaviors` | 1032ms | 729ms | 798ms |
| `/analytics` | 2604ms | 1646ms | 2263ms |
| `/export` | 2059ms | 1620ms | 1642ms |
| `/settings` | 951ms | 500ms | 608ms |

Authenticated production client navigation clicks:

| Click | Time To Target Heading |
|---|---:|
| Timeline -> Behaviors | 1063ms |
| Behaviors -> Analytics | 1622ms |
| Analytics -> Export | 1761ms |
| Export -> Settings | 746ms |
| Settings -> Timeline | 1622ms |

Authenticated production feature interactions:

| Action | Baseline |
|---|---:|
| Open Behavior create disclosure | 430ms |
| Create temporary behavior | 2448ms |
| Archive temporary behavior | 1298ms |
| Create temporary status-test behavior | 1320ms |
| Mark temporary Timeline occurrence Completed | 1210ms |
| Save temporary occurrence note | click caused Timeline revalidation; stale-row wait failed after note text remained visible |
| Archive temporary status-test behavior | 1375ms |

Authenticated local dev full route loads in Chrome:

| Route | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| `/timeline` | 9554ms | 9851ms | 7803ms |
| `/behaviors` | 1255ms | 783ms | 858ms |
| `/analytics` | 8222ms | 9161ms | 8092ms |
| `/export` | 9629ms | 9244ms | 8871ms |
| `/settings` | 1055ms | 1027ms | 778ms |

Console findings:
- Production Chrome logged minified React hydration error `#418` after app
  navigation.
- Local dev clarified the hydration mismatch was caused by Chrome extension
  attributes added to `<body>`:
  `data-new-gr-c-s-check-loaded` and `data-gr-ext-installed`.
- A Chrome-extension async-listener warning also appeared; it is external to
  the app.

Initial evidence-based candidates:
- Timeline, Analytics, and Export are slow relative to Behaviors/Settings
  because they call `syncUserOccurrences` and then perform route-specific reads.
- `syncUserOccurrences` processes each behavior sequentially and each caller
  later re-reads the same behavior list.
- Note save revalidates the full `/timeline` route, which can unmount the row
  during measurement and likely adds latency.
- Static/optimized image and MP3 cache headers are conservative.
- `<body suppressHydrationWarning>` should suppress extension-injected body
  attribute hydration noise without hiding app-owned markup mismatches deeper
  in the tree.

## Change Runs

### 2026-06-25 Batch 1: Service Parallelism, Asset Caching, Note Fast Path

Implementation:
- `syncUserOccurrences` now accepts a preloaded behavior list and syncs
  independent behaviors in parallel.
- Timeline, Analytics, and Export now reuse their already-needed behavior list
  instead of reading behaviors once for sync and again for page data.
- Timeline and Analytics fetch profile timezone and behaviors in parallel before
  sync.
- Export fetches profile timezone, behaviors, and categories in parallel before
  sync, and fetches status-event/reminder-delivery export details in parallel.
- Raw `public/brand` and `public/sounds` assets now have short durable cache
  headers, and Next image optimization has a 7-day minimum cache TTL.
- `<body suppressHydrationWarning>` suppresses Chrome-extension-injected body
  attribute hydration noise found during baseline.
- Completion chime preload now runs once per module instance instead of issuing
  repeated media `load()` calls from every rendered status-button group.
- Timeline note save no longer revalidates the full `/timeline` route; the form
  still gets the server-action success state immediately. Analytics note save
  keeps route revalidation because that panel has a separate read-only note
  summary that should stay fresh.

Local production-build route timing after changes:

| Route | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| `/timeline` | 1886ms | 1593ms | 1561ms |
| `/behaviors` | 626ms | 674ms | 703ms |
| `/analytics` | 1598ms | 1580ms | 1544ms |
| `/export` | 1810ms | 1830ms | 1813ms |
| `/settings` | 772ms | 664ms | 689ms |

Local production-build client navigation after the first service/cache batch:

| Click | Time To Target Heading |
|---|---:|
| Timeline -> Behaviors | 661ms |
| Behaviors -> Analytics | 1484ms |
| Analytics -> Export | 1848ms |
| Export -> Settings | 638ms |
| Settings -> Timeline | 1494ms |

Local production-build console findings:
- No app console warnings/errors in the measured route run.
- Local raw asset headers now return
  `Cache-Control: public, max-age=86400, stale-while-revalidate=604800` for
  `/brand/cadence-logo.png` and `/sounds/completion-chime.mp3`.

Interpretation:
- Timeline, Analytics, and Export remain the slowest authenticated routes, but
  the local production build is now in the expected 1.5-1.9s range for the
  sync-heavy routes from this machine.
- These local numbers should not be treated as production deltas yet. Hosted
  production after-change timing requires a Vercel deployment of this batch and
  a second Chrome run against `https://cadence-blush-three.vercel.app`.

Verification:
- Pass: `npm run resolvers:check`
- Pass: `npm run typecheck`
- Pass: `npm run lint`
- Pass: `npm run agents:check`
- Pass: `npm run test`
- Pass: `npx vitest run tests/completion-feedback.test.ts`
- Pass: `npm run build`
- Pass: `npm run design-system:check`
- Pass: `git diff --check`

### 2026-06-25 Batch 2: Stable Sync Query Reuse

Implementation:
- Per-behavior occurrence generation now reads existing occurrences and schedule
  slots in parallel.
- Reminder planning can accept a caller-provided occurrence list.
- Occurrence sync passes its already-fetched occurrence list into reminder
  planning when generation made no occurrence creates, updates, or deletes. If
  generation mutates occurrences, reminder planning still performs its own fresh
  read so reminder delivery inputs stay current.

Measurement:
- No separate browser timing run was recorded for this smaller batch after the
  Batch 1 local production run. The next production/local browser run should
  include this change and compare against the baseline tables above.

Verification:
- Pass: `npx vitest run tests/reminder.service.test.ts`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test` (43 files, 269 tests)
- Pass: `npm run design-system:check`
- Pass: `npm run build`
- Pass: `git diff --check`

### 2026-06-25 Batch 3: Batched Stable Sync Writes And Auth Read Reuse

Continuation baseline:
- In-app Browser was not authenticated on production, so production coverage in
  this pass was limited to public routes and protected-route redirects.
- Production unauthenticated Node `fetch` timings showed protected app redirects
  around 0.16-0.35s warm TTFB, `/login` around 0.21-0.53s warm TTFB, and
  legal routes around 0.14-0.38s warm TTFB.
- Raw brand/sound assets now return the expected durable cache headers from
  the earlier batch:
  `public, max-age=86400, stale-while-revalidate=604800`.
- Authenticated local production-build measurements used the existing local
  browser session at `http://localhost:3000`. The guarded local test-login path
  is unavailable under `next start` because `NODE_ENV=production`, so no
  write-flow interaction tests were run in this pass.

Authenticated local production-build route baseline before this batch:

| Route | Run 1 | Run 2 | Run 3 | CDP finding |
|---|---:|---:|---:|---|
| `/timeline` | 3150ms | 2144ms | 2653ms | DCL 1560-2664ms after first load; client CPU small |
| `/behaviors` | 1204ms | 1093ms | 1260ms | DCL 559-708ms |
| `/analytics` | 2335ms | 1980ms | 1903ms | DCL 1359-1773ms |
| `/export` | 2502ms | 1965ms | 2459ms | DCL 1403-1970ms |
| `/settings` | 1179ms | 1157ms | 1143ms | DCL 592-640ms |

Observed bottleneck:
- CDP metrics showed route time was dominated by server/data work; scripting,
  layout, and style recalculation were near zero on warm loads.
- `syncUserOccurrences` still performed independent create/delete/reminder
  writes per behavior during read-heavy route loads.
- Protected page rendering asked Supabase Auth for the same user in the app
  layout and again in route services.
- `/timeline` read behaviors and timezone once for Timeline data and again for
  first-run onboarding state.

Implementation kept:
- `syncUserOccurrences` now keeps the proven parallel per-behavior occurrence
  reads, but batches missing occurrence upserts, unresolved deletes, and
  reminder delivery planning/upserts across all behaviors for the route-load
  sync path.
- Added `syncReminderDeliveriesForBehaviors` so stable route loads can create
  missing pending reminder deliveries with one grouped service call while
  preserving inactive-behavior cancellation.
- Added request-scoped `getCurrentUser` / `requireCurrentUserId` helpers using
  React `cache`, then reused that auth result from the protected layout and the
  measured page services.
- Added `getTimelinePageBundle` so `/timeline` shares behavior/timezone reads
  between Timeline data and first-run onboarding state.

Final authenticated local production-build route timing after this batch:

| Route | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| `/timeline` | 3816ms | 1962ms | 2622ms |
| `/behaviors` | 1215ms | 1180ms | 1207ms |
| `/analytics` | 2642ms | 2281ms | 2392ms |
| `/export` | 2486ms | 2316ms | 2671ms |
| `/settings` | 1135ms | 1183ms | 1188ms |

Focused final route timing, five runs after warm-up:

| Route | Runs | Median |
|---|---:|---:|
| `/timeline` | 2373ms, 2039ms, 1992ms, 2145ms, 2107ms | 2107ms |
| `/analytics` | 1920ms, 1913ms, 1935ms, 1891ms, 1915ms | 1915ms |
| `/export` | 2206ms, 2409ms, 2155ms, 2239ms, 2093ms | 2206ms |

Authenticated local production-build client navigation after this batch:

| Click | Time To Target |
|---|---:|
| Timeline -> Behaviors | 748ms |
| Behaviors -> Analytics | 1743ms |
| Analytics -> Export | 2107ms |
| Export -> Settings | 709ms |
| Settings -> Timeline | 1489ms |

Decision:
- Kept. Compared with this pass's same-session pre-change local route
  baseline, median route timing improved for Timeline, Analytics, and Export.
- Client navigation remains server-bound and did not materially improve for
  Analytics or Export; that is logged as follow-up rather than hidden.
- No console warnings or errors appeared in the measured local browser runs.

Verification:
- Pass: `npx vitest run tests/occurrence.service.test.ts tests/reminder.service.test.ts tests/settings.service.test.ts tests/behaviorlog-import-ui.test.tsx tests/behaviorlog-restore-ui.test.tsx`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test` (44 files, 271 tests)
- Pass: `npm run build`
- Pass: `git diff --check`

### 2026-06-25 Ticket 035: Server Timing Instrumentation

Implementation:
- Added server-only performance timing spans behind `CADENCE_PERF_LOG=1`.
  Default runtime behavior remains silent.
- Instrumented protected app layout auth lookup, authenticated route data loads
  for `/timeline`, `/behaviors`, `/analytics`, and `/export`, occurrence sync
  phases, reminder planning/writes, and primary repository reads used by those
  routes.
- Added `npm run perf:routes` as a repeatable dependency-free HTTP route timing
  harness. It reports route, status, TTFB, total time, and bytes without
  printing cookies, response bodies, or user data.
- Timing events emit JSON with route, span, duration, status, error type, and
  aggregate counts only. The sanitizer drops sensitive count keys and redacts
  UUID-shaped route/span segments.

Local production-build measurement with `CADENCE_PERF_LOG=1`:
- Server: `npm run build`, then `CADENCE_PERF_LOG=1 npm run start -- -p 3000`
- Authenticated Chrome tab at `http://localhost:3000`
- Route elapsed timings:

| Route | Elapsed |
|---|---:|
| `/timeline` | 4379ms |
| `/behaviors` | 1102ms |
| `/analytics` | 1832ms |
| `/export` | 2370ms |
| `/settings` | 779ms |

Unauthenticated harness smoke:
- `CADENCE_PERF_BASE_URL=http://localhost:3000 CADENCE_PERF_RUNS=2 CADENCE_PERF_WARMUPS=1 npm run perf:routes`
- Protected routes correctly returned 307 redirects in about 1-4ms local TTFB.

Slowest authenticated local server spans from the first instrumentation pass:

| Route | Span | Duration | Counts |
|---|---|---:|---|
| `/timeline` | `page.bundle_load` | 2455.0ms | 8 timeline sections |
| `/timeline` | `service.sync_user_occurrences` | 1221.6ms | 18 behaviors, 0 created/updated/deleted |
| `/timeline` | `occurrence_sync.existing_occurrence_reads` | 588.7ms | 18 behaviors, 308 occurrences |
| `/timeline` | `db.list_behaviorlog_import_runs` | 578.2ms | 1 import run |
| `/timeline` | `db.list_user_behaviors` | 560.5ms | 18 behaviors, 18 schedule slots |
| `/timeline` | `occurrence_sync.reminder_planning_writes` | 506.7ms | 18 behaviors, 308 occurrences |
| `/timeline` | `db.create_missing_reminder_deliveries` | 501.2ms | 306 reminders planned |
| `/analytics` | `page.data_load` | 1468.2ms | 30-day range, 16 behavior summaries |
| `/analytics` | `service.sync_user_occurrences` | 817.9ms | 18 behaviors, 0 created/updated/deleted |
| `/export` | `page.data_load` | 1981.9ms | 12 behaviors, 127 exported occurrences |
| `/export` | `service.sync_user_occurrences` | 1026.4ms | 18 behaviors, 0 created/updated/deleted |
| `/export` | `occurrence_sync.existing_occurrence_reads` | 506.3ms | 18 behaviors, 308 occurrences |

Interpretation:
- This ticket did not attempt a speed improvement; it added evidence.
- The first authenticated local span sample supports the existing hypothesis:
  route time is dominated by occurrence sync and reminder delivery planning on
  read routes, even when there are no occurrence creates, updates, or deletes.
- `/behaviors` is comparatively faster because it does not run occurrence sync
  during page data load.
- Auth lookup remained visible but smaller than route data work in this sample:
  app layout `auth.get_current_user` ranged from about 168-312ms.

Verification:
- Pass: `npx vitest run tests/performance-timing.test.ts tests/occurrence.service.test.ts tests/reminder.service.test.ts`
- Pass: `npm run typecheck`
- Pass: `npm run lint`
- Pass: `npm run build`

### 2026-06-25 Ticket 036: Route Loading Boundaries And Navigation Response

Implementation:
- Added a shared authenticated app `loading.tsx` boundary for `/timeline`,
  `/behaviors`, `/analytics`, `/export`, and `/settings`.
- Added a small app-shell pending state for primary navigation links. It keeps
  Next `Link` and default prefetch behavior intact, marks the clicked link with
  `aria-busy`, and clears visually once the pathname reaches the target.
- The loading and pending states use the existing square, divider-based
  Cadence vocabulary: no spinner-only state, no shadows, no gradients, no
  rounded cards, and no data or resolver changes.

Local production-build measurement:
- Server: `npm run build`, then `CADENCE_PERF_LOG=1 npm run start -- -p 3000`
- Authenticated browser tab at `http://localhost:3000`
- Concurrent polling around nav clicks:

| Transition | Click to route loading | Click to nav pending | Click to target |
|---|---:|---:|---:|
| Timeline -> Behaviors | 124ms | not captured in this run | 814ms |
| Settings -> Timeline | 36ms | 117ms | 1891ms |

Browser QA:
- Desktop viewport `1280x900`: `/timeline`, `/behaviors`, `/analytics`,
  `/export`, and `/settings` reached the expected route and heading with no
  document-level horizontal overflow.
- Mobile viewport `390x844`: the same routes reached the expected route and
  heading with no document-level horizontal overflow.
- Browser console showed no warnings or errors during the route checks.

Interpretation:
- This ticket improves immediate feedback during route transitions but does not
  reduce server/data time. Ticket 037 and Ticket 038 remain the next steps for
  removing occurrence sync from hot reads.

### 2026-06-25 Ticket 037: Occurrence Sync Freshness State

Implementation:
- Added `occurrence_sync_state` as a user-owned Supabase table with RLS,
  explicit authenticated grants, per-user timezone/horizon coverage fields,
  stale reason, last successful sync timestamp, and aggregate sync counts.
- Added repository and service helpers to read sync state, mark state stale,
  mark state fresh after successful account occurrence sync, and decide whether
  a requested local-date horizon is covered.
- `syncUserOccurrences` now marks the account sync state fresh after successful
  generation and reminder planning. It still runs on read routes in this
  ticket; hot-route removal is deferred to Ticket 038.
- Behavior create/edit/archive/restore and Settings timezone update now mark
  occurrence sync stale before occurrence-affecting writes and then run an
  account sync. BehaviorLog import and restore apply paths mark the state stale
  when accepted plans can create or update occurrence records.
- Updated generated Supabase database types, data-model docs, and RLS registry
  tests for the new table.

Interpretation:
- This ticket creates the persisted freshness contract needed by Ticket 038.
- No route-speed improvement is claimed here because Timeline, Analytics, and
  Export still call `syncUserOccurrences` before rendering.
- The state table is intentionally per-user, not per-behavior. A successful
  account sync can mark the account horizon fresh; direct import/restore data
  repair remains conservative and leaves the state stale for a later repair
  sync.

Verification:
- Pass: `npx vitest run tests/behaviorlog-import-intervention-history.test.ts tests/occurrence-sync-state.service.test.ts tests/occurrence.service.test.ts tests/settings.service.test.ts tests/behaviorlog-import-write.service.test.ts tests/behaviorlog-restore-apply.service.test.ts tests/rls-policy-registry.test.ts`
- Pass: `npm run supabase -- db reset`
- Pass: `npm run --silent supabase -- gen types typescript --local > lib/db/database.types.ts`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test` (46 files, 280 tests)
- Pass: `npm run build`
- Pass: `git diff --check`

Hosted schema deployment:
- On 2026-06-25, after user authorization, hosted Supabase migration history
  was brought into congruence with local migrations through
  `20260625221334`. The push included the pending restore preview/apply
  migrations, Ticket 037 `occurrence_sync_state`, a corrective restore RPC
  migration that changes Behavior restore upserts to `on conflict (id)`, and
  an internal function-permission hardening migration.
- Hosted schema probes confirmed `public.occurrence_sync_state` exists,
  `public.apply_behaviorlog_restore(jsonb)` has the corrected Behavior upsert,
  the imported-intervention upsert still uses `(import_run_id, external_id)`,
  `anon` cannot execute restore/internal trigger functions, and
  `authenticated` can execute the restore RPC.
- Hosted advisors passed with `--fail-on error`. Remaining warnings are the
  intentional authenticated restore `SECURITY DEFINER` RPC, hosted Auth leaked
  password protection being disabled, and pre-existing RLS init-plan
  performance warnings on older policies.

### 2026-06-25 Ticket 038: Move Occurrence Sync Off Hot Read Routes

Implementation:
- Added `ensureUserOccurrencesFresh` to check `occurrence_sync_state` before
  route rendering and to run `syncUserOccurrences` only when the account is
  stale or the requested local-date horizon is not covered.
- Timeline now asks for today plus the future Timeline horizon. Analytics and
  Export ask only through the current/exported local day and do not trigger a
  full rolling sync when the account horizon is already covered.
- Tightened occurrence generation cleanup so smaller read-route horizons cannot
  delete valid unresolved rows beyond the requested generation window.
- Added protected, idempotent `/api/occurrences/sync` processing with bounded
  `limit`, reused secret protection, auth-failure rate limiting, aggregate
  counts only, and a daily Vercel Cron entry.
- Kept behavior create/edit/archive/restore and Settings timezone writes on the
  immediate occurrence sync path so user mutations still repair future rows
  before returning.

Local production-build route timing:
- Normal `.env.local` production timing against the hosted Supabase project was
  originally blocked because the hosted schema had not yet received the Ticket
  037 `occurrence_sync_state` migration. That schema blocker was removed by
  the authorized hosted Supabase push on 2026-06-25; new hosted route timing is
  still pending a separate measurement pass.
- A local Supabase stack timing pass was run with `CADENCE_PERF_LOG=1` and the
  local test-login route against a production build. After one temporary daily
  behavior existed and the write path had synced its horizon, route spans
  showed `service.ensure_user_occurrences_fresh` with `covered=1` and
  `synced=0` for Timeline, Analytics, and Export.

Local stack full route timing after Ticket 038:

| Route | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| `/timeline` | 554ms | 684ms | 1000ms |
| `/behaviors` | 804ms | 672ms | 1258ms |
| `/analytics` | 755ms | 656ms | 655ms |
| `/export` | 1009ms | 1003ms | 682ms |
| `/settings` | 610ms | 236ms | 877ms |

Representative local server spans after Ticket 038:

| Route/action | Span | Result |
|---|---|---|
| `/timeline` | `service.ensure_user_occurrences_fresh` | `covered=1`, `synced=0`, `horizon_days=30` |
| `/analytics` | `service.ensure_user_occurrences_fresh` | `covered=1`, `synced=0`, `horizon_days=0` |
| `/export` | `service.ensure_user_occurrences_fresh` | `covered=1`, `synced=0`, `horizon_days=0` |
| Behavior edit | `service.sync_user_occurrences` | write path synced immediately, no route-role service client |
| Behavior archive | `service.sync_user_occurrences` | unresolved future rows deleted and pending reminders cancelled |
| Behavior restore | `service.sync_user_occurrences` | future horizon recreated and reminders replanned |

Functional QA:
- Timeline status action updated the visible occurrence status message.
- Export API downloads returned 200 for JSONL, CSV, full JSON, and BehaviorLog
  bundle with authenticated local test-login cookies.
- Settings timezone changed from `America/New_York` to `America/Chicago` and
  back, each time updating the one active behavior.
- Behavior edit, archive, and restore succeeded through the UI.
- The Analytics selected-day review panel rendered the correct occurrence and
  correction controls. The browser automation wrapper did not successfully
  submit the nested status form during this run; focused status/analytics
  service coverage remains the verification for that unchanged path.
- Desktop browser route sanity for `/timeline`, `/behaviors`, `/analytics`,
  `/export`, and `/settings` showed no document-level horizontal overflow. The
  only captured browser error came from the browser automation clipboard
  bridge, not app code.

Interpretation:
- Ticket 038 removes the dominant no-op occurrence sync from covered read
  routes. The remaining read-route time in the local stack is regular data
  fetching and route rendering.
- Write paths intentionally still perform immediate occurrence sync because
  correctness after behavior/timezone/archive mutations is more important than
  deferring those repairs.
- Hosted production timing no longer needs a schema push, but still needs a
  separate hosted measurement pass after the performance code is deployed.

Verification:
- Pass: `npx vitest run tests/occurrence.resolver.test.ts tests/occurrence.service.test.ts tests/occurrence-sync-route.test.ts tests/occurrence-sync-state.service.test.ts`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test` (47 files, 289 tests)
- Pass: `npm run build`

### 2026-06-25 Ticket 039: Decouple Reminder Planning From Read-Route Rendering

Implementation:
- `syncUserOccurrences` now supports an explicit reminder-planning switch.
  Existing behavior/timezone/import/restore write paths keep the default
  planning behavior.
- `ensureUserOccurrencesFresh` defaults reminder planning off when it has to
  repair occurrence rows during a page read. The protected background
  occurrence sync process explicitly opts reminder planning back in.
- Status resolution still cancels pending reminder deliveries for the resolved
  occurrence through the existing occurrence-status service path.
- `docs/NOTIFICATION_SPEC.md` now states that operational reminder planning
  belongs on occurrence-generation write paths and protected/background horizon
  syncs, not Timeline/Analytics/Export page rendering.

Interpretation:
- This is a write-boundary hardening change. No new route timing claim is made
  here because Ticket 038 already removed covered read-route occurrence sync;
  Ticket 039 prevents stale read-route fallback from creating or cancelling
  reminder deliveries while rendering.
- Reminder processor idempotence and duplicate-send safety remain based on the
  existing claim-before-send flow and due-delivery eligibility recheck.

Verification:
- Pass: `npx vitest run tests/occurrence.service.test.ts tests/reminder.service.test.ts`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test` (47 files, 293 tests)
- Pass: `npm run build`
- Pass: `git diff --check`

### 2026-06-25 Ticket 040: Auth And App-Shell Latency Reduction

Documentation check:
- Current Supabase SSR documentation recommends `getClaims()` for protecting
  pages and refreshing SSR cookies, and warns not to trust `getSession()` in
  server code.
- Supabase JavaScript reference says `getClaims()` verifies JWT claims against
  the project's JWKS endpoint and can be faster than `getUser()`, while
  `getUser()` still performs an Auth server request and is appropriate when the
  full current user record is needed.

Implementation:
- Protected-route proxy gating now uses `supabase.auth.getClaims()` instead of
  `getUser()` to decide protected-route access, authenticated `/login`
  redirects, and `/` redirects.
- The proxy emits `proxy.auth.get_claims` timing spans when
  `CADENCE_PERF_LOG=1`.
- The authenticated app layout still uses `getCurrentUser()`/`getUser()` for
  account display name and email. Settings/account and other code paths that
  need authoritative user details are unchanged.
- No service-role client, RLS bypass, or user-editable metadata authorization
  was introduced.

Local stack smoke and timing:
- Server: local Supabase env, production build, `CADENCE_ENABLE_TEST_LOGIN=1`,
  `CADENCE_PERF_LOG=1`.
- HTTP smoke:
  - unauthenticated `/timeline`: 307 to `/login?next=%2Ftimeline`, 22ms
  - anonymous `/login`: 200, 32ms
  - `/auth/test-login?next=/settings`: reached `/settings`, 296ms
  - authenticated `/settings`: 200, 36ms
  - authenticated `/login?next=/settings`: redirected to `/settings`, 33ms
- Browser smoke:
  - authenticated `/timeline`, `/behaviors`, and `/settings` rendered expected
    headings with no document-level horizontal overflow.
  - authenticated `/login?next=/settings` redirected to `/settings`.
  - only captured browser error was the automation clipboard bridge, not app
    code.

Representative local server spans:

| Span | Observed durations |
|---|---:|
| `proxy.auth.get_claims` | commonly 0.3-7.9ms |
| `proxy.auth.get_claims` | occasional 55.9-63.9ms outliers during refresh/key work |
| app layout `auth.get_current_user` | 18.0-52.5ms |

Interpretation:
- The proxy no longer needs the full Auth user object just to gate routes, so
  the route gate now follows Supabase's lower-latency claims path.
- The app layout remains a visible auth cost because account display still
  needs authoritative user metadata. Further reduction would require moving
  account display to a profile/database read or a deferred client path, which
  is intentionally left for evidence-driven future work.

Verification:
- Pass: `npx vitest run tests/supabase-proxy.test.ts tests/auth-callback-route.test.ts tests/auth-google-route.test.ts tests/test-login.test.ts`
- Pass: `npm run typecheck`
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test` (47 files, 297 tests)
- Pass: `npm run build`
- Pass: `git diff --check`

### 2026-06-25 Ticket 041: Query Evidence, Indexes, And Optional Timeline RPC

Local route timing after Tickets 038-040:
- Server: local Supabase env, production build, `CADENCE_ENABLE_TEST_LOGIN=1`,
  `CADENCE_PERF_LOG=1`.
- Account shape: temporary authenticated local test user with no active
  behaviors. This keeps the route matrix comparable for post-architecture read
  overhead, but it is not a high-cardinality index benchmark.
- Hosted production query evidence was not collected in the original Ticket
  041 pass because hosted schema deployment had not yet been authorized. The
  schema blocker was removed by the authorized 2026-06-25 Supabase push; hosted
  query evidence still needs a separate measurement pass after deployment.

| Route | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| `/timeline` | 40.7ms | 30.4ms | 34.5ms |
| `/behaviors` | 41.6ms | 24.1ms | 29.5ms |
| `/analytics` | 44.1ms | 35.3ms | 52.0ms |
| `/export` | 56.2ms | 30.5ms | 33.0ms |
| `/settings` | 28.1ms | 22.1ms | 22.9ms |

Representative warm repository spans:

| Query family | Existing support | Observed spans | Decision |
|---|---|---:|---|
| Timeline forward local-date range | `occurrences_user_local_date_idx (user_id, local_date, scheduled_for)` | 2.1-3.5ms | no new index |
| Needs decision prior unresolved | `occurrences_user_status_idx (user_id, status, local_date)` | 1.9-3.6ms | no new index |
| Retained prior resolved by `status_marked_at` | `occurrences_user_status_idx`, then `status_marked_at` filter | 2.2-4.0ms | no new index until real retained-prior volume shows need |
| Analytics local-date range | `occurrences_user_local_date_idx` | 1.6-2.7ms | no new index |
| Export through current day | `occurrences_user_local_date_idx` for current range path | 1.7-4.6ms | no new index |
| Per-behavior occurrence sync reads | unique `(behavior_id, scheduled_for)` plus behavior id uniqueness; sync skipped on covered reads | 0 behaviors in this matrix; prior Ticket 038 write-path spans acceptable locally | defer until real multi-behavior hosted evidence |
| Due pending reminders | existing `reminder_deliveries_due_unclaimed_idx (channel, scheduled_send_at) where status='pending' and processing_started_at is null` | no production send smoke; existing partial index matches processor query shape | no new index |

RPC/index decision:
- No Supabase migration was added.
- No Timeline read RPC was added. Timeline's three occurrence reads are now
  low single-digit millisecond spans locally, and total route time is dominated
  by app layout auth, rendering, and normal route work rather than repeated slow
  occurrence queries.
- Candidate indexes remain future-only until hosted production or seeded
  high-cardinality local evidence shows a specific slow query.

Verification:
- Pass: local production route timing matrix for `/timeline`, `/behaviors`,
  `/analytics`, `/export`, and `/settings`.
- Pass: `npm run agents:check`
- Pass: `npm run resolvers:check`
- Pass: `npm run lint`
- Pass: `npm run typecheck`
- Pass: `npm run test` (47 files, 297 tests)
- Pass: `npm run build`
- Pass: `git diff --check`

### 2026-06-25 Production Validation After Tickets 035-041

Environment:
- Production deployment: `dpl_3XUkDXzhPi2M7oexyJWGAvuRn4md`
- Production commit: `8ed1b3b734814d2fcd6725a252a8972f6160b6c5`
- Vercel region: `iad1`
- Canonical production URL: `https://cadence-blush-three.vercel.app`
- Chrome authenticated production tab: signed in with an existing session

Vercel deployment observations:
- The latest production deployment is `READY` and points at the current local
  `main` commit.
- Build completed successfully. The only build warning observed was the
  existing npm peer-dependency warning involving `ink` and
  `react-reconciler`; no app build failure or route-generation failure was
  present.
- Build output still classifies protected app routes as dynamic
  server-rendered routes, and legal/static utility routes as static output.

Unauthenticated production HTTP timing from this machine:

| Route/asset | Status | Runs | Notes |
|---|---:|---:|---|
| `/` | 307 | 0.690s, 0.303s, 0.220s TTFB | redirects to login |
| `/login` | 200 | 0.454s, 0.514s, 0.332s TTFB | 13.9 KB HTML |
| `/timeline` | 307 | 0.229s, 0.290s, 0.153s TTFB | protected redirect |
| `/behaviors` | 307 | 0.202s, 0.160s, 0.199s TTFB | protected redirect |
| `/analytics` | 307 | 0.154s, 0.155s, 0.205s TTFB | protected redirect |
| `/export` | 307 | 0.161s, 0.180s, 0.163s TTFB | protected redirect |
| `/settings` | 307 | 0.204s, 0.163s, 0.161s TTFB | protected redirect |
| `/terms` | 200 | 0.231s, 0.155s, 0.149s TTFB | static public route |
| `/privacy` | 200 | 0.264s, 0.149s, 0.155s TTFB | static public route |
| `/trust` | 200 | 0.162s, 0.233s, 0.166s TTFB | static public route |
| `/brand/cadence-logo.png` | 200 | 1.044s, 0.248s, 0.378s total | 748 KB raw source, Vercel cache hit on header check |
| `/sounds/completion-chime.mp3` | 200 | 0.197s, 0.144s, 0.185s total | 26 KB, Vercel cache hit on header check |

Static asset header check:
- `/brand/cadence-logo.png` and `/sounds/completion-chime.mp3` now return
  `Cache-Control: public, max-age=86400, stale-while-revalidate=604800` in
  production.
- Both assets returned `x-vercel-cache: HIT` during the header check.

Authenticated production full route loads in Chrome:

| Route | Run 1 | Run 2 | Run 3 | Median | Baseline median |
|---|---:|---:|---:|---:|---:|
| `/timeline` | 833ms | 1228ms | 795ms | 833ms | 2272ms |
| `/behaviors` | 637ms | 752ms | 612ms | 637ms | 798ms |
| `/analytics` | 850ms | 890ms | 723ms | 850ms | 2263ms |
| `/export` | 1123ms | 967ms | 786ms | 967ms | 1642ms |
| `/settings` | 644ms | 790ms | 516ms | 644ms | 608ms |

Authenticated production client navigation clicks:

| Click | Time To Target Heading | Baseline |
|---|---:|---:|
| Timeline -> Behaviors | 1051ms | 1063ms |
| Behaviors -> Analytics | 1026ms | 1622ms |
| Analytics -> Export | 1091ms | 1761ms |
| Export -> Settings | 802ms | 746ms |
| Settings -> Timeline | 1011ms | 1622ms |

Mobile production sanity:

| Route | Time To Heading | Viewport | Horizontal overflow |
|---|---:|---|---|
| `/timeline` | 1359ms | `390x844` | no |
| `/behaviors` | 810ms | `390x844` | no |
| `/analytics` | 718ms | `390x844` | no |
| `/export` | 883ms | `390x844` | no |
| `/settings` | 765ms | `390x844` | no |

Safe process-route checks:
- Missing-secret `/api/reminders/process?limit=1` returned 401 in 946ms,
  527ms, and 238ms.
- Missing-secret `/api/occurrences/sync?limit=1` returned 401 in 278ms,
  517ms, and 169ms.
- No production reminder send or occurrence sync job was triggered.

Console findings:
- A fresh authenticated desktop production tab rendered `/timeline` with no
  warning or error console entries.
- A mobile-first authenticated production check at `390x844` also rendered
  `/timeline` with no warning or error console entries.
- One React hydration `#418` entry appeared when mobile emulation was applied
  to an already loaded desktop tab and then routes were navigated. A clean
  mobile-first tab did not reproduce it, so this pass records it as an
  emulation-transition artifact unless it recurs in ordinary mobile browsing.

Interpretation:
- The production deployment includes the performance architecture work and
  validates the main goal: Timeline, Analytics, and Export no longer show the
  1.6-2.3s median route loads recorded in the baseline production pass.
- Client navigation is better for Analytics, Export, and Timeline return
  paths, but Timeline -> Behaviors is essentially unchanged and
  Export -> Settings is slightly slower in this single pass. This looks like
  normal dynamic-route variance rather than a new product issue.
- Settings did not benefit from occurrence-sync changes because it was not one
  of the sync-heavy routes.
- No index, RPC, cache, offline, or UI-scope expansion is justified by this
  production validation pass.

Verification:
- Pass: Vercel project/deployment inspection confirmed production `READY` at
  commit `8ed1b3b734814d2fcd6725a252a8972f6160b6c5`.
- Pass: Vercel build-log inspection for deployment
  `dpl_3XUkDXzhPi2M7oexyJWGAvuRn4md`.
- Pass: unauthenticated production route timing with `npm run perf:routes`.
- Pass: authenticated production Chrome route-load timing for `/timeline`,
  `/behaviors`, `/analytics`, `/export`, and `/settings`.
- Pass: authenticated production Chrome navigation timing across the primary
  app routes.
- Pass: authenticated mobile production sanity at `390x844` for primary app
  routes with no horizontal overflow.
- Pass: safe missing-secret 401 checks for `/api/reminders/process` and
  `/api/occurrences/sync`.
- Pass: production asset cache-header check for the raw logo and completion
  chime assets.

## Future-Only Recommendations

- The architectural follow-up work from this section has been filed in
  `docs/TICKETS.md` as Tickets 035-041 and completed through the production
  validation pass above.
- Add a scoped note form state update for Analytics so note saves can avoid a
  full route refresh while still updating the review summary immediately.
- Revisit the occurrence-generation planner contract before attempting smaller
  sync horizons for Analytics or Export. The current planner can delete future
  unresolved rows outside the requested horizon, so a smaller horizon is not a
  safe drop-in optimization.
- Add database indexes only if a later hosted or seeded high-cardinality timing
  pass shows a specific slow query. Add indexes only through migrations with
  `docs/DATA_MODEL.md` and type updates when the evidence is clear.
- Consider a low-risk service cache or background refresh strategy for
  occurrence sync only if a later production timing pass shows route sync is
  again the dominant cost.
