# Desktop Build Proposal

A forward-looking architecture proposal for shipping Cadence Tracker as a
downloadable, signed macOS desktop application, built so the same core can later
run as an iOS app and gain optional multi-device sync.

## Status and scope

- **This is a proposal, not scheduled work.** It captures durable architectural
  decisions and direction. It is not a commitment to a timeline.
- **No tickets are defined here.** When this track is scheduled, author tickets
  in `docs/TICKETS.md` following the existing format, and update `STATUS.md` as
  usual. This document deliberately stops short of acceptance criteria.
- **UI specifics are intentionally omitted.** The UI is under active
  development. Nothing here pins screen layouts, component inventories, routes,
  or visual structure. UI guidance in this document is expressed only as
  durable *architectural invariants* (see "UI migration — principles only").
- **This document does not override active product docs.** The desktop track
  revisits several constraints currently locked for v1 (see "Relationship to
  current v1 constraints"). Those constraints remain in force until a refactor
  is actually scheduled and the relevant docs in `AGENTS.md` / `docs/` are
  updated in the same task that begins the work.

Precedence: while unscheduled, treat this file as lower precedence than every
source-of-truth doc listed in `AGENTS.md`. It is closest in spirit to
`docs/FUTURE_UPDATES.md` — direction that is not yet v1 scope.

## Goal

Produce a macOS app a user can download and run that is:

1. **Local-first.** Works fully offline against a local database. No login
   required to use the app.
2. **Efficient and always-on friendly.** Low idle CPU and memory, since users
   are expected to keep it open continuously.
3. **Sync-ready.** Multi-device sync is not built in v1, but the data model,
   identity, and a sync seam are scaffolded so sync can be added later without a
   schema migration or a UI/core rewrite.
4. **iOS-portable.** The portable core, the UI, and the platform adapters are
   structured so an iOS build reuses them with minimal change.

## Locked decisions

These were chosen deliberately and are the stable foundation of this proposal.

| Decision | Choice | Rationale |
|---|---|---|
| Shell / runtime | **Tauri v2** | Uses the OS-native webview (WebKit/WKWebView) instead of bundling Chromium, so idle footprint is small — important for an always-open app. Supports iOS, and macOS + iOS both render on WebKit, so the UI behaves consistently across Apple targets. The same JavaScript adapters (SQLite, notifications) run on desktop and iOS. |
| UI runtime | **Vite + React SPA** | Lean, no server runtime, no React Server Component / Server Action constraints. Pairs naturally with Tauri's static frontend model. Reuses the existing React components and Tailwind design tokens. |
| Auth / identity | **Optional pluggable sign-in** | App runs fully local under an anonymous local profile with no login. A cloud identity provider (Supabase Auth) is wired behind an `Identity` port and used only when the user opts into sync. |
| Data | **Local-first SQLite + sync scaffold** | Local SQLite via Tauri's SQL plugin. Sync metadata (tombstones, change log, cursor) is added up front so a sync engine can be dropped in later. |

Cost accepted with Tauri: **Rust enters the stack.** It is contained to the
thin `src-tauri/` shell (plugin registration and migration definitions).
Business logic never lives in Rust — it stays in the TypeScript core (enforced
by a boundary check; see "Agentic development guardrails").

## Relationship to current v1 constraints

`AGENTS.md` currently lists several items this track intentionally revisits.
None of these change today. They change only when the desktop track is
scheduled and the owning docs are updated in the same task.

| Currently locked (v1) | Desktop track direction | When it changes |
|---|---|---|
| "Native mobile apps" out of scope | iOS is a future target of the same core | Only when the iOS phase is scheduled |
| "PWA offline cache" / "Offline writes or sync conflict handling" out of scope | Local-first is the desktop foundation; sync conflict policy is defined here | When the desktop track is scheduled |
| Supabase Auth + Google login required; data restricted to authenticated user | Auth becomes optional; local anonymous profile is the default | When the desktop track is scheduled |
| RLS required on all user-owned tables; do not bypass | Local SQLite has no RLS (single local DB, single user). RLS returns on the *server* side if/when sync lands | When the local data layer is built |
| Vercel deployment + hourly cron reminder processing | Replaced by OS-scheduled local notifications | When the notification phase is scheduled |

`docs/FUTURE_UPDATES.md` already anticipates local pending queues and offline
work; this document supersedes the speculative parts of it for the desktop
track and makes the storage choice concrete (SQLite + change log).

## Target architecture

The shape moves from "server-rendered app in a wrapper" to "portable client
core + thin native shell," using a ports-and-adapters (hexagonal) structure.
This is an extension of the existing resolver-first rule, not a replacement:
resolvers stay pure; database access moves behind a port interface instead of
calling Supabase directly.

```
+-- lib/core  (pure TypeScript, ZERO platform / DOM / DB / network imports) ----+
|   - resolvers/*        reused as-is (recurrence, timeline, status, ...)       |
|   - types/*            reused                                                  |
|   - services/*         orchestration, depends ONLY on the ports below         |
|   - ports/             interfaces: DataStore, Identity, Notifier, SyncEngine, |
|                        Clock                                                   |
+-------------------------------------------------------------------------------+
        ^                  ^                 ^                  ^
   DataStore adapter  Identity adapter  Notifier adapter  SyncEngine adapter
   ----------------   ----------------  ----------------  -----------------
   Local SQLite       Local anon id +   OS local          No-op (v1)
   (Tauri SQL plugin) optional cloud    notifications     -> real backend (v2)
        ^
+-- UI: Vite + React SPA (reuses existing components + Tailwind tokens) --------+
|   data flows through hooks -> services -> ports; no direct adapter imports    |
+-------------------------------------------------------------------------------+
        ^                                          ^
   Desktop shell (macOS, signed/notarized)   iOS shell (later, same core + UI)
```

### Reuse map

- **Reused as-is:** `lib/resolvers/*`, `lib/types/*`, the React component
  inventory, Tailwind tokens / `globals.css`, the `reminder_deliveries`
  planning model, export logic.
- **Refactored:** services drop the `requireUserId()` Supabase calls and the
  injected Supabase client; they depend on ports instead. Pages stop being
  Server Components / Server Actions and become client code that calls services
  through hooks.
- **Replaced:** `lib/db/*.repo.ts` → `DataStore` SQLite adapter;
  `lib/supabase/*` + `proxy.ts` + the auth routes → optional `Identity`
  adapter; web push + service worker + Vercel cron + `/api/reminders/process` →
  OS local-notification scheduler.
- **Dropped:** `push_subscriptions` table, RLS policies (local DB), the
  `handle_new_user` Postgres trigger (replaced by app-level first-run seeding).

## Portable core principle

`lib/core/*` must not import anything platform-specific: no DOM, no
`@tauri-apps/*`, no `@supabase/*`, no `next`, no concrete adapter. This is the
single most important rule in this document, because it is what makes the same
core run unchanged on macOS and iOS. It is enforced by a deterministic check
(see guardrails) so an agent cannot silently break portability.

This also preserves the existing resolver rules in `AGENTS.md`: resolvers stay
pure, `now` is injected (via the `Clock` port), and no resolver reads I/O.

## Ports

Defined as TypeScript interfaces in the core. Exact method signatures are an
implementation detail to be settled when the work is scheduled; the durable part
is the *responsibility boundary* of each port.

- **DataStore** — reads and writes domain records (profiles, categories,
  behaviors, occurrences, reminder deliveries). The only thing that knows about
  SQL. Repository function shapes from today's `lib/db` are the natural starting
  point for its interface.
- **Identity** — returns the current user id and exposes optional sign-in /
  sign-out / link-local-data-to-cloud-identity. Default implementation returns a
  stable local anonymous id.
- **Notifier** — schedules, cancels, and reschedules OS local notifications;
  reports permission state. Backed by the Tauri notification plugin on both
  desktop and iOS.
- **SyncEngine** — pushes outbox changes and pulls remote changes. v1 ships a
  no-op local implementation.
- **Clock** — supplies `now` (a `Temporal.Instant`) to services and resolvers,
  consistent with the existing "inject now" rule in `docs/DATETIME_STRATEGY.md`.

A shared **DataStore contract test suite** should accompany the port: one
executable spec that every adapter (local SQLite now, sync-backed later) must
satisfy.

## Local data model and sync readiness

This is the most detailed and durable part of the proposal, because the schema
must be sync-ready from the start to avoid a later migration.

Translation from the current Postgres schema
(`supabase/migrations/20260607204951_create_database_schema.sql`):

- `uuid` → `TEXT` (generate ids in TypeScript with `crypto.randomUUID()`).
- `jsonb` (e.g. `recurrence_rule`) → `TEXT` holding JSON. The app already treats
  it as JSON.
- `timestamptz` / `time` / `date` → `TEXT` (ISO-8601). The code already passes
  ISO strings, so this is low-friction.
- Drop all RLS policies and grants (single local database, single user).
- Replace the `auth.users` foreign keys and `handle_new_user` trigger with
  app-level first-run seeding: ensure one local profile and the default
  categories exist on first launch.
- Drop `push_subscriptions` (web-push only; not used by local notifications).

Sync scaffold added now (dormant until a sync engine exists):

- **Tombstones:** a `deleted_at` column on every syncable table. Deletes are
  soft, never hard, so deletions can propagate.
- **Change log / outbox:** a table recording every local mutation
  (`op`, `table`, `row_id`, `payload`, `ts`, `synced`). The SyncEngine drains it.
- **Sync cursor:** a `sync_state` table holding the per-table pull cursor and
  last-synced timestamp.
- **Stable keys:** keep `user_id` on every row (already present) so local rows
  can be claimed by a cloud identity at sign-in without rewriting keys.

Conflict policy (decided now, documented in `docs/DATA_MODEL.md` when built):
**last-writer-wins by `updated_at` per row; a tombstone wins over a concurrent
update.** This matches the app's "manual truth / latest explicit user action
wins" stance and is simple enough for a single human's devices.

Migrations run through the Tauri SQL plugin's migration mechanism, kept
git-tracked, mirroring the discipline already used for Supabase migrations.

## Identity and optional sign-in

- Default: an anonymous local profile id generated on first run. The app is
  fully usable with no account and no network.
- Optional: the user can sign in (Supabase Auth) to enable sync. Sign-in links
  existing local data to the cloud identity rather than discarding it; because
  every row already carries `user_id`, this is a claim/update, not a rewrite.
- Desktop/mobile OAuth uses a deep-link / custom-URL-scheme redirect (Tauri's
  deep-link plugin), not the cookie-based SSR flow used by the web app today.
- v1 may ship the local anonymous provider only and stub the cloud provider
  behind the same `Identity` port.

## Notifications and reminders

The reminder planning logic is reused: `lib/resolvers/reminder.resolver.ts` and
the `reminder_deliveries` model already compute when a reminder should fire.

- Instead of an hourly server cron polling `/api/reminders/process`, reminders
  are **pre-scheduled with the OS**: compute upcoming deliveries, register them
  as OS local notifications at their fire time, and cancel/reschedule when the
  underlying occurrence is resolved, edited, or archived.
- This is efficient (no background polling loop) and is the model iOS requires
  (apps cannot run background loops; the OS fires scheduled local
  notifications). The same approach works on desktop while the app is open.
- The `reminder_deliveries` table remains the source of truth for what is
  scheduled; notification ids map back to delivery rows so they can be cancelled.
- **Email reminders are deferred** on this track. Email cannot be sent safely
  from a client, so it becomes a server/sync-era feature. The `email` channel
  stays in the data model but is inactive in the local-only build.
- Validate macOS behavior when the app is fully quit; for the always-open
  desktop case this is not a concern, and iOS handles OS-scheduled notifications
  natively.

## Desktop packaging and distribution

- Build `.app` / `.dmg` with `tauri build`.
- **Apple Developer ID required.** Configure Developer ID Application signing,
  notarization, the hardened runtime, and a notification entitlement. Without
  notarization, Gatekeeper warns users; with it, the app opens cleanly. The same
  Apple account is reused for the eventual iOS App Store build.
- **Auto-update** via Tauri's updater plugin with signed update artifacts
  (e.g. published to GitHub Releases).
- **Data location:** the SQLite file lives in the Tauri app data directory. The
  existing full-JSON export is the backup story.
- **Data import:** provide a one-time import that seeds the local database from
  the existing full-JSON export, so current cloud data can move into the desktop
  app.

## UI migration — principles only

The UI is changing and is **not** scoped here. Do not read this section as a
plan for specific screens. These are the only durable UI invariants for the
desktop track; anything else about the UI is owned by ongoing UI work and
`DESIGN.md`.

- Components stay **presentational**: they take data and callbacks as props and
  do not implement recurrence, reminder, analytics, or export logic (the
  existing resolver-first rule in `AGENTS.md` still holds).
- Data is read and written through **hooks → services → ports**. The UI never
  imports a concrete adapter (`@tauri-apps/*`, SQLite, Supabase) directly.
- No Server Components and no Server Actions (there is no server). Page-level
  data fetching becomes client data fetching; a client cache/invalidation
  approach may be introduced, kept minimal per the "no unnecessary
  state-management libraries" style rule.
- Tailwind tokens / `globals.css` carry over; the design system is reused.
- Whatever the screen structure becomes, it must remain mobile-responsive so the
  same components are reusable in the iOS shell.

When the UI stabilizes and this track is scheduled, the then-current UI is what
gets ported — not any layout implied by this document.

## Agentic development guardrails

This track is intended to be built by coding agents in small, independently
verifiable slices. To keep agents from drifting across the new boundaries, add
deterministic checks alongside the existing `agents:check` / `resolvers:check`:

- **`core:check`** — fails if anything in `lib/core/*` imports the DOM,
  `@tauri-apps/*`, `@supabase/*`, `next`, or a concrete adapter. Protects iOS
  portability.
- **`ports:check`** — fails if UI or services import a concrete adapter instead
  of a port interface.
- **DataStore contract test suite** — a single spec run against every adapter, so
  a new adapter has an executable target.

Working approach:

- **Strangler, always-green.** Introduce ports first, migrate the data layer
  behind today's function shapes, validate as a plain web app against SQLite,
  then swap the shell. Every slice keeps `lint` / `typecheck` / `test` / `build`
  and the new checks green, so there is always a verifiable baseline.
- **Rust is contained and reviewed.** `src-tauri/` holds plugin registration and
  migration definitions only. Treat changes there as rare and review-worthy; the
  `core:check` boundary keeps logic out of Rust.
- **Per-slice `STATUS.md` updates** continue as the current-state ledger, per
  `AGENTS.md`.

## Migration phases (dependency order, not a schedule, not tickets)

These are capability milestones in dependency order, to show what must precede
what. They are **not** work items and carry no acceptance criteria; tickets are
authored only when the track is scheduled. UI is intentionally a single fluid
phase rather than a per-screen breakdown.

1. **Spike.** A bare Tauri + Vite + React app that reads/writes a SQLite row via
   the SQL plugin and fires one scheduled notification. De-risks the stack,
   including WebKit/WKWebView differences, before any refactor.
2. **Core extraction.** Define the ports; refactor services onto them; add
   `core:check` / `ports:check`. Keep the current app runnable during the
   transition (strangler).
3. **Local data layer.** SQLite schema with tombstones, change log, and sync
   cursor; first-run seeding; local DataStore adapter; contract tests.
4. **UI to SPA.** Move to the Vite + React SPA, reusing components and tokens,
   replacing server-rendered data flow with client hooks. Fluid; tracks the
   then-current UI.
5. **Notifications.** Notifier adapter + OS-scheduled reminders reusing the
   reminder resolver; email channel inactive.
6. **Desktop shell + distribution.** Tauri shell, Apple signing/notarization,
   auto-update, data import from export.
7. **Sync scaffold + identity.** No-op SyncEngine wired; optional Supabase
   identity behind the sign-in path; conflict policy documented.
8. **iOS (later).** `tauri ios` target reusing core + UI + adapters; Apple
   provisioning; notification capabilities; WKWebView validation.

## Risks and open questions

- **WebKit/WKWebView is not Chromium.** Some web APIs differ; the spike exists to
  surface this before screens are converted.
- **Rust in the stack.** Accepted and contained, but it is a second language;
  pin Tauri/plugin versions and keep `src-tauri/` thin.
- **Tauri iOS is comparatively new.** Expect rough edges at the iOS phase; none
  of the seams in this plan block it.
- **Notification-while-quit on macOS.** Fine for the always-open case; validate
  the quit case if it matters.
- **Sync backend is not chosen.** The scaffold is deliberately backend-agnostic
  (LWW + outbox + cursor). Candidate backends (Supabase-backed sync, or a
  local-first engine such as PowerSync / ElectricSQL / Turso embedded replicas)
  are evaluated only when sync is scheduled.
- **Email reminders** require a server and are out of the local-only build.

## Out of scope for this track

- Multi-device sync implementation (only the scaffold is built).
- Email reminder delivery (server/sync-era feature).
- Any UI specification (owned by ongoing UI work and `DESIGN.md`).
- Android (not requested; the architecture does not preclude it later).
