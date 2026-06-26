# UX Testing Plan

## Purpose

This plan defines how to test Cadence's initial user journey inventory. It is
designed for expert review, simulated persona walkthroughs, and later moderated
or unmoderated user sessions.

Testing should find journey gaps, usability defects, accessibility risks,
copy-level ambiguity, and implementation bugs. It should not expand v1 product
scope.

## Scope

Covered surfaces:

- Astro marketing site under `apps/marketing`
- Public account-information routes: `/terms`, `/privacy`, `/trust`
- Authenticated app routes: `/timeline`, `/behaviors`, `/export`, `/settings`
- Auth routes: `/login`, `/auth/google`, `/auth/callback`
- Machine-readable marketing outputs: Markdown mirrors, `llms.txt`,
  `llms-full.txt`, route manifest, sitemap, robots

Out of scope:

- Native desktop and mobile apps
- Billing, subscriptions, and admin surfaces
- Collaboration or social workflows
- AI coaching or speech features
- Calendar sync
- Offline writes and PWA cache behavior
- Real provider email sends unless explicitly approved for a disposable test
  recipient

## Method

Use three layers of evidence:

1. Source review: compare the implemented routes and components against
   `docs/UX_JOURNEY_INVENTORY.md` and product source-of-truth docs.
2. Browser walkthrough: run journeys on local or authorized staging/prod
   environments using disposable accounts and safe test data.
3. Accessibility and resilience checks: keyboard, mobile, contrast-sensitive
   states, reduced motion, empty states, invalid input, denied permissions, and
   failed imports.

Every finding should be logged in `docs/UX_RESEARCH_LOG.md`.

## Participant and Persona Plan

Initial expert-pass persona assignment:

| Persona | Primary Journeys |
|---|---|
| Maya, first-time private tracker | J01, J02, J03, J04, J05, J20 |
| Jordan, fast daily checker | J06, J07, J08, J09, J21 |
| Priya, reflective reviewer | J09, J10, J11 |
| Sam, portability-focused adopter | J01, J15, J16, J17, J22 |
| Lina, reminder-dependent user | J04, J12, J13, J14 |
| Robin, privacy-conscious account owner | J02, J14, J17, J18, J19 |
| Alex, keyboard and low-vision user | J07, J10, J12, J20, J21 |

For later human sessions, recruit at least:

- 2 people who track routines today with lightweight tools or notes.
- 1 person who cares about data export or open formats.
- 1 person who has declined browser notifications in other apps.
- 1 person who regularly uses keyboard navigation or browser zoom.

## Test Environments

Local authenticated app:

- Use `npm run dev` for Next.js.
- Use the dev/test login route only when enabled by environment variables and
  only on localhost.
- Prefer disposable test accounts and fixture-like behavior data.

Marketing site:

- Use `npm run marketing:dev` for live walkthrough.
- Use `npm run marketing:check` after documentation or route-output changes.

Responsive viewports:

- Desktop: 1440 x 900
- Tablet-like: 768 x 1024
- Mobile: 390 x 844
- Narrow stress pass: 320 x 700

Browser matrix:

- Chromium or Chrome for baseline.
- Safari or WebKit for notification and drawer behavior when available.
- Firefox for keyboard and form behavior when available.

Accessibility settings:

- Keyboard-only navigation.
- Browser zoom at 200 percent.
- `prefers-reduced-motion: reduce`.
- High contrast or increased contrast mode where available.
- Notifications allowed, denied, blocked, and unsupported states where possible.

## Data Setup

Prepare reusable accounts or local fixtures with:

- Empty account with default categories and no behaviors.
- One active daily exact-time behavior.
- One active range-preset behavior.
- One behavior with multiple schedule slots in a day.
- One archived behavior.
- Current-day unresolved, Completed, and Not Completed occurrences.
- Prior-day unresolved occurrences for Needs decision.
- Same-day retained Needs decision rows after resolution.
- Occurrences with and without notes.
- BehaviorLog import bundle with validation warnings.
- BehaviorLog import bundle with high or restricted note sensitivity.
- Restore preview bundle with destructive changes.

Safety rules:

- Do not use real personal behavior data in screenshots or logs.
- Do not send real email reminders without explicit user-approved recipient and
  production send instruction.
- Do not run account deletion except on disposable test accounts.
- Do not use hosted provider service-role keys outside documented smoke or test
  workflows.

## Severity Model

Use this severity model in `docs/UX_RESEARCH_LOG.md`:

| Severity | Meaning | Examples |
|---|---|---|
| P0 | Blocks core use or creates data/privacy risk | Cannot sign in, destructive restore can apply without confirmation, cross-account data exposure |
| P1 | Blocks an important journey or risks incorrect records | User cannot create first behavior, Needs decision count is wrong, status correction fails |
| P2 | Causes confusion, avoidable effort, or accessibility risk | Heatmap action is undiscoverable, blocked notification state is unclear, mobile action target is too small |
| P3 | Polish issue or low-risk wording/layout problem | Secondary copy is vague, route label feels inconsistent, minor spacing issue |

Finding types:

- Product gap
- Implementation bug
- UX copy issue
- Accessibility issue
- Visual/UI issue
- Test-data limitation
- Documentation gap

## Task Scripts

### TS01 Public Discovery

Persona: Maya.

Tasks:

1. Start on marketing `/`.
2. Explain what Cadence does.
3. Explain what BehaviorLog is.
4. Find the path to try the app.
5. Find the example bundle.

Pass criteria:

- User identifies Cadence as the tracker and BehaviorLog as the portability
  standard.
- User can find Log in or Try Cadence without reading the whole page.
- User does not infer desktop, mobile, billing, social, or AI features are
  currently available.

### TS02 Trust Before Sign-In

Persona: Robin.

Tasks:

1. Open `/login`.
2. Find privacy and trust information.
3. Identify login method.
4. Start Google sign-in or describe why they would not.

Pass criteria:

- User can find Terms, Privacy, and Trust.
- User understands Google sign-in is the visible auth path.
- User understands export and deletion exist before committing to the app.

### TS03 First-Run Activation

Persona: Maya.

Tasks:

1. Sign in with a clean disposable account.
2. Observe Timeline.
3. Use setup pop-up to start first behavior creation.
4. Return to Timeline.
5. Skip setup in the current browser.

Pass criteria:

- Timeline remains the main screen.
- Setup does not behave like a required wizard.
- User can create a behavior without touching notification permission first.

### TS04 Create and Edit Behavior

Persona: Maya.

Tasks:

1. Create a daily behavior with one exact time.
2. Create a weekly behavior with a range preset.
3. Add a second schedule slot to a behavior.
4. Edit recurrence and reminder settings.
5. Archive and restore a behavior.

Pass criteria:

- Missing required fields produce recoverable errors.
- Browser reminder default and email reminder opt-in are clear.
- Archive and restore preserve record history.

### TS05 Daily Timeline

Persona: Jordan.

Tasks:

1. Open Timeline.
2. Mark an occurrence Completed.
3. Mark another occurrence Not Completed.
4. Expand each resolved row and correct one status.
5. Add and save a note.
6. Show more future days.

Pass criteria:

- Current day starts the forward feed.
- Status state changes are visible without page confusion.
- Not Completed is factual and not punitive.
- Note save target and status actions are distinct.

### TS06 Needs Decision

Persona: Priya.

Tasks:

1. Open Needs decision.
2. Resolve prior-day unresolved rows.
3. Confirm count changes.
4. Correct a retained row.
5. Close and reopen the modal.

Pass criteria:

- Date grouping remains stable.
- Count includes only unresolved prior-day rows.
- Retained rows remain correctable through the current local day.
- No stored or visible "missed" status appears.

### TS07 Behavior Review and Later Correction

Persona: Priya.

Tasks:

1. Change adherence range.
2. Inspect overall heatmap and legend.
3. Select a non-empty behavior calendar cell.
4. Open Review for one occurrence.
5. Change status and edit note.

Pass criteria:

- User discovers behavior cell review.
- Overall heatmap remains summary-only.
- Updated status and note refresh related counts and display.
- Unresolved remains neutral.

### TS08 Reminder Setup

Persona: Lina.

Tasks:

1. Open Settings notifications.
2. Attempt to save browser reminder subscription.
3. Test allowed, denied, blocked, and unsupported states where possible.
4. Enable email reminder for one behavior and choose an offset.

Pass criteria:

- Native permission prompt appears only from user action.
- Denied or blocked permission does not block tracking.
- No secret or provider detail appears client-side.
- Email reminder setup stays per behavior.

### TS09 Timezone

Persona: Robin.

Tasks:

1. Open timezone settings.
2. Use detected timezone.
3. Enter an invalid timezone and recover.
4. Save a valid IANA timezone.
5. Check future unresolved occurrences.

Pass criteria:

- Browser-detected value is visible.
- Invalid input has a recoverable error.
- User understands future unresolved occurrences can shift.

### TS10 Export and Markdown Summary

Persona: Sam.

Tasks:

1. Select 7, 30, 90 days, and All time.
2. Toggle archived behaviors.
3. Download JSONL, CSV, full JSON backup, and BehaviorLog bundle.
4. Copy and download Markdown summary.

Pass criteria:

- Counts and downloads match selected options.
- User can choose a format based on intent.
- AI summary reads as an export artifact, not an in-app coaching feature.

### TS11 Import and Restore

Persona: Sam.

Tasks:

1. Upload invalid BehaviorLog bundle.
2. Upload valid create-only bundle.
3. Review note sensitivity and intervention warnings.
4. Apply only safe supported plan.
5. Run restore preview with destructive changes.
6. Attempt restore apply with missing or stale confirmation gates.

Pass criteria:

- Invalid files fail safely.
- Apply is unavailable when conflicts or unsafe decisions remain.
- High or restricted note sensitivity requires separate acknowledgement.
- Restore apply refuses stale preview/local graph.

### TS12 Account Deletion

Persona: Robin.

Tasks:

1. Open Settings.
2. Find account deletion section.
3. Read export reminder.
4. Try submitting before acknowledgement and typed confirmation.
5. Complete deletion only on disposable account.

Pass criteria:

- Deletion cannot occur accidentally.
- User understands data will be removed from Cadence and account will sign out.
- User is not told that external provider state will be deleted.

### TS13 Keyboard and Mobile

Persona: Alex.

Tasks:

1. Navigate primary routes with keyboard only.
2. Open and close mobile drawer.
3. Open Needs decision and close it.
4. Complete Timeline status and note actions at mobile width.
5. Use browser zoom at 200 percent.

Pass criteria:

- Focus order is logical.
- Focus indicators are visible.
- Drawer traps focus and locks body scroll.
- Bottom fixed controls do not hide required actions.
- Text does not overflow controls.

## Observation Rubric

For each task, record:

- First point of hesitation.
- Misread labels or concepts.
- Any moment the user expects automation that Cadence does not provide.
- Any moment the user expects hidden history, undo, or confirmation.
- Any status/action confusion.
- Any accessibility failure.
- Any layout overlap, clipped menu, clipped modal, or scroll trap.
- Recovery path after invalid input or failed state.
- Whether the user can explain the final record state in their own words.

## Verification Commands

Run after documentation-only changes:

```bash
npm run agents:check
npm run resolvers:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run marketing:check
```

Also run `npm run design-system:check` if the work changes design-system
contracts, reusable UI, tokens, component inventories, or design-system pages.

If any command is unavailable or blocked, record the exact reason in
`STATUS.md` and the final handoff.
