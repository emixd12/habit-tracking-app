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

## Future-Only Recommendations

- Add a scoped note form state update for Analytics so note saves can avoid a
  full route refresh while still updating the review summary immediately.
- Revisit the occurrence-generation planner contract before attempting smaller
  sync horizons for Analytics or Export. The current planner can delete future
  unresolved rows outside the requested horizon, so a smaller horizon is not a
  safe drop-in optimization.
- After production deployment, inspect hosted route timing and Supabase query
  evidence before adding database indexes. Add indexes only through migrations
  with `docs/DATA_MODEL.md` and type updates when the evidence is clear.
- Consider a low-risk service cache or background refresh strategy for
  occurrence sync only after production after-change timings show route sync is
  still the dominant cost.
