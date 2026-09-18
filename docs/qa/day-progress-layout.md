# Day-progress layout review

Status: owner accepted the seventh-revision UI baseline on 2026-09-16.
Ticket 132 is complete. No production Timeline layout changed.
Earlier revision entries below are historical snapshots of review status.

Open the development-only bench at `/design-system?preview=day-progress`.
The bench uses synthetic Occurrences and external events. It neither reads an
account nor calls Google. `OccurrenceRow` supplies the actual ledger controls.

## Accepted choice

Place forward rows chronologically. Reuse the current row component with compact
responsive spacing. Equal-time peers retain their actual time labels without
Behavior-facing ticks or nodes. The candidate no longer draws connecting brackets. Retain the current Behavior stacks in Needs decision and history.
Production integration changes presentation order only; it never rewrites
scheduled times or stored records.

| Choice | Result |
|---|---|
| Chronological rows | One continuous line; actual-time labels; repeated Behavior titles remain on their actual rows |
| Connect into existing Behavior stacks | An early and late Occurrence of one Behavior can straddle other Behaviors; connectors must cross or reverse direction |

The candidate chooses chronological rows because crossing connectors make
time harder to follow. The owner explicitly closed UI review and prioritized
infrastructure over minor design polish on 2026-09-16.
The latest candidate keeps timed Calendar context left of the continuous axis.
The ledger alone occupies the right side, with 12px action padding at narrow
widths and 16px on desktop. All Day Events sits beside the day title in the
ledger header and wraps on narrow layouts. Its hover/focus preview and details
use the bottom drawer; dismissal and restore remain available. Desktop actions show text
unless natural text does not fit. Mobile uses accessible icon actions with 44px
targets. The brand-blue current-time dot has no row tint.
No persistent teal overlap fill or edge appears. Hover/focus outlines only
overlapping Behaviors. Point Behaviors overlap only when `start <= activation < end`.
Estimated-duration Behaviors use half-open interval overlap. Completed and Not
Completed fills remain unchanged.
The current grouped frame remains an unchanged reference.

## Contract

- Temporal defines full local-day boundaries, including DST transitions.
- UI supplies measured time-label centers and day boundaries. Core owns interpolation,
  exact-start grouping, clipped event spans, and accessible marker spacing.
- One piecewise mapping positions temporal anchors and the dot. Timed-event
  hover/focus previews show duration on a thickened axis segment from the displayed
  original-day perpendicular-stem contact and highlight matching Behavior rows. Preserve mapped
  length to the day body bottom. An overnight continuation starts at the next section top above
  its heading, continues to the event end without another marker or stem. Details retain actual
  times. No permanent duration bars appear.
  Calendar events have centered-icon perpendicular stems and no axis nodes.
  Behavior rows have no ticks or nodes. Readable spacing overrides proportional
  scale. The presentation discloses compression.
- Collision displacement never changes an event instant. Crowded Calendar icons
  may displace vertically into 44px non-overlapping targets. Actual timestamps
  remain unchanged; displayed duration follows the stem offsets. Spacing is non-uniform,
  not a uniform-hour ruler. One Calendar lane preserves dense event access.
- Group only Calendar events with exactly the same original start instant.
  Nearby starts remain separate. The same-start marker uses the Calendar badge
  without changing group data or actions.
- Overnight segments retain one event identity. All-day items use date-only
  start and exclusive end dates. The ledger-header All Day Events control supports dismissal and
  restoration without source or status writes.
- Focus/hover reveals a fixed bottom non-modal preview drawer without taking
  focus. It reserves matching viewport space, is at most `min(18rem, 40dvh)` (a maximum, never a fixed height), and
  scrolls internally. It persists until explicit dismissal or replacement so a pointer can reach it.
  Click/tap/Enter/Space opens the preview; each event’s View details action opens only that event in the modal details drawer. Close or Escape restores focus
  without reopening the preview. Source links require safe destinations.
- Actual manual status remains authoritative. Estimated, scheduled, and running
  activity cannot change status, recurrence, reminders, or provider events.

Normalized event, geometry, freshness, and estimate types live in
`packages/core/src/types/day-progress.ts`. Pure owners and paired tests are
registered in `docs/AGENT_RESOLVERS.md` and `scripts/check-resolvers.mjs`.

The proposed estimate uses at least three distinct Completed Occurrences from
the preceding ninety complete local days. Sum positive stopped-session time per
Occurrence, exclude any Occurrence with a running session, then take the mean.
Insufficient history means unknown. Existing analytics semantics stay unchanged.
This threshold is a planning default, not an owner-specified statistical rule.

Each timed event gets one marker at its start, or on the first visible day if it
started earlier. Later days retain duration segments without repeated markers.
Drawers fit their content with 16px padding and reserve only their rendered height.

All-day controls are absent when the day has no all-day events. Otherwise they
show “All day: {first event title}”, with “+N more” for additional visible events.
Dismissed events retain a Restore control. Hover, focus, click, and tap open the
same persistent preview. The preview has no repeated heading or divider. Each
event owns a View details button that opens only that event in the modal details
drawer. Closing details returns focus to the original timeline control.


## Baseline observations

The existing generic TimelineGroup trace preview rendered 48px summary rows
at desktop and 390px widths. Its nested bench padding compressed narrow rows
to approximately 247–263px and caused control overlap. That generic preview
does not reproduce the product's 358px content width at a 390px viewport.
The comparison bench must use product gutters and report actual row widths.

The baseline browser reported a duplicate source-list key for
`apps/desktop/src/local-database-controls.tsx` in the existing surface catalog.
This preceded the proposed layout. No provider/network error occurred.

## Initial browser and coding evidence (2026-09-16, superseded layout)

The parent verified the synthetic bench in the Codex browser on loopback port
4322. Port 4321 was occupied. Actual CSS viewport measurements account for
browser zoom; the narrow viewport measured 390px, not its outer window width.

| Check | Observed result |
|---|---|
| Narrow rows | All five proposed rows measured 358px wide with 48px collapsed summaries; document width remained 390px |
| Desktop rows | All five rows measured 808px wide with 48px summaries in the 880px frame |
| Narrow mode on desktop | All three frames measured 390px; proposed rows remained 358px |
| Mapped icon center | Team stand-up at 8:00 AM matched the first 8:00 AM row center within 0.001px |
| Narrow pointer targets | Each event/overflow target occupied x=0–24px; rows started at x=24px, with no overlap or horizontal overflow |
| Expansion and resize | The first row expanded to 500px, exposed Note and timer controls, and retained its disclosure through width changes; summary height stayed 48px |
| Clock | Keyboard adjustment advanced the fixture clock from 1:20 PM to 1:30 PM and repositioned the dot after expansion |
| Details | Enter opened Lunch with Priya; Space opened grouped event details; Escape closed the dialog and restored launcher focus |
| Rich details | Dialog exposed Calendar, time, location, organizer, attendees, conference, attachments, and an HTTPS source link |
| All-day visibility | Unchecking removed both all-day controls; rechecking restored them |

Source destinations were inspected, not followed. Native touch and WKWebView
remain unverified. The existing timer component uses the real display clock;
the June synthetic running sessions therefore show long elapsed durations.
The fixture clock controls the proposed dot only. This bench does not establish
production timer lifecycle or performance acceptance.

All standard checks pass: agents, interactions, resolvers, lint, typecheck,
test, and build. Core portability, design-system, desktop parity, desktop
typecheck, and desktop frontend build also pass. The full suite passes 1,660
tests, with 26 skipped. Thirteen tests cover the new pure contracts. The initial
sandbox run blocked five local fake-provider tests; the loopback-enabled rerun
passes. Existing seven lint fixture warnings and desktop chunk warnings remain.
No migration or native boundary changed.

The first independent review found a 12px icon/span offset, missing horizontal
stems, and narrow targets covering part of the row hit area. The parent centered
icons at mapped instants, drew exact span endpoints and horizontal stems, and
redistributed the narrow gutters. The measurements above include those fixes.
After the parent reran all listed checks, a fresh read-only review returned
`ship` with no findings for this preparatory slice. Owner review remains pending.
The review does not close any production, provider, or native release gate.

## First owner-feedback revision (2026-09-16, superseded layout)

The owner requested less title/action whitespace, a dismissible third All day
column, floating previews, and clearer centered stems. These are revision
instructions, not acceptance of the candidate. The initial width measurements
above describe the superseded fixed-width proposal only.

The revised bench uses scoped CSS around actual OccurrenceRow components. It
renders one Calendar lane and one time axis. Timed spans share that axis instead
of adding parallel rails. Each 44px Calendar target and perpendicular stem share
an exact center. All-day dismissal applies across displayed dates and offers a
Restore dismissed control. Hover/focus opens a native non-modal popover; click
opens the existing native full-details dialog.

| Revision check | Observed result |
|---|---|
| Title/action gap | Drink water shrank from 397px in the current frame to 227px in the proposal |
| Desktop | 880px frame; 592px Behavior rows; 48px collapsed summaries; separate 144px All day column |
| Responsive web | 390px actual viewport; 302px Behavior rows; 88px summaries; full status labels on second line; no horizontal overflow |
| Node/stem alignment | Every measured Calendar node and stem center differed by less than 0.005px |
| Expansion/resize | Expanded Note draft survived desktop-to-390px switch; anchor stayed within 0.001px of the visible time-label center |
| Hover/focus | Pointer hover opened the floating preview; pointer transfer into it kept it open; keyboard focus stayed on the launcher |
| Preview dismissal | Escape from inside the preview closed it and returned focus to the launcher |
| Full details | Enter opened Lunch with Priya; Escape closed full details and restored launcher focus |
| All-day dismissal | Dismiss removed the same event on both displayed dates; Restore brought it back; keyboard focus stayed on an available control |

Three DOM tests cover restorable all-day dismissal and preview focus behavior,
including absence of product writes. Native popover behavior was checked in the
browser; the DOM tests stub only that missing jsdom API. Native touch/WKWebView
remain unverified. Production Timeline and provider behavior remain unchanged.

The temporary inventory scan excludes the bench and reports no changed source
paths. It also reports existing inventory differences outside this revision;
manual mappings remain intact. The generic usage scan exceeded a 45-second
budget. The canonical design-system check passes, and both tracked inventory
and product usage exclude DayProgressBench.

All seven standard checks pass for the revision: agents, interactions, resolvers,
lint, typecheck, test, and build. Core portability, design-system, desktop parity,
desktop typecheck, and desktop frontend build also pass. The suite passes 1,663
tests, with 26 skipped. Seven existing fixture lint warnings and the desktop
chunk-size warning remain. The first revision reviewer requested a focus-persistence fix: pointer leave
closed the preview while its launcher stayed focused. The parent now closes only
when both focus and hover leave the launcher and card. A regression test and
browser retest confirm persistence; Escape still dismisses. All listed checks
were rerun successfully after this correction. A fresh read-only review of the corrected revision returned `ship` with no
findings. Owner layout review and all production/native gates remain open.

## Second owner-feedback revision (2026-09-16, superseded candidate)

The owner rejected the right-side All day column and breaks in the vertical line.
The owner requested two left-side alternatives and icon-only collapsed-row
status actions. These instructions replace the prior candidate, not the pending
owner acceptance gate.

- **A · All-day count:** one compact All day button near each day heading opens
  that day's visible all-day events. Dismiss from the dialog; Restore stays in
  the same left-side position.
- **B · Individual markers:** each all-day event has a small Calendar marker
  near the day heading, with a native title tooltip. The same dialog dismissal
  turns its marker into Restore.
- **Continuity:** one spine crosses all three synthetic days and their headings.
  Day headings and the ledger align to its right. Nothing occupies a right-side
  Calendar column.
- **Geometry:** the previous square was the bracket joining equal-time Behavior
  rows. The gray band represented event duration on the axis. Both were visually
  ambiguous, so this candidate removes them. Every Calendar stem now ends at its
  own axis node; separate small ticks align with each Behavior time label.
- **Compact actions:** an opt-in StatusButtons/OccurrenceRow property hides only
  the visible action text. Accessible names, native title tooltips, status
  semantics, and expanded actions remain. Production callers retain text labels.

Browser QA at actual 390px confirms 286px-wide, 48px-high collapsed rows and
44px-square check/X actions. Document width remains 390px. Calendar stem/node
center differences stay below 0.01px; each endpoint aligns exactly with the
continuous spine. Both all-day alternatives open details, dismiss across the two
visible dates, restore, and return focus to their launcher. The baseline remains
unchanged. Native touch and WKWebView remain unverified.

Six focused DOM checks cover both all-day options, independent event restoration,
accessible icon names/default reference labels, and the existing preview
focus/Escape/mixed-input behavior. The first review found that individual Restore
markers restored all dismissed events. The corrected marker restores only its
selected ID. A second synthetic all-day event exercises this distinction; the
browser confirms that restoring Design offsite leaves School holiday dismissed.
All standard checks pass: agents, interactions, resolvers, lint, typecheck,
full test, and build. Core portability, design-system, desktop parity, desktop
typecheck, and desktop frontend build also pass. The current suite passes 1,670
tests (26 skipped), including all six bench DOM tests. Seven existing fixture
lint warnings and the desktop chunk warning remain. The suite requires local
loopback listening for its fake provider; the sandbox denied that listener, and
the authorized rerun passed. Desktop rows measure 720px;
all day headings sit to the right of the continuous spine. Note drafts and
expanded disclosures survive option and width changes. Fresh read-only review
of the restore correction returned `ship` with no findings. Owner layout review
remains pending. The generic usage scanner again exceeded
45 seconds; the canonical design-system check passes.

## Third owner-feedback revision (2026-09-16, historical and superseded)

The owner selected A and requested the label All Day Events and a hover preview.
The candidate now keeps only that count. Its anchored native popover opens on
hover or focus without taking focus. Click/Enter or View details opens the native
details dialog. Dismissal remains synthetic and restorable. All context stays left.

Desktop status labels remain visible by default. The existing ResizeObserver
measures full title and action text with DOM Ranges. Labels yield only when the
full text would not fit; a Long Behavior title fixture exercises that case.
The narrow container uses icons. Both modes preserve accessible names, tooltips
for icon actions, and 44px targets. Production callers remain unchanged.

Behavior-facing ticks and nodes are removed. Calendar stems/nodes remain.
The moving dot uses the existing brand-blue primary token. The row whose
collapsed summary contains the dot's vertical position gains a shade: pale blue
for unresolved, darker blue for Completed, and darker Rust for Not Completed.
This is presentation geometry, not a duration estimate or status mutation.
Day-body boundary spacing prevents midnight from tinting the first future row.
Header spacing keeps all-day and midnight Calendar hit targets separate.

Browser evidence: actual 390 CSS pixels, no horizontal overflow, 286px rows,
48px summaries, and 44px actions. Desktop short titles retain labels; the long
fixture switches to icons and switches back when shortened. Hover enters the
All Day Events preview without focus movement, pointer transfer keeps it open,
and View details opens the dialog. Dismiss/restore returns launcher focus.
At midnight no row is tinted; at 8:00 AM the first row is tinted and its status
stays unresolved. At 1:20 PM the Completed walk retains its status and gains a
darker shade. Native touch and WKWebView remain unverified.

Six focused DOM tests cover adaptive action labels, all-day preview/details,
dismiss/restore, current-row presentation, and existing preview focus behavior.
The full suite passes 1,672 tests with 28 skipped. Concurrent capacity-test work
accounts for the suite-count increase. Its preview logging read an import-only
property from a union; one type guard now reports null for restore metadata.
All standard checks pass: agents, interactions, resolvers, lint, typecheck,
test, and build. Core portability, design-system, desktop parity, desktop
typecheck, and desktop frontend build also pass. The existing seven fixture lint
warnings and desktop chunk-size warning remain. Fresh read-only review returned
`ship` with no findings. Owner layout acceptance remains pending. No provider,
migration, deployment, or installed desktop changed.

The temporary inventory has no changed tracked source paths and excludes the
bench. Existing manual entries remain intact. The generic usage scanner again
exceeded 45 seconds; the canonical design-system check remains the verifier.

## Remaining acceptance boundaries

Browser fixture evidence does not establish native WKWebView, real Calendar,
idle/minimized performance, account isolation, cache cleanup, or release acceptance.
Those remain under Tickets 133–137 and `docs/qa/day-progress-release.md`.
The owner accepted the concrete layout on 2026-09-16. Production integration
continues under Tickets 133–137 with the acceptance boundaries above.

## Fourth owner-feedback revision (2026-09-16, historical and superseded)

The owner superseded the third revision. All Day Events now sits beside the day
title in the ledger header, wrapping on narrow layouts. The selected treatment
keeps hover/focus preview, click/tap/Enter details, Escape focus return, and
local-only dismiss/restore behavior.

Timed Calendar context remains left of one continuous line. The ledger remains
right. Restore action padding is 12px on narrow layouts and 16px on desktop.
Desktop shows status labels unless natural text does not fit. Mobile uses
accessible icon actions with 44px targets. The brand-blue current-time dot no
longer tints a row.

Only an unresolved Behavior with an external timed overlap receives the new
muted teal shade. A point Behavior overlaps when `start <= activation < end`.
An estimated-duration Behavior overlaps by a half-open interval. Completed and
Not Completed fills remain unchanged. A resolved overlap may show a teal edge;
hover and focus strengthen it to a distinct teal outline. This cue never writes
status, schedule, provider, or dismissal data.

Timed-event hover/focus previews show actual duration as a thickened axis
segment and highlight matching Behavior rows. The segment is temporary; no
permanent duration bar appears. Calendar icons use centered perpendicular stems
without axis nodes. Dense icons may displace vertically into 44px non-overlap
targets. The actual-time preview and actual-duration mapping stay undisplaced.
Spacing may be non-uniform and must not read as a uniform-hour axis.

Group only events with exactly the same original start instant. Nearby starts
remain separate. The bench offered Count, Stack, and Calendar-badge variants for
the same group data and actions. Fixtures include two 8:00 AM morning events,
three 12:45 PM lunch events, separate 7:50 AM and 8:05 AM events, and an
evening-water toggle: a 3-hour duration overlaps a 23:30 train event; the
21:30 point version does not.

Owner layout acceptance remains pending. Tickets 133–137 have no production
authorization. Web owns the synthetic bench only. Desktop follows in Tickets
133–137. Marketing is not applicable. Future mobile remains deferred; 390px
evidence applies to responsive web only.

Fourth-revision verification: 21 focused tests pass, including seven bench DOM
checks and fourteen shared-contract checks. Browser QA confirms 16px desktop
and 12px narrow action insets, 48px rows, and no horizontal overflow at 390 CSS
pixels. Midnight and afternoon clock positions retain identical overlap cues.
Timed hover shows the selected event duration and matching rows; overnight hover
highlights both day segments and the overlapping previous-day Behavior.
All three marker options retain the same groups. All Day Events remains beside
the date and retains preview/details/dismiss/restore behavior.

The full suite passes 1,678 tests with 29 skipped, including concurrent repository
work. Standard checks, core portability, design-system, desktop parity,
desktop typecheck, and desktop frontend build pass. Existing seven fixture lint
warnings and the desktop chunk-size warning remain. The generic usage scanner
exceeded 45 seconds; the canonical design-system check passes. Fresh read-only
review returned `ship`. Two earlier reviews found stale node/grouping wording
in UI Spec and Product Spec; the parent corrected it and verified current
contracts agree. Keyboard focus retains its standard outline on shaded rows.

Web owned the review bench. Desktop would consume the same pure contracts after
review. Marketing had no runtime change or new claims. Future native mobile
remained deferred; 390px verification applied to responsive web only.

## Fifth owner-feedback revision (2026-09-16, historical; superseded by sixth revision)

The owner replaced the anchored floating preview with a fixed bottom non-modal
preview drawer. Hover and focus open it without moving or stealing focus. The
drawer reserves matching viewport space so it cannot obscure ledger controls. It
is at most `min(18rem, 40dvh)` high and scrolls internally. It persists until explicit
dismissal or replacement so a pointer can reach it. Click, tap, or Enter opens the bottom native
modal details drawer. Close or Escape restores launcher focus without reopening the preview.

The drawer duration mark starts at the displayed original-day perpendicular-stem
contact. It keeps the displayed mapped start-to-end length to the day body bottom
and crosses midnight continuously through the next day heading and padding. An
overnight continuation starts at the next section top above its heading, passes
its displayed continuation stem, and ends beyond it. These display offsets never
replace actual event start/end in details.

Only the Calendar badge remains for exact-start groups. Nearby starts remain
separate. All Day Events remains beside the date. Persistent teal overlap fills
and edges are removed. Hover/focus outlines only overlapping Behaviors. Completed
and Not Completed fills stay unchanged. Point and interval overlap semantics stay
unchanged.

Verification: all seven bench DOM tests and fourteen shared-contract tests pass.
The full suite passes 1,678 tests with 29 skipped. Agents, interactions, resolver
boundaries, lint, TypeScript, build, design-system, and desktop parity checks pass.
Seven existing fixture lint warnings remain. The generic usage scanner did not
finish; the canonical design-system check passes with 32 components, 116 usages,
and no bench entries in product usage. Inventory scanning changed no tracked
source paths. No manual theme toggle was added.

Browser QA on loopback port 4322 confirms the following:

- At 390 CSS pixels, page, scroll area, and narrow frames measure 390px without
  horizontal overflow. Ledger rows remain 286px wide and 48px high.
- The preview drawer measures 288px high, below the separate scroll area with a
  16px gap. All three grouped events remain accessible through internal scrolling.
- Pointer hover opens the drawer without moving keyboard focus. Switching days
  leaves one drawer. All Day Events uses the same drawer.
- The overnight highlight begins exactly at the original displayed stem. Its
  two segments meet across the heading within 0.001px and pass the next-day stem.
- Row summaries have transparent backgrounds. Only inspected overlaps gain an
  outline; Completed and Not Completed article fills remain unchanged.
- Details open in a bottom native modal drawer. Close restores launcher focus
  and clears the preview; Escape also dismisses the non-modal preview.

Fresh read-only review returned `ship` with no findings. Native touch and
WKWebView remain unverified. Owner layout acceptance remains pending.
Ticket 132 remains in progress. Tickets 133–137 remain production-pending.

## Sixth owner-feedback revision (2026-09-16, historical; interaction flow superseded by seventh revision)

The owner rejected repeated markers for one overnight event. The shared layout
now assigns one marker per timed event across the visible range. A start before
the range appears once on the first visible day. Later days keep the duration
segment but receive no marker, stem, or marker-spacing allocation. Hover retains
one continuous duration; the preview shows both dates for overnight events.

Preview and details drawers now fit their content, retaining the existing
`min(18rem, 40dvh)` ceiling for long content. Preview content uses 16px outer
padding and section spacing, 8px header separation, and 44px controls. A
ResizeObserver reserves exactly the rendered drawer height plus the existing
16px gap. No fixed empty drawer area remains.

Verification:
- All 22 focused layout, context, and DOM tests passed. The full suite passed
  1,679 tests, with 29 skipped.
- Agent, interaction, resolver, lint, typecheck, core, design-system, and web
  build checks passed. Lint retains seven existing fixture warnings.
- Desktop typecheck, build, and parity checks passed. The existing bundle-size
  warning remains; native desktop UI was not exercised.
- Desktop and exact 390px browser checks confirmed one Overnight train marker,
  continuous cross-day duration, and both dates in preview/details.
- The single-event preview measured 162px, down from 288px. Its reserved space
  matched. Three-event previews and details capped at 288px and scrolled.
  Narrow page width remained 390px. Escape restored marker focus.
- Fresh read-only review returned ship with no findings. Native touch and
  WKWebView behavior remain unverified.

Web owns the synthetic bench; desktop follows in Tickets
133–137. Marketing is not applicable. Native mobile remains deferred; narrow
browser evidence applies to responsive web. Overall owner layout review remains
pending.


## Seventh owner-feedback revision (2026-09-16, accepted baseline)

All-day controls are absent when the day has no all-day events. Otherwise they
show “All day: {first event title}”, with “+N more” for additional visible events.
Dismissed events retain a Restore control. Hover, focus, click, and tap open the
same persistent preview. The preview has no repeated heading or divider. Each
event owns a View details button that opens only that event in the modal details
drawer. Closing details returns focus to the original timeline control.

The preview retains 16px padding, 44px controls, existing typography, square
edges, content sizing, and measured reserved viewport space. The close control
sits alongside the event content. Group markers keep all events in the preview;
details never combine events.

Descriptive labels follow the information-scent rationale in
[NN/g’s guidance](https://www.nngroup.com/articles/information-scent/) and
[W3C’s descriptive link guidance](https://www.w3.org/WAI/WCAG21/Understanding/link-purpose-in-context.html).
The specific title-plus-more wording is a design choice, not a research finding
about all-day event frequency. No frequency assumption governs the layout.

Web: implemented only in the synthetic bench. Desktop: same candidate for
Tickets 133–137, no native parity claim. Marketing: not applicable. Native mobile:
deferred; touch/click behavior applies to responsive web.

Verification: all 1,680 tests passed (29 skipped), including eight bench DOM
tests. Agent, interaction, resolver, lint, typecheck, and design-system checks
passed. Lint retains seven existing fixture warnings. Final build passed; fresh
read-only review returned ship with no findings.

Desktop and exact 390px browser checks confirmed:

- No repeated preview heading, divider, or group-level View details action.
- All-day and same-start event buttons each open only their selected event.
- Click opens a persistent preview without opening a modal.
- Three-event content scrolls inside the 288px drawer ceiling; all three details
  buttons remain reachable. Page width stays 390px.
- Close/Escape restores the timeline launcher. Existing dismiss/restore works.

Native touch/WKWebView remains unverified. The owner accepted this layout on
2026-09-16, as recorded in the closeout below.


## Owner closeout (2026-09-16)

The owner stated that basic functionality was ready, requested infrastructure
work before minor design changes, and asked to close out interface work.
This is explicit acceptance of the seventh-revision baseline, not inferred from
praise. Ticket 132 closes. Further visual polish is deferred and does not block
133–137. Production, live Google, native touch, and WKWebView acceptance remain
separate; this closeout does not claim those checks passed.

Ticket 134 now owns provider schema/contract finalization through
`docs/EXTERNAL_EVENT_CONTRACT.md`; Ticket 137 owns combined implementation and
documentation closeout. No new UI code changed during this planning closeout.
