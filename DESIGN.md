---
name: Cadence Tracker
description: A sparse, square, IBM Plex Sans-forward visual system for a public behavior tracker and BehaviorLog reference surface.
colors:
  primary: "#3572b3"
  background: "#FDFCFB"
  surface: "#F4F5F6"
  text: "#0A0B0C"
  muted-readable: "#626C75"
  accent: "#C84A31"
  timeline-row-hover: "#eef6ff"
  timeline-needs-decision-hover: "#e8f2ff"
  timeline-completed-hover: "#2f669f"
typography:
  display:
    fontFamily: "IBM Plex Sans"
    fontSize: "30px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0px"
  headline:
    fontFamily: "IBM Plex Sans"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "0px"
  title:
    fontFamily: "IBM Plex Sans"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "0px"
  body:
    fontFamily: "IBM Plex Sans"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0px"
  label:
    fontFamily: "IBM Plex Sans"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "1px"
rounded:
  none: "0px"
spacing:
  sm: "8px"
  md: "24px"
  lg: "64px"
  xl: "120px"
  page-gutter: "clamp(20px, 4.5vw, 72px)"
  wide-page-gutter: "clamp(24px, 5vw, 80px)"
components:
  button-primary:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0"
    textDecoration: "underline"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.muted-readable}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0"
    textDecoration: "underline"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0"
    textDecoration: "underline"
  input-field:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
  behavior-record:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    typography: "{typography.title}"
    rounded: "{rounded.none}"
    padding: "20px"
  timeline-row:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    typography: "{typography.title}"
    rounded: "{rounded.none}"
    padding: "24px"
  nav-active:
    backgroundColor: "{colors.timeline-row-hover}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "12px"
---

# Design System: Cadence Tracker

## 1. Overview

**Creative North Star: "The Quiet Ledger"**

The interface is a private field log and public reference surface: square, calm, legible, and exact. It uses IBM Plex Sans type, quiet rules, broad whitespace, black underlined primary actions, compact form controls, small heatmap cells, and flat product captures across the implemented auth shell, Behaviors screen, Timeline screen, Export screen, Settings screen, and Astro marketing site.

This is product UI, not a poster. The look can be distinctive, but every screen must still work quickly for marking occurrences, reading Needs decision, editing behaviors, checking basic analytics, and exporting records.

**Key Characteristics:**

- IBM Plex Sans-only typography.
- Bleached off-white background with quiet ash dividers.
- Muted blue used for selected recurrence presets, completed cells, and completed Timeline state.
- Pale timeline blue used for the current navigation route state.
- Rust red used for explicit Not Completed decisions and rare caution states.
- Square corners, no shadows, no blur, no rounded cards.
- Spacious desktop rhythm with compact, stackable mobile layouts.
- Shared page gutters should keep public pages from touching the viewport
  edge; wide marketing sections use the wider gutter token before max-width
  clamping.
- Behaviors, Export, and Settings may use the shared decorative page banner
  full width above route content.
- Public marketing pages keep the same square ledger vocabulary while making
  Cadence the first narrative position and treating BehaviorLog as the open
  portability layer behind Cadence exports.

## 1.1 Surface Model

Cadence has one canonical design system with surface-scoped implementations.
The canonical system owns foundations, state semantics, accessibility
expectations, product language, and reusable component-family contracts. Each
surface may implement those contracts in its native runtime:

- **Authenticated web app:** Next.js/React live product components tracked by
  `design-system.manifest.json`, `design-system.usage.json`, and the local
  `/design-system` bench.
- **Astro marketing site:** static Astro templates and CSS that share Cadence
  tokens, section rhythm, marks, CTAs, and product-capture vocabulary without
  importing authenticated React components.
- **Desktop and mobile:** future local-first surfaces that should reuse tokens,
  primitive contracts, presentational module specs, and resolver-fed view
  models when those tracks are scheduled.

`design-system.surfaces.json` is the machine-readable cross-surface catalog.
It groups tokens, primitives, navigation, layouts, patterns, and product
modules into canonical families, then maps each family to web, marketing,
desktop, and mobile implementations or planned notes. A surface may use a
different language or framework as long as it satisfies the shared contract.

Shared code should start at tokens and framework-light primitives. Do not
extract full product modules into `packages/ui` until another scheduled runtime
needs them and the extraction removes real duplication.

## 2. Colors

The palette is almost monochrome: black ink, bleached paper, subtle gray, and one muted blue. Red is a rare warning signal.

### Primary

- **Monolith Blue**: `#3572b3`, used for selected states, hover fills on selected controls, completed Timeline rows, and completed heatmap cells.
- **Timeline Row Hover**: `#eef6ff`, used for unresolved and Not Completed Timeline occurrence row hover and the current navigation route state.
- **Needs Decision Hover**: `#e8f2ff`, used for prior unresolved Needs decision occurrence row hover.
- **Completed Row Hover**: `#2f669f`, used for Completed Timeline occurrence row hover.

### Secondary

- **Rust Signal**: Used for explicit Not Completed decisions and rare destructive or caution states. Keep the language factual so the color marks a recorded state, not a moral failure.

### Neutral

- **Bleached Newsprint**: Main app background.
- **Cold Surface**: Secondary panels, empty states, skeleton loaders, inline note areas, inactive heatmap cells, and inactive navigation hover.
- **Ink Black**: Main text, icons, and hard text hierarchy.
- **Ash Line**: The single border color for dividers, controls, panels, rows, inputs, and heatmap cells.
- **Readable Ash**: Essential secondary text where the lighter muted gray would not meet contrast.

### Named Rules

**The Four-Color Rule.** Most screens should read as black, background, blue, and surface gray. Rust appears for explicit Not Completed decisions and genuine caution.

**The Contrast Rule.** Use Ash Line for all borders and quiet separators. Use Readable Ash or Ink Black for text that the user must read.

## 3. Typography

**Display Font:** IBM Plex Sans
**Body Font:** IBM Plex Sans
**Label Font:** IBM Plex Sans

**Character:** The type should feel mechanical and logged, not nostalgic or cute. Use scale, spacing, color, borders, and layout to create hierarchy instead of introducing another font or heavier weights.

### Hierarchy

- **Display** (400, 30px, 1.2): Page titles and prominent dates on larger screens only.
- **Headline** (400, 24px, 1.25): Section titles such as Timeline, Behaviors, Export, and Settings.
- **Section** (400, 20px, 1.25): Major in-page panels and grouped content headings.
- **Title** (400, 18px, 1.25): Behavior titles, occurrence titles, card headings, and form section titles.
- **Body** (400, 14px, open leading): Notes, descriptions, recurrence summaries, and normal explanatory text. Keep prose to 65-75ch.
- **Label** (400, 12px, 1px tracking): Navigation labels, button labels, status pills, table labels, and compact metadata.

The active Tailwind text scale is shifted one step smaller than the framework default: `text-4xl` renders at 30px, `text-3xl` at 24px, `text-2xl` at 20px, `text-base` at 14px, and `text-sm` at 12px.
The active Tailwind font-weight scale is flattened for this no-bold experiment: `font-medium`, `font-semibold`, `font-bold`, and heavier utilities all render at 400.

### Named Rules

**The IBM Plex Sans Rule.** Do not introduce serif, display, script, or secondary sans fonts.

**The No-Cramped-Type Rule.** Letter spacing is never negative. The reference aesthetic comes from IBM Plex Sans letterforms and square layout, not squeezed letters.

**The Uppercase Limit Rule.** Headings, short labels, and buttons may use uppercase. Body copy, notes, descriptions, and helper text must use normal sentence case.

## 4. Elevation

This system is flat by default. Depth is created with borders, spacing, surface color, and full filled states, not shadows.

### Named Rules

**The No-Shadow Rule.** Do not use drop shadows, glass effects, blurred panels, or soft floating cards.

**The Quiet Divider Rule.** Prefer single 1px Ash Line dividers over full perimeter boxes. Inputs, select controls, compact chips, true dialogs, and dense data tables may still use enclosure when the boundary is functional. Hierarchy comes from fill, spacing, and typography rather than heavier border weight.

**The One-Line-Per-Boundary Rule.** Any boundary between two neighbors is drawn exactly once. Stacked page sections take a single divider between them (`divide-y` on the stack, or `border-t` on every section after the first), never per-section `border-y`, which doubles the line across the gap. A nested container never redraws its parent's boundary: a list inside a section uses inner `divide-y` only, with no outer border, and inline status text does not carry its own `border-t`.

**The Spacing Scale.** Vertical space encodes hierarchy on a fixed ladder, and parallel objects always share the same value:

| Boundary | Space | Owner |
|---|---|---|
| Page header rule → content; page-level siblings | 48px (`gap-12`) | the screen-frame stack |
| Section ↔ section | 16px + 1px rule + 16px (33px, rule centered) | the section stack: `divide-y` with `py-4` sections, `first:pt-0 last:pb-0` |
| Sub-block ↔ sub-block inside a section (fieldsets, Export subsections at 32px) | 24–32px | the section's own grid |
| Heading block → its content | 16px (`mt-4`) | the section |
| Sibling items (form controls, paragraphs) | 12px (`gap-3`) | the content grid |
| Tight groups (stat rows, dl pairs) | 8px (`gap-2`) | the group |
| Label → value | 4px (`gap-1`) | the item |

A boundary's space always exceeds every boundary one level below it; header rules echo in halves (page title→rule 24, rule→content 48; Export super-header desc→rule 16, rule→subsections 32). Title→description is 12px (`mt-3`) at every tier. Row density keeps three named tiers — 8px dense feed rows (Timeline), 12px ledger rows (settings links, setup rows), 16px airy rows (export downloads, behavior records) — chosen per surface, never mixed within one list. Overlay panels pad at 16px with 12px inner insets. Timeline is exempt at the top: its day headers are the page's first tier and keep their promoted 48px rhythm. Public account pages follow the same ladder one step airier (24px section padding, 33→49px section gaps).

**The Heading Ladder.** Page title `text-3xl sm:text-4xl` → super/promoted headers (Export's Export/Import, Timeline's today date) `text-2xl` → section headings `text-xl` → row titles `text-lg` and below. Headings never carry bold overrides; weight stays normal per the type experiment.

## 5. Components

### Buttons

- **Primitive:** Text on a transparent background with a thin underline. This is the default action/link vocabulary in the design-system harness and for lightweight product actions.
- **Primary:** Ink Black text, underline, Label typography, and no perimeter box.
- **Secondary:** Readable Ash text, underline, Label typography, and no perimeter box.
- **Danger:** Rust Signal text, underline, Label typography, and no perimeter box. Use for factual destructive or caution actions such as Archive behavior.
- **Reserved fills:** Use filled button surfaces only for selected controls, destructive confirmations, fixed high-priority actions such as Needs decision, and cases where the target needs a larger touch surface.
- **Hover / Focus:** Hover may add non-reflowing text emphasis or shift secondary actions to Ink Black. Focus must use a visible 2px outline with offset.

### Chips

- **Style:** Square, compact labels with 1px border.
- **State:** Selected chips use Monolith Blue fill with Bleached Newsprint text. Unselected chips stay background with Ink Black text.

### Cards / Containers

- **Corner Style:** Square corners (0px).
- **Background:** Bleached Newsprint for normal rows; Cold Surface for empty states, expanded details, and low-emphasis panels.
- **Shadow Strategy:** No shadows.
- **Border:** Prefer single Ash Line dividers and unboxed sections. Behavior records and Timeline occurrence rows are unboxed list rows. Use perimeter borders only where a real field, modal, table, or dense control needs an explicit boundary.
- **Internal Padding:** 16px for behavior rows (airy row tier), vertical 10-12px padding plus a compact horizontal inset for Timeline occurrence rows on both desktop and mobile. Page sections follow the Spacing Scale (16px section padding inside a divided stack) instead of large per-section padding.

### Inputs / Fields

- **Style:** Bleached Newsprint background, 1px Ash Line border, square corners, IBM Plex Sans body text, and 8px 12px padding.
- **Selects:** Native select controls use the shared select primitive: the same square field enclosure with the browser widget chrome removed (`appearance: none`) and a 16px Ink Black stroke chevron. The chevron sits at the field's standard 12px inset from the right border, mirroring the 12px left text inset, with right padding reserving 40px so text never runs under it.
- **Focus:** Keep the square geometry and add a visible outline.
- **Error / Disabled:** Errors use Rust Signal text. Disabled states use Cold Surface and Readable Ash.

### Behavior Management

- **Form layout:** Full-width page section without an extra outer card border or outer padding. Use stacked field groups, quiet inner dividers, and a two-column desktop rhythm that collapses to one column on mobile.
- **Scheduled time:** Show only the scheduled-time control in the Behavior form. Timezone is owned by Settings and should not appear as a separate create-form panel.
- **Recurrence section:** Render as an unframed form section with a plain section heading, segmented radio presets, and smaller muted subsection labels such as Every, On, and Day.
- **Recurrence presets:** Segmented radio labels use Monolith Blue fill only for the selected preset. Weekday choices use compact borderless labels with a visible native checkbox.
- **Reminder section:** Render as an unframed form section matching Recurrence, with a plain section heading, bordered checkbox controls, and smaller muted subsection labels such as Reminder offset.
- **Create behavior:** Keep the creation form available from the Behaviors page without making existing behavior records secondary. When records already exist, use a simple native disclosure; when no records exist, the disclosure may open by default.
- **Behavior records:** Active records are unboxed list rows separated by a single 1px Ash Line divider between adjacent records. They keep 16px padding (airy row tier), visible range-based adherence, Completed and Not Completed counts, and a per-behavior calendar sized to the row. Visible outcome stats use the same compact vertical rhythm as metadata inside Details and Settings. Lower-use behavior characteristics such as category, schedule, recurrence, reminders, and description live inside the row's Details and Settings disclosure with the edit form. Archive behavior appears at the end of that settings area and aligns to the opposite side of the Save/Cancel footer row on desktop. Create and edit forms use real field/control borders only; schedule slots use quiet row dividers instead of perimeter boxes.
- **Behavior date review:** Selecting a non-empty behavior calendar cell opens a quiet row-level review area for dated occurrence records. Date of behavior, Time of behavior, Status, and Note render as plain detail rows. Date and time are display-only. Status and Note correction controls stay hidden behind a per-occurrence Review disclosure.
- **Archived behaviors:** Archived records stay out of the active behavior feed and live behind a low-priority bottom disclosure with a count. Restore uses the primary text-action treatment.
- **Archive and restore actions:** Archive behavior uses a factual Rust Signal underlined action at the end of Details and Settings for active records. Archived records stay visible with a neutral square label and a factual Restore action using the primary text-action treatment.
- **Disclosure controls:** Native `summary` controls are the product's standard hide/show trigger button for disclosure sections and row detail drawers. Use the shared disclosure-trigger class for marker hiding, cursor, focus, and tap affordance. Use the shared indicator where a section needs an explicit opener, but omit a separate icon when the whole row is the trigger. Disclosure content spacing belongs to the disclosure pattern or the relevant row pattern, not one-off instance padding.

### Navigation

- **Desktop:** Fixed retractable sidebar with quiet dividers and compact labels. Expanded width is 256px and collapsed width is 64px. The main content uses matching large-breakpoint left padding. Header, navigation, and footer account rows share a fixed 64px icon/avatar column so collapsed and expanded icon positions match. The desktop sidebar header has no bottom divider. In the expanded rail, the Cadence mark and name link to `/timeline`, and the collapse control stays separate from the brand link. In the collapsed rail, the brand cell is an expand-only button with no navigation side effect; hovering it swaps the Cadence mark to the open-sidebar icon. Brand links use a 70% opacity state on hover and press. Active route uses Timeline Row Hover fill with Ink Black text. Inactive hover uses Cold Surface. Primary navigation rows do not have gaps between them. In collapsed state, active and hover fills apply only to the icon cell, not the full row.
- **Sidebar motion:** Width, brand label opacity, and nav label opacity transition over 200ms. Labels remain in the DOM, collapse visually to `w-0`, and stay `whitespace-nowrap` so text never wraps during rail transitions.
- **Mobile:** Do not use the collapsed rail under 1024px. Use a sticky 64px top header that opens a 60vw left drawer. The header has no bottom divider at the top of the page; a 1px Ash Line divider fades in over the first short scroll distance so separation appears only when content moves underneath the sticky bar. The Cadence mark and name in the sticky header and drawer header link to `/timeline`; the hamburger remains the drawer opener. Brand links use a 70% opacity state on hover and press. The drawer keeps the same square navigation vocabulary and its header has no bottom divider. The drawer traps focus while open, locks body scroll, closes from backdrop or Escape, supports edge swipe open from the first 20px of the viewport, and supports left swipe close. The drawer may use a narrow `shadow-lg` only to separate it from the faded backdrop.
- **Routes:** Use the documented primary app screens: Timeline, Behaviors, Export, Settings. `/analytics` is only a compatibility redirect to Behaviors. Do not copy placeholder labels from the reference screens.
- **Page banner:** Behaviors, Export, and Settings may start with the shared decorative page banner image as a full app-content-width banner with a tiny top inset and no bottom margin. Timeline keeps its own decorative image treatment and hides the visible page title below it.

### First-Run Setup

- **Placement:** Timeline may render a dismissible fixed setup pop-up only while required public-launch setup items remain incomplete. It must not take space above the feed. Once the user dismisses it in the current browser, or behavior/notification/timezone setup is complete, the Timeline returns to the normal feed-first rule.
- **Structure:** Use a non-modal pop-up with a quiet header, Skip setup control, and divider-separated rows. Do not use an inline band, wizard, modal takeover, progress meter, reward language, or motivational copy.
- **Rows:** Create first behavior, Browser reminders, Timezone, and Import existing records. Each row uses a small icon, a factual status label, and an underlined text link into existing controls: `/behaviors#create-behavior`, `/settings#notifications`, `/settings#timezone`, and `/export#behaviorlog-import`.
- **State language:** Use direct labels such as Start here, Done, Not enabled, Blocked, Unavailable, Confirmed, Review, Started, and Optional. Import is optional and must not block setup completion.
- **Permission behavior:** The setup pop-up reads browser support and permission state, but it never requests notification permission on page load. Denied or blocked notification permission is a completed onboarding decision, not a reason to keep the setup pop-up open after the other required setup items are done.

### Timeline Rows

- **Timeline structure:** The current day is the first forward feed section and uses the strongest date treatment. Do not show a visible Timeline page title above the feed. The transparent Cadence horse-line-and-dot image may sit directly above the feed as a full app-content-width banner with no extra top or bottom margin; the first Timeline day section remains the current day. Day transitions use the date header plus a thin divider, not boxed day sections. Needs decision is reached from a fixed lower-right button on desktop and a full-width lower safe-area button on mobile; it opens a modal rather than appearing as an inline Timeline section.
- **Mobile refresh:** At mobile widths, a downward pull from the top of Timeline uses a 72px threshold and the factual states Pull to refresh, Release to refresh, and Refreshing timeline. Render the temporary feedback as a small square, bordered surface below the sticky header with no shadow. Short, horizontal, cancelled, below-the-top, and control-started gestures retain their normal behavior. One qualifying release requests one route refresh and never mutates an Occurrence or adds offline behavior.
- **Collapsed unresolved:** Scheduled time as plain text, behavior title, Completed text-link action, and Not Completed text-link action. Rows are compact and unboxed, with collapsed time, title, and action text vertically centered within the row; do not draw a perimeter border around each behavior row. Row content keeps a compact horizontal inset on both desktop and mobile, and time, title, Completed, and Not Completed share one horizontal row when unresolved status actions are visible. Completed and Not Completed keep their minimum tap target and same-line labels; the time and title may compact and truncate before the status targets shrink. Primary status actions are visible for Needs decision rows and current-day unresolved rows. Preset time ranges show only their short label, such as Morning or Evening, in collapsed rows.
- **Timeline status actions:** Render Completed and Not Completed as inline underlined text-link controls with the check and x icons retained. Do not use boxed, filled, or outlined button chrome for these row-level status actions. Keep status action underlines consistently thin; do not use underline thickness to indicate that a row is already Not Completed. Mobile status and Save note actions should have at least a 44px tap target. Hover-capable devices and keyboard focus may add non-reflowing text emphasis as a targeted exception to the base no-bold type experiment, but should not change the action color or move adjacent actions.
- **Expanded details:** Native disclosure reveals description, category, schedule summary, and note directly on the row surface, without a grey panel, enclosing border, top divider, boxed card treatment, chevron, or separate disclosure icon. Opening a resolved row keeps Completed or Not Completed vertically centered in the summary-height line and horizontally parallel to the behavior title; detail height must not recenter the label farther down the row. The detail block uses a small left inset. Measure spacing optically between rendered text and field edges: the largest gap is the standardized 16px disclosure-row gap between the collapsed row content and the first detail label, the next-largest gap is between detail pairs, and the smallest gap is shared by detail label/value, Note label/textarea, and textarea/Save note relationships. While open, the whole occurrence row holds the same blue background used by that row's hover state. The Note textarea keeps its field border; Save note uses the same underlined text-action vocabulary as Completed and Not Completed.
- **Track time:** Active current-day and visible Needs decision occurrences expose one underlined Track Time action. Do not repeat it as a heading while idle or stopped. While a session runs, Track time becomes a static, non-underlined label above the tabular counter and timing actions. All timing text and actions inherit the occurrence row's contrast-aware text roles.
- **Resolved:** Keep resolved rows visible with distinct states. Completed rows hide primary status actions and use a full Monolith Blue fill instead of a separate status chip. Not Completed rows use the same resolved-row structure with Rust Signal fill, Bleached Newsprint text, and a collapsed Not Completed label; correction is available from the expanded row.
- **Completion feedback:** A successful user-initiated change into Completed may play one short chime. Use one actual media playback attempt for the confirmed transition; gesture preparation must not start a separate muted media element. Keep the Web Audio fallback prepared for browsers that reject delayed media. Treat the chime as state feedback, not a reward loop: no voice, no alarm tone, no repeat sound, and no sound for Not Completed or page load.
- **Needs decision:** The floating button shows the unresolved count to decide and uses Monolith Blue when the count is greater than zero. Keep the count and label on one continuous button surface without an internal divider. On mobile, the button spans the lower safe-area width and the modal becomes a full-height sheet with the same flat row vocabulary. On desktop, the modal uses a flat bordered panel. The open modal has no visible global Needs decision title, global count, Prior unresolved eyebrow, or reserved header row. Pin the close control over the top-right corner and let the first white date group start at the top of a scroll area with equal left and right modal gutters; only the date header text row may reserve space for the close control. Each date group shows the date with the per-date count left to decide underneath. Highlight prior unresolved rows with Cold Surface and thin structural lines, never red error styling. Rows decided from the modal can remain in their original prior-day group through the current local day; Completed retained rows use the full completed treatment, and Not Completed retained rows use the Rust Signal treatment with the same resolved-row structure. Do not write or imply a stored Needs decision status.

### Behavior Review Heatmaps

- **Behavior review structure:** Overall adherence sits near the top of Behaviors with the active range selector directly above the overall calendar inside that same area. The overall adherence label and percentage share one adjacent, unbroken header line at desktop widths; the selected date range sits directly underneath in compact muted month-day wording. The range selector, calendar, and legend form one right-aligned desktop cluster. Review sections are unboxed report bands separated by single horizontal dividers where needed, not perimeter panel borders.
- **Calendar legend:** The overall calendar legend stays visible and vertically listed to the right of the calendar on desktop.
- **Top summary unresolved count:** When nonzero, match the Timeline Needs decision count by counting only active unresolved occurrences before the current local day, regardless of the selected Behaviors range. Hide the top summary Unresolved row when the count is zero. Current-day unresolved occurrences may still show in heatmap cells and behavior date review rows, but per-behavior and category count grids do not render an Unresolved row.
- **Completion-intensity cells:** Overall calendar cells mix Monolith Blue with Bleached Newsprint by completed share: 100% uses full Monolith Blue, 50% uses a half-strength blue, and lower shares keep fading toward the background.
- **Not completed cells:** Overall calendar cells with resolved occurrences but no completions use Rust Signal rather than the neutral completion-intensity scale.
- **Unresolved cells:** Cold Surface or background with a neutral border. Do not imply failure.
- **Grid:** Square cells, consistent gutters, no gradients, no rounded cells. Calendar cells show a compact date label on hover or keyboard focus while keeping the longer accessible label available.
- **Behavior rows:** Behavior counts use unboxed divider rows with title, adherence label, Completed and Not Completed label/value counts, MM-DD-YY tracking-since text, and a seven-column heatmap sized to the row. Values align left in the shared field column with equal vertical spacing. Category, schedule, recurrence, reminders, and description sit inside Details and Settings. Full completion is filled blue; partial states use factual diagonal marks; not completed states use Rust Signal without an added diagonal mark. The behavior tracking start date is marked with a dotted cell border when it falls inside the selected range. Non-empty behavior calendar cells open that behavior's Behavior date review area.
- **Behavior day review:** The selected day appears inside the selected behavior row as a quiet Cold Surface expansion headed by Behavior date. Do not use internal divider lines that compete with the behavior-row separators. Each occurrence uses plain text rows for Time of behavior, Status, and Note; empty notes display italic No note. Status and note correction controls stay hidden behind a Review disclosure by default. Inside the disclosure, Change status and the Completed / Not Completed actions sit on the same row when space allows, followed by the inline Note form. Do not render an empty inspection panel when there are no occurrences on the selected behavior day.

### Export Panels

- **Export structure:** Options, downloads, and AI summary stack as separate sections. Keep range, selected-range scope counts, archived-behavior controls, and note controls at the top so every download reflects the same selected state. Export and Import are super-sections one tier below the page title: `text-2xl` headers, 48px apart, with 32px to their subsections; subsection headings are `text-xl` with 16px to their content, per the Spacing Scale and Heading Ladder.
- **Range controls:** Use underlined text-action choices for 7 days, 30 days, 90 days, and All time. Selected range uses Ink Black text. Inactive range choices use Readable Ash. The archived-behavior option uses a plain checkbox.
- **Download actions:** JSONL, CSV, full JSON backup, and BehaviorLog bundle use compact two-column label/action rows with the file extension next to the format name. Avoid explanatory card grids, icons, or restore/import promises in the UI.
- **AI summary:** Show a Markdown preview in a Cold Surface preformatted panel, with Copy summary and Download .md controls above it. The preview uses resolver-produced content; the UI does not calculate adherence or format export rows.
- **Prompt library:** Place Analysis prompts after the AI summary as unboxed native disclosure rows with inner `divide-y` separators at the 16px airy tier. Expanded prompts use a bordered Cold Surface preformatted panel matching the AI summary preview and an underlined Copy prompt text action.
- **BehaviorLog import:** Keep import preview sparse and ledger-like. Show privacy warnings, imported-note record counts, inline occurrence-note fill counts, and intervention preview counts before apply. High or restricted note sensitivity requires a separate checkbox acknowledgement. Do not add a generalized note browser here.

### Settings Panels

- **Page structure:** Settings is a single-column stack of unboxed sections separated by one 1px Ash Line divider between neighbors, following the One-Line-Per-Boundary Rule. Sections draw no perimeter or `border-y` of their own, and no side-by-side section grid. Section content keeps a readable measure: prose within roughly 65ch and form controls at a compact single-column width instead of multi-column desktop sprawl.
- **Profile:** Quiet label/value rows only.
- **Timezone:** One native select of IANA timezones whose selected value is the saved timezone; the select is the single source for "current timezone", with no separate current or browser-detected value rows and no visible label repeating the section heading. When the browser-detected timezone differs from the saved one, show one quiet muted line, "Detected {timezone}", with an inline secondary Use detected timezone text action that updates the select; when they match or detection is unavailable, show nothing. Saving stays an explicit primary Save timezone action, with helper copy explaining the schedule impact. If the browser cannot enumerate timezones, fall back to a plain IANA text field.
- **Notification permission:** One section with a Browser notifications status value plus a single primary text action. Permission prompts must be triggered by the user, not on page load.
- **Unavailable states:** Use factual muted text for denied, unsupported, or unconfigured browser push. Rust Signal is only for an actual save error.
- **Inline results:** Save confirmations and errors are plain text lines under their form. They do not carry their own divider.
- **Trust and legal:** Link to Terms, Privacy, and Trust from Settings using quiet ledger rows separated by inner dividers only; the list draws no outer border. The list sizes to its content so row dividers span only the length of the text, not the full section width. Each row is a full-row link and hovers with the standard inactive-row treatment: Cold Surface fill across the row with the muted summary shifting to Ink Black; keyboard focus uses the global focus outline.
- **Account deletion:** Use a flat single-column Settings section with export reminder copy, a checkbox acknowledgement, typed confirmation, and a Rust Signal destructive text action, with no internal horizontal rules. This is the only destructive account action in the public-launch web app baseline.

### Public Account Information

- **Routes:** `/terms`, `/privacy`, and `/trust` use the same square, flat product vocabulary as the authenticated app.
- **Layout:** Keep public legal/trust pages narrow, text-first, and divided by quiet rules. Use plain navigation between the three pages and simple Sign in / Open settings actions. They follow the Spacing Scale one step airier: 24px section padding in the divided stack, the standard 24px title→rule and 12px title→description, and 16px heading→content.
- **Copy:** Keep legal/trust copy factual. Explain account isolation, manual statuses, portability, reminders, and deletion without marketing claims or motivational language.

### Astro Marketing Site

- **Routes:** The marketing site lives under `apps/marketing` and implements
  `/`, `/standard`, `/cadence`, `/examples`, `/docs`, and `/about`.
- **Layout:** Use full-width page sections separated by 1px Ash Line rules.
  Keep hero text unboxed and leave the next section visible in the first
  viewport. Apply the shared marketing page-gutter tokens to section, header,
  and footer bodies before max-width clamping so desktop pages keep breathing
  room at viewport edges. The homepage hero may use a two-column copy/media
  composition when the media is a direct product capture, not a decorative
  card.
- **Heading scale:** Marketing H2 headings sit one step below the prior display
  scale so secondary sections do not compete with the homepage H1.
- **Brand relationship:** The homepage leads with Cadence as the product and
  site brand. BehaviorLog is explained as the open bundle standard and
  portability layer Cadence writes and reads. Keep the existing Cadence mark,
  and use only the Cadence logo and name in the marketing header. Do not use a
  combined BehaviorLog/Cadence lockup in top navigation. Header navigation
  links use the underlined text-action convention and no bottom divider. The
  launch header shows only Cadence and BehaviorLog route links plus Log in.
  About is footer-only, and Docs/Examples stay available by direct link and
  machine-readable outputs rather than top navigation.
- **Captures:** Product visuals are sanitized static captures of the Timeline
  and BehaviorLog bundle file set. They reuse real Cadence row language:
  scheduled time, behavior title, Completed, Not Completed, Needs decision,
  Note, and status-history authority. They do not render real account data.
  The homepage hero layers the trajectory-horse backplate with sanitized Timeline and behavior-row captures positioned in CSS. The composition must stay quiet, keep the captures readable, and fit the available lane without colliding with the headline or clipping offscreen at any viewport width.
- **CTAs:** The launch marketing site uses filled-button CTAs rather than the app's underlined text actions: a Monolith Blue filled primary (Try Cadence), a 1px-bordered secondary, and underlined ghost links for tertiary actions. The header Log in renders as a compact bordered button. This is a deliberate marketing-register exception; the authenticated app keeps its underlined text-action vocabulary.
- **Docs route:** `/docs` is agent-first and developer-familiar. It links to
  Markdown mirrors, `llms.txt`, `llms-full.txt`, `/data/route-manifest.json`,
  sitemap, robots, and the example bundle. Use tables for machine file indexes
  rather than decorative cards. On narrow screens, tables wrap inside the page
  width rather than causing document-level horizontal scroll. Future docs
  should grow toward Guides, Reference, Examples, Agent policy, and Schema
  history without dropping machine-readable mirrors.
- **SEO and agent readability:** Pages include canonical URLs, page-specific
  descriptions, Open Graph/Twitter metadata, JSON-LD, one H1, semantic
  landmarks, and Markdown alternate links.
- **Marketing boundaries:** No marketing cookies, analytics scripts,
  client-side tracking, desktop/mobile teaser, billing teaser, or AI coaching
  copy appears in the launch site.
- **Marketing register exceptions:** The marketing site shares the Cadence palette and IBM Plex Sans, and may additionally use: border radii (12px cards, 8px controls, pill chips), a sticky header with backdrop blur, font weights 400 to 600, a subtle two-hue page gradient, and IBM Plex Mono strictly for file names, file trees, and code samples. Decorative shadows remain banned on both surfaces. The square, flat, all-400, shadow-free rules elsewhere in this document bind the product app, not the marketing site.

## 6. Do's and Don'ts

### Do:

- **Do** use IBM Plex Sans everywhere.
- **Do** use 0px border radius throughout the app (the marketing site follows the Marketing register exceptions).
- **Do** prefer single quiet 1px Ash Line dividers over full perimeter boxes.
- **Do** keep the Timeline as the primary screen and `/timeline` as the default authenticated route.
- **Do** keep categories hidden from primary navigation and Timeline filtering.
- **Do** make mobile layouts stack vertically with comfortable 24px spacing.
- **Do** use Timeline Row Hover for active navigation, Monolith Blue for selected states and completed cells, Ink Black for primary actions, and Readable Ash for secondary actions.
- **Do** use Rust Signal for explicit Not Completed decisions and true caution states.

### Don't:

- **Don't** use dense dashboards.
- **Don't** use gamified streaks, rewards, badges, or scorekeeping.
- **Don't** use social habit-tracking language.
- **Don't** use motivational coaching copy.
- **Don't** use medical dose, supply, or refill tracking patterns.
- **Don't** use quantified-self analytics sprawl.
- **Don't** use multi-user SaaS administration patterns.
- **Don't** use calendar-sync or task-manager complexity.
- **Don't** use offline or PWA mutation flows in v1.
- **Don't** add rounded cards, soft shadows, blurred panels, gradients, glass effects, or decorative stripes.
- **Don't** use missed, failed, or punitive language for Not Completed.
- **Don't** copy the reference screen content, sample habits, route labels, or flows.
