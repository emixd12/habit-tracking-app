# UX Research Log

## Purpose

This is the working log for Cadence UX journey testing. It records expert
review, sub-agent findings, later moderated usability observations, glitches,
and bugs.

Do not use this document to change product scope. If a finding requires a
product behavior change, update the relevant source-of-truth document in the
same future task.

## Logging Format

Use this format for each finding:

```text
ID:
Date:
Reviewer:
Persona:
Journey:
Route or surface:
Viewport or environment:
Finding type:
Severity:
Observation:
Evidence:
Source-of-truth reference:
Recommended follow-up:
Status:
```

Severity:

- P0: blocks core use or creates data/privacy risk.
- P1: blocks an important journey or risks incorrect records.
- P2: causes confusion, avoidable effort, or accessibility risk.
- P3: polish issue or low-risk wording/layout problem.

Finding types:

- Product gap
- Implementation bug
- UX copy issue
- Accessibility issue
- Visual/UI issue
- Test-data limitation
- Documentation gap

Finding status:

- Open
- Needs reproduction
- Deferred
- Fixed
- Won't fix

## Initial Expert Review Summary

Date: 2026-06-26

Reviewer: Codex parent agent, expert UX pass

Method:

- Reviewed project source-of-truth docs and representative implementation
  files.
- Created journey inventory and task-based test plan.
- Spawned focused read-only sub-agents for acquisition/trust, first-run
  activation, daily Timeline, recovery/review, reminders/settings, and
  portability.

Current posture:

- The documented product shape is coherent and tightly scoped.
- The strongest UX risks are discoverability of quiet controls, high-friction
  import/restore comprehension, permission-state clarity, and mobile/focus
  behavior in overlays and drawers.
- No product-scope conflict was identified while creating the research
  backbone.

## Browser Reproduction Pass

Date: 2026-07-06

Reviewer: Codex parent agent with read-only sub-agent audits

Method:

- Reproduced source-confirmed Settings, Timeline, first-run setup, and Needs
  Decision findings against fixture-backed `/design-system` previews at desktop,
  390px, and 320px.
- Verified no document-level horizontal overflow or browser console warnings in
  the changed previews.
- Verified Needs Decision keyboard open, Tab/Shift+Tab containment, Escape
  close, and focus return to the launcher in the design-system preview.
- Did not use `/auth/test-login` because the local app is pointed at hosted
  Supabase, and creating disposable hosted users requires owner approval for
  this pass.

Follow-up approved hosted QA:

Date: 2026-07-09

Reviewer: Codex parent agent

Method:

- Used `/auth/test-login` with `CADENCE_ALLOW_HOSTED_TEST_LOGIN=1` after owner
  approval to create disposable hosted Supabase users.
- Ran hosted many-user RLS smoke QA; the command created two temporary users,
  verified six ownership checks, and cleaned up those users.
- Browser-tested real authenticated `/timeline`, `/settings`, and `/export`
  flows with system Chrome. Screenshots and a sanitized JSON report were kept
  under `/private/tmp/cadence-remaining-qa`.
- Deleted every disposable browser-QA account through the Settings account
  deletion UI; final test-login cleanup reported no stale users deleted.

Observed results:

- Clean-account first-run setup rendered on real `/timeline` at desktop and
  390px mobile, with no horizontal overflow and the mobile panel top at 76px
  below the sticky header.
- Timeline status controls were visible for a created behavior with no
  horizontal overflow.
- BehaviorLog export downloaded successfully, and create-only import of that
  bundle into a second disposable account succeeded.
- Browser notifications saved successfully in a persistent Chrome profile after
  the client helper was fixed to wait for an active service worker before
  calling PushManager subscribe. A denied-notification state showed `Blocked in
  this browser` and hid the enable action.
- Settings `/settings#timezone` preserved exactly one `id="timezone"` anchor,
  the label targeted `timezone-input`, and mobile layout had no horizontal
  overflow.
- Account deletion remained disabled until the export acknowledgement and typed
  confirmation matched, then successfully deleted both disposable browser-QA
  accounts.
- Restore preview accepted a real Cadence-exported BehaviorLog bundle, but
  restore apply stayed disabled because the preview contained skipped actions.
  The exported bundle uses `sch_<uuid>` schedule ids while the current restore
  apply path still expects UUID core identifiers. This is a confirmed restore
  compatibility blocker, not a user-input blocker.

## Findings

### UX-001: BehaviorLog Value May Not Be Clear To First-Time Users

ID: UX-001

Date: 2026-06-26

Reviewer: Codex parent agent

Persona: Maya, first-time private tracker

Journey: J01 Public discovery

Route or surface: Astro marketing routes

Viewport or environment: Source review

Finding type: UX copy issue

Severity: P2

Observation: Users who do not already care about open data formats may not
understand why BehaviorLog matters before they have created behavior data.

Evidence: Product docs intentionally position Cadence as the consumer-facing
product and BehaviorLog as the portability layer. This is correct, but it makes
copy hierarchy important on `/`, `/cadence`, `/standard`, `/examples`, and
`/docs`.

Source-of-truth reference: `docs/PRODUCT_SPEC.md`, `docs/UI_SPEC.md`,
`docs/PUBLIC_PRODUCT_ARCHITECTURE.md`

Recommended follow-up: In a browser-based marketing walkthrough, ask first-time
participants to explain Cadence and BehaviorLog in their own words before using
the login CTA.

Resolution update (2026-07-09): Ticket 056 ran owner-approved agent-proxy
browser walkthroughs before and after a homepage copy correction. The initial
walkthroughs consistently found that "open tracker" was ambiguous and that
BehaviorLog could briefly be mistaken for the product. The revised homepage
names Cadence as the open-source personal tracker and BehaviorLog as the
portable export file format Cadence reads and writes. Reruns found no material
product-versus-format confusion.

Status: Fixed (owner-approved agent proxy evidence, not real-user evidence).

### UX-002: Quiet Text Actions Need Mobile And Hurry-State Testing

ID: UX-002

Date: 2026-06-26

Reviewer: Codex parent agent

Persona: Jordan, fast daily checker

Journey: J07 Daily timeline use

Route or surface: `/timeline`

Viewport or environment: Source and component review

Finding type: Accessibility issue

Severity: P2

Observation: Timeline row actions intentionally use underlined text-action
controls. This fits the visual system, but hurried users and mobile users may
miss status actions or hit the wrong target if spacing, focus, and 44px touch
targets are not verified.

Evidence: `components/timeline/Timeline.tsx` and related row components expose
Timeline status actions as the primary daily workflow. `docs/UI_SPEC.md`
requires mobile status and note actions to provide at least 44px tap targets.

Source-of-truth reference: `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`

Recommended follow-up: Run TS05 and TS13 at 390px and 320px widths, with
keyboard-only navigation and browser zoom at 200 percent.

Reproduction update (2026-07-06): Source review found the primary mobile
status and note actions already use 44px-class tap targets. Design-system
Timeline preview at 390px and 320px had no horizontal overflow or console
warnings after the row-disclosure and grouped-stack fixes. Authenticated
clean-account hurry-state testing remains a future human-research activity, not
a blocking implementation bug.

Status: Fixed

### UX-003: Needs Decision Zero-Count Retained Rows May Be Confusing

ID: UX-003

Date: 2026-06-26

Reviewer: Codex parent agent

Persona: Priya, reflective reviewer

Journey: J09 Needs decision

Route or surface: `/timeline`, Needs decision modal

Viewport or environment: Source and spec review

Finding type: UX copy issue

Severity: P2

Observation: The documented behavior allows the Needs decision button to open
with zero unresolved count when same-day retained decided rows still exist.
That is useful for correction, but users may read a zero-count action as empty
or broken.

Evidence: `docs/UI_SPEC.md` says retained decided rows can remain accessible in
the modal while the count continues to include unresolved prior-day occurrences
only.

Source-of-truth reference: `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`

Recommended follow-up: Include a same-day retained-row state in TS06 and ask
participants what they expect the zero-count button to do before opening it.

Reproduction update (2026-07-06): Confirmed as a copy risk and fixed. When the
unresolved count is zero but retained rows remain, the launcher now says
`Review decisions from today`.

Follow-up (2026-07-17): The per-date label `All decided today` was misleading
because each date group represents a prior day. Resolved date groups now say
`None left to decide`, which describes the group state without changing the
meaning of its date header.

Status: Fixed

### UX-004: Behavior Heatmap Interactivity May Be Undiscoverable

ID: UX-004

Date: 2026-06-26

Reviewer: Codex parent agent

Persona: Priya, reflective reviewer

Journey: J10 Later correction

Route or surface: `/behaviors`

Viewport or environment: Source and component review

Finding type: Visual/UI issue

Severity: P2

Observation: Later correction depends on selecting non-empty behavior calendar
cells. Users may read heatmaps as passive data visualization, especially
because the overall calendar is intentionally passive.

Evidence: `docs/USER_FLOWS.md` distinguishes the passive overall calendar from
actionable behavior-level date review. `components/behaviors/BehaviorList.tsx`
renders heatmap cells as dense square UI.

Source-of-truth reference: `docs/USER_FLOWS.md`, `docs/UI_SPEC.md`

Owner-approved agent proxy walkthrough (2026-07-09): This is proxy evidence,
not real-user evidence. In a local authenticated browser session, a reflective
reviewer persona started on Behaviors, looked for a way to correct a dated
decision without a prompt, selected a non-empty behavior heatmap cell carrying
the accessible/title hint `open day review`, and reached the explicit Review
selected day area. Opening the occurrence Review disclosure exposed Completed,
Not Completed, and Clear decision, with Clear decision limited to that
behavior-date context. The same path was checked at desktop and 390px mobile
viewports without overlap or horizontal scrolling. No occurrence status or note
was submitted, and no real-account screenshots were committed.

Outcome: The approved proxy route found the behavior-date review path from the
behavior heatmap without relying on the intentionally passive overall calendar.
No material copy or interaction confusion remained after the action hint,
explicit review heading, and scoped Clear decision affordance were present.

Future follow-up: Run TS07 with human participants before treating this as
externally validated discoverability evidence. If they do not find the path,
log a scoped UI follow-up rather than adding global past Timeline browsing.

Status: Fixed (owner-approved agent proxy evidence)

### UX-005: Browser Permission Recovery Needs Explicit Testing

ID: UX-005

Date: 2026-06-26

Reviewer: Codex parent agent

Persona: Lina, reminder-dependent user

Journey: J12 Browser reminders

Route or surface: `/settings#notifications`

Viewport or environment: Source and spec review

Finding type: Product gap

Severity: P2

Observation: Browser notification permission has browser-owned states that
Cadence cannot fully repair. The product correctly keeps tracking usable, but
blocked permission recovery must be tested as its own path.

Evidence: `docs/NOTIFICATION_SPEC.md` says blocked origins need browser or site
settings changed before Cadence can save a working subscription.

Source-of-truth reference: `docs/NOTIFICATION_SPEC.md`, `docs/USER_FLOWS.md`

Recommended follow-up: Run TS08 across at least allowed, denied, and blocked
permission states. Verify copy stays factual and does not imply Cadence can
reopen a browser prompt after the origin is blocked.

Reproduction update (2026-07-09): Approved hosted QA verified the allowed
subscription path in a persistent Chrome profile and a denied-notification
state via browser permission override. The denied state displayed `Blocked in
this browser` and did not show the enable action. The allowed path initially
found a real browser bug where PushManager subscription could run before the
service worker was active; this was fixed in the browser push helper.

Status: Fixed

### UX-006: Export Format Choice May Need Task-Based Clarity

ID: UX-006

Date: 2026-06-26

Reviewer: Codex parent agent

Persona: Sam, portability-focused adopter

Journey: J15 Export data

Route or surface: `/export`

Viewport or environment: Source and component review

Finding type: UX copy issue

Severity: P3

Observation: Export exposes multiple correct formats. Users may not know which
to choose for spreadsheet review, full backup, BehaviorLog portability, or AI
summary use.

Evidence: `components/export/ExportPanel.tsx` lists JSONL, CSV, full JSON
backup, BehaviorLog bundle, and Markdown summary. `docs/EXPORT_FORMATS.md`
defines different audiences for each format.

Source-of-truth reference: `docs/EXPORT_FORMATS.md`, `docs/UI_SPEC.md`

Recommended follow-up: Run TS10 and ask users to choose a format for three
tasks: spreadsheet, backup, and transfer to another BehaviorLog-aware tool.

Status: Open

### UX-007: Import And Restore Density Is A Necessary Comprehension Risk

ID: UX-007

Date: 2026-06-26

Reviewer: Codex parent agent

Persona: Sam, portability-focused adopter

Journey: J16 Import BehaviorLog bundle, J17 Restore backup

Route or surface: `/export`

Viewport or environment: Source and spec review

Finding type: Product gap

Severity: P1

Observation: Import and restore intentionally carry validation, privacy,
sensitivity, conflict, stale-preview, and destructive-change information. This
friction is appropriate, but it is a high comprehension burden and should be
tested before relying on the flow as an account-safety backbone.

Evidence: `docs/EXPORT_FORMATS.md` defines create-only import, merge preview,
restore preview, and restore apply gates. `docs/USER_FLOWS.md` requires
privacy and sensitivity warnings.

Source-of-truth reference: `docs/EXPORT_FORMATS.md`, `docs/USER_FLOWS.md`

Recommended follow-up: Run TS11 with invalid, valid, sensitivity-warning, and
destructive restore fixtures. Treat any accidental apply affordance or unclear
destructive summary as P1 or higher.

Status: Open

### UX-008: Account Deletion Requires Disposable-Account QA

ID: UX-008

Date: 2026-06-26

Reviewer: Codex parent agent

Persona: Robin, privacy-conscious account owner

Journey: J19 Account deletion

Route or surface: `/settings`

Viewport or environment: Source and spec review

Finding type: Test-data limitation

Severity: P2

Observation: Account deletion is core to trust, but full end-to-end testing is
destructive and must use disposable accounts only.

Evidence: `docs/USER_FLOWS.md` requires export acknowledgement and typed
confirmation. `STATUS.md` notes account deletion and export acknowledgement are
implemented.

Source-of-truth reference: `docs/USER_FLOWS.md`, `docs/OPERATIONS.md`

Recommended follow-up: Run TS12 in local or authorized hosted environment with
temporary test users only. Verify blocked submissions before the final
destructive step even when a full deletion run is skipped.

Status: Open

### UX-009: Marketing Surface Exposes Trust And Legal Information Late

ID: UX-009

Date: 2026-06-26

Reviewer: Sub-agent, Acquisition and Trust

Persona: Robin, privacy-conscious account owner

Journey: J01 Public discovery, J02 Trust before sign-in

Route or surface: Astro marketing routes

Viewport or environment: Source review

Finding type: Product gap

Severity: P2

Observation: Marketing pages do not expose Terms, Privacy, or Trust before the
user reaches the app login page. The current header/footer preserve the narrow
marketing navigation model, but pre-auth confidence is concentrated late in the
journey.

Evidence: Marketing navigation currently centers Cadence, BehaviorLog, About,
GitHub, and machine-readable links. The login page exposes Terms, Privacy, and
Trust.

Source-of-truth reference: `docs/PUBLIC_PRODUCT_ARCHITECTURE.md`,
`docs/USER_FLOWS.md`

Recommended follow-up: Test whether marketing users look for privacy/trust
before clicking Log in. If they do, add low-priority footer access from the
Astro marketing surface without expanding the launch header.

Resolution update (2026-07-09): Ticket 056 added low-priority Trust, Privacy,
and Terms links to the Astro marketing footer while keeping the launch header
narrow.

Status: Fixed

### UX-010: Public Legal Pages Lack A Clear Marketing Return Path

ID: UX-010

Date: 2026-06-26

Reviewer: Sub-agent, Acquisition and Trust

Persona: Robin, privacy-conscious account owner

Journey: J18 Legal and trust reference

Route or surface: `/terms`, `/privacy`, `/trust`

Viewport or environment: Source review

Finding type: UX copy issue

Severity: P3

Observation: Public legal pages offer Sign in and Open settings actions, but no
obvious route back to the marketing overview. Open settings can also read like
a public action, even though unauthenticated users are redirected to login.

Evidence: The legal content footer links to sign-in and settings-oriented
actions while the marketing site is a separate Astro surface.

Source-of-truth reference: `docs/ROUTE_MAP.md`, `docs/USER_FLOWS.md`

Recommended follow-up: In TS02 and TS18, ask users where they expect to go
after reading legal/trust content. Consider a Cadence overview link and a
signed-in-aware label in a later UI pass.

Resolution update (2026-07-09): Ticket 056 added a Cadence overview link to
the public legal/trust page footer so readers can return to the marketing
overview before signing in.

Status: Fixed

### UX-011: Trust Copy May Understate Account Isolation

ID: UX-011

Date: 2026-06-26

Reviewer: Sub-agent, Acquisition and Trust

Persona: Robin, privacy-conscious account owner

Journey: J02 Trust before sign-in, J18 Legal and trust reference

Route or surface: `/trust`

Viewport or environment: Source review

Finding type: UX copy issue

Severity: P2

Observation: Trust copy should be checked for language that sounds weaker than
the implemented RLS-backed account-isolation posture.

Evidence: Product and data-model docs define authenticated user ownership and
RLS on user-owned tables. Public trust copy needs to remain factual without
underclaiming the model.

Source-of-truth reference: `docs/DATA_MODEL.md`, `docs/PRODUCT_SPEC.md`

Recommended follow-up: Run TS02 with privacy-conscious users and ask what they
believe account isolation means. If wording causes doubt, revise trust copy
without overclaiming operational support boundaries.

Resolution update (2026-07-09): Ticket 056 revised the Trust account-isolation
copy to name the implemented Supabase Auth plus Row Level Security model
without adding support or security guarantees beyond the product scope.

Status: Fixed

### UX-012: Marketing Docs Machine File Index May Omit `/docs.md`

ID: UX-012

Date: 2026-06-26

Reviewer: Sub-agent, Acquisition and Trust

Persona: Sam, portability-focused adopter

Journey: J22 Machine-readable public docs

Route or surface: Marketing `/docs`

Viewport or environment: Source review

Finding type: Implementation bug

Severity: P3

Observation: The marketing `/docs` machine files table may omit `/docs.md`
even though page-specific Markdown mirrors are generated.

Evidence: Sub-agent source review found the table list jumping from examples to
about while route mirrors include docs.

Source-of-truth reference: `docs/ROUTE_MAP.md`, `docs/CRAWL_POLICY.md`

Recommended follow-up: Verify generated marketing output with
`npm run marketing:check`; if `/docs.md` exists but is not linked, add it in a
focused marketing docs fix.

Resolution update (2026-07-09): Ticket 056 added `/docs.md` to the visible
marketing `/docs` machine-files table. `npm run marketing:check` remains the
build-output verification gate.

Status: Fixed

### UX-013: First-Run Setup Pop-Up May Collide With Mobile Header

ID: UX-013

Date: 2026-06-26

Reviewer: Sub-agent, First-Run Activation

Persona: Maya, first-time private tracker

Journey: J04 First-run activation, J21 Mobile navigation and task flow

Route or surface: `/timeline`

Viewport or environment: Source review

Finding type: Visual/UI issue

Severity: P1

Observation: The mobile first-run setup pop-up may be partially hidden by the
sticky app header because the setup panel and mobile header use competing
fixed layers.

Evidence: The setup panel is fixed and non-modal. The mobile header is also
sticky/fixed in the app shell. The issue needs browser confirmation at mobile
width.

Source-of-truth reference: `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`

Recommended follow-up: Run TS03 at 390px and 320px with a clean account. If
the setup panel is hidden or overlaps navigation, treat as an implementation
bug before public onboarding tests.

Reproduction update (2026-07-06): Source review confirmed the mobile header
and setup pop-up layer conflict. The panel now sits below the sticky mobile
header, has a viewport-based max height, and scrolls when needed. Design-system
browser preview at 390px and 320px had no horizontal overflow or console
warnings.

Status: Fixed

### UX-014: Browser Reminder Onboarding Conflates Permission With Subscription

ID: UX-014

Date: 2026-06-26

Reviewer: Sub-agent, First-Run Activation and Reminders/Settings

Persona: Lina, reminder-dependent user

Journey: J04 First-run activation, J12 Browser reminders

Route or surface: `/timeline`, `/settings#notifications`

Viewport or environment: Source review

Finding type: Product gap

Severity: P2

Observation: Browser reminder setup can look complete when notification
permission is granted, even if push subscription save later fails or cannot be
verified on revisit.

Evidence: Onboarding state is based on browser permission/support. Settings
shows a success message after the click path, but the page model does not
surface active saved-subscription state on revisit.

Source-of-truth reference: `docs/NOTIFICATION_SPEC.md`, `docs/USER_FLOWS.md`

Recommended follow-up: Decide whether onboarding should label this as
Notification permission or track subscription state. Run TS08 with permission
allowed but subscription failure simulated.

Reproduction update (2026-07-09): Approved hosted QA reproduced a real
subscription failure before the service worker became active. The browser push
helper now waits for `navigator.serviceWorker.ready` before reading or creating
the PushManager subscription. A persistent Chrome retry saved the subscription
and showed `Enabled on this device`.

Status: Fixed

### UX-015: Settings Timezone Uses Duplicate `timezone` IDs

ID: UX-015

Date: 2026-06-26

Reviewer: Sub-agent, First-Run Activation

Persona: Alex, keyboard and low-vision user

Journey: J14 Timezone management

Route or surface: `/settings#timezone`

Viewport or environment: Source review

Finding type: Implementation bug

Severity: P2

Observation: The Settings timezone section and timezone input both use the
same `timezone` id, which can confuse anchor targeting and label association.

Evidence: Sub-agent source review found duplicate `id="timezone"` in the
Timezone panel.

Source-of-truth reference: `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`

Recommended follow-up: Fix the duplicate id in a focused accessibility patch,
then add a regression check for Settings anchor and label behavior.

Reproduction update (2026-07-06): Confirmed in source and fixed. The section
keeps `id="timezone"` for `/settings#timezone`, while the input now uses
`id="timezone-input"` and the label points to that control.

Status: Fixed

### UX-016: First-Run Setup Dismissal Is Browser-Global

ID: UX-016

Date: 2026-06-26

Reviewer: Sub-agent, First-Run Activation

Persona: Maya, first-time private tracker

Journey: J04 First-run activation

Route or surface: `/timeline`

Viewport or environment: Source review

Finding type: Product gap

Severity: P2

Observation: Setup dismissal is local to the browser rather than scoped to a
specific authenticated account.

Evidence: The documented setup prompt is optional and dismissible in the
current browser. This matches the current docs, but can confuse shared-device
or multi-account local testing.

Source-of-truth reference: `docs/PRODUCT_SPEC.md`, `docs/UI_SPEC.md`

Recommended follow-up: In TS03, test a second account in the same browser after
dismissal. Decide whether account-scoped dismissal belongs in v1 or should stay
local-only by design.

Reproduction update (2026-07-06): Current-browser dismissal remains the v1
decision because the setup prompt is optional and non-blocking, and
account-scoped dismissal would add persistence scope not required by the
current product docs.

Status: Fixed

### UX-017: First-Run Setup Announcement And Focus Strategy Need Testing

ID: UX-017

Date: 2026-06-26

Reviewer: Sub-agent, First-Run Activation

Persona: Alex, keyboard and low-vision user

Journey: J04 First-run activation

Route or surface: `/timeline`

Viewport or environment: Source review

Finding type: Accessibility issue

Severity: P2

Observation: The non-modal setup pop-up may be missed by assistive-technology
users if it has no announcement or clear focus strategy.

Evidence: The setup is intentionally non-modal and fixed so it does not block
the Timeline. That raises a discoverability requirement for non-pointer users.

Source-of-truth reference: `docs/UI_SPEC.md`

Recommended follow-up: Run TS03 and TS13 with keyboard-only navigation and a
screen-reader-informed review. Confirm whether users encounter the setup rows
without focus being stolen from the Timeline.

Reproduction update (2026-07-06): The setup pop-up remains non-modal and does
not steal focus from the Timeline, matching the current product decision.
Screen-reader-specific announcement tuning is deferred unless future testing
shows a broader usability issue.

Status: Deferred

### UX-018: Needs Decision Modal Needs Focus Trap And Focus Restoration

ID: UX-018

Date: 2026-06-26

Reviewer: Sub-agents, Daily Timeline and Recovery/Review

Persona: Alex, keyboard and low-vision user

Journey: J09 Needs decision, J21 Mobile navigation and task flow

Route or surface: `/timeline`, Needs decision modal

Viewport or environment: Source review

Finding type: Accessibility issue

Severity: P2

Observation: The Needs decision dialog handles close behavior, but source
review did not find a robust focus trap or focus restoration to the launcher.

Evidence: The modal is a custom dialog. Keyboard users may tab into obscured
page content or lose their place after closing.

Source-of-truth reference: `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`

Recommended follow-up: Run TS06 and TS13 keyboard-only. If confirmed, add focus
trap, opener focus restoration, and focused component tests.

Reproduction update (2026-07-06): Confirmed in source and fixed. Needs Decision
now captures the launcher, traps Tab/Shift+Tab inside the dialog, closes on
Escape, restores body scroll, and returns focus to the launcher. Design-system
browser preview passed keyboard open, Tab loop, Escape close, and focus return
at desktop, 390px, and 320px.

Status: Fixed

### UX-019: Show More Future Days May Lose Scroll Context

ID: UX-019

Date: 2026-06-26

Reviewer: Sub-agent, Daily Timeline

Persona: Jordan, fast daily checker

Journey: J08 Future preview

Route or surface: `/timeline?days=...`

Viewport or environment: Source review

Finding type: Visual/UI issue

Severity: P2

Observation: The Show more days link likely navigates by query string and
returns the user to the top of the page, losing the context of the newly
revealed future days.

Evidence: The Timeline Show more control is a route link to a larger `days`
query value.

Source-of-truth reference: `docs/USER_FLOWS.md`

Recommended follow-up: Run TS05 and TS13 on a long Timeline. Consider scroll
preservation or an anchor to the newly revealed section if context is lost.

Reproduction update (2026-07-06): Confirmed as a source risk and fixed with
`scroll={false}` on the Show more days route link so revealing more future days
preserves the user's current scroll context.

Status: Fixed

### UX-020: Timeline Row Expansion Semantics May Be Too Implicit

ID: UX-020

Date: 2026-06-26

Reviewer: Sub-agent, Daily Timeline

Persona: Jordan, fast daily checker; Alex, keyboard and low-vision user

Journey: J07 Daily timeline use

Route or surface: `/timeline`

Viewport or environment: Source review

Finding type: Accessibility issue

Severity: P2

Observation: Row expansion may depend on an implicit summary area rather than
making the whole non-action row area clearly toggle details. Assistive
technology may also not associate the revealed detail panel with the native
disclosure if details are rendered outside the native element.

Evidence: Sub-agent source review flagged the implementation shape around
`OccurrenceRow` and CSS detail expansion.

Source-of-truth reference: `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`

Recommended follow-up: Run TS05 with pointer, keyboard, and screen-reader-like
inspection. If confirmed, rework row expansion while preserving the no-chevron
visual rule.

Reproduction update (2026-07-06): Confirmed in source and fixed. Timeline row
details now live inside the native `details` element after `summary`, while the
no-chevron visual treatment is preserved.

Status: Fixed

### UX-021: Same-Day Needs Decision Retention Scope Is Ambiguous

ID: UX-021

Date: 2026-06-26

Reviewer: Sub-agent, Recovery and Review

Persona: Priya, reflective reviewer

Journey: J09 Needs decision, J10 Later correction

Route or surface: `/timeline`, `/behaviors`

Viewport or environment: Source review

Finding type: Product gap

Severity: P2

Observation: Same-day retained prior-day rows appear to be derived from status
timing, not necessarily from whether the decision happened inside the Needs
decision modal. A prior-day row corrected from Behaviors today may therefore
also reappear in Needs decision.

Evidence: The documented UX frames retention as a correction affordance for
rows decided from Needs decision. Source review suggests implementation is
based on current status timing and local day.

Source-of-truth reference: `docs/PRODUCT_SPEC.md`, `docs/UI_SPEC.md`,
`docs/USER_FLOWS.md`

Recommended follow-up: Decide whether retention should be strictly
Needs-decision-origin or any prior-day row resolved today. Update docs and
tests before changing behavior.

Reproduction update (2026-07-06): Resolved by documenting the existing
implementation contract. Retention applies to any prior-day occurrence resolved
today, derived from `status_marked_at` and local midnight, without adding a
stored modal-origin flag.

Status: Fixed

### UX-022: No UI Path Clears A Decision Back To Unresolved

ID: UX-022

Date: 2026-06-26

Reviewer: Sub-agent, Recovery and Review

Persona: Priya, reflective reviewer

Journey: J09 Needs decision, J10 Later correction

Route or surface: `/timeline`, `/behaviors`

Viewport or environment: Source review

Finding type: Product gap

Severity: P2

Observation: The status resolver supports returning a decision to Unresolved,
but the current UI exposes only Completed and Not Completed correction actions.

Evidence: Sub-agent source review found resolver/test support for unresolved
transitions and UI/service actions limited to Completed and Not Completed.

Source-of-truth reference: `docs/PRODUCT_SPEC.md`, `docs/USER_FLOWS.md`

Recommended follow-up: Decide whether v1 correction should include Clear
decision. If yes, update source docs, wire through services/UI, and add tests.

Status: Open

### UX-023: Behavior Date Review Heading Is Too Vague

ID: UX-023

Date: 2026-06-26

Reviewer: Sub-agent, Recovery and Review

Persona: Priya, reflective reviewer

Journey: J10 Later correction

Route or surface: `/behaviors`

Viewport or environment: Source review

Finding type: UX copy issue

Severity: P3

Observation: The selected-day correction area is headed with a generic Review
label, which may not clearly tell users that they are reviewing a behavior on a
specific date.

Evidence: The later-correction journey relies on selecting a behavior heatmap
cell and understanding the selected date context.

Source-of-truth reference: `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`

Recommended follow-up: In TS07, ask users what the Review panel refers to.
Consider `Behavior date` or `Review selected day` with the selected date in a
future copy pass.

Status: Open

### UX-024: Saved Browser Subscription State Is Not Visible On Revisit

ID: UX-024

Date: 2026-06-26

Reviewer: Sub-agent, Reminders and Settings

Persona: Lina, reminder-dependent user

Journey: J12 Browser reminders

Route or surface: `/settings#notifications`

Viewport or environment: Source review

Finding type: Product gap

Severity: P2

Observation: A user can receive success feedback after saving a browser push
subscription, but the Settings page does not appear to show an active
subscription state when revisited.

Evidence: Settings data exposes notification support/configuration, but the
review did not find active saved-subscription state in the page model.

Source-of-truth reference: `docs/NOTIFICATION_SPEC.md`, `docs/UI_SPEC.md`

Recommended follow-up: In TS08, save a subscription, reload Settings, and ask
whether the user believes reminders are active. Consider adding subscription
state if confusion is confirmed.

Reproduction update (2026-07-09): Approved hosted QA saved a browser push
subscription in a persistent Chrome profile. Settings updated from `Not enabled
on this device` to `Enabled on this device` and showed the saved-state message.
Full human comprehension testing on revisit remains optional research.

Status: Fixed

### UX-025: Behavior Browser Reminder Toggle Can Overpromise Delivery

ID: UX-025

Date: 2026-06-26

Reviewer: Sub-agent, Reminders and Settings

Persona: Lina, reminder-dependent user

Journey: J12 Browser reminders, J13 Email reminders

Route or surface: `/behaviors`

Viewport or environment: Source review

Finding type: UX copy issue

Severity: P2

Observation: Behavior-level browser reminders are enabled by default, but
delivery still depends on global browser permission and active subscription.
The behavior toggle can therefore imply delivery before global setup is valid.

Evidence: Reminder generation defaults browser reminders on, while processing
can fail when no active subscription exists.

Source-of-truth reference: `docs/NOTIFICATION_SPEC.md`, `docs/USER_FLOWS.md`

Recommended follow-up: In TS04 and TS08, create a behavior before notification
setup and ask what the browser reminder toggle means. Consider copy or state
that distinguishes behavior intent from delivery readiness.

Resolution update (2026-07-09): Ticket 053 updated the Behavior form reminder
copy so the browser reminder checkbox is framed as behavior-level intent that
uses devices enabled in Settings. The copy now states that the behavior remains
tracked if this device is not enabled or browser notifications are blocked.

Status: Fixed

### UX-026: Notification Click May Focus The Wrong App Page

ID: UX-026

Date: 2026-06-26

Reviewer: Sub-agent, Reminders and Settings

Persona: Lina, reminder-dependent user

Journey: J12 Browser reminders

Route or surface: Browser push service worker

Viewport or environment: Source review

Finding type: Implementation bug

Severity: P2

Observation: Clicking a browser notification may focus any existing same-origin
Cadence window without navigating to `/timeline`. If Settings or Export is
open, the reminder click may not land on the occurrence context.

Evidence: Sub-agent source review flagged the push service worker click
handling.

Source-of-truth reference: `docs/NOTIFICATION_SPEC.md`, `docs/USER_FLOWS.md`

Recommended follow-up: Run TS08 with an existing Settings tab and a safe test
browser notification. If confirmed, update click handling to focus or open the
intended Timeline URL.

Resolution update (2026-07-09): Ticket 053 added service-worker regression
coverage for notification clicks. An existing same-origin Cadence tab is
navigated to the notification target, defaulting to `/timeline`, before focus
is restored. Cross-origin payload URLs are already constrained back to the
Timeline origin.

Status: Fixed

### UX-027: Timezone Save Impact Is Not Clear Before Submit

ID: UX-027

Date: 2026-06-26

Reviewer: Sub-agent, Reminders and Settings

Persona: Robin, privacy-conscious account owner

Journey: J14 Timezone management

Route or surface: `/settings#timezone`

Viewport or environment: Source review

Finding type: UX copy issue

Severity: P2

Observation: Saving timezone changes active behavior timezones and future
unresolved occurrences, but the pre-save UI may not make that impact clear.

Evidence: The Settings service performs the schedule-affecting update. The
timezone panel focuses on current/detected/manual values.

Source-of-truth reference: `docs/DATETIME_STRATEGY.md`,
`docs/USER_FLOWS.md`, `docs/UI_SPEC.md`

Recommended follow-up: Run TS09 with a non-default timezone. If users cannot
predict the effect, add concise impact copy without turning Settings into a
documentation page.

Reproduction update (2026-07-06): Source review confirmed the impact was not
stated before submit. The timezone panel now states that saving updates active
behavior schedules and future unresolved occurrences while past and resolved
history stays unchanged.

Status: Fixed

### UX-028: Account Deletion Client Gates Are Not Mirrored Before Submit

ID: UX-028

Date: 2026-06-26

Reviewer: Sub-agent, Reminders and Settings

Persona: Robin, privacy-conscious account owner

Journey: J19 Account deletion

Route or surface: `/settings`

Viewport or environment: Source review

Finding type: UX copy issue

Severity: P3

Observation: Server-side account deletion gates are correct, but the
destructive button may be enabled before the checkbox and typed confirmation
requirements are satisfied, causing recovery by server error only.

Evidence: Sub-agent source review found server validation in account deletion
service and less restrictive client submit affordance.

Source-of-truth reference: `docs/USER_FLOWS.md`, `docs/OPERATIONS.md`

Recommended follow-up: In TS12, attempt deletion before completing each gate.
If users treat the enabled button as permission to proceed, mirror the gates in
client button state while retaining server validation.

Reproduction update (2026-07-06): Confirmed in source and fixed. The
destructive submit is disabled until the export acknowledgement is checked and
the typed confirmation matches. Server validation remains unchanged.

Status: Fixed

### UX-029: Restore Preview History May Show Completed Previews As Open

ID: UX-029

Date: 2026-06-26

Reviewer: Sub-agent, Portability

Persona: Sam, portability-focused adopter

Journey: J17 Restore backup

Route or surface: `/export`, restore panel

Viewport or environment: Source review

Finding type: Implementation bug

Severity: P2

Observation: Restore previews may be stored with no completion timestamp, so
Recent restores can display completed previews as Open.

Evidence: Sub-agent source review flagged restore preview service and restore
history display behavior.

Source-of-truth reference: `docs/EXPORT_FORMATS.md`, `docs/USER_FLOWS.md`

Recommended follow-up: Reproduce with TS11. If confirmed, update preview
history status/timestamps so read-only previews do not look unfinished.

Status: Needs reproduction

### UX-030: Import Apply Is Not Bound To The Exact Reviewed Preview

ID: UX-030

Date: 2026-06-26

Reviewer: Sub-agent, Portability

Persona: Sam, portability-focused adopter

Journey: J16 Import BehaviorLog bundle

Route or surface: `/export#behaviorlog-import`

Viewport or environment: Source review

Finding type: Product gap

Severity: P2

Observation: Import apply appears to re-parse and re-preview the hidden bundle
at apply time rather than being bound to the exact preview run or fingerprint
the user reviewed. Restore has stricter accepted-preview gates.

Evidence: Sub-agent source review compared import apply behavior with restore
preview/apply gates.

Source-of-truth reference: `docs/EXPORT_FORMATS.md`

Recommended follow-up: Decide whether import apply needs a preview-run or
fingerprint gate similar to restore. Run TS11 with changed local data between
preview and apply.

Status: Open

### UX-031: Full JSON Backup Label May Overpromise Status History

ID: UX-031

Date: 2026-06-26

Reviewer: Sub-agent, Portability

Persona: Sam, portability-focused adopter

Journey: J15 Export data

Route or surface: `/export`

Viewport or environment: Source review

Finding type: UX copy issue

Severity: P2

Observation: Full JSON backup may not include status event history, while
BehaviorLog does. The label may overpromise if users expect a complete
status-history backup from that format.

Evidence: Product docs say exports should include useful history, while the
full JSON backup shape is narrower than the BehaviorLog bundle.

Source-of-truth reference: `docs/PRODUCT_SPEC.md`, `docs/EXPORT_FORMATS.md`

Recommended follow-up: Verify current full JSON contents in TS10. If status
history is absent by design, clarify the label or update docs so BehaviorLog is
the clearly complete interoperability/restore path.

Status: Open

### UX-032: Import Preview Details May Be Hidden From The User

ID: UX-032

Date: 2026-06-26

Reviewer: Sub-agent, Portability

Persona: Sam, portability-focused adopter

Journey: J16 Import BehaviorLog bundle

Route or surface: `/export#behaviorlog-import`

Viewport or environment: Source review

Finding type: Visual/UI issue

Severity: P2

Observation: Import preview data includes unsupported fields and intervention
counts by linked behavior, but the panel may not surface those details.

Evidence: Sub-agent source review compared import preview types with
BehaviorLog import panel output.

Source-of-truth reference: `docs/EXPORT_FORMATS.md`, `docs/USER_FLOWS.md`

Recommended follow-up: Run TS11 with unsupported fields and intervention rows.
Confirm whether the user can see enough detail to decide safely.

Status: Needs reproduction

### UX-033: Restore Preview Sensitivity Summary May Be Too Implicit

ID: UX-033

Date: 2026-06-26

Reviewer: Sub-agent, Portability

Persona: Robin, privacy-conscious account owner

Journey: J17 Restore backup

Route or surface: `/export`, restore panel

Viewport or environment: Source review

Finding type: UX copy issue

Severity: P3

Observation: Restore preview has high/restricted note and redacted
intervention summary counts, but the UI may show them only through warnings and
actions rather than a clear sensitivity/redaction summary.

Evidence: Sub-agent source review compared restore preview types with panel
output.

Source-of-truth reference: `docs/EXPORT_FORMATS.md`, `docs/USER_FLOWS.md`

Recommended follow-up: Run TS11 with high/restricted notes and redacted
intervention fields. Ask users to summarize the privacy risk before apply.

Status: Needs reproduction

### UX-034: Export Range Controls Drift From UI Spec

ID: UX-034

Date: 2026-06-26

Reviewer: Sub-agent, Portability

Persona: Sam, portability-focused adopter

Journey: J15 Export data

Route or surface: `/export`

Viewport or environment: Source review

Finding type: Visual/UI issue

Severity: P3

Observation: Export range controls use filled bordered radio chips, while the
UI spec calls for underlined text-action choices.

Evidence: Sub-agent source review compared `ExportPanel` range controls with
the documented Export Panels design rules.

Source-of-truth reference: `docs/UI_SPEC.md`

Recommended follow-up: Confirm in browser. If accurate, align Export range
controls with the text-action primitive in a focused UI consistency ticket.

Status: Needs reproduction

### UX-035: Multi-Slot Timeline Groups May Duplicate Titles On Mobile

ID: UX-035

Date: 2026-06-26

Reviewer: Sub-agent, Daily Timeline

Persona: Jordan, fast daily checker

Journey: J07 Daily timeline use, J21 Mobile navigation and task flow

Route or surface: `/timeline`

Viewport or environment: Source review

Finding type: Visual/UI issue

Severity: P3

Observation: Multi-slot behavior groups may repeat the behavior title in both
the stack header and each occurrence row, slowing mobile scanning.

Evidence: Sub-agent source review flagged repeated title rendering in the
multi-slot Timeline group structure.

Source-of-truth reference: `docs/UI_SPEC.md`, `docs/USER_FLOWS.md`

Recommended follow-up: Include a multi-slot behavior in TS05 and TS13. Time how
quickly users identify which scheduled slot they are marking.

Reproduction update (2026-07-06): Source review confirmed duplicated visible
title text in grouped stacks. The group header now uses the generic label
`Multiple scheduled times` while each occurrence row keeps its behavior title
and accessible row semantics.

Status: Fixed

### UX-036: Marketing Comprehension Proxy Walkthroughs

ID: UX-036

Date: 2026-07-09

Reviewer: Owner-approved agent proxy testing

Persona: First-time simple-tracker shopper; portability-focused technical
visitor; privacy-conscious account evaluator

Journey: J01 Public discovery

Route or surface: Local Astro marketing site at `/`, `/cadence`, `/standard`,
`/docs`, `/examples`, `/about`, and linked public Trust, Privacy, and Terms
pages

Viewport or environment: Independent browser DOM walkthroughs; full-page
screenshots where available

Evidence record: `docs/qa/TICKET_056_MARKETING_PROXY.md`

Finding type: UX copy issue

Severity: P2 before correction; resolved in proxy retest

Initial proxy evidence: All three personas could find a practical next step and
eventually explain Cadence as a private, single-player recurring behavior
tracker and BehaviorLog as its portability format. They also found pre-login
Trust, Privacy, and Terms. Each reported the same initial hesitation: "open
tracker" could mean open source or an unresolved-tracking state, and the
BehaviorLog-first language could briefly blur the product versus format
distinction.

Correction: The homepage now leads with Cadence as the personal tracker, calls
it open source, and defines BehaviorLog as the portable export file format
Cadence reads and writes.

Rerun evidence: The same three persona tasks completed without material
Cadence-versus-BehaviorLog confusion. The shopper identified the one-person
scope, manual status model, exclusions, and login path. The portability visitor
identified BehaviorLog, event-history authority, docs, and the example bundle.
The privacy visitor found Trust, Privacy, and Terms before login and understood
the account boundary and export posture. A minor non-blocking observation
remains: marketing copy names reminders but does not teach channel or
permission setup, which is outside this ticket's scope.

Evidence limitation: This is owner-approved agent proxy testing, not real-user
evidence. It must not be presented as externally validated comprehension.
Before making that claim, run independent first-time human-user testing of the
same discovery, portability, and pre-login trust tasks.

Status: Fixed for Ticket 056 proxy acceptance; real-user validation remains a
future research follow-up.

## Sub-Agent Review Notes

Date: 2026-06-26

The first research pass used six focused read-only sub-agents:

- Acquisition and Trust
- First-Run Activation
- Daily Timeline
- Recovery and Review
- Reminders and Settings
- Portability

Their findings are integrated into UX-009 through UX-035. Findings marked
Needs reproduction came from source review and should be verified in browser
before implementation.
