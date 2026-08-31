# Desktop Build

The owner activated the local-first macOS track on 2026-08-30. Tickets 107–114
are complete. Ticket 115 separately owns deferred Apple-trusted distribution.
This document replaces the earlier unscheduled proposal. `STATUS.md` records
implementation and verification.

## Scope and defaults

Build tracking parity with the current web application using Tauri v2, Vite,
React, and SQLite. Tracking requires no login or network. Target Apple Silicon
first, with macOS 14 as the declared minimum. Runtime compatibility is verified
only on tested systems; macOS 14 execution remains unverified. Preserve the
existing web deployment and Astro marketing site. Mobile implementation remains
deferred.

Use one stable local profile. The default timezone remains America/New_York,
with local timezone selection. Seed the current default categories: Medical,
Grooming, Fitness, Food / Drink, Home, Measurements, Admin, and Other.

Tracking parity and Ticket 113's ad hoc, unnotarized preview/updater acceptance
are complete. Apple Developer Program access, Developer ID signing, notarization,
and Apple Silicon macOS 14 acceptance remain deferred under Ticket 115, not
passed. Exclude Intel releases, live sync, cloud login, email
delivery, cloud account controls, duplicated public/legal pages, billing, and
AI integrations. Keep imported email configuration as data without sending.

## Current parity baseline

`docs/DESKTOP_PARITY.md` records the current implementation baseline and its
evidence. `interaction-registry.json` remains the canonical interaction
inventory. Preserve current behavior rather than recreating an earlier v1:

| Capability | Existing contract | Desktop requirement |
|---|---|---|
| Timeline | `docs/UI_SPEC.md`, `docs/USER_FLOWS.md` | Today/future grouping, Needs decision retention, manual statuses, Notes, timing, correction, and completion feedback |
| Behaviors | `docs/PRODUCT_SPEC.md`, `docs/RECURRENCE_RULES.md` | Multiple schedules/time entries, exact/custom/preset ranges, recurrence, categories, edit/archive/restore, analytics, selected-day review |
| History and identity | `docs/DATA_MODEL.md` | Definition/configuration history, status events, timing sessions, configuration lineage, range-aware Occurrence identity, stale-write guards, and protected Occurrences |
| Portability | `docs/EXPORT_FORMATS.md` | All five formats, prompt tools, privacy defaults, BehaviorLog import/merge, destructive restore, and provenance |
| Settings | `docs/USER_FLOWS.md`, `docs/NOTIFICATION_SPEC.md` | Local timezone, optional onboarding, native notification permission/readiness, and scheduled-through coverage |

Definition-history and safely mapped time-session replay already exist in the
BehaviorLog import/restore contract. Configuration history remains export
context; imports construct only the current generating schedule graph and keep
historical Occurrences detached. Do not regress these distinctions.

## Workspace and shared core

Add only the scheduled workspaces:

```text
app/, components/, lib/   existing Next.js web app, retained at repository root
apps/marketing/          existing Astro marketing site
apps/desktop/            Tauri v2 + Vite + React
packages/core/           incrementally extracted portable domain code
packages/ui/             canonical tokens and framework-light primitives
```

Ticket 108 must prove native boundaries before Ticket 109 performs broad
extraction. Do not create packages solely to reserve names. Keep npm workspaces
and current web APIs; no app-root move, new task orchestrator, or unrelated
`packages/db`/`packages/config` extraction is required.

Move portable domain types, resolvers, and orchestration incrementally.
Resolvers remain pure and receive `now`; Temporal owns local dates and DST.
Compatibility exports and web adapters preserve existing callers while code
moves. Supabase Auth, RLS, caching, server routes, and provider delivery remain
web adapter responsibilities.

Define operation-specific `DataStore` methods for actual consumers. Behavior
create/update/archive/restore, status changes, import, and restore need atomic
operations with their existing preconditions. Avoid a generic CRUD interface.
Use one shared adapter contract suite against local Supabase and real SQLite.

The shared core cannot import Next.js, Supabase, Tauri, concrete adapters,
Node-only APIs, or browser globals. Ticket 109 adds a deterministic portability
check and keeps existing resolver checks aware of moved implementations.
Structural checks detect boundary drift; common fixtures and adapter tests
establish behavioral evidence.

Replace Node-only hashing with portable hashing that preserves exact existing
fingerprints. Isolate ZIP handling behind an archive adapter. Retain the
existing file-count, size, decompression, ratio, path, and preview-binding
safety limits from `docs/EXPORT_FORMATS.md`.

## Local persistence

Translate the **current** data model and all applicable migrations, not only
`20260607204951_create_database_schema.sql`. Include schedules, schedule slots,
timing, definition/configuration/status history, configuration lineage,
Occurrence freshness state, reminder records, import runs/mappings, imported
Notes/interventions, and export-relevant provenance.

Use text UUIDs and canonical temporal strings. Preserve explicit local dates
and UTC instants. Enable SQLite foreign-key enforcement and preserve owner,
range-aware uniqueness, append-only history, idempotency, stale-edit guards,
and Occurrence preservation rules. First-run seeding must not replace the
profile or recreate removed categories on every launch.

The local database lives in the application data directory. Git-tracked
SQLite migrations must support existing databases, rollback on failure, and
recovery evidence before release. Supabase migrations and generated web types
remain independent; desktop work does not authorize hosted schema changes.

Use a thin native transaction boundary when required. Do not assume separate
SQL-plugin calls share a connection or transaction. Business decisions stay in
TypeScript; native code may execute validated operations atomically, manage
files, schedule notifications, and handle lifecycle events.

Retain the explicitly requested dormant sync scaffold:

- tombstones for syncable deletions;
- a mutation outbox committed in the same transaction as the domain mutation;
- persisted cursors and stable local identity;
- a no-op `SyncEngine` with no network delivery.

The scaffold must preserve current deletion, history, and uniqueness semantics.
It does not implement a remote backend, cloud identity linking, or conflict
resolution. Future sync needs its own contract; the old blanket
last-writer-wins proposal does not override current concurrency protections.

## UI and cross-platform cascade

Keep the current sparse design and four-screen structure: Timeline, Behaviors,
Export & Import, and Settings. Desktop uses callbacks and client services
instead of Server Actions. Product components must not own domain rules or
database/native calls.

Extract canonical tokens into `packages/ui` incrementally. Keep runtime-specific
shells and product components. Bundle fonts, images, and completion audio for
offline use, subject to redistribution-rights verification before release.
Use BehaviorLog import for web-to-desktop transfer; do not add a Full JSON
importer.

Extend `design-system.surfaces.json` with desktop implementations and native
bench evidence. Keep product usage counts separate from bench previews.
Extend the existing interaction registry with platform applicability,
implementation status, and evidence. Reuse interaction IDs when the intent
does not change. Do not create a second interaction or decision registry.

Each new or materially changed product/design ticket must address web, desktop,
marketing, and future mobile. Each entry must link implementation, identify a
follow-up ticket, or explain why it is not applicable. Marketing consumes
approved product claims; it does not duplicate application UI. Mobile stays
deferred even when it benefits from portable contracts.

Existing checks must reject missing references. The desktop release check must
reject incomplete applicable interaction parity. Neither check alone proves
semantic or visual parity; fixture, adapter, and WKWebView evidence remains
required.

Candidate-building prerequisites must be separate from final release readiness.
A planned updater interaction may require candidate artifacts for its acceptance
test. It must not block their creation or be falsely promoted to implemented.
Keep the existing production release checks strict. Preview candidates retain
applicable signature, archive/content, and data-protection checks.

## Native reminders

Preserve hosted browser/email reminder semantics. Desktop schedules local
notifications through a thin macOS adapter. The standard Tauri desktop
notification implementation does not provide scheduled delivery; see its
[implementation](https://raw.githubusercontent.com/tauri-apps/plugins-workspace/v2/plugins/notification/src/desktop.rs).

Target the next 30 days, scheduling the nearest eligible reminders first.
The owner accepted a clearly displayed OS-limited horizon on 2026-08-30;
30 days is a target, not guaranteed coverage. Verify retained pending requests
through OS readback and derive coverage from the contiguous intended sequence.
The first missing request ends verified coverage; a later retained request
cannot extend it. Show the actual scheduled-through date/time and clearly
disclose shorter coverage or unavailable verification. Successful scheduling
callbacks alone do not prove coverage. Do not hardcode a universal request cap.

Reconcile on launch, resume, local day change, and relevant mutations. Persist
native request identifiers and map activation back to the intended Timeline
Occurrence. Cancellation and replacement must remain idempotent after
resolution, edits, archival, repeated reconciliation, and restart.

Native delivery uses BehaviorLog's existing extension mechanism. Do not fork
the upstream schema or change the hosted delivery channels. Do not imply that
OS acceptance proves the user received or read a notification.

The desktop adapter allows up to 850 ms for each pending/delivered readback
phase to settle. One stable incomplete readback may trigger nearest-request
repair. It counts occupied desired identifiers separately from exact content
matches and preserves matching nearest requests. Unstable readback remains
limited; it never establishes a universal OS capacity. Archival, resolution,
and deletion also cancel and verify delivered-only Notification Center entries.
Already delivered entries for unresolved active Occurrences remain available.

Verify permission denial, scheduled delivery, cancellation, replacement,
activation, sleep/resume, fully quit delivery, and OS scheduling limits on
macOS. A shorter OS-limited horizon is acceptable only when coverage is verified
and clearly displayed. Unverified or overstated coverage still fails the gate.
Do not silently truncate coverage or add a background helper.

The initial native probe found that macOS 26.5.2 retained 100 of 128 requests
and evicted 28 without scheduling callback errors. This is observed evidence,
not a universal 100-request limit. The owner's 2026-08-30 horizon decision
replaces the guaranteed 30-day requirement. It does not complete Ticket 108 or
waive native activation proof before broad refactoring. See
[native evidence](qa/2026-08-30-desktop-native-boundary.md).

## Implementation sequence

| Phase | Ticket | Completion requirement |
|---|---|---|
| Activate | 107 | Owning docs, current parity baseline, and cross-platform contract are recorded; unrelated changes survive |
| Native proof | 108 | Persistent SQLite writes, atomic rollback, scheduling/cancellation, activation, and restart evidence pass before broad refactoring |
| Shared foundations | 109 | Portable core/tokens move incrementally with preserved web APIs, fingerprints, and green checks |
| Local persistence | 110 | Current schema, stable seed, atomic operations/outbox, and both adapter contracts pass |
| Tracking parity | 111 | Four screens and all current tracking/portability interactions pass offline and WKWebView QA |
| Native reminders | 112 | Nearest-first reconciliation, verified OS-limited coverage, visible horizon, and lifecycle evidence pass |
| Preview and updater acceptance | 113 | Authorized ad hoc preview, public feed, failure paths, explicit update/restart, and data preservation pass |
| Apple-trusted distribution | 115 | Deferred until Developer Program access, Developer ID, notarization, stapled artifacts, quarantined-DMG Gatekeeper, and Apple Silicon macOS 14 acceptance are available |

## Completed unnotarized preview milestone

The 2026-08-31 owner decision authorized Ticket 113. The completed milestone
preserved Cadence, `app.cadence.desktop`, and existing local data. It produced
Apple Silicon artifacts with ad hoc signing and no Apple credentials or
notarization. It added no backend, CI infrastructure, background helper, cloud
login, or live sync.

The completed milestone uses the existing `emixd12/habit-tracking-app`
repository, clearly labeled preview files, and a dedicated HTTPS preview feed.
It does not depend on the latest-release pointer. Repository credentials remain
outside the app and feed. The owner approved the concrete published packet.

Ticket 113 checked existing updater keys before generating one persistent pair.
The password-protected private key remains outside the repository with owner-
only access. Exact key paths, password-manager backup steps, secure password
retention, and the public fingerprint are documented without secrets. Updater
integrity signing does not replace Apple signing.

Testing on the current laptop used a protected database backup. Two preview
versions passed real HTTPS update, downloaded DMG launch, explicit install and
restart, invalid-signature/tamper rejection, unavailable-download recovery,
preserved local identity/history, and reminder reconciliation. Both versions
use schema 6, so shipped-migration testing is not applicable to Ticket 113.
Existing native rollback tests remain current evidence. The first future schema-
changing desktop update must upgrade an older installed version through the real
updater with a protected database backup.

Document expected macOS security warnings and use Apple's per-app approval
workflow where needed. Do not disable Gatekeeper globally or remove quarantine
to claim an installation passed. The exact six asset hashes in
[`the asset record`](qa/2026-08-30-desktop-asset-provenance.md) now carry the
owner's Cadence bundling authorization. Preserve third-party notices, MIT asset
exclusions, and reserved trademark rights; no broader relicensing is authorized.

## Verification and release

Run agent, interaction, resolver, design-system, lint, typecheck, test, web-build,
and marketing checks throughout the track. Add native build/test and core
portability checks when their implementations exist. Record unavailable checks
explicitly; do not claim native runtime proof from browser simulation.

Required evidence includes:

- shared adapter contracts against local Supabase and real SQLite;
- midnight/DST, monthly fallback, overlapping schedules, stale edits, timing
  restart, and protected Occurrence preservation;
- import/restore rollback, stale-preview rejection, archive limits,
  sensitive-data defaults, and BehaviorLog round trips;
- offline launch, restart persistence, keyboard access, responsive layouts,
  and actual WKWebView rendering;
- native notification permissions, cancellation, activation, sleep/resume,
  fully quit delivery, contiguous OS-readback coverage, and visible shorter horizons;
- Ticket 113 updater signatures, local-data-preserving upgrades, and bundled-
  asset redistribution rights;
- Ticket 115 Developer ID signing, notarization, stapled app/DMG validation,
  quarantined notarized-DMG Gatekeeper acceptance, and Apple Silicon macOS 14.

Ticket 115 owns the deferred Developer ID signed and notarized `.app` and `.dmg`
artifacts. Tauri requires [signed updater artifacts](https://v2.tauri.app/plugin/updater/).
Local commands, signing requirements, and installed-upgrade evidence live in
[`DESKTOP_RELEASE.md`](DESKTOP_RELEASE.md).

Apple access and credentials remain unavailable, and the current host does not
run macOS 14. Keep Ticket 115 deferred. Public production publication remains an
explicit owner-authorized action; do not publish or change providers as a side
effect.
