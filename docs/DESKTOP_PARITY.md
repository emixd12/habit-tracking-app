# Desktop parity baseline

The baseline is the BehaviorLog 0.3 working web build on 2026-08-30, including its
uncommitted marketing changes. The four desktop product screens now use local
services and shared UI. Tracking parity is complete locally. Ticket 113's ad hoc
preview and updater acceptance are complete. Apple-trusted distribution is
deferred under Ticket 115.
The native boundary bench does not count as tracking parity.

The original 0.2 native workflows remain supporting evidence. Current 0.3
export, migration, import, and adapter acceptance is recorded separately in
`docs/qa/2026-08-30-desktop-0.3-acceptance.md`. Neither the native boundary bench
nor structural registry checks establish a signed release.

`interaction-registry.json` is the only interaction inventory. At activation,
it contains 88 existing intents: 63 apply to desktop and 25 have explicit
exclusions. Ticket 111 owns 60 tracking intents. Ticket 112 owns three native
notification intents. Future mobile implementation and parity remain deferred.
These counts describe activation only. The current registry has 90 intents:
64 apply to desktop and 26 have explicit exclusions. All 64 applicable intents
are implemented. The registry is authoritative.

## Current tracking contract

- Timeline shows today, seven future days initially, and seven-day increments
  through 30 future days. Needs decision includes prior unresolved occurrences
  and decisions retained through their current local-day correction window.
- Status writes append history atomically. Repeated resolved choices are
  idempotent. Clear decision belongs in Behavior day review. Notes preserve
  drafts and reject stale saves. Completion audio cannot delay status success.
- Timing supports start, stop, and confirmed reset. Persisted running sessions
  survive restarts and midnight. Start eligibility follows the current
  Timeline and Needs decision rules. Stop remains available afterward.
- Behaviors support category selection, title, description, multiple recurrence
  schedules, multiple exact times or time ranges, archive, and restore. Current
  forms permit six schedules and eight time entries per schedule. Default
  categories remain the eight names in `lib/types/database.ts`; category CRUD
  is not an implemented parity requirement.
- Analytics supports 7, 30, and 90-day ranges, selected-day correction, separate
  unresolved counts, and average tracked time derived from stopped sessions.
- Export supports JSONL, CSV, full JSON, Markdown, and BehaviorLog. Notes and
  timing require explicit inclusion. Prompt tools copy text for an external
  assistant; Cadence does not call an AI service.
- BehaviorLog supports validated previews, create-only import, approved merge,
  and destructive restore with backup and typed confirmation. It preserves
  safely mapped schedules, timing, history, and provenance. Restore and import
  reject stale accepted previews and roll back failed writes. Full JSON is an
  export, not an additional importer.
- Settings supports explicit timezone choice and local timezone detection.
  Timezone changes preserve historical occurrences and append configuration
  history. Desktop adapts first-run setup and notification settings locally.

See `docs/PRODUCT_SPEC.md`, `docs/RECURRENCE_RULES.md`,
`docs/DATETIME_STRATEGY.md`, and `docs/EXPORT_FORMATS.md` for exact semantics.

## Persistence baseline

The SQLite schema in `docs/DESKTOP_DATA_MODEL.md` implements the current model,
not only the original June schema. It includes profiles, categories, Behaviors, schedules, time entries,
Occurrences, timing sessions, definition events, configuration events, status
events, occurrence-generation freshness, import runs, import mappings, passive
imported notes, passive imported interventions, and native reminder state.
Desktop also retains the explicitly requested stable identity, tombstones,
transactional mutation outbox, cursors, and no-op sync boundary.

Required invariants include:

- Occurrence identity uses Behavior, local date, start time, and exact/range-end
  identity. Equal starts with different ranges remain distinct.
- A Behavior write commits its schedule graph, append-only history, current
  configuration pointer, and freshness invalidation atomically.
- Status writes compare both the current status and latest event. The snapshot,
  new event, pending-reminder cancellation, and outbox commit together.
- Generation compares the current configuration and freshness version. It
  preserves resolved rows, rows at or before now, notes, timing, and unknown
  lineage. It never fabricates history for legacy records.
- Only one running timing session exists per Occurrence. Stopped duration is
  derived from timestamps, never stored as a mutable total.
- Import and restore preserve accepted-preview fingerprints, idempotence,
  provenance, append-only history policy, and transaction rollback.
- Passive imported interventions never become operational reminders without
  a separate supported and explicit promotion boundary.

Hosted Auth, RLS, push subscriptions, provider delivery, account deletion, and
distributed rate limits remain web responsibilities. Local ownership still
validates the one profile at the native data boundary.

## Shared extraction boundaries

`packages/core` now owns portable resolvers, domain types, hashing, and shared
operation planning. Web compatibility exports preserve existing module APIs.
`lib/db/behavior-store.ts` and the desktop store implement the same operation
contract. Hosted Auth, cache, and provider delivery remain web adapters.

Portable SHA-256 preserves export and import fingerprints. Core checks reject
framework, provider, Node-only, and browser-runtime imports. FormData parsing
stays outside the core. Shared SQLite/Supabase contracts exercise actual
atomic operations rather than replacement in-memory repositories.

ZIP compression and decompression stay behind an archive adapter. Preserve the
existing 2 MiB archive, 128-entry, 32 MiB per-entry, 64 MiB total, and 100:1
compression limits, CRC validation, path validation, and unsupported-format
rejections. Do not treat a Node polyfill as portability proof.

Shared UI uses explicit refresh, navigation, and form callbacks. The web keeps
Next adapters; desktop supplies local services. `packages/ui` owns canonical
tokens, offline IBM Plex Sans CSS, and runtime providers. Desktop bundles the
current product images and audio. The owner authorized the six exact asset
hashes for Cadence distribution on 2026-08-31; see
`docs/qa/2026-08-30-desktop-asset-provenance.md`. MIT exclusions and reserved
marks remain. Font and icon notices remain required and are recorded in
`apps/desktop/README.md`.

## Current evidence (2026-08-31)

- Actual WKWebView proof covers daily Behavior creation, both decisions, saved
  Notes, timing across quit/reopen, reset, archive/restore, selected-day review,
  Settings confirmation, and native pending-request cancellation.
- Native Export proof covers save/cancel, privacy defaults, included Notes/time,
  copied Markdown, file selection, preview, approved merge/replay, restore
  acknowledgments, and a completed destructive restore. The restore preserved
  the kept graph, Note, and timing while removing 31 reviewed future rows.
- At 406×800, native navigation, disclosures, content width, and route scroll
  reset passed. Setup navigation reaches asynchronously loaded import controls.
  Evidence and limitations live in
  `docs/qa/2026-08-30-desktop-native-boundary.md`.
- Six real SQLite store contracts and eight portability contracts pass on
  the final 0.3 source. Fresh original-bundle replay, repeated self-export merge,
  and restore preserve accepted source identity and passive records.
  `tests/helpers/behavior-store-contract.ts` also runs create/update/archive/
  restore, history, stale-write, and rollback through the production Supabase
  adapter. Ordinary clients enforce cross-user isolation. The local RLS smoke
  passes 92 checks. Synthetic accounts were cleaned up; no hosted data changed.
- The rich import fixture matches the production SQL atomic import and shared
  native plan. Comparison covers graph topology, status, Note, 60-second timing,
  histories, provenance, accepted-run idempotency, and no operational reminders
  before separate post-commit repair.
- The SQL restore contract exercises self-export/merge/restore with exact Keep
  preservation and reviewed future deletion. Mixed Keep/write fixtures verify
  metadata replacement, separately approved Notes, and partial schedule changes
  without rewriting a kept time entry. Historical self-export after a schedule
  change also passes. SQL fixes remain local until separately deployed.
- Final 0.3 native save, privacy, approved merge, re-export, and zero-create
  replay preview pass. Configuration history and existing passive Notes retain
  their IDs and content. Settings confirms zero operational reminder requests
  after the synthetic archived-history import.
- Shared token declaration maps and browser baselines preserve web and marketing
  styling. Native screenshots provide separate WKWebView evidence.

Offline launch and persistence passed through owner-assisted acceptance on
2026-08-31. The owner confirmed disconnecting networking, launching Cadence,
marking Cadence offline QA Completed, and preserving that decision after
quit/relaunch. The supplied screenshot shows Completed. A read-only SQLite
snapshot at 00:28:19 EDT independently confirmed the saved decision and its
00:26:04.205 mutation, with valid integrity and no foreign-key failures. The
running process started at 00:26:20, after that decision. The reopened native
UI retained Completed before cleanup. Network disconnection was owner-confirmed,
not independently observed.
Ticket 111 is complete locally. Evidence:
`docs/qa/2026-08-30-desktop-lifecycle-release.md#offline-launch-and-persistence-passed`.

Activation routing validates product UUID targets and reads the exact owned
Occurrence outside the feed range. Shared row semantics cover archived, past,
resolved, and future targets. Focused tests and the real SQLite contract pass.
The owner clicked a native product notification after the app quit. Before any
agent launch, Cadence showed the intended 22:41 Occurrence expanded and focused;
the earlier 22:30 row remained collapsed. Tab moved to the target's Track Time
control. Final-product fully quit delivery is also verified. A DOM regression
confirms repeated activation focus and preserves focus during ordinary refresh.
Evidence: `docs/qa/2026-08-30-desktop-lifecycle-release.md#product-notification-click-passed`.

Product now refreshes at the profile's next local midnight, with DST-aware
calendar scheduling and timezone-change cleanup. Product tests verify Needs
decision regrouping and reminder repair before the minute poll. Wake/resume
event tests cover the existing native event drain. Actual system sleep/wake
passed on 2026-08-31: OS logs recorded sleep at 00:17:30 EDT and wake at 00:17:32.
SQLite recorded planning at 00:17:32.668 and coverage at 00:17:35.252, before the
next minute poll and GUI inspection. Settings showed Allowed permission,
complete zero/zero coverage, and no errors without selecting Refresh. This
proves automatic post-wake reconciliation without distinguishing the wake and
resume callbacks. Tickets 111 and 112 are complete locally.
Evidence: `docs/qa/2026-08-30-desktop-lifecycle-release.md#system-sleep-and-wake-passed`.

The registry marks implemented intents using shared semantic tests, real adapter
contracts, and representative native workflows. Final WKWebView Escape dismissal restored launcher focus; Tab, Return,
and Space exercised representative navigation and form opening.
Real updater/recovery acceptance passed through the public preview feed.
Both versions use SQLite schema 6, so shipped-migration testing is not applicable
to Ticket 113. Native rollback tests remain current evidence. The first future
schema-changing update must upgrade an older installed version through the real
updater after a protected database backup.

Ticket 115 owns Apple Developer Program access, Developer ID signing,
notarization, stapled app/DMG verification, quarantined notarized-DMG Gatekeeper
acceptance, and Apple Silicon macOS 14 execution. These remain deferred, not
passed. Marketing must not claim notarized or generally available distribution.

## Verification boundary

`node scripts/check-interactions.mjs --desktop-release` verifies declarations
and references, not behavior. Preview candidate-building checks remain separate
and do not weaken Ticket 115's Apple validation. The strict production check
passes updater configuration, tools, and all 64 applicable interactions, then
stops on the unavailable Developer ID and notarization inputs.

Query the current pending desktop work without maintaining another inventory:

```bash
jq -r '.interactions[] | select(.platforms.desktop.applicability == "applicable") | [.id, .name, .platforms.desktop.status, (.platforms.desktop.follow_up // "")] | @tsv' interaction-registry.json
```
