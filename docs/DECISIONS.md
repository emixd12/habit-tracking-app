# Locked Product Decisions

These decisions are already resolved. Do not re-ask them unless a later user prompt explicitly changes them.

## Status model

Use explicit manual marking.

Statuses:

- unresolved
- completed
- not_completed

Do not auto-mark an occurrence as missed.

Needs decision is a derived UI state for prior-day unresolved occurrences, not a stored status.

The UI labels `completed` as Completed and `not_completed` as Not Completed.

Occurrence rows keep a current-status snapshot. Internal
`occurrence_status_events` rows store explicit status history for auditability
and BehaviorLog interoperability.

Manual status snapshot and event writes are atomic. Corrections link to the
latest known event, clearing a decision leaves history intact, repeated taps of
the current resolved status are idempotent, and note-only edits do not create
status events.

## Primary route

Use Timeline as the primary screen.

Route:
`/timeline`

Avoid:
`/dashboard`

## Day reset

Use local midnight.

Default timezone:
America/New_York

## Medication tracking

V1 tracks only did/did not.

Do not add:

- Dose amount
- Supply count
- Refill inventory
- Medication calculation logic

## Measurements

No structured measurement templates in v1.

Use:

- Behavior title
- Behavior description
- Occurrence note

### Occurrence elapsed time exception

Ticket 068 permits one duration-only exception. An occurrence can own persisted
start/stop time sessions. Cadence derives recorded duration from each stopped
interval and keeps timing separate from statuses, adherence, notes, and reminder
eligibility. This does not authorize templates, targets, manual duration entry,
or other structured measurements. Start is available on an active behavior's
current-day occurrence and on occurrences still visible in Needs decision.

## Recurrence anchor

Use scheduled date/time.

Recurring behaviors should recur according to their schedule, not from the last completion date.

## Behavior schedules and time entries

Behaviors can have one or more schedules. Each schedule owns one recurrence
pattern and one or more exact times or time ranges. Add time means another time
entry under the same recurrence. Add schedule means another recurrence pattern.

Supported preset ranges:

- Morning: 6:00 AM-Noon
- Afternoon: Noon-6:00 PM
- Evening: 6:00 PM-Midnight
- Night: Midnight-6:00 AM

Range occurrences use the beginning of the range as their scheduled reminder
anchor. Matching generated occurrences with the same behavior, local date,
start time, and end-time/range identity are counted once. Multi-time behavior
completion is derived from individual occurrence statuses only; do not add a
stored partial-completion status or progress label.

## Reminders

Browser notifications:

- Enabled by default on every behavior
- Permission is requested from Settings

Email reminders:

- Optional per behavior
- Configured when creating/editing behavior

## Offline behavior

Internet-required web app is acceptable.

Web offline support and PWA caching remain deferred. The active desktop track
requires offline tracking through SQLite; live synchronization remains deferred.

Future offline/PWA work is tracked in `/docs/FUTURE_UPDATES.md`.

## Auth

Use Google login through Supabase Auth for the web app. Desktop uses one stable
local profile without login or network access.

## Supabase operations

Use the Supabase CLI as the standard pathway for database and hosted project operations.

- Use project-local commands through `npm run supabase -- <command>`.
- Use migrations for all schema changes.
- Keep local and hosted schema congruent through git-tracked migrations.
- Do not change the hosted database directly outside migrations.
- Use `docs/SUPABASE_WORKFLOW.md` for command details.

## Owner-scoped time-session query APIs

Keep a bounded, authenticated, `SECURITY INVOKER` RPC for genuinely arbitrary
Occurrence ID sets. The repository batches automatically above 2,000 unique
IDs, merges the results, and restores deterministic global order. Callers and
users do not encounter that implementation limit.

Do not use the ID RPC as the primary historical-data API. Analytics,
behavior-date review, and Export use a joined date-range/keyset-cursor RPC.
PostgreSQL joins Occurrences to Time Sessions directly, filters on stored
Occurrence `local_date`, and returns bounded pages that the repository follows
automatically.

Do not place an unbounded UUID list in a Data API URL. Do not use
`SECURITY DEFINER`, accept a caller-supplied user ID, expose execution to
anonymous roles, or use the service-role client. Existing owner RLS remains
authoritative, and both RPCs explicitly scope rows to `auth.uid()` as defense
in depth. Ticket 094 owns the full contracts and verification requirements.

## Email provider

Use Sequenzy for v1 email reminders.

- Use the Sequenzy CLI as the standard agent pathway for provider operations.
- Use project-local commands through `npm run sequenzy -- <command>`.
- Keep runtime email sending server-only.
- Do not expose `SEQUENZY_API_KEY` to the browser.
- Use `docs/SEQUENZY_WORKFLOW.md` for command details.

## Date and time implementation

Use the strategy in `docs/DATETIME_STRATEGY.md`.

- Default timezone remains `America/New_York`.
- Use local midnight for day boundaries.
- Store `scheduled_for` as `timestamptz` and `local_date` as the local calendar date.
- Use Temporal for timezone-aware implementation when recurrence logic begins.
- Inject `now` into resolvers; do not read the system clock inside resolver logic.

## Agent drift checks

Run `npm run agents:check` and `npm run resolvers:check` before considering any coding task complete.

These checks are part of the repository contract and should be extended when new drift risks appear.

## Product direction

Build a custom, open-source Cadence product.

Do not start by integrating an open-source habit tracker.

Cadence is now a public product posture, not a private-only app. The current
web app should be hardened for many independent single-account users while
remaining single-player and small.

Cadence also demonstrates and promotes the BehaviorLog Bundle standard:
`https://github.com/emixd12/BehaviorLog-Bundle`.

## Public surface architecture

Use separate shells for separate surfaces:

- authenticated web app: current Next.js app,
- marketing site: implemented sibling Astro app,
- desktop app: local-first macOS track implemented under Tickets 107–114, with
  Apple-trusted distribution deferred under Ticket 115,
- mobile app: future local-first app following the desktop direction.

For the active desktop track, keep Next.js at the repository root and add only:

```text
app/              existing Next.js routes, with components/ and lib/ at root
apps/
  marketing/
  desktop/
packages/
  core/
  ui/
```

Create shared packages incrementally after the native boundary proof. Broader
restructuring and mobile remain deferred. Keep npm workspaces.

## Marketing stack

Use Astro for the public marketing site. Keep it SEO-conscious, static-first,
and visually consistent with `docs/PRODUCT_SPEC.md` and `DESIGN.md`.

## Pricing and AI

Billing is not launch scope. The intended future shape is free open-source
desktop/mobile apps plus paid web/shared-account capabilities for cross-surface
saving and future speech-to-speech AI features.

Do not add payment or AI speech features until tickets update the relevant
product, route, data, legal, and operations docs.

## Open-source copyright and security disclosure

Decision date: 2026-08-25. Ticket: 099.

Cadence uses the MIT license with
`Copyright (c) 2026 Identity Scaffolding LLC`.

The MIT scope covers owner-controlled source code, repository documentation,
and synthetic sample content. It excludes tracked binary non-code assets
pending provenance review, including app icons, logos, brand illustrations,
product captures, custom notification icons, design exploration, QA
screenshots, and audio.

Cadence names and logos remain reserved as trademarks. The MIT license grants
no trademark-use permission. Hosted service access, production credentials,
and user-owned behavioral data also remain outside the source license.

Private vulnerability reports use `security@identityscaffolding.com` as the
primary route. GitHub private vulnerability reporting becomes a secondary
route after publication and explicit enablement. The repository owner monitors
the inbox. The owner authorized exactly one harmless synthetic route test. The
sender accepted and retained that one message with sent status on 2026-08-25,
and recipient-side inspection confirmed receipt at the approved mailbox. The
message landed in the junk folder, so the repository owner monitors filtered
folders or maintains appropriate allowlisting. No response deadline, bug
bounty, paid support, contributor license agreement, or copyright assignment
is promised.

## Marketing content, retention, and legal publication

Decision date: 2026-08-27. Ticket: 106.

Cadence's public source remains
`https://github.com/emixd12/habit-tracking-app` under the MIT license. The
application origin remains canonical for `/trust`, `/privacy`, and `/terms`.
Cadence provides prepared prompts, but users export data and choose an external
AI service; Cadence does not send behavior data to an AI provider. Public copy
names exactly JSONL, JSON, CSV, Markdown, and BehaviorLog bundle exports.

The public entity is Identity Scaffolding LLC, a Wyoming limited liability
company assumed authorized in New York, at 30 N Gould St Ste R, Sheridan, WY 82801. The minimum age is 18. New York law governs, subject to nonwaivable
consumer protections. Disputes start with informal resolution and then proceed
in a court of competent jurisdiction in New York State. The initial Terms use
neither mandatory arbitration nor a class-action waiver.

The retention policy remains a proposal, not an approved publication claim.
Its targets are 30 days for routine logs; up to 90 days or the end of an
investigation for security-incident logs; no more than 30 days for backups;
immediately or within seven days for deleted-account live data, with backup
remnants aging out within 30 days; and 12 months after resolution for support
messages. Specific records may be kept longer only for security investigations,
fraud prevention, or legal preservation.

The sanitized 2026-08-27 audit found one-day Vercel Pro runtime logs, seven-day
Supabase Pro API and database logs, and seven-day Supabase Pro daily backups.
No Vercel Observability Plus entitlement, Vercel Log Drain, or Supabase Log
Drain was evidenced. The routine-log and incident-log targets are unsupported.
The backup maximum is supported. Immediate live-data deletion is supported by
the Auth deletion path and database cascades, without a destructive production
test in this audit. Sequenzy transactional retention, browser-push intermediary
retention, and the proposed 12-month support-message period remain unverified.

The Privacy and Terms text dated August 27, 2026 is a draft date, not legal
approval or an effective publication date. Legal-copy publication and public
registration remain blocked until sanitized provider-retention evidence
supports the final claims,
`privacy@identityscaffolding.com` passes one harmless route-confirmation test,
and one legal review approves the final legal text and facts. No gate is
recorded as passed by this decision. The proposed retention policy must change,
or the active provider controls must change under separate authorization,
before the retention gate can pass.

## Ticket 106 publication approval

Decision date: 2026-08-31. Ticket: 106.

The 2026-08-27 decision above remains a historical checkpoint. The owner later
confirmed that active retention settings were verified, the privacy mailbox
passed its harmless route test, legal review approved the final Privacy and
Terms text and facts, and all publication approvals are complete.

The final policy replaces the unsupported 30-day routine-log proposal with the
verified active windows: one day for Vercel runtime logs and seven days for
Supabase API and database logs. Supabase daily backups and deleted-account
backup remnants retain no more than seven days. Browser-push payloads expire
after no more than 24 hours. Support messages retain for 12 months after
resolution. Security-incident records may be preserved for up to 90 days or
the end of the investigation when an investigation requires preservation.

Privacy and Terms are approved for publication. Public registration is
approved. This decision changes no authentication implementation or provider
setting.

## Local-first macOS desktop activation

Decision date: 2026-08-30. Tickets: 107–113.

The owner approved implementation of the desktop plan. Use Tauri v2, Vite,
React, and SQLite for macOS 14+ on Apple Silicon. Tracking requires no login or
network. Keep one stable local profile and current category/timezone defaults.
Preserve current tracking parity, including schedules, timing, history,
lineage, BehaviorLog import/merge/restore, and privacy defaults.

Native SQLite transaction and notification proof must precede broad shared-core
or UI refactoring. Add `apps/desktop`, then extract `packages/core` and
`packages/ui` incrementally. Preserve web APIs and keep Next.js at the root.
Business decisions remain in TypeScript. Thin native code may handle
transactions, files, notification scheduling, and lifecycle.

Retain tombstones, an atomic mutation outbox, cursors, stable local identity,
and a no-op SyncEngine. Do not add live sync, cloud login, or a remote conflict
policy. Reuse BehaviorLog import for transfer; do not add a Full JSON importer.
Native delivery uses BehaviorLog extensions without a schema fork or changes
to hosted delivery semantics.

Target 30 days of native reminders with a clearly displayed, verified
OS-limited horizon. The later 2026-08-30 horizon decision below supersedes the
initial guaranteed-coverage requirement. No background helper is authorized.

Use existing interaction IDs, platform applicability/evidence, and design-system
surface mappings. Every new or materially changed product/design ticket must
address web, desktop, marketing, and future mobile with implementation,
follow-up, or explicit not-applicable reasoning. Structural checks do not prove
semantic parity. Marketing consumes approved claims rather than duplicate UI.

Desktop tracking and the unnotarized preview/updater milestone are complete.
Apple-trusted distribution remains separate and deferred under Ticket 115.
The 2026-08-31 preview decision below records the six assets' distribution
authorization without marking Apple requirements passed.
Public publication remains an explicit release action.
Mobile, Intel releases, email delivery, cloud account controls, and duplicate
public/legal pages remain outside this track.

## Unnotarized desktop preview and asset authorization

Decision date: 2026-08-31. Ticket: 113.

The owner authorized an ad hoc signed Apple Silicon preview using Cadence's
existing identity and local data. Apple enrollment, Developer ID signing,
notarization, and original final-release acceptance are explicitly deferred,
not passed. They must not block preview preparation. macOS 14 remains the
declared minimum; compatibility requires actual testing.

Separate candidate-building prerequisites from final release checks. Preserve
strict production checks, signature/archive validation, data protection, and
honest updater evidence. Prepare previews and a dedicated HTTPS update feed
locally for `emixd12/habit-tracking-app`; public artifacts or feed exposure
required approval of the concrete files and destination. Ticket 113 and
`docs/DESKTOP_RELEASE.md` own the completed preview record; Ticket 115 owns
Apple-trusted distribution.

The owner confirmed ownership and authorized distribution inside Cadence of the
six exact file/hash pairs in `docs/qa/2026-08-30-desktop-asset-provenance.md`.
Do not request the same permission again. Existing MIT asset exclusions,
third-party notices, and reserved trademark rights remain unchanged. This does
not authorize unrelated relicensing or public hosting.

## Apple-trusted desktop distribution split

Decision date: 2026-08-31. Tickets: 113 and 115.

The owner closed Ticket 113 around its completed unnotarized Apple Silicon
preview and updater acceptance. Ticket 115 now owns Apple Developer Program
access, Developer ID Application signing, notarization submission and stapling,
quarantined notarized-DMG Gatekeeper acceptance, and actual Apple Silicon
macOS 14 execution. Ticket 115 is deferred because those resources are
unavailable. Marketing must not claim notarized or generally available
distribution until Ticket 115 passes.

Production checks remain strict. The current preview versions both use SQLite
schema 6, so shipped-migration testing is not applicable to Ticket 113. Native
rollback tests remain current evidence. The first future schema-changing desktop
update must upgrade an older installed version through the real updater after a
protected database backup. Do not create a disposable migration build or a
separate migration ticket now.

## Desktop native reminder horizon

Decision date: 2026-08-30. Tickets: 108 and 112.

The owner accepted replacing guaranteed 30-day native coverage with a clearly
displayed OS-limited horizon. Keep 30 days as the target and schedule nearest
eligible reminders first. Verify retained pending requests through OS readback.
Report contiguous coverage only; the first missing intended request ends it.
Clearly disclose the actual scheduled-through date/time, shorter coverage, and
unavailable verification. Scheduling callbacks alone do not prove retention.

The native probe's 100-of-128 retained requests motivated this change; it does
not establish a universal 100-request cap. Reconcile on launch, resume, local
day change, and relevant mutations without hardcoding that observed ceiling.

This decision permits a shorter verified horizon, not silent truncation or a
background helper. Hosted reminder semantics stay unchanged. Native activation
proof still precedes broad refactoring, and all other implementation, parity,
and release requirements remain. This decision does not complete Ticket 108.
