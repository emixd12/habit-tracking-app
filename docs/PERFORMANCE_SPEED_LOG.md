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
| Behaviors | `/behaviors` | cold load, warm reload, create-section open, range changes, behavior-date review open |
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
| Behavior date review | open behavior-date review and change status/note | report refreshes |
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

## 2026-06-26 Follow-Up Speed Pass

Trigger: after the Web App Performance Speed Loop completed, the app still felt
sluggish. This pass continued local production-build optimization using the
same protected route matrix and authenticated temporary test-login account.

Changes:

- Replaced ordinary app-route user-id reads with verified Supabase Auth claims
  (`getClaims()`) while keeping full `getUser()` for strict account operations.
- Preloaded `occurrence_sync_state` in Timeline, Analytics, and Export so
  covered freshness checks avoid their own duplicate state read.
- Streamed protected page content behind immediate route shells for Timeline,
  Behaviors, Analytics, Export, and Settings.
- Reused one BehaviorLog import-run query for both Export import and restore
  panels.
- Removed redundant occurrence reads from note saves and status-event timezone
  lookups.
- Deferred behavior CRUD occurrence/reminder repair through the existing stale
  freshness contract instead of running heavy sync inside the action.
- Optimized create behavior by relying on database category ownership
  constraints, submitting the page-loaded default timezone, returning only the
  inserted behavior row, and inserting new schedule slots without a pre-read.

Significant-change measurements:

| Stage | Local production-build result |
|---|---:|
| Auth claims + preloaded freshness state | route TTFB under 20ms; full stream medians: Timeline ~396ms, Behaviors ~177ms, Analytics ~346ms, Export ~363ms, Settings ~180ms |
| Streaming route shells | route TTFB under 21ms; full streams stayed DB-bound |
| Export import-run reuse | Export full stream remained ~340-400ms on empty test data |
| Create behavior before action changes | `2446ms` |
| Create behavior after deferring sync | `1285ms` |
| Create behavior after removing category read/parallelizing writes | `1056ms` |
| Create behavior after insert-only slots + submitted timezone | `715ms` |

Final local production-build route matrix after warmup, authenticated temporary
test account with 5 active behaviors:

| Route | Median TTFB | Median full stream | Notes |
|---|---:|---:|---|
| `/timeline` | 12.5ms | 386.8ms | 155 generated occurrences in payload |
| `/behaviors` | 10.8ms | 188.3ms | 5 active behaviors |
| `/analytics` | 7.7ms | 366.8ms | 5 occurrences in range |
| `/export` | 11.3ms | 588.4ms | export status/reminder history reads dominate |
| `/settings` | 8.7ms | 179.8ms | single profile/settings read |

Interpretation:

- The app now delivers protected route shells in under 100ms locally.
- Full authenticated data streams and normal form-action responses did not
  reach the requested 100ms target under local-to-hosted-Supabase conditions.
  The remaining warm spans are dominated by required hosted Supabase reads or
  writes at roughly 155-200ms each from this machine.
- Reaching sub-100ms full data responses would require a different architecture
  boundary, such as database-side page RPC aggregation, colocated backend/data
  execution with measured sub-100ms database round trips, or client-side
  optimistic action flows that do not wait for full route re-rendering.

Production deployment:

- Deployed this follow-up pass with
  `npx vercel deploy --prod --yes --scope emis-projects-4c886aeb`.
- Vercel deployment `dpl_VgjDqGJ82FoMK4SK6Kafh8yw78sX` is `Ready` and aliased
  to `https://cadence-blush-three.vercel.app`.
- Unauthenticated production smoke after deploy: `/login` returned `200`, and
  protected app routes returned expected `307` redirects to login.

## 2026-06-26 Ticket 042: Production Region And DB Round-Trip Evidence

Read-only evidence pass against production found no app/database region
mismatch.

Environment:

- Production deployment: `dpl_J82v2C9abHaoPSZBRR7EcdEsLNFB`
- Production status: `READY`
- Canonical production URL: `https://cadence-blush-three.vercel.app`
- Vercel function region evidence: deployment API reports `regions: ["iad1"]`;
  Vercel inspect/build output also shows dynamic lambda outputs in `iad1`.
- Supabase project: `qjodzutjxtmtzczbloxa`
- Supabase project region: `us-east-1`
- Supabase project status: `ACTIVE_HEALTHY`

Authenticated production full route loads in Chrome:

| Route | Run 1 | Run 2 | Run 3 | Median |
|---|---:|---:|---:|---:|
| `/timeline` | 796ms | 710ms | 646ms | 710ms |
| `/behaviors` | 582ms | 647ms | 534ms | 582ms |
| `/analytics` | 591ms | 662ms | 586ms | 591ms |
| `/export` | 670ms | 581ms | 634ms | 634ms |
| `/settings` | 541ms | 253ms | 249ms | 253ms |

Server-side timing limitation:

- Existing production instrumentation could not provide Supabase span evidence
  because `CADENCE_PERF_LOG` is not configured in production.
- `vercel logs --query performance_timing` returned no timing messages.
- Vercel runtime request logs showed authenticated route requests returning
  `200` with `cache: MISS`, but no app timing payloads.
- A local-machine probe to the Supabase REST endpoint returned the expected
  unauthenticated `401` with the project ref header and about `89ms` to first
  byte. This confirms endpoint reachability from the test machine but is not
  function-to-database timing evidence.

Interpretation:

- Do not move production infrastructure based on current evidence. Vercel
  `iad1` and Supabase `us-east-1` are already both US East placement.
- The remaining latency is more likely from dynamic route work, multiple
  Supabase/Auth/Data API round trips, RSC streaming, and post-action render
  work than from geographic distance.
- The lowest-risk path is to keep the current placement and pursue narrow
  RPC/cache/action-flow mitigation only where measurements identify repeated
  Supabase round trips or post-action re-rendering as the bottleneck.

Verification:

- Pass: production Vercel deployment/API inspection for deployment region.
- Pass: Supabase project list inspection for project region.
- Pass: authenticated Chrome route matrix for `/timeline`, `/behaviors`,
  `/analytics`, `/export`, and `/settings`.
- Pass: production log inspection confirmed no `performance_timing` span events
  were available.
- Pass: `npm run agents:check`.

## 2026-06-26 Tickets 043-046: RPC, Cache, Optimistic UI, And Targeted Mutation Follow-Up

Implementation:

- Ticket 043 adds `public.get_export_page_read_bundle(date, date)` as a narrow
  `SECURITY INVOKER` Export-page RPC. It keeps export date-range resolution,
  occurrence freshness, formatting, and BehaviorLog bundle creation in
  TypeScript, but collapses the normal fresh Export read from seven
  authenticated data reads after auth/profile flow to profile timezone plus one
  page bundle RPC.
- Ticket 044 adds a per-user read-through cache for stable authenticated data:
  profile timezone/settings, behavior lists, categories, and BehaviorLog
  import-run metadata. Cache misses still use the ordinary authenticated
  Supabase client and RLS. Occurrences, status events, reminder deliveries,
  push subscriptions, and account deletion authorization data remain uncached.
- Ticket 045 adds row-local optimistic Timeline status projection for
  Completed and Not Completed. The visual row updates immediately with
  `aria-busy`/status feedback, rolls back on server-action error, and still
  reconciles through the server result and existing `router.refresh()` path.
  Note-save optimism was left out because the note form remount/default-value
  pattern needs a separate scoped change.
- Ticket 046 changes Behavior create to return a server-confirmed
  `BehaviorView`, skip current-route `/behaviors` revalidation, and insert the
  confirmed row into the client list. It still revalidates `/timeline` because
  a new active behavior can affect generated occurrences.

Call-count expectations:

| Surface/action | Before | After |
|---|---:|---:|
| Fresh Export page data after auth/profile | categories, behaviors, sync state, occurrences, status events, reminder deliveries, plus profile | profile timezone plus `get_export_page_read_bundle` |
| Timeline/Analytics stable reads | profile timezone and behavior list on every render | warm per-user cache hit until mutation invalidation or TTL expiry |
| Behaviors page stable reads | categories, behaviors, profile timezone on every render | warm per-user cache hit until mutation invalidation or TTL expiry |
| Settings profile read | profile settings on every render | warm per-user cache hit until timezone/account invalidation or TTL expiry |
| Behavior create visible update | server write plus `/behaviors` and `/timeline` revalidation | server write, small confirmed result, local list insert, `/timeline` revalidation only |

Cache invalidation:

- Behavior create/update/archive/restore clears behavior/category/timezone
  buckets for that user.
- Settings timezone change clears profile and behavior buckets for that user.
- BehaviorLog import/restore preview/status updates clear import-run buckets.
- BehaviorLog import/restore apply clears behavior/category buckets.
- Account deletion clears all read-cache buckets for the deleted user.

Verification:

- Pass: `SUPABASE_NO_TELEMETRY=1 npm run supabase -- db reset`.
- Pass: local SQL probe confirmed the Export RPC is not `SECURITY DEFINER`, has
  `search_path=public`, is not executable by `anon`, and is executable by
  `authenticated`.
- Pass: local RPC shape probe returned the expected top-level bundle keys.
- Pass: `SUPABASE_NO_TELEMETRY=1 npm run supabase -- db advisors --local --type all --fail-on error`
  with only pre-existing RLS init-plan warnings.
- Pass: `npx vitest run tests/user-read-cache.test.ts tests/behavior-create.service.test.ts tests/behavior-actions.test.ts tests/behavior-list-state.test.ts tests/timeline-optimistic-status.test.ts tests/settings.service.test.ts tests/behaviorlog-import-ui.test.tsx tests/behaviorlog-restore-ui.test.tsx tests/export.resolver.test.ts`.
- Pass: `npm run lint`.
- Pass: `npm run typecheck`.

Remaining measurement:

- Hosted Supabase received migration
  `20260626032324_add_export_page_read_rpc.sql` with
  `npm run supabase -- db push --linked --yes`.
- Production deployment `dpl_4FtW7Fhw9gmJeDLtHL5e836huGog` is `READY`, aliased
  to `https://cadence-blush-three.vercel.app`, and built in `iad1`.
- Unauthenticated production smoke after deploy: `/login` returned `200`;
  `/timeline` and `/export` returned expected `307` redirects to login.

Authenticated production full route loads in Chrome after deploy:

| Route | Run 1 | Run 2 | Run 3 | Median |
|---|---:|---:|---:|---:|
| `/timeline` | 963ms | 426ms | 1206ms | 963ms |
| `/behaviors` | 532ms | 280ms | 231ms | 280ms |
| `/analytics` | 384ms | 429ms | 445ms | 429ms |
| `/export` | 539ms | 322ms | 1500ms | 539ms |
| `/settings` | 431ms | 251ms | 264ms | 264ms |

The Chrome timing method used wall-clock navigation-to-load timing plus a
small DOM state check, because the browser runtime used for this pass did not
expose page `performance` APIs. All five routes rendered authenticated app
content and did not redirect to login.

## 2026-06-26 Ticket 047: Production Performance Timing Log Sampling

Implementation:

- Added Ticket 047 to `docs/TICKETS.md` for hosted production sampling of the
  existing Ticket 035 instrumentation.
- Documented `CADENCE_PERF_LOG=1` in `docs/VERCEL_WORKFLOW.md` as an optional
  Production sampling flag for privacy-safe server timing spans.
- Added `CADENCE_PERF_LOG=1` to the Vercel Production environment for the
  `cadence` project and redeployed production so the runtime received it.
- Production deployment `dpl_GyGQSJX5dCQzyRxA4zXyiEH8K7SN` is `READY`,
  aliased to `https://cadence-blush-three.vercel.app`, and built in `iad1`.

Authenticated Chrome route loads after enabling production timing:

| Route | Run 1 | Run 2 | Run 3 | Median |
|---|---:|---:|---:|---:|
| `/timeline` | 3614ms | 1605ms | 414ms | 1605ms |
| `/behaviors` | 914ms | 275ms | 204ms | 275ms |
| `/analytics` | 369ms | 748ms | 800ms | 748ms |
| `/export` | 531ms | 351ms | 417ms | 417ms |
| `/settings` | 434ms | 246ms | 344ms | 344ms |

A second cache-busted route pass rendered authenticated app content with no
login redirects:

| Route | Elapsed |
|---|---:|
| `/timeline?perf_sample=...` | 977ms |
| `/behaviors?perf_sample=...` | 550ms |
| `/analytics?perf_sample=...` | 811ms |
| `/export?perf_sample=...` | 543ms |
| `/settings?perf_sample=...` | 364ms |

Representative production server spans from `vercel logs --query
performance_timing`:

| Route | Span | Observed duration | Counts |
|---|---|---:|---|
| `/timeline` | `page.bundle_load` | 127.5-1470.3ms | 8 timeline sections |
| `/timeline` | `service.ensure_user_occurrences_fresh` | 0-576.1ms | covered reads reported `covered=1`, repair reported `synced=1`, 19 behaviors, 10 created |
| `/timeline` | `db.list_occurrences_between_local_dates` | 44.1-533.2ms | 307 occurrences |
| `/behaviors` | `page.data_load` | 5.9-337.6ms | 8 categories, 12 active, 7 archived |
| `/analytics` | `page.data_load` | 83.4-478.1ms | 30-day range, 16 behavior summaries |
| `/export` | `page.data_load` | 187.4-296.8ms | 12 behaviors, 136 occurrences, 1 import run |
| `/export` | `db.get_export_page_read_bundle` | 60.1-94.9ms | profile, sync state, categories, behaviors, slots, occurrences, events, reminders |
| `/settings` | `page.data_load` | 10.0-168.7ms | no user payload counts |
| `app_layout` | `auth.get_current_user_claims` | 7.2-274.8ms | no user payload counts |
| primary routes | `proxy.auth.get_claims` | usually 1-6ms, one cold outlier at 374ms | no user payload counts |

Interpretation:

- Production timing logs now provide server span attribution. The prior Ticket
  042 limitation is closed.
- The app messages emitted by the timing utility are sanitized JSON containing
  `source`, `kind`, `route`, `span`, `duration_ms`, `status`, and aggregate
  counts only. The sampled app messages did not include emails, behavior
  titles, notes, cookies, provider tokens, request bodies, or response bodies.
- Warm covered occurrence-freshness checks are effectively free in the sampled
  logs (`covered=1`, `synced=0`, `0-0.2ms`). When a read route has to repair
  freshness, Timeline can still spend about `576ms` in
  `service.ensure_user_occurrences_fresh`, and that single repair explains the
  slowest sampled Timeline page load.
- The per-user read-through cache is visible indirectly: repeated Behaviors
  and Settings page data spans can drop to roughly `5.9-35.9ms` and
  `10.0-10.6ms` when stable reads are warm. Repository spans reappear on
  misses, TTL expiry, new Vercel instances, or invalidation.
- Export's page-level RPC is behaving as intended: the sampled bundle RPC
  completed in roughly `60.1-94.9ms`, with the overall Export data load around
  `187.4-296.8ms`.

Remaining risk:

- `CADENCE_PERF_LOG=1` is intentionally enabled in Production after this
  ticket. The output is sanitized, but it increases runtime log volume while
  enabled and should be turned off when active production sampling is no longer
  useful.
- The read-through cache remains per server instance and short TTL. It reduces
  repeated stable reads on warm instances, but it is not a shared durable cache.

Verification:

- Pass: `npx vercel env ls production --scope emis-projects-4c886aeb`
  confirmed `CADENCE_PERF_LOG` is present in Production.
- Pass: `npx vercel deploy --prod --yes --scope emis-projects-4c886aeb`
  created deployment `dpl_GyGQSJX5dCQzyRxA4zXyiEH8K7SN`.
- Pass:
  `npx vercel inspect cadence-17t607jh1-emis-projects-4c886aeb.vercel.app --scope emis-projects-4c886aeb`
  confirmed the deployment is `READY`, aliased to production, and built in
  `iad1`.
- Pass: authenticated Chrome route matrix rendered `/timeline`, `/behaviors`,
  `/analytics`, `/export`, and `/settings` without login redirects.
- Pass:
  `npx vercel logs cadence-blush-three.vercel.app --scope emis-projects-4c886aeb --since 35m --query performance_timing --json`
  returned sanitized `performance_timing` events for proxy auth, app layout
  auth, Timeline bundle load, primary page data loads, Export RPC reads,
  occurrence freshness, and repository reads.

## First-screen transfer reduction: completion chime defer

Date: 2026-06-30.

Scope:
- Reduce compressed transfer before the authenticated first screen appears.
- Use the production build report only for candidate orientation, then validate
  actual transferred bytes through browser network events.
- Keep a candidate only if checks pass, desktop and mobile screenshots are
  pixel-identical, and transferred bytes decrease.

Measurement method:
- Local production build served with `next start` at `http://localhost:3210`.
- Existing authenticated browser session navigated from
  `/login?next=%2Ftimeline` to the product first screen, `/timeline`.
- Browser cache disabled through CDP.
- Transfer bytes are summed from CDP `Network.loadingFinished.encodedDataLength`
  for same-origin requests through `load + 1500ms`.
- Screenshots were captured at `1280x720` desktop and `390x844` mobile.

Baseline:

| Viewport | Transferred bytes | Largest avoidable transfer |
|---|---:|---|
| Desktop | 413,674 | `completion-chime.mp3` loaded twice, 52,179 bytes total |
| Mobile | 380,083 | `completion-chime.mp3` loaded twice, 52,179 bytes total |

Kept change:
- `components/timeline/StatusButtons.tsx` no longer calls
  `preloadCompletionChime()` on mount. The completion chime remains prepared
  from the status button user gesture and can still fall back to synthesized
  audio.

After:

| Viewport | Transferred bytes | Delta | Screenshot comparison |
|---|---:|---:|---|
| Desktop | 361,465 | -52,209 | Pixel-identical |
| Mobile | 327,872 | -52,211 | Pixel-identical |

Stop reason:
- The remaining large transferred items are first-screen document, JavaScript,
  font, CSS, and Timeline banner image resources. Further reductions would need
  a broader UI or loading-priority tradeoff rather than a low-risk defer.

Verification:
- Pass: `npm run agents:check`.
- Pass: `npm run resolvers:check`.
- Pass: `npm run lint`.
- Pass: `npm run typecheck`.
- Pass: `npm run test` (55 files, 339 tests).
- Pass: `npm run build`.
- Pass: pixel-level desktop and mobile screenshot comparison with `sharp`.

## 2026-07-29 Ticket 064 local many-account read baseline

Scope:

- Run the bounded local-only Locust read suite against a production-mode
  persistent Next.js process and the project-local Docker Supabase stack.
- Use one disposable ordinary authenticated session per active virtual user.
- Keep account creation, sign-in, session refresh, fixture writes, route
  prewarm, and deterministic route assertions outside timed statistics.
- Exercise public documents, protected Timeline/Behaviors/Export/Settings
  documents, query states, and JSONL/CSV/full JSON/BehaviorLog downloads.

Environment:

- Run ID: `20260729t091314z-911e90cdbcf7`
- Command: `npm run load:read:full`
- Hardware: Apple M5, 10 logical CPUs, 32 GiB memory, macOS arm64
- Runtime: Node `v22.22.3`, Next.js `16.2.7`, Python `3.14.6`, Locust
  `2.46.2`, Docker `29.4.3`, Supabase CLI `2.105.0`
- Application: local production build under a persistent Node process
- Data target: project-local Supabase CLI Docker stack
- Shared-machine caveat: 44 containers and four local Supabase stacks were
  running; measurements include that contention.
- Warm/cold caveat: the app and all ordinary sessions were prewarmed; this run
  does not measure cold starts.
- Workload weights are initial product assumptions, not observed analytics.

Fixture and safety evidence:

- 105 independent accounts: 10 Empty, 60 Typical daily, 20 Review-heavy, 10
  Export-heavy, and five reserved Heavy schedule.
- Pre- and post-load integrity each checked 70,010 owned rows with zero
  violations.
- Deterministic preflight covered all 15 required route/request contracts,
  including all four full-scope export formats with archived behaviors and
  notes.
- Every 5/10/25/50/100-user default stage excluded Heavy schedule identities.
  Only `heavy-5` selected the five reserved Heavy schedule accounts.
- No provider calls were enabled. Locust received no service-role, Sequenzy,
  Web Push, reminder-process, or cron secret.

Results:

| Stage | Users | Achieved duration | Requests | Failures | RPS | p50 | p75 | p95 | p99 | Response bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Smoke | 1 | 181.0s | 46 | 0 | 0.26 | 43ms | 50ms | 64ms | 81ms | 15,545,448 |
| Warm calibration | 1 | 121.5s | 27 | 0 | 0.23 | 43ms | 49ms | 63ms | 66ms | 9,803,760 |
| Baseline | 5 | 601.4s | 755 | 0 | 1.26 | 38ms | 45ms | 64ms | 71ms | 219,989,048 |
| Baseline | 10 | 601.5s | 1,491 | 0 | 2.48 | 37ms | 45ms | 64ms | 80ms | 458,508,550 |
| Ramp | 10 | 240.9s | 598 | 0 | 2.49 | 37ms | 47ms | 66ms | 92ms | 191,587,088 |
| Ramp | 25 | 240.6s | 1,479 | 0 | 6.17 | 33ms | 46ms | 65ms | 98ms | 457,967,698 |
| Ramp | 50 | 241.2s | 2,956 | 1 (0.034%) | 12.28 | 29ms | 43ms | 69ms | 120ms | 913,592,539 |
| Ramp | 100 | 240.9s | 5,896 | 4 (0.068%) | 24.53 | 28ms | 43ms | 96ms | 160ms | 1,824,469,086 |
| Recovery | 10 | 301.4s | 741 | 0 | 2.47 | 38ms | 46ms | 63ms | 79ms | 228,929,152 |
| Heavy schedule | 5 | 301.2s | 365 | 0 | 1.21 | 61ms | 71ms | 110ms | 140ms | 323,693,008 |

Interpretation:

- All 10 stage gates passed. The warm p95 was 63ms, so the provisional
  two-times ceiling was 126ms; the highest stage p95 was 110ms in the
  separately tagged Heavy schedule stage.
- The 10-user recovery p95 was 63ms versus the pre-ramp 64ms baseline, within
  the required 10% recovery bound. Both stages recorded zero failures.
- Ramp-50 recorded one and Ramp-100 recorded four transport-level status `0`
  failures. Their aggregate failure ratios were 0.034% and 0.068%,
  respectively, below the provisional 0.5% gate. There were zero unexpected
  `5xx` responses, Locust exceptions, cross-account markers, and resource
  breaches.
- Across all stages, 14,354 requests transferred 4,644,085,377 response bytes.
  Peak measured throughput was 24.53 requests/second at 100 users.
- Maximum observed host load was 1.053 per logical CPU. Minimum available
  memory was 8,961,687,552 bytes. Maximum app and Locust RSS were 720,076,800
  and 117,686,272 bytes.
- These results establish a local persistent-Node baseline only. They do not
  establish Vercel, hosted Supabase, cold-start, regional-network, or
  production capacity.

Post-run verification:

- Pass: timed coverage observed every one of the 15 normalized request names.
- Pass: post-load local two-user RLS smoke.
- Pass: exact cleanup deleted all 105 run users and left zero product rows.
- Pass: independent local database count found zero remaining
  `cadence-load-...@example.invalid` Auth users.
- Pass: private session material was removed; retained aggregate reports were
  sanitized under owner-only permissions.

## 2026-07-29 Ticket 065 provisional local mutation evidence

Status: exploratory evidence only; no final Ticket 065 capacity result.

Scope and interpretation:

- These runs exercised the local production-mode Next.js process, the
  project-local Supabase Docker stack, ordinary authenticated sessions, and
  synthetic mutation fixtures.
- Provider isolation was local and deterministic. Non-operator stages required
  zero fake-provider requests; operator-capable fixtures could target only the
  supervisor-owned loopback fake Sequenzy service. Bounded loopback fake sends
  are expected operator evidence, while zero real-provider sends are permitted.
  No active push subscription, real Sequenzy endpoint, Web Push credential,
  Google OAuth flow, or hosted target was part of this evidence.
- Every run owned an exact set of synthetic accounts and cleanup selectors.
  Cleanup used the exact run ID and Auth users, not a database reset or broad
  data selector.

Calibration caveat:

- The representative mutation calibration is one composite user for three
  minutes. Its declared task selection reproduces the ordinary 100-point mixed
  role weights, but the measured p95 comes from one synthetic identity and
  roughly 80-90 HTTP requests. The empirical tail is consequently coarse and
  does not represent every cohort or guarantee every low-frequency request
  name appears in that stage.
- The representative calibration and mixed workload declare a 2–5-second think
  time. Current evidence retains that pacing assumption in both declaration
  and summary artifacts.
- Twice the same-run aggregate calibration p95 is a provisional local stop/go
  gate. It is not a stable regression threshold, service-level objective,
  hosted-capacity estimate, or production claim. Full-run request-name,
  cohort, integrity, recovery, soak, contention, operator, and cleanup evidence
  remains independently required.

Completed exploratory artifacts:

| Run | Calibration | Observed outcome | Integrity and cleanup | Use |
|---|---|---|---|---|
| `20260729t143431z-30c2e8280cdf` | 91 requests; p95 110ms; provisional ceiling 220ms | Ramp passed at 10, 25, and 50 users, then ramp-100 reached p95 950ms. This artifact predates the final rule that all four ramps continue after p95-only breaches. | Post-failure inspection found 30 `reminder_count_below_baseline` violations. RLS passed; exact cleanup deleted 100 of 100 users with zero residual product rows. | Rejected as capacity evidence because correctness inspection failed. It identified the need for canonical active-state restoration and mandatory integrity after a performance boundary. |
| `20260729t155300z-8eb75380068e` | 82 requests; p95 90ms; provisional ceiling 180ms | Under the earlier supervisor, ramp-25 recorded a p95-only terminal at 350ms and ramp-50/ramp-100 were skipped. The independent spike baseline later failed at p95 200ms. Current semantics would retain the breach and execute both later ramp plateaus. | The forced checkpoint immediately after ramp-25 had zero violations. Final post-failure integrity and RLS passed; exact cleanup deleted 100 of 100 users with zero residual product rows. | Useful historical control-flow and integrity evidence, but not a capacity result because the selected suite did not complete and did not execute the current ramp contract. |

Shared-host caveat and retry policy:

- The second artifact showed a broad slowdown rather than one isolated route.
  Compared with the earlier exploratory run, ramp-25 had nearly equal
  throughput and read/write mix but aggregate p95 increased from 99ms to
  350ms. All 17 observed stable request names were slower, while maximum
  one-minute host load rose from 0.637 to 1.775 per logical CPU.
- That pattern is consistent with shared-host contention, but the retained
  aggregate samples do not attribute CPU work to a specific competing process.
  Both artifacts also recorded a dirty working tree rather than an exact patch
  fingerprint. The evidence supports a controlled retry, not a claim that
  contamination was proven.
- A retry must use a new exact run on an otherwise quiet machine without
  changing source, workload weights, calibration rules, or gates. Evidence
  from different run IDs must not be merged. A repeated boundary under quiet
  conditions is treated as real local product or stack evidence.

Durable boundary and soak rules:

- A p95-only ramp breach is retained as
  `recorded_ramp_latency_breach: true` with a non-passing plateau, forces an
  integrity checkpoint, and does not stop the later declared ramps. All four
  10/25/50/100-user ramp plateaus execute. An unexpected request-failure ratio
  or any safety, semantic, integrity, real-provider, resource, ceiling, `5xx`,
  or exception failure still aborts.
- Breakpoint may retain its first nominal performance failure as a terminal
  non-passing boundary and skip later breakpoint plateaus. Recorded ramp
  breaches, breakpoint terminals, and expected spike-stress outcomes require
  an immediate integrity checkpoint before subsequent traffic.
- The reported capacity point is the highest executed `plateau_passed` user
  count and achieved requests per second, never a breached or terminal stage.
- A soak requires all four same-run ramp plateaus and a passing ramp-25. It
  must be strictly below the lowest integrity-clean recorded ramp latency
  boundary; when no ramp boundary was observed, a passing plateau strictly
  above 25 users supplies the boundary. The standalone soak profile includes
  calibration, those four ramps, and the 60-minute soak. Full-run evidence
  also reconciles the completed soak against the later breakpoint.

Interrupted and rejected evidence:

- Run `20260729t181001z-24f992ad9c46` was interrupted during the selected
  lifecycle and never passed. It has no `completion.json` or final
  `summary.json`; retained progress and individual stage artifacts are
  incomplete evidence and provide no capacity result.
- Manual cleanup was performed with the exact run ID after interruption. That
  recovery does not convert the run into a passing lifecycle. The run remains
  rejected permanently; do not add a capacity, terminal, or acceptance value
  from it.
- Run `20260729t201355z-db87da10d00c` failed closed on the first smoke request
  because the harness attempted to discover a prior-day action inside the
  client-mounted Needs decision dialog from raw server HTML. RLS passed; exact
  cleanup deleted 100 of 100 users with zero residual product rows. Its failed
  completion sentinel retained zero completed stages and correctly classified
  all six partial smoke artifacts as orphans. The repaired harness uses the
  existing selected behavior/day server-rendered action surface.
- Run `20260729t204734z-18013736cbff` passed smoke, calibration, and both mixed
  baselines, then failed closed during `ramp-10`. One Export-heavy identity's
  second-latest due/past occurrence was 34 days old, outside the selected
  30-day review window, so its setup GET lacked the selected-day marker.
  Baseline-5 recorded 1,477 requests at p95 100ms and baseline-10 recorded
  2,898 requests at p95 120ms, both with zero failures, but the artifact is not
  capacity evidence because the ramp did not complete. RLS passed; exact
  cleanup deleted 100 of 100 users with zero residual product rows. The
  corrected fixture bounds the selected occurrence to 90 days, uses the
  90-day review surface, and prewarms that surface for every identity.
- Run `20260729t213920z-1e245694539d` passed smoke, calibration, both mixed
  baselines, and all four ramp plateaus with zero request failures. The
  representative calibration p95 was 94ms; ramp p95 values were 88ms at 10
  users, 100ms at 25, 200ms at 50, and 2,300ms at 100. The 50- and 100-user
  plateaus were nominal latency boundaries, while ramp-25 remained the highest
  passing plateau. The run then failed closed because Locust's asynchronous
  CSV sampler retained 152 successful `INT-BEHAVIOR-023` requests while its
  final HTML, console summary, and one-use semantic receipt ledger all retained
  154 successful submissions with 154 completed readbacks. The final
  in-memory request snapshot now atomically replaces only the existing
  `_stats.csv` during Locust shutdown, preserving the exact six-artifact
  contract without tolerating mismatches. The run also exposed an unreachable
  soak boundary branch: soak-25 now requires all four ramps, a passing
  ramp-25, and either an integrity-clean recorded boundary or a passing
  plateau strictly above 25. RLS passed; all 48 completed-stage artifacts
  reconciled with no orphans; exact cleanup deleted 100 of 100 users with zero
  residual product rows. This rejected run remains diagnostic evidence only.
- Run `20260729t225646z-3a40ecd7daf3` passed smoke, calibration, both mixed
  baselines, and ramp-10/ramp-25. Calibration p95 was 110ms; ramp p95 values
  were 100ms at 10 users, 170ms at 25, 580ms at 50, and 2,700ms at 100.
  Ramp-50 was an integrity-clean latency boundary. Ramp-100 recorded 7,161
  requests, two ordinary GET connection-reset failures, zero `5xx`, and no
  resource breach before stopping at 232.976 of 240 seconds. Final in-memory
  request accounting matched successful Server Action submissions, proving
  the prior CSV correction, but 16 successful submissions were still awaiting
  readback when shutdown began. The runtime guard had misclassified generic
  loopback HTTP resets as database refusals; an unrecorded third reset invoked
  inline reentrant shutdown before Locust's statistics listener could retain
  the triggering request or reason. The classifier now requires explicit
  database context or an unambiguous database-capacity refusal, and guarded
  abort is one-shot, reason-retaining, and deferred until request accounting
  completes. Post-failure integrity and RLS passed, the exact 100 of 100 users
  were deleted with zero residual product rows, and all 48 artifacts
  reconciled with no orphans. This run is rejected diagnostic evidence, not a
  capacity result.
- Run `20260730t014631z-063151d6e33e` completed its calibration and all four
  ramp stages, but its completion status is failed and it remains rejected.
  Exact retained stage metrics were:
  - calibration: 181.241s, 103 requests, zero failures, 0.5796 RPS, and
    p50/p75/p95/p99 of 45/73/100/120ms;
  - ramp-10: 240.766s, 1,244 requests, zero failures, 5.1848 RPS, and
    37/52/86/130ms;
  - ramp-25: 241.294s, 2,927 requests, zero failures, 12.1572 RPS, and
    33/50/92/130ms;
  - ramp-50: 241.375s, 5,875 requests, zero failures, 24.3908 RPS, and
    42/75/150/220ms; and
  - ramp-100: 243.158s, 8,924 requests, one non-`5xx` failure (0.0112%),
    36.7814 RPS, and 560/910/1,800/2,600ms.
  The 100-user plateau was an integrity-clean latency boundary against the
  200ms calibrated gate. The run then failed the aggregate due/past reminder
  gate even though its final retained counters showed 100 tracked
  occurrences, 100 tracked deliveries, 102 clear events, 100 Unresolved
  occurrences, 71 cancelled deliveries, and zero reactivated deliveries.
  That was a false gate diagnosis: repeated clear actions can exercise the
  same due/past occurrence more than once, so clear-event count cannot stand
  in for unique exercised occurrences. This older artifact did not retain a
  unique exercised-occurrence count and therefore cannot be retrospectively
  proven or promoted as passing evidence. Its integrity checkpoints otherwise
  recorded zero violations, RLS passed, all 30 expected stage artifacts were
  retained with no orphans, and exact cleanup deleted 100 of 100 users with
  zero residual product rows.

## 2026-07-30 Ticket 065 authoritative local mutation ramp evidence

Status: authoritative ramp slice passed. Ticket 065 remains incomplete pending
an authoritative passing full suite.

Scope:

- Run ID: `20260730t023443z-b35dca7c46da`
- Command: `npm run load:mutation:ramp`
- Workload: one three-minute representative mixed calibration followed by
  bounded 10-, 25-, 50-, and 100-user mixed mutation plateaus.
- Fixtures: 100 independent accounts allocated as 70 Typical daily, 20
  Review-heavy, and 10 Export-heavy accounts. The declaration also reserved
  eight same-account contention pairs, although this ramp slice did not run
  the contention profile.
- Pacing and mix: declared 2–5-second think time and read-dominant 65/35 task
  weights. The representative completed ramp stages achieved 78.85% reads and
  21.15% mutations.

Results:

| Stage | Users | Achieved duration | Requests | Failures | RPS | p50 | p75 | p95 | p99 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Mixed calibration | 1 | 181.119s | 92 | 0 | 0.5115 | 46ms | 67ms | 87ms | 120ms |
| Ramp | 10 | 241.743s | 1,199 | 0 | 4.9761 | 34ms | 46ms | 84ms | 110ms |
| Ramp | 25 | 241.539s | 3,044 | 0 | 12.6291 | 34ms | 52ms | 94ms | 150ms |
| Ramp | 50 | 241.270s | 5,819 | 0 | 24.1705 | 41ms | 73ms | 160ms | 280ms |
| Ramp | 100 | 242.269s | 8,907 | 0 | 36.8510 | 550ms | 920ms | 1,600ms | 2,400ms |

Capacity interpretation:

- The calibrated nominal p95 gate was 200ms. Ramp-10, ramp-25, and ramp-50
  were passing plateaus.
- The highest sustainable local plateau was 50 users at
  24.170549938063317 achieved requests per second.
- Ramp-100 recorded zero request failures, zero unexpected `5xx`, and zero
  Locust exceptions, but its 1,600ms p95 was an integrity-clean latency
  boundary and the plateau was not selected as sustainable.
- The five stages recorded 19,061 requests with zero failures. No stage reached
  the 60-RPS, 200,000-request, runtime, or local resource ceiling. Ramp-100
  reached the authorized 100-user maximum without exceeding it.

Correctness and lifecycle evidence:

- The final seven-field due/past reminder proof was:
  `tracked_occurrences=100`, `tracked_deliveries=100`,
  `exercised_occurrences=71`, `clear_events=102`,
  `unresolved_occurrences=100`, `cancelled_deliveries=71`, and
  `reactivated_deliveries=0`. The unique exercised count proves that every
  exercised due/past delivery remained cancelled even when one occurrence was
  cleared repeatedly.
- The before, post-calibration, and post-ramp integrity checkpoints each
  recorded zero violations. The final checkpoint checked all 100 accounts and
  85,696 product rows, including zero cross-owner rows, unexpected duplicate
  occurrences or deliveries, invalid status/definition chains, false-fresh
  horizons, stuck processing claims, forbidden rows, or orphan rows.
- The local two-user RLS smoke passed.
- Artifact inspection passed with exactly 30 expected and 30 retained stage
  artifacts, matching digests, and zero orphan artifacts. The terminal
  completion record passed.
- Exact cleanup matched and deleted all 100 synthetic users and found zero
  residual product rows.
- The independent final verifier passed:
  `npm run load:mutation:evidence:check -- --run-id
  20260730t023443z-b35dca7c46da`.

Runtime and caveats:

- Hardware: Apple M5, 10 logical CPUs, 32 GiB memory, macOS `25.5.0` arm64.
- Runtime: Node `v22.22.3`, Next.js `16.2.7`, Python `3.14.6`, Locust
  `2.46.2`, Docker `29.4.3`, and Supabase CLI `2.105.0`.
- Maximum observed host load was 0.924 per logical CPU. Minimum available
  memory was 5,863,047,168 bytes. Maximum app and Locust RSS were
  2,212,757,504 and 224,083,968 bytes; no resource breach was recorded.
- The source record identifies commit
  `c8c92b3bcd18522eaa1e2d5859a3b3469f5c34d7` with a dirty working tree, so the
  retained runtime record, not the commit alone, defines this measurement.
- This is warm, local-only evidence from a persistent production-mode Next.js
  process and the project-local Supabase Docker stack. Provider mode was the
  loopback fake Sequenzy service and Web Push was disabled. It is not hosted,
  Vercel, production, cold-start, or customer-capacity evidence.
- This ramp slice does not satisfy the full Ticket 065 acceptance surface.
  Authoritative full-suite evidence must still pass mixed baseline,
  spike/recovery, soak, breakpoint, changed-timezone, contention, operator and
  fake-provider reconciliation, full timed mutation coverage, final integrity,
  RLS, artifacts, and exact cleanup before Ticket 065 can complete or Ticket
  066 can begin.

## 2026-07-30 Ticket 065 rejected soak and RSS-evidence correction

Status: diagnostic only; the run remains rejected and is not capacity evidence.

Standalone soak run `20260730t083919z-a5462699b1c1` completed its calibration,
all four same-run ramp plateaus, and the full 3,600.646-second 25-user soak.
The soak served 43,204 requests at 12.0007 RPS with zero failures, zero
unexpected `5xx`, zero Locust exceptions, p50 33ms, p75 49ms, p95 85ms, and
p99 130ms. Authenticated structured exports crossed the local one-hour JWT
boundary without the export-only `401` that rejected the preceding full run.
All successful mutations had exact semantic readbacks; final integrity,
due/past reminder, RLS, 36/36 artifact, and 100/100 exact-cleanup checks passed.
Database connections fell from 22 to 16.

The post-run bounded-growth gate nevertheless rejected the run. Its former
definition compared the first and final single app-RSS samples. The first
sample was a 65.859 MiB idle/garbage-collection trough taken before the 25
users warmed, after a paced session-renewal gap; the final hot sample was
312.563 MiB. The recorded peak was 554.375 MiB, so the process had already
reclaimed 241.813 MiB before the final observation. The prior independent soak
showed the same cold-trough pattern. Because the supervisor discarded the
intermediate 721 observations, neither run can prove a steady-state trend and
neither may be retroactively promoted.

Mutation run-evidence schema `1.1.0` corrects the evidence method without
raising a ceiling. It retains secret-free monotonic five-second resource
samples and compares the median app RSS in `[5 minutes, 10 minutes)` with the
median in the final five minutes. Each window requires at least 50 valid
samples, boundary coverage within 15 seconds, and no gap over 15 seconds. The
existing larger-of-128-MiB-or-25% growth allowance and 4 GiB instantaneous app
and Locust ceilings remain unchanged. The exact-run checker recomputes the
sample aggregates, window medians, coverage, and verdict. This establishes a
declared bounded-growth result; it is not a general proof for or against a
memory leak.

## 2026-07-30 Ticket 065 authoritative schema 1.1 local soak

Status: authoritative standalone soak passed; Ticket 065 remains incomplete
pending the full suite.

Standalone soak run `20260730t154126z-1f1a904f9ca5` passed all six declared
stages and `npm run load:mutation:evidence:check`. Its 3,601.427-second,
25-user soak served 42,856 requests at 11.9020 RPS with zero failures, zero
unexpected `5xx`, zero Locust exceptions, p50 36ms, p75 56ms, p95 110ms, and
p99 200ms. The achieved mix remained read-dominant at 79.6341% reads and
20.3659% mutations. Every successful mutation had its exact semantic readback.

The soak retained 722 monotonic five-second resource samples. The warmed
`[5 minutes, 10 minutes)` window contained 60 valid samples with median app RSS
of 252,502,016 bytes. The final five-minute window contained 60 valid samples
with median app RSS of 256,139,264 bytes. Both windows contained zero invalid
samples; their maximum gaps were 5,002.373ms and 5,002.917ms. Growth was
3,637,248 bytes, or 1.4405%, against the unchanged 134,217,728-byte allowance.
Peak app RSS was 1,646,804,992 bytes, peak Locust RSS was 106,938,368 bytes,
and neither crossed its 4 GiB ceiling. Database connections fell from 22 to
17.

Post-run integrity reported zero violations across 88,992 rows. Due/past
evidence reconciled 100 tracked occurrences and deliveries, 71 exercised
occurrences, 116 Clear events, 100 final Unresolved occurrences, 71 cancelled
deliveries, and zero reactivations. RLS passed six ownership checks. Artifact
inspection retained the exact 36/36 files with zero orphans. Exact cleanup
deleted all 100 run users and left zero product rows.

The same run retained 25 users as the highest sustainable local plateau at
12.2319 RPS. The 50-user and 100-user ramps remained zero-failure latency
boundaries at 23.36 RPS/p95 420ms and 32.17 RPS/p95 2,600ms. These results are
local persistent-Node evidence, not hosted or production capacity. A fresh
authoritative full suite remains required.

## 2026-07-30 Ticket 065 rejected full run and reminder-integrity correction

Status: diagnostic only; the run remains rejected and is not final capacity
evidence.

Full run `20260730t172728z-69ee594dc997` completed 17 stages through
`timezone-changed-5`. Breakpoint reached a zero-failure p95 boundary at 75
users, so the supervisor skipped the remaining 100-user breakpoint as
declared. The changed-timezone stage completed 20 exact Settings submissions
with zero request failures and preserved all 27,150 dynamically captured past
or resolved occurrences.

The following integrity checkpoint rejected two
`reminder_count_below_baseline` rows. This was a harness invariant conflict.
Timezone resync may replace a future Unresolved occurrence after its reminder
became due. The reminder planner intentionally does not recreate missing
due/past deliveries. A monotonic total reminder count therefore contradicts
the documented planning contract even when every current strictly future
eligible reminder exists.

Integrity now checks current future reminder eligibility, duplicate and
unexpected pending rows, and immutable reminder identity for every baseline
past or resolved occurrence. It retains the upper growth limit but removes the
invalid total-count lower bound. Focused lifecycle, suite, and independent
evidence tests pass with 111 checks.

The rejected run passed its post-run RLS smoke, retained the exact 102/102
completed-stage artifacts with zero orphans, deleted all 100 synthetic users,
and left zero product rows. Contention and operator overlap did not run. A
fresh authoritative full suite remains required.

## 2026-07-30 Ticket 065 rejected strict spike retry

Status: diagnostic only; the strict failure gate rejected the run.

Full retry `20260730t203346z-c8186c148525` passed smoke, calibration, both
mixed baselines, and all four ramp plateaus. The 100-user spike then completed
7,682 requests with 41 loopback connection resets. Its 0.53% failure ratio
exceeded the declared less-than-0.5% gate, while p95 reached 5,400ms against a
110ms calibration. The supervisor rejected the run before recovery or later
groups.

Post-run RLS passed. Artifact inspection retained the exact 60/60
completed-stage files with zero orphans. Exact cleanup deleted all 100 run
users and left zero product rows. The run is not promotable, and the strict
gate remains unchanged.

## 2026-07-30 Ticket 065 rejected contention-selector retry

Status: diagnostic only; contention rejected the run.

Full retry `20260730t220333z-43601180a45b` passed smoke, calibration,
baselines, ramp, spike/recovery, soak, breakpoint, and changed-timezone load.
The 60-minute soak served 43,038 requests with zero failures at 11.95 RPS and
p95 100ms. Breakpoint 50 passed with zero failures and p95 140ms. Breakpoint 75
set the first zero-failure latency boundary at p95 380ms, so breakpoint 100 was
skipped as declared.

The subsequent contention stage stopped after its first request. The exact
seed-time current-day occurrence selector no longer rendered because the
preceding timezone resync legitimately replaced current and future Unresolved
occurrences. The failure was fixture selector drift, not a contention,
integrity, or capacity result.

Contention fixtures now select the most recent prior-day Unresolved occurrence
on the reserved maintainer behavior. Prior-day occurrence identity survives
timezone resync and remains available in Needs decision. The strict contention
semantics remain unchanged: two independent sessions must produce one winner,
one stale loser, and a converged stored status.

Post-run RLS passed. Exact cleanup deleted all 100 run users and left zero
product rows. The run remains rejected, and a fresh authoritative full suite
is required.

## 2026-07-31 Ticket 065 rejected stable-date contention retry

Status: diagnostic only; contention rejected the run.

Full retry `20260731t005526z-b2e8cca38514` passed smoke, calibration, both
baselines, ramp, spike/recovery, the full 60-minute soak, breakpoint, and
changed-timezone load. The soak served 42,943 requests with zero failures at
11.93 RPS and p95 86ms. Breakpoint 50 passed with zero failures and p95 140ms.
Breakpoint 75 set the first zero-failure latency boundary at p95 390ms, so
breakpoint 100 was skipped as declared.

The prior-day contention selector survived timezone resync, but Timeline does
not server-render Needs decision rows while its client-controlled dialog is
closed. The first archive-state hypothesis was insufficient. Standalone
contention run `20260731t040008z-e71b7359d3fb` used an active, untouched
fresh-horizon Behavior and reproduced the same first-request failure. Its
zero-write integrity checkpoint passed, RLS passed, all 6/6 artifacts
reconciled, exact cleanup deleted its one user, and zero product rows remained.

Contention now selects a prior-day Unresolved occurrence on the reserved active
fresh-horizon Behavior and discovers its forms through the existing
server-rendered selected behavior/day review. The private paired-session
artifact binds the exact Behavior, local date, occurrence, owner, and expected
status. Focused fixture tests cover all three mutation cohorts. The strict
contention result still requires one winner, one stale loser, and two sessions
converged on the stored result.

Post-run RLS passed. Artifact inspection retained the exact 108/108 completed
stage artifacts with zero orphans. Exact cleanup deleted all 100 run users and
left zero product rows. The run remains rejected, and a fresh authoritative
full suite is required.

## 2026-07-31 Ticket 065 contention retry and error-code correction

Status: the authoritative focused contention slice passed. Ticket 065 remains
incomplete pending one uninterrupted authoritative full suite.

Standalone run `20260731t040440z-c8b2da9f2887` proved that selected behavior/day
review exposes the exact stable prior-day occurrence to both ordinary sessions.
The winning status action returned in 56ms. The stale loser did not return for
64.249 seconds because the transactional RPC used SQLSTATE `40001` for its
deliberate stale-plan exceptions. PostgreSQL defines `40001` as a retryable
serialization failure, so PostgREST retried the semantic rejection until the
request timed out. The database still appended exactly one status event. The
run passed integrity, RLS, all 6/6 artifact checks, one-user cleanup, and zero
residual-row checks, but its semantic gate rejected the delayed ambiguous
loser.

Migration `20260731041500_use_nonretryable_occurrence_contention_errors.sql`
changes only the RPC's two stale-plan error markers from `40001` to `P0001`.
That error code is a nonretryable PL/pgSQL raised exception. A clean local
Supabase reset applied the full migration chain, and inspection of the live
function found two `P0001` markers and no `40001` markers.

Post-migration diagnostic run `20260731t041025z-4d0b1c472a84` returned the
stale loser in 59ms. The harness still rejected it because Supabase returned a
plain structured error object, while the action mapper exposes only `Error`
instances. The repository now translates only the two exact known `P0001`
messages to the documented stale-status `Error`. It converts unknown
structured database errors to a generic action error.

Authoritative focused run `20260731t041227z-eeff1bbf9832` then passed the
unchanged five-minute contention profile and the independent exact-run checker.
It completed 726 requests with zero failures at 2.43 RPS and p95 50ms. All 242
status-action submissions had exact semantic readbacks. Integrity found zero
violations after 161 appended status events. RLS passed, artifact inspection
retained the exact 6/6 files, cleanup deleted the one synthetic user, and zero
product rows remained.

This focused result proves the same-account collision semantics only. It does
not replace the required full suite or establish hosted capacity.

## 2026-07-31 Ticket 065 rejected operator-handoff full run

Status: diagnostic only; the final operator-overlap stage rejected the run.

Full run `20260731t041910z-685ce0119003` passed 18 stages through the corrected
contention profile. Its 60-minute soak completed 43,368 requests with zero
failures at 12.05 RPS and p95 88ms. Breakpoint 50 passed with zero failures at
23.91 RPS and p95 160ms. Breakpoint 75 established the first zero-failure
latency boundary at 35.25 RPS and p95 430ms, so breakpoint 100 skipped as
declared. Changed-timezone preservation verified all 27,319 dynamically
captured past or resolved occurrences. Contention then completed 744 requests
with zero failures and p95 52ms.

The final operator-overlap stage rejected one Timeline read after eight
seconds because its exact future occurrence form was absent. The prior
changed-timezone stage leased the first five accounts. A timezone resync may
legitimately replace a future Unresolved occurrence, including the fixed row
used by the Daily tracker. Operator overlap then leased the first ten accounts,
so one changed account entered the mixed stage with an invalidated selector.
The protected occurrence-sync operator and 100 fake-provider reminder sends
completed successfully before the strict request gate stopped Locust.

Combined full suites now refresh and lease changed-timezone users from the
final five identities. Operator overlap continues to lease the first ten
identities and marks the eleventh, non-leased account stale for its causal
repair proof. The windows are disjoint while cohort distribution, user counts,
routes, preservation gates, and operator behavior remain unchanged.

The rejected run passed its post-failure integrity checkpoint with zero
violations, RLS, the exact 114/114 artifact inventory, cleanup of all 100
synthetic users, and zero residual product rows. A focused operator run and a
fresh authoritative full suite remain required.

## 2026-07-31 Ticket 065 operator readiness correction

Status: authoritative focused operator evidence passed. Ticket 065 remains
incomplete pending one uninterrupted authoritative full suite.

Focused operator run `20260731t071641z-dcfe303bd59e` completed calibration and
the five-minute operator-overlap traffic stage with zero Locust request
failures. Final integrity still rejected five
`due_past_clear_reminder_reactivated` rows. The supervisor started its first
protected process loop immediately. That loop could claim and send due
reminders before five Daily tracker users completed their startup
resolve-and-Clear transitions.

The first protected operator loop now waits one bounded 20-second readiness
interval. Daily startup transitions therefore cancel the exact due/past
reminders before global reminder processing begins. Later protected loops
retain the declared 20-second cadence and remain concurrent with ordinary
mixed traffic.

Replacement run `20260731t072654z-27ed797933e3` passed both stages and
`npm run load:mutation:evidence:check` for the exact run. Operator overlap
completed 1,464 Locust requests with zero failures at 4.87 RPS and p95 79ms.
The supervisor completed 29 protected requests, proved one spare-account
causal occurrence repair, and accepted 16 unique fake-provider sends with zero
rejections or duplicate fingerprints. Six due/past occurrences were exercised
across the run; all six deliveries remained cancelled and zero reactivated.
Integrity and RLS passed, artifact inspection retained the exact 12/12 files,
cleanup deleted all 11 synthetic users, and zero product rows remained.

This result proves the operator profile and readiness ordering in isolation.
The disjoint changed-timezone-to-operator identity handoff still requires the
fresh full-suite proof.

## 2026-07-31 Ticket 065 authoritative full local mutation suite

Status: authoritative full suite passed. Ticket 065 is complete.

Full run `20260731t073716z-8108c309ba98` completed all 19 executed stages with
zero Locust request failures. Breakpoint 100 skipped after the first declared
bounded breakpoint failure. The exact-run evidence checker independently
accepted the unchanged run after a checker-only identity-offset correction.
The run recorded 101,534 Locust requests plus 27 protected operator requests,
well below the 4,000,000-request ceiling.

The calibrated mixed warm baseline had p95 99ms, producing a strict nominal
gate of 198ms. Ramp 50 was the highest sustainable local plateau at 24.6114
RPS and p95 150ms. Ramp 100 remained zero-failure but reached p95 1,500ms.
Breakpoint 50 passed at 24.0038 RPS and p95 160ms. Breakpoint 75 established
the first zero-failure latency boundary at 35.0443 RPS and p95 450ms.
Breakpoint 100 therefore skipped as declared. The 100-user spike served 11,184
requests with zero failures at 37.0258 RPS and p95 1,900ms. Recovery returned
to p95 84ms, matching its pre-spike baseline.

The 3,601.496-second, 25-user soak served 42,794 requests at 11.8848 RPS with
zero failures and p95 86ms. Reads remained dominant at 79.7121%. Every one of
the 8,682 successful mutations had its exact semantic readback. The soak
retained 722 resource samples. Its warmed `[5 minutes, 10 minutes)` median app
RSS was 494,731,264 bytes. Its final-five-minute median was 481,533,952 bytes.
Growth was -13,197,312 bytes against the unchanged 134,217,728-byte allowance.
Both windows retained 60 valid samples, zero invalid samples, and maximum gaps
under 5,004ms. Database connections declined from 22 to 21.

Changed-timezone traffic used identities 95-99 and preserved all 27,312
captured past or resolved occurrences. Same-account contention completed 762
requests with zero failures and p95 49ms. Operator overlap used the first ten
identities plus its non-leased eleventh repair account. It completed 1,434
Locust requests with zero failures and p95 79ms. The supervisor completed 27
protected requests, proved one causal occurrence repair, and accepted 191
unique loopback fake-provider sends with zero rejections, duplicate
fingerprints, or Web Push attempts. Its final reminder replay claimed nothing.

Final integrity reported zero violations across 94,375 rows. The run appended
9,053 owner-consistent status events. It exercised 91 due/past reminders; all
91 remained cancelled and zero reactivated. RLS passed six ownership checks.
Artifact inspection retained the exact 114/114 stage files with zero orphans.
Exact cleanup deleted all 100 synthetic users and left zero product rows.

The independent checker initially compared the changed-timezone cohort with
the first five deterministic accounts, ignoring the stage's declared identity
offset. The producer evidence was correct. The checker and its test fixture
now slice from each stage's exact offset. A full-suite regression test locks
the final-five timezone allocation. The unchanged run then passed
`npm run load:mutation:evidence:check`.

These results are local persistent-Node evidence on a shared machine. They do
not establish hosted or production capacity.

Final repository verification passed 99 Vitest files and 757 tests with
loopback permission for the local fake-provider server. Agent, interaction,
resolver, load-manifest, Python, lint, TypeScript, build, database-reset, and
whitespace gates also passed.

## 2026-07-31 Ticket 066 hosted readiness

Status: blocked before traffic. No hosted Locust request ran, so this entry
contains no hosted capacity claim.

The repository now has a fail-closed, static, single-stage hosted preflight.
It validates the owner and provider approvals, dedicated staging isolation,
synthetic-only data, provider stub, source IPs, traffic and cost ceilings,
monitoring retention, clean deployed commit, RLS, migration, advisor, smoke,
and cleanup-dry-run evidence. It stores no approval or target details and
prints only sanitized limits. It cannot contact a hosted target or start
Locust.

Read-only provider discovery found no dedicated Cadence Vercel staging project
and no separate Cadence Supabase staging project. The Supabase organization
reports Pro. Vercel Enterprise status and approval, the exact staging
hostname, owner authorization, traffic window and sources, cost ceiling, and
monitoring evidence remain missing.

The sanitized readiness report is
`docs/qa/load-testing/2026-07-31-hosted-readiness.md`. The authoritative local
Ticket 065 result remains local evidence only and cannot be extrapolated into
a hosted capacity value.
