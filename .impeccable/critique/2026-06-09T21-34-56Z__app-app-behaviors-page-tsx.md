---
target: Behaviors page
total_score: 25
p0_count: 0
p1_count: 2
timestamp: 2026-06-09T21-34-56Z
slug: app-app-behaviors-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Selected recurrence/reminder states are clear, but save/archive feedback only appears after submission. |
| 2 | Match System / Real World | 3 | "Behavior" and schedule concepts fit the product, but labels like "Every N days" and "day(s)" expose implementation language. |
| 3 | User Control and Freedom | 2 | Archive is a one-click row action, while restore/reversal is hidden inside the edit form as an "Active" checkbox. |
| 4 | Consistency and Standards | 3 | The square IBM Plex visual system is consistent; segmented radios and native checkboxes use slightly different affordance strength. |
| 5 | Error Prevention | 2 | Destructive/archive action has weak friction, and reminder/email choices do not explain unavailable or permission-dependent states. |
| 6 | Recognition Rather Than Recall | 3 | Behavior cards summarize the right facts, but the edit path expands into a full creation-style form. |
| 7 | Flexibility and Efficiency | 2 | Managing existing behaviors is pushed below a long creation form, and every card carries a large edit flow. |
| 8 | Aesthetic and Minimalist Design | 3 | The screen is visually restrained, but the first viewport is mostly form mechanics rather than the user's current behavior ledger. |
| 9 | Error Recovery | 2 | Field errors exist, but archive recovery is not discoverable as a first-class action. |
| 10 | Help and Documentation | 2 | Empty states and reminder states are factual but too thin for first-time setup decisions. |
| **Total** | | **25/40** | **Solid foundation, overweight workflow** |

## Anti-Patterns Verdict

**LLM assessment**: This does not read as obviously AI-generated. The square layout, no-shadow palette, and IBM Plex system feel deliberately aligned with the "quiet ledger" direction. The weakness is product density, not visual slop: the page asks users to pass through a full behavior creation workflow before reaching the existing records, and each record can become another full workflow.

**Deterministic scan**: The detector returned `[]` for `app/(app)/behaviors/page.tsx`, `components/behaviors/BehaviorForm.tsx`, `components/behaviors/BehaviorList.tsx`, `components/behaviors/RecurrenceEditor.tsx`, and `components/behaviors/ReminderEditor.tsx`. No static slop rules were triggered.

**Visual overlays**: No reliable user-visible overlay is available. Browser mutation preflight failed with a read-only evaluation error before script injection could happen, so the overlay/live-server path was skipped. Browser evidence came from DOM/layout reads instead.

## Overall Impression

The page has the right design bones: quiet, exact, sparse, and square. The single biggest opportunity is to make this a behavior-management page first and a behavior-creation form second. Right now, creating a new behavior dominates the first 933px on desktop and about 1241px of form height on mobile, while the active behavior list starts far below the fold.

## What's Working

1. The visual system is coherent: no rounded cards, no shadows, no decorative gradients, and restrained color use.
2. Behavior cards summarize the right operational facts: scheduled time, category, recurrence, reminder, description, and archive/edit actions.
3. The recurrence and reminder controls are explicit enough for v1 and avoid natural-language recurrence or cron exposure.

## Priority Issues

### [P1] Creation dominates maintenance

**Why it matters**: Users likely visit this page more often to review, edit, or archive existing behaviors than to create new ones. On desktop the create section is about 1000px tall; on a 390px mobile viewport, Active behaviors starts around y=1523. That makes the existing ledger feel secondary.

**Fix**: Collapse creation behind a primary "New behavior" disclosure, or turn the top into a compact add row with title/time/recurrence defaults and an "Advanced schedule" expansion. Keep active behaviors visible in the first or second viewport.

**Suggested command**: `$impeccable layout`

### [P1] Every card contains a full edit form

**Why it matters**: Inline editing is good, but rendering `BehaviorForm` inside every `details` card creates a heavy page and repeats the same full form many times. The browser evidence saw 10 behavior cards and repeated edit controls for each. That creates accessibility noise, slows automation, and can make future client-side interactions brittle.

**Fix**: Lazy-mount the edit form only after a card is opened, or use one shared edit surface that receives the selected behavior. Preserve inline context, but do not render all edit forms at once.

**Suggested command**: `$impeccable optimize`

### [P2] Segmented radios need visible keyboard focus

**Why it matters**: Schedule and recurrence use `sr-only` radio inputs wrapped by styled labels. Mouse users get a clean segmented control, but keyboard users may not see where focus is because the focus ring belongs to the hidden input rather than the visible segment.

**Fix**: Add `focus-within` styling to segmented labels, or use a shared segmented-control component that exposes selected, hover, focus, disabled, and error states consistently.

**Suggested command**: `$impeccable audit`

### [P2] Archive recovery is underpowered

**Why it matters**: Archive is a one-click row action. Archived records stay visible, which is good, but restoration is only discoverable by opening edit and toggling "Active." That is a weak recovery path for a destructive-ish action.

**Fix**: Add a factual "Restore" action on archived rows, and consider a short inline status message after archiving. Keep rust only for hover/caution, not as an error treatment.

**Suggested command**: `$impeccable harden`

### [P3] Some copy leaks implementation terms

**Why it matters**: The product voice should be exact, but not mechanical. "Every N days" and "day(s)" make the form feel developer-authored. "Schedule times" is accurate but a little stiff on cards.

**Fix**: Rename "Every N days" to "Every few days" or "Custom days"; render singular/plural suffixes naturally; consider "Scheduled for" instead of "Schedule times."

**Suggested command**: `$impeccable clarify`

## Persona Red Flags

**Jordan, first-time setup**: The first screen is a full advanced form. Jordan sees title, category, description, exact/range scheduling, recurrence, browser reminder, email reminder, offset, and create action before seeing an example of how behaviors will look after creation. The risk is hesitation at setup, not confusion about any one control.

**Alex, frequent maintainer**: Alex wants to adjust or archive an existing behavior quickly. The active list is below a long create form, and each "Edit behavior" opens the full create/edit machinery rather than a compact common-edit path. High scroll cost on mobile.

**Sam, keyboard-only user**: Sam can likely tab into the controls, but segmented radio focus is not visually obvious because the visible label is not styled by focus. The recurrence preset group is especially exposed.

## Minor Observations

- The no-horizontal-overflow result is good on both 1280px desktop and 390px mobile.
- The "Archived" label treatment matches the neutral design direction.
- Empty messages are too bare when there are no active or archived behaviors; they should say what action is available without becoming onboarding prose.
- Reminder controls do not distinguish provider availability, browser permission, or email configuration states at the form level.

## Questions to Consider

- Should the Behaviors page open on the existing ledger, with creation as an invoked action?
- What is the smallest edit surface that can safely change a behavior without re-showing the whole create form?
- Is archive meant to be reversible in one click, or is it closer to a soft delete?
