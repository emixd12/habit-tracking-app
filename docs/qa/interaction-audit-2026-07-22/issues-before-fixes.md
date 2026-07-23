# Interaction audit issues before fixes

Frozen: 2026-07-22, before remediation.

This report is the immutable pre-remediation finding set for the Cadence
interaction audit. Later fixes, ownership, and retest outcomes belong in
`remediation.md`; findings in this file must not be removed or rewritten to
make the post-fix state look cleaner.

## Frozen baseline

- Git commit: `79b964ac76f37d7dea1e40ae7a896afea086ebb1`
- Interaction registry SHA-256:
  `852e30ff18a2dd45d31d3d13537d7d3f65c3f43a42ee30b57bf262735cc097a0`
- Registry schema: `1.0.0`
- Inventory: 83 interactions, 97 declared triggers, and 55 declared variants
- Initial verification: `agents:check`, `interactions:check`,
  `resolvers:check`, and the 452-test Vitest suite passed
- Hosted data: synthetic disposable accounts only; all audit accounts were
  deleted after their batches

Severity totals: **0 P0, 6 P1, 17 P2, and 4 P3**.

## P0 findings

No P0 finding was verified.

## P1 findings

### IA-001 — Reminder delivery planning is bypassed after behavior graph writes

- Affected interactions: `INT-BEHAVIOR-016` through `INT-BEHAVIOR-020`,
  `INT-BEHAVIOR-022`, `INT-BEHAVIOR-023`, `INT-EXPORT-013`, and
  `INT-EXPORT-018`.
- Reproduction: create or update a behavior with a reminder, archive or restore
  it, or apply an import/restore; then read Timeline before the background
  planner runs and inspect `reminder_deliveries`.
- Expected: every graph write immediately leaves occurrence coverage and
  reminder deliveries consistent; archive cancels pending deliveries and
  restore replans them.
- Actual: write paths only mark occurrence sync stale. Ordinary reads repair
  occurrences with `planReminderDeliveries: false` and then mark coverage
  fresh, so the background planner skips the user. New deliveries can be
  absent and old rows can stay stale or cancelled.
- Impact: primary reminder journeys silently fail even though behavior saves
  appear successful.
- Evidence: `lib/services/behavior.service.ts:79-250`,
  `lib/services/occurrence.service.ts:400-495`,
  `lib/services/behaviorlog-import-write.service.ts:353,771`,
  `lib/services/behaviorlog-restore.service.ts:394`, and
  `supabase/migrations/20260717161342_repair_schedule_integrity_and_atomic_behavior_writes.sql:734-883`.
- Source of truth: `docs/NOTIFICATION_SPEC.md:163-169` and
  `docs/TICKETS.md:2018-2035`.

### IA-002 — One browser push endpoint can remain attached to multiple accounts

- Affected interaction: `INT-SETTINGS-004`.
- Reproduction: register one browser subscription as account A, sign into
  account B in the same browser, and refresh notification status or register
  again.
- Expected: the endpoint is owned by the current account only, and the status
  reflects both browser and persisted current-account state.
- Actual: status checks only the origin-local `PushManager` subscription. The
  database uniqueness and upsert key are `(user_id, endpoint)`, so the same
  endpoint can remain active for multiple users. A persistence failure can
  also reload as “Enabled” without a current-account row.
- Impact: a shared browser can receive behavior-title payloads for a prior
  account, which is a privacy breach.
- Evidence: `lib/push/browser.ts:67-123`,
  `lib/db/pushSubscriptions.repo.ts:12-30`, and
  `supabase/migrations/20260607204951_create_database_schema.sql:90-100`.
- Source of truth: `docs/NOTIFICATION_SPEC.md` and the owner-scoping promise in
  `interaction-registry.json`.

### IA-003 — Valid import and restore bundles exceed the actual Server Action limit

- Affected interactions: `INT-EXPORT-010`, `INT-EXPORT-013`,
  `INT-EXPORT-014`, and `INT-EXPORT-018`.
- Reproduction: preview an otherwise valid bundle larger than roughly 750 KiB,
  acknowledge it, and submit the apply action, which base64-embeds the bytes.
- Expected: a bundle below Cadence's documented 20 MiB limit can preview and
  apply, or receives a controlled application error.
- Actual: Next.js defaults Server Actions to a 1 MiB request body and
  `next.config.ts` does not override it. The framework rejects the apply body
  before Cadence recovery handling runs.
- Impact: valid backups can preview successfully but cannot be imported or
  restored.
- Evidence: `next.config.ts:5`, import/restore action payload construction, and
  installed Next.js `action-handler.js:575-585`.
- Source of truth: the 20 MiB limits in the BehaviorLog import and restore
  services and `docs/UI_SPEC.md:670-701`.

### IA-004 — ZIP parsing permits unauthenticated resource exhaustion

- Affected interactions: `INT-EXPORT-010` and `INT-EXPORT-014`.
- Reproduction: submit a small compressed archive with a very large declared
  entry count or expansion ratio to either preview endpoint.
- Expected: authenticate first and reject archives that exceed per-entry,
  cumulative uncompressed-size, entry-count, or compression-ratio limits.
- Actual: only compressed input bytes are capped; the parser trusts central
  directory sizes and uses synchronous `inflateRawSync`. Import and restore
  parse before authentication.
- Impact: an unauthenticated request can consume substantial memory and CPU,
  affecting availability.
- Evidence: `lib/services/zip.ts:72-109,141-173`,
  `lib/services/behaviorlog-import.service.ts:172-178`, and
  `lib/services/behaviorlog-restore.service.ts:276-282`.
- Source of truth: the safe-preview and bounded-input promises in
  `docs/UI_SPEC.md` and `docs/USER_FLOWS.md`.

### IA-005 — An identical BehaviorLog bundle cannot complete an approved merge

- Affected interactions: `INT-EXPORT-010` through `INT-EXPORT-013`.
- Reproduction: apply a synthetic bundle with Create-only, then immediately
  preview the same unchanged bundle using Approved merge.
- Expected: the second preview maps or skips identical records idempotently and
  can be safely applied.
- Actual: the behavior is mapped, but the preview reports
  `behavior_identity_mismatch` and leaves ten dependent records at Needs
  decision even though visible title, category, description, and schedule are
  identical.
- Impact: the primary idempotent merge/re-import journey is blocked.
- Evidence: hosted disposable-account browser reproduction and
  `lib/resolvers/behaviorlog-import.resolver.ts:1966-1977,2860-2874`.
- Source of truth: `docs/USER_FLOWS.md` BehaviorLog merge flow and the
  idempotency promises in import tests and the interaction registry.

### IA-006 — A failed timezone save can persist an unrecoverable partial graph

- Affected interaction: `INT-SETTINGS-003`.
- Reproduction: allow the profile timezone update to succeed, fail behavior
  timezone propagation or occurrence sync, and retry the same timezone.
- Expected: failure preserves the original graph, or a retry repairs every
  dependent record.
- Actual: the service writes profile, behaviors, and sync state sequentially.
  A retry returns early when the profile already contains the new timezone, so
  behavior timezones can remain inconsistent. Sync failure is also reported
  after prior writes persist.
- Impact: schedules and occurrences can use mixed timezone state with no
  recovery path in the UI.
- Evidence: `lib/services/settings.service.ts:73-98`.
- Source of truth: `docs/USER_FLOWS.md:495-499`, `docs/UI_SPEC.md:691`, and
  `INT-SETTINGS-003` failure semantics.

## P2 findings

### IA-007 — Clearing a decision cannot revive its cancelled reminder

- Affected interaction: `INT-TIMELINE-007`.
- Reproduction: resolve an occurrence before its reminder, clear the decision,
  then run reminder planning.
- Expected: clearing returns the occurrence to Unresolved and replans an
  eligible future reminder.
- Actual: resolution cancels the unique delivery row; Clear does not plan
  reminders, and the later insert uses `ignoreDuplicates`, so the cancelled row
  is never revived.
- Impact: the user can undo a decision but not restore the reminder promised by
  the interaction.
- Evidence: `lib/services/occurrence.service.ts:626-637`,
  `app/(app)/behaviors/actions.ts:97-115`,
  `lib/db/reminderDeliveries.repo.ts:27-32`, and the delivery uniqueness
  constraint in the initial schema migration.
- Source of truth: `interaction-registry.json` success result for
  `INT-TIMELINE-007` and `docs/NOTIFICATION_SPEC.md`.

### IA-008 — Archive and restore can partially persist while reporting failure

- Affected interactions: `INT-BEHAVIOR-022` and `INT-BEHAVIOR-023`.
- Reproduction: make either the behavior update or stale-marker operation fail
  in the service's `Promise.all`.
- Expected: failure preserves the original active/archive state.
- Actual: one concurrent write can persist while the other rejects, after which
  the action reports failure.
- Impact: the visible error can disagree with durable behavior state.
- Evidence: `lib/services/behavior.service.ts:205-250`.
- Source of truth: the registered failure results for both interactions.

### IA-009 — Cancel leaves controlled schedule edits behind

- Affected interaction: `INT-BEHAVIOR-021`.
- Reproduction: change recurrence, monthly fields, and time; activate Cancel.
- Expected: all unsaved edits return to the initial create/edit draft.
- Actual: native form reset clears uncontrolled identity fields but controlled
  recurrence and time state persists. The browser capture shows Daily beside
  stale monthly controls and a retained `09:15` time.
- Impact: the next save can persist changes the user explicitly cancelled.
- Evidence: `components/behaviors/BehaviorForm.tsx:96-198,311-318,357-373,533-641`
  and `screenshots/behavior-cancel-reset-state.png`.
- Source of truth: `INT-BEHAVIOR-021` intent.

### IA-010 — Schedule time-mode selects have no accessible name

- Affected interaction: `INT-BEHAVIOR-012`.
- Reproduction: inspect or traverse a behavior form with a screen reader.
- Expected: every repeated Exact time/Time range select has a programmatic name
  that distinguishes its schedule and row.
- Actual: the select has no associated label, `aria-label`, or
  `aria-labelledby`; the visible sibling “Times” text is not associated.
- Impact: assistive-technology users encounter unnamed comboboxes.
- Evidence: `components/behaviors/BehaviorForm.tsx:378-380,533-558`.
- Source of truth: the Alex accessibility lens and `docs/UI_SPEC.md`.

### IA-011 — Important asynchronous results are not announced

- Affected interactions: `INT-BEHAVIOR-022`, `INT-BEHAVIOR-023`,
  `INT-SETTINGS-004`, and `INT-SETTINGS-009`.
- Reproduction: perform or fail one of these actions with a screen reader while
  focus remains on the initiating control.
- Expected: success and error state is announced with an appropriate live
  region or alert/status role.
- Actual: messages are plain paragraphs without `role`, `aria-live`, or focus
  movement.
- Impact: non-visual users may not know whether a destructive, notification, or
  archive action completed.
- Evidence: `components/behaviors/BehaviorList.tsx:804-807`,
  `components/settings/NotificationPermissionPanel.tsx:166-175`, and
  `components/settings/AccountDeletionPanel.tsx:104-107`.
- Source of truth: `docs/UI_SPEC.md` accessibility requirements.

### IA-012 — Notification denial recovery disappears after reload

- Affected interaction: `INT-SETTINGS-004`.
- Reproduction: deny browser notifications, reload Settings, or make initial
  subscription-status inspection reject.
- Expected: persistent, actionable browser-settings recovery remains visible,
  and status inspection settles into a factual recoverable state.
- Actual: denied permission hides the action and reload shows only “Blocked in
  this browser”; detailed recovery text exists only in the click handler. An
  uncaught initial rejection can leave “Checking” indefinitely or hide first-run
  setup.
- Impact: the user cannot recover from a common permission state from within
  the documented workflow.
- Evidence: `components/settings/NotificationPermissionPanel.tsx:38-75,109-115,193-195`
  and `components/onboarding/FirstRunOnboardingPanel.tsx:49-92`.
- Source of truth: `docs/USER_FLOWS.md:501-505`, `docs/UI_SPEC.md:425-428`, and
  stale `UX-005` in `docs/UX_RESEARCH_LOG.md`.

### IA-013 — Destructive Apply controls are enabled before their gates

- Affected interactions: `INT-EXPORT-011` through `INT-EXPORT-013` and
  `INT-EXPORT-015` through `INT-EXPORT-018`.
- Reproduction: preview an import or restore and inspect Apply before checking
  acknowledgements or typing `RESTORE`.
- Expected: Apply remains unavailable until every required gate is satisfied.
- Actual: import Apply remains enabled and relies on native required
  validation. Restore's disabled calculation ignores all gates, and its typed
  confirmation field is not required. Server enforcement still prevents the
  write.
- Impact: destructive readiness is communicated incorrectly and keyboard or
  assistive-technology users encounter avoidable failed submissions.
- Evidence: `components/export/BehaviorLogImportPanel.tsx:372-508` and
  `components/export/BehaviorLogRestorePanel.tsx:265-353`.
- Source of truth: `docs/UI_SPEC.md:670-701` and registry availability rules.

### IA-014 — CSV exports permit spreadsheet formula injection

- Affected interaction: `INT-EXPORT-005` (`csv` and `behaviorlog` variants).
- Reproduction: use a title or note beginning with `=`, `+`, `-`, or `@`,
  export CSV or BehaviorLog CSV views, and open the file in a spreadsheet.
- Expected: user-authored fields remain inert data.
- Actual: CSV escaping handles separators, quotes, and newlines but does not
  neutralize formula-leading cells.
- Impact: an imported or self-authored value can execute as a spreadsheet
  formula when the export is opened.
- Evidence: `lib/resolvers/export.resolver.ts:503-531,1845-1872`.
- Source of truth: `docs/EXPORT_FORMATS.md` safety and portability intent.

### IA-015 — The marketing skip link does not focus main content

- Affected interaction: `INT-MKT-001`.
- Reproduction: activate “Skip to content” on the built marketing homepage.
- Expected: the fragment changes to `#main` and keyboard focus lands on the
  main landmark.
- Actual: the URL fragment changes, but focus falls to `body`; `main` is not a
  focus target.
- Impact: keyboard users still traverse from the document start instead of the
  promised destination.
- Evidence: built Astro preview at 1440×900 and
  `apps/marketing/src/layouts/BaseLayout.astro` skip-link/main markup.
- Source of truth: `INT-MKT-001` success result.

### IA-016 — The registered example-bundle route is stale

- Affected interaction: `INT-MKT-009`.
- Reproduction: compare the registry route with the built CTA and generated
  artifact.
- Expected: the registry names the downloadable artifact used by the site.
- Actual: the registry declares
  `/examples/cadence-example.behaviorlog.zip`; the built site and generator use
  `/examples/cadence-demo.behaviorlog.zip`. The real download succeeds.
- Impact: registry-driven QA and guides request a nonexistent path.
- Evidence: `interaction-registry.json:650`,
  `apps/marketing/src/data/site.ts:13,34-36`, and the 8,497-byte browser
  download from the built preview.
- Source of truth: `docs/INTERACTION_REGISTRY.md`.

### IA-017 — Needs decision backdrop close is missing from registry coverage

- Affected interaction: `INT-TIMELINE-003`.
- Reproduction: press the modal backdrop rather than Close or Escape.
- Expected: every owned close trigger appears in the registry and drift
  checker.
- Actual: backdrop `onMouseDown` closes the dialog and restores focus, but only
  Close and Escape are registered. The checker does not scan `onMouseDown`.
- Impact: the declared 97-trigger matrix omits a real pointer/touch path.
- Evidence: live browser reproduction,
  `components/timeline/NeedsDecisionDialog.tsx:113-116,153`, and
  `scripts/check-interactions.mjs:92-97`.
- Source of truth: `docs/INTERACTION_REGISTRY.md:37-43,73-83`.

### IA-018 — Delivered-notification click is absent from the registry

- Affected interaction: `INT-SETTINGS-004` and an unregistered downstream
  interaction.
- Reproduction: click a delivered Cadence browser notification.
- Expected: the focus-or-open `/timeline` behavior is registered and traceable.
- Actual: the service worker owns `notificationclick`, focuses or opens a
  client, and navigates to `/timeline`, but no interaction or source-inventory
  entry covers it.
- Impact: a public-facing navigation path cannot be audited or guided from the
  canonical inventory.
- Evidence: `public/push-service-worker.js:17-55`.
- Source of truth: `docs/INTERACTION_REGISTRY.md:37-43,73-83`.

### IA-019 — Timeline exposes an unregistered Unmark action

- Affected interactions: `INT-TIMELINE-005`, `INT-TIMELINE-006`, and
  `INT-TIMELINE-007`.
- Reproduction: mark an expanded Timeline occurrence Completed or Not
  Completed; activate the resulting “Unmark” control.
- Expected: Timeline status controls match the registered interaction set, in
  which Clear decision is scoped to behavior day review.
- Actual: Timeline exposes and successfully executes “Unmark,” but no Timeline
  trigger is registered for it.
- Impact: status mutation capability and user guidance differ from the product
  source of truth.
- Evidence: live capture `screenshots/timeline-unregistered-unmark.png`,
  `components/timeline/StatusButtons.tsx:52`, and the registry.
- Source of truth: `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`, and
  `docs/INTERACTION_REGISTRY.md`.
- Approval dependency: deciding whether to remove Unmark or formally expand
  Timeline scope changes product direction.

### IA-020 — Browser Back can desynchronize the export range radio

- Affected interactions: `INT-EXPORT-001` through `INT-EXPORT-004`.
- Reproduction: choose All time, apply, navigate away or to another range, then
  use Back to a `?range=90` URL.
- Expected: URL, selected-range text, counts, and checked radio all show 90
  days.
- Actual: the URL, text, and counts show 90 days while the local-state radio
  still shows All time.
- Impact: the next Apply can submit a range different from the visibly loaded
  results.
- Evidence: `screenshots/export-back-range-mismatch.png` and export panel local
  state/prop synchronization.
- Source of truth: `INT-EXPORT-001` through `INT-EXPORT-004`.

### IA-021 — Shared-device guidance has no sign-out interaction

- Affected scope: authenticated shell and Settings; no registry ID currently
  exists.
- Reproduction: follow the Terms instruction to sign out on a shared device.
- Expected: an authenticated user can end the session without deleting the
  account.
- Actual: no shell, Settings, route, or registry interaction signs out; only
  account deletion calls `signOut`.
- Impact: the documented shared-device privacy control is impossible.
- Evidence: `components/settings/LegalContent.tsx:87-90`, AppShell/Settings, and
  `lib/services/account.service.ts:33`.
- Source of truth: Terms and account-security guidance.
- Approval dependency: adding sign-out creates a new user interaction and needs
  explicit product-direction approval.

### IA-022 — A personal reminder test address is committed in provider docs

- Affected scope: reminder operations documentation; adjacent interactions are
  `INT-BEHAVIOR-017` and `INT-BEHAVIOR-018`.
- Reproduction: inspect the recorded Sequenzy test event.
- Expected: public repository evidence uses a redacted or synthetic recipient.
- Actual: `docs/SEQUENZY_WORKFLOW.md:219` contains a personal email address.
- Impact: unnecessary personal data is published in the current tree; redacting
  the file does not erase Git history.
- Evidence: `docs/SEQUENZY_WORKFLOW.md:219`.
- Source of truth: repository security and privacy rules in `AGENTS.md`.

### IA-023 — The deployed marketing alias is not congruent with this baseline

- Affected scope: production versions of `INT-MKT-001` through `INT-MKT-011`.
- Reproduction: compare the deployed homepage title at
  `https://cadence-marketing-two.vercel.app/` with the built working-tree
  homepage.
- Expected: the public alias reflects the audited baseline title
  “Cadence · Decide your days, own every record.”
- Actual: the deployed page reported “BehaviorLog Bundle Standard and Cadence.”
- Impact: production cannot be treated as exact evidence for this source
  baseline, and Cadence-first metadata is stale.
- Evidence: read-only Chrome observation and
  `apps/marketing/src/layouts/BaseLayout.astro`.
- Source of truth: `docs/PUBLIC_PRODUCT_ARCHITECTURE.md` and the current
  marketing source.
- Approval dependency: deployment or alias changes require separate
  authorization.

## P3 findings — documented, not remediated in this audit

### IA-024 — First-run dismissal is origin-global rather than account-specific

- Affected interactions: `INT-ONBOARD-001` and `INT-ONBOARD-002`.
- Reproduction: dismiss setup in disposable account A, delete it, then create
  disposable account B in the same browser.
- Expected: ambiguous; a new-account interpretation would show setup again,
  while the current spec says browser-local dismissal.
- Actual: the fixed `cadence-first-run-dismissed` key suppresses onboarding for
  every later account on the origin.
- Impact: a new user on a shared browser can miss first-use guidance.
- Evidence: live sequential-account reproduction and
  `components/onboarding/FirstRunOnboardingPanel.tsx:28,62-64,104-107`.
- Source of truth: `docs/UI_SPEC.md` browser-local dismissal wording.
- Approval dependency: changing the storage key semantics requires a product
  decision.

### IA-025 — Several registered labels do not match visible controls

- Affected interactions: `INT-ONBOARD-001`, `INT-SHELL-004`,
  `INT-BEHAVIOR-021`, `INT-EXPORT-013`, and `INT-SETTINGS-005`.
- Actual examples: “Close setup” versus “Dismiss setup”; “Collapse/Open
  sidebar” versus “Collapse navigation” and brand expansion; “Cancel reset
  button” versus “Cancel”; stale import Apply labels; one “row” versus three
  legal links.
- Impact: generated QA instructions and manuals can ask for controls users
  cannot find verbatim.
- Evidence: registry-to-browser/source comparison.
- Source of truth: `docs/INTERACTION_REGISTRY.md` exact-control contract.

### IA-026 — The footer llms link is missing source-inventory ownership

- Affected interaction: `INT-MKT-010`.
- Reproduction: compare the interaction implementation list with the
  BaseLayout source-inventory entry.
- Expected: every implementation source is mapped to the intent it owns.
- Actual: `BaseLayout.astro` implements the footer `llms.txt` link and is named
  by the interaction, but its inventory entry omits `INT-MKT-010`.
- Impact: source-based ownership queries miss a real trigger origin.
- Evidence: `apps/marketing/src/layouts/BaseLayout.astro:88`,
  `interaction-registry.json:108-117,677-684`, and
  `scripts/check-interactions.mjs:363-370`.
- Source of truth: `docs/INTERACTION_REGISTRY.md`.

### IA-027 — Direct automated coverage is materially overstated

- Affected interactions include `INT-AUTH-003`, `INT-MKT-009`,
  `INT-MKT-010`, `INT-SHELL-001`, `INT-SHELL-002`, `INT-ONBOARD-001`,
  `INT-ONBOARD-002`, `INT-TIMELINE-001`, `INT-TIMELINE-004`,
  `INT-BEHAVIOR-004`, `INT-BEHAVIOR-007` through `INT-BEHAVIOR-015`,
  `INT-BEHAVIOR-020`, `INT-BEHAVIOR-022`, `INT-BEHAVIOR-023`, export panel
  interactions, `INT-SETTINGS-001`, `INT-SETTINGS-004`,
  `INT-SETTINGS-005`, and `INT-SETTINGS-009`.
- Actual: cited tests commonly cover parsing, a service, static copy, or an
  adjacent component without activating the registered UI trigger. Some
  entries cite production generators rather than tests.
- Impact: registry queries overstate regression protection and hide required
  manual coverage.
- Evidence: comparison of each cited reference with its registered trigger;
  representative details remain in `static-findings.md`.
- Source of truth: `docs/INTERACTION_REGISTRY.md` coverage-level definitions.

## External-test blockers at freeze

These are evidence limitations, not additional IA issues:

- Google OAuth walkthrough: blocked because the available browser session was
  a personal account and no approved disposable Google identity was available.
- Exact-subscription push delivery: blocked because the isolated in-app browser
  had notification permission denied; the other browser session was personal.
  No personal subscription was registered or used.
- Sequenzy delivery: provider authentication and the enabled
  `habit-reminder` template were verified read-only, but `AGENTMAIL_API_KEY` was
  absent, so a task-scoped inbox and sanitized receipt could not be created.
- The hosted `/api/reminders/process` route is unscoped across due users and was
  deliberately not invoked.

