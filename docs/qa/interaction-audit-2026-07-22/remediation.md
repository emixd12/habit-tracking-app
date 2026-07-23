# Interaction audit remediation ledger

This file records ownership, changes, review, and retest results after the
immutable finding set in `issues-before-fixes.md` was frozen.

## Rules

- Do not rewrite or remove findings from `issues-before-fixes.md`.
- Fix P0 through P2 findings only. P3 findings remain documented.
- Record approval-dependent work as blocked rather than silently changing
  product direction, deploying schema, changing provider configuration, or
  mutating non-disposable hosted data.
- Review each batch first for source-of-truth compliance, then for code quality
  and regression risk.

## P1 batches

| Batch | Findings | Owner | State | Focused verification |
| --- | --- | --- | --- | --- |
| Reminder and timezone consistency | IA-001, IA-006, IA-007 | `p1_reminder_timezone` | Implemented and twice reviewed | 51 focused tests, `resolvers:check`, lint, and typecheck pass |
| Push endpoint ownership | IA-002 | `p1_push_ownership` | Application fix implemented; schema deployment approval-blocked | 4 focused files / 22 tests pass; local reset was attempted but Docker was unavailable; hosted migration was not deployed |
| Import and restore safety | IA-003, IA-004, IA-005 | `p1_import_security` | Implemented | IA-003 follow-up covers the >750 KiB regression, exact raw-archive fingerprint binding, 2 MB refusal, and a 1,230,362-byte worst-case export; prior IA-004/IA-005 verification remains recorded below |

### IA-001, IA-006, and IA-007 implementation

- Reminder planning now reconciles the expected future delivery set: it creates
  missing rows, cancels obsolete unclaimed rows, and reactivates cancelled rows
  only when `scheduled_send_at` is strictly after the injected current instant.
  Due and past pending rows remain under due-delivery validation.
- Behavior and approved import/restore writes run best-effort occurrence and
  reminder repair after the durable product write. A repair error is monitored
  and remains retryable without reporting the committed write as failed.
- The background selector reads the durable sync-state ledger with stale rows
  first, then earliest covered horizon, oldest update, and stable user id. This
  rotates bounded batches instead of repeatedly selecting the oldest profiles.
- A same-value timezone retry rewrites active behavior timezones and reruns
  occurrence/reminder repair, recovering profile-first partial failures.
- Clear decision immediately reconciles the owning occurrence and behavior.
  Only still-future reminders can be restored; a repair failure preserves the
  committed Unresolved correction and marks retry state.

The first source-of-truth review found false post-commit failure risk and
past-reminder revival risk; both were corrected. The independent second review
then found the missing Clear-decision trigger and bounded-batch starvation;
both were corrected and covered before this batch was accepted.

### IA-002 deployment dependency

The browser now verifies the exact endpoint and key material against an active
row owned by the current account. Stale browser state is unsubscribed before a
fresh subscription is created, and a failed persistence attempt rolls the new
browser subscription back. A local migration deactivates older duplicate
active endpoint rows under a table lock and adds a partial unique index so one
active endpoint cannot belong to multiple accounts.

The application fix is not production-complete until the migration is applied.
`npm run supabase -- db reset` could not run because the local Docker engine was
unavailable. Hosted `db push` is a separate schema-deployment approval and was
not performed. Deploy the migration before application code; otherwise existing
duplicate rows can still produce a false enabled state.

### IA-003 implemented direction

IA-003 uses single-transport apply with a preview fingerprint. Import and
restore action state retain the SHA-256 of the exact previewed archive bytes,
not base64 archive data. Apply submits the base64 archive once, recomputes its
raw fingerprint, requires an exact match, and then re-parses and re-validates
the bundle authoritatively.

The advertised and enforced compressed-bundle limit is 2 MB, with the same
factual refusal in the client pre-submit check and server validation. The
Next.js Server Action ceiling is 4 MB so a roughly 2.7 MB base64 representation
of a 2 MB ZIP stays below Vercel's 4.5 MB request cap with margin. Export ZIP
entries now use DEFLATE. The synthetic five-year corpus of ten daily Behaviors,
18,260 Occurrences, approximately 500-character Notes, and 18,260 status events
measured 1,230,362 bytes (1.173 MiB), below the 1.5 MiB sanity threshold.
The focused test also proves a valid compressed bundle above 750 KiB can pass
preview, accepted-preview binding, and apply. Full follow-up verification passed
106 agent invariants, 4,199 interaction invariants across 85 interactions and
34 sources, 159 resolver invariants, design-system checks with no errors or
warnings, lint, typecheck, 537 tests in 80 files, and the production build.

### IA-004 and IA-005 implementation

- IA-004: import and restore authenticate before archive decoding. ZIP reads
  now bound compressed input, entry count, per-entry and cumulative extracted
  bytes, compression ratio, and actual inflate output; malformed directory,
  ZIP64, multi-disk, encrypted, unsupported-compression, size, and CRC states
  fail with controlled errors.
- IA-005: merge candidate lookup uses canonical BehaviorLog category identity
  while retaining Cadence display-category identity when both sides provide
  it. An unchanged Cadence re-import maps idempotently, while same-title
  `Medical` and `Measurements` behaviors remain a conflict even though both
  canonicalize to `health_wellness`.

Focused verification passed across 13 BehaviorLog import, restore, ZIP, UI,
resolver, write-service, and migration test files (100 tests), plus
`npm run resolvers:check`, `npm run lint`, and `npm run typecheck`.

## P2 batches

| Batch | Findings | Owner | State | Focused verification |
| --- | --- | --- | --- | --- |
| Behavior lifecycle and schedule-form accessibility | IA-008, IA-009, IA-010 | `p2_behavior_lifecycle` | Implemented and twice reviewed | 46 focused tests, lint, typecheck, `resolvers:check`, `interactions:check`, and `design-system:check` pass |
| Asynchronous results and destructive client gates | IA-011, IA-012, IA-013, IA-020 | `p2_async_safety_ui` | Implemented and twice reviewed | 4 focused files / 30 tests, follow-up 8-test review, lint, typecheck, and `interactions:check` pass |
| Export, public accessibility, registry completeness, and privacy | IA-014, IA-015, IA-016, IA-017, IA-018, IA-022 | `p2_registry_security` | Implemented and twice reviewed | 2 final focused files / 28 tests, `interactions:check`, `resolvers:check`, `marketing:check`, lint, and typecheck pass |
| Product or deployment decisions | IA-019, IA-021, IA-023 | Owner-approved follow-up | IA-019, IA-021, and IA-023 implemented | Timeline Unmark is registered on the existing correction intent; POST-only shell Sign out is implemented; the audited marketing tree was deployed and verified congruent on 2026-07-23 |

### IA-008, IA-009, and IA-010 implementation

- Archive and Restore now use the existing owner-scoped
  `update_behavior_with_schedule_graph` transaction. The behavior active state,
  preserved definition/schedule graph, and durable stale retry marker commit or
  roll back together. Immediate repair is non-fatal after commit. The client
  also reconciles the committed row immediately between Active and Archived
  sections, without waiting for a reload or creating a duplicate row.
- Immediate repair requires the current profile timezone. A missing or failed
  profile read leaves the atomic stale marker in place, while the background
  selector preserves ledger priority and resolves each selected account's
  current timezone from `profiles` instead of trusting a copied ledger value.
- Cancel restores the complete initial create/edit draft, including controlled
  recurrence, schedule, and time rows.
- Every repeated Exact time/Time range select now has a distinct accessible
  name containing its schedule and time-row positions.

The first second-stage review found that the initial post-commit design could
lose retry intent when stale marking and immediate repair both failed. The
transactional revision closed that gap. A follow-up review then found that an
archived Behavior could carry an older timezone into the retry ledger; the
authoritative profile lookup and background target mapping closed that gap.

### IA-011, IA-012, IA-013, and IA-020 implementation

- Behavior lifecycle results use one live announcement: successful results are
  statuses and failures are alerts. Account-deletion failures are alerts in
  Settings; successful deletion redirects to one focused, polite
  `Account deleted.` status on Login. The archive/restore result is owned by the
  parent list so it survives row movement, and the deletion notice focuses
  after hydration rather than only during the server render.
- Notification inspection failures settle into a retryable not-enabled state.
  Blocked browser-settings recovery and **Refresh this device** remain visible
  after reload. Unsupported, denied, dismissed, registration, and permission
  request failures caused by a user action are alerts; passive availability
  information and success remain statuses.
- Import Apply is disabled until the exact accepted preview and any sensitivity
  warning are acknowledged. Restore Apply additionally requires the fresh
  backup acknowledgement and exact case-sensitive `RESTORE` text. A different
  preview fingerprint resets the client acknowledgements, while the server
  remains authoritative.
- The Export range draft remounts from the server/URL range so browser Back can
  no longer show a stale checked radio beside different results.

The independent review caught two missing accessibility outcomes: deletion
success was announced only in an unreachable action state, and several failed
notification attempts still used polite status semantics. Both were corrected
and re-reviewed against their real outcome branches.

### IA-014, IA-015, IA-016, IA-017, IA-018, and IA-022 implementation

- App and BehaviorLog CSV views prefix formula-leading user-controlled text
  with an apostrophe before normal CSV quoting. Protection is column-scoped;
  machine-generated structured fields, including `-04:00` and `+05:30` UTC
  offsets, remain exact.
- The marketing `<main id="main">` is focusable, so **Skip to content** has a
  valid focus target. The registry now names the generated
  `/examples/cadence-demo.behaviorlog.zip` artifact.
- The Needs decision backdrop close is a declared trigger, and the interaction
  checker scans `onMouseDown` handlers.
- `INT-NOTIFICATION-001` now registers delivered-notification activation. The
  service worker is in source inventory, and direct tests cover existing-window
  navigation/focus, new-window opening, and cross-origin fallback to the
  same-origin `/timeline` route.
- The personal reminder-test recipient was redacted from current provider docs
  and `STATUS.md`. Both documents state that the address can remain in Git
  history; history was not rewritten.

The independent review found that the first CSV fix also prefixed legitimate
negative structured values. Column-scoped protection and signed-offset
regressions corrected that before this batch was accepted. P3 IA-026 was left
unchanged as required.

### P2 follow-up decisions

- IA-019: Timeline **Unmark** is registered as the immediate-correction trigger
  on `INT-TIMELINE-007`, alongside deliberate **Clear decision** in Behavior
  review. Both paths use the same atomic Unresolved correction and restore only
  still-future reminders.
- IA-021: `INT-SHELL-008` provides a POST-only **Sign out** control below the
  account row in expanded desktop, collapsed desktop, and mobile-drawer states.
  Success ends the session and announces **Signed out.** on Login.
- IA-023: resolved on 2026-07-23 with owner approval. The audited marketing
  working tree was deployed to the `cadence-marketing` Vercel project and
  aliased to `https://cadence-marketing-two.vercel.app`. The deployed homepage
  title matches the audited baseline, `/examples/cadence-demo.behaviorlog.zip`
  serves the expected artifact, and `/llms.txt` responds.

## P3 research backlog

IA-024 through IA-027 remain exactly as frozen: onboarding dismissal is
origin-global, several registry labels drift from visible control text,
BaseLayout source ownership omits the footer trigger for `INT-MKT-010`, and
multiple direct-coverage declarations remain overstated. No P3 implementation
or registry-coverage cleanup was performed in this audit.

### IA-028 — Settings can overflow slightly at 320px with a long account email

This P3 observation was found during the post-remediation full-matrix retest,
after `issues-before-fixes.md` had been frozen, so it is recorded here without
rewriting the pre-remediation report.

- Affected interactions: `INT-SETTINGS-001` through `INT-SETTINGS-009` on the
  shared Settings route.
- Reproduction: use the task-scoped synthetic account identifier, set the
  viewport to 320×844, and inspect the Settings page width.
- Expected: the page remains within the 320px viewport without horizontal
  scrolling.
- Actual: the document measured 320px client width and 328px scroll width. The
  same page did not overflow at 390×844, and the Behaviors page did not overflow
  at 320×844. The long Profile email established the Settings grid's minimum
  content width.
- Impact: a long account identifier can introduce an 8px horizontal scroll or
  clip the right edge at the targeted minimum viewport.
- Evidence: isolated-browser layout measurements and
  `app/(app)/settings/page.tsx` Profile email rendering.
- Source of truth: `AGENTS.md` completion criterion 9 and the mobile
  single-column layout rules in `DESIGN.md`.
- Disposition: documented only, consistent with the rule not to remediate P3
  findings in this audit.

## Persona guidance and registry integration

The task-based manuals under `docs/user-guide/` cover all current interactions
without creating product routes. Registry schema 1.1 adds required
`user_guidance` metadata. Eighty-three interactions use the user-facing guides;
only `INT-AUTH-002` and `INT-SHELL-007` point to the internal QA appendix. The
checker validates audience, path, file existence, and GitHub-style Markdown
heading anchors.

## Full-matrix retest

Complete with documented approval and environment blocks. The immutable
baseline remains 83 interactions, 97 triggers, 55 variants, and 152 cases with
126 pass, 22 fail, and 4 blocked terminal results. The current registry matrix
contains 85 interactions, 101 triggers, 55 variants, and 156 cases. Its final
case results are 144 pass, 0 fail, and 12 blocked; every case has current guide
references and preserves its separate frozen baseline evidence where one
existed.

Affected browser paths were retested at 1440×900 and 390×844, with targeted
320×844 checks. Cancel reset, immediate Archive/Restore placement and live
announcements, Export browser-Back range reconciliation, notification recovery,
focused account-deletion confirmation, and the marketing skip target all
matched the remediated contracts. App and marketing console checks reported no
interaction-specific errors or warnings. IA-028 records the separate 320px
Settings overflow and remains unfixed as a P3 finding.

Provider-boundary outcomes are explicit rather than substituted with personal
state. At freeze, all three were blocked: Google OAuth (no approved disposable
identity), exact-subscription push delivery (isolated browser denied
permission), and Sequenzy delivery (task-scoped AgentMail credential
unavailable). Read-only Sequenzy identity and template checks passed. The
unscoped hosted reminder queue was never invoked.

Owner-authorized follow-up on 2026-07-23 resolved two of the three:

- Google OAuth end-to-end passed on production using the owner's designated
  spare Google identity only: /login CTA, account chooser (redirect host
  byte-verified against the configured Supabase project), consent, callback,
  authenticated /timeline, and account deletion through the Settings gates.
  No other Google account was touched; no credential was handled.
- Sequenzy reminder email delivery passed end-to-end; see
  `sequenzy-delivery-receipt-2026-07-23.md` for the sanitized receipt. The
  scoped `limit=1` process call ran only after confirming the sole due
  pending delivery system-wide belonged to the disposable test account.
- Exact-subscription push delivery passed later on 2026-07-23 after the owner
  authorized local-origin browser navigation: a disposable test-login account
  granted the native localhost notification prompt fresh (owner clicked
  Allow), registered exactly one active subscription owned by that account
  under the deployed IA-002 uniqueness constraint, and a product-planned due
  reminder processed with `limit=1` (sole due delivery system-wide) returned
  `sent: 1`. The notification rendered and its activation focused /timeline,
  exercising `INT-NOTIFICATION-001`. The subscription, account, and all rows
  were deleted afterward; no personal subscription was used or disturbed.
  One local-environment defect was found and logged for follow-up: an
  `http:` `NEXT_PUBLIC_SITE_URL` is passed through as the VAPID subject and
  rejected by the web-push provider; the send succeeded once the variable was
  temporarily unset so the `mailto:` fallback applied. Production uses an
  `https:` subject and is unaffected.

Repository verification passed `agents:check` (106), `interactions:check`
(4,142 across 84 interactions and 34 sources), `resolvers:check` (157),
`design-system:check` (0 errors and 0 warnings), `marketing:check` (0 errors,
warnings, or hints), lint, typecheck, 523 tests in 78 files, build, and
`git diff --check`. The Supabase reset was attempted separately and blocked by
an unavailable Docker engine; the IA-002 migration remains undeployed pending
schema-deployment approval.

All task-created disposable accounts were deleted, task downloads and isolated
browser tabs were cleared, temporary viewport changes were reset, and no
personal account or recipient was used.
