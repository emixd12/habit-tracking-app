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

The interface is a private field log and public reference surface: square, calm, legible, and exact. It uses IBM Plex Sans type, quiet rules, broad whitespace, black underlined primary actions, compact form controls, small heatmap cells, and flat product captures across the implemented auth shell, Behaviors screen, Timeline screen, Analytics screen, Export screen, Settings screen, and Astro marketing site.

This is product UI, not a poster. The look can be distinctive, but every screen must still work quickly for marking occurrences, reading Needs decision, editing behaviors, checking basic analytics, and exporting records.

**Key Characteristics:**

- IBM Plex Sans-only typography.
- Bleached off-white background with quiet ash dividers.
- Muted blue used for selected recurrence presets, completed cells, and completed Timeline state.
- Pale timeline blue used for the current navigation route state.
- Rust red used for explicit Not Completed decisions and rare caution states.
- Square corners, no shadows, no blur, no rounded cards.
- Spacious desktop rhythm with compact, stackable mobile layouts.
- Public marketing pages keep the same square ledger vocabulary while giving
  BehaviorLog the first narrative position and Cadence the main product object.

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
- **Headline** (400, 24px, 1.25): Section titles such as Timeline, Behaviors, Analytics, Export, and Settings.
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

## 5. Components

### Buttons

- **Primitive:** Text on a transparent background with a thin underline. This is the default action/link vocabulary in the design-system harness and for lightweight product actions.
- **Primary:** Ink Black text, underline, Label typography, and no perimeter box.
- **Secondary:** Readable Ash text, underline, Label typography, and no perimeter box.
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
- **Internal Padding:** 20px for behavior rows, 10-12px for compact Timeline occurrence rows, 64px for major page sections on desktop, 24px or less on mobile.

### Inputs / Fields

- **Style:** Bleached Newsprint background, 1px Ash Line border, square corners, IBM Plex Sans body text, and 8px 12px padding.
- **Focus:** Keep the square geometry and add a visible outline.
- **Error / Disabled:** Errors use Rust Signal text. Disabled states use Cold Surface and Readable Ash.

### Behavior Management

- **Form layout:** Full-width page section without an extra outer card border or outer padding. Use stacked field groups, quiet inner dividers, and a two-column desktop rhythm that collapses to one column on mobile.
- **Scheduled time:** Show only the scheduled-time control in the Behavior form. Timezone is owned by Settings and should not appear as a separate create-form panel.
- **Recurrence section:** Render as an unframed form section with a plain section heading, segmented radio presets, and smaller muted subsection labels such as Every, On, and Day.
- **Recurrence presets:** Segmented radio labels use Monolith Blue fill only for the selected preset. Weekday choices use square bordered checkbox chips.
- **Reminder section:** Render as an unframed form section matching Recurrence, with a plain section heading, bordered checkbox controls, and smaller muted subsection labels such as Reminder offset.
- **Create behavior:** Keep the creation form available from the Behaviors page without making existing behavior records secondary. When records already exist, use a simple native disclosure; when no records exist, the disclosure may open by default.
- **Behavior records:** Active and archived records are unboxed list rows separated by a single 1px Ash Line divider between adjacent records. They keep 20px padding, visible schedule/reminder metadata, a labeled Notes block when description text exists, and lazy-mounted inline disclosure for editing. The Notes block has no divider lines immediately above or below it. Create and edit forms use real field/control borders only; schedule slots use quiet row dividers instead of perimeter boxes.
- **Archive and restore actions:** Archive uses a factual Rust Signal underlined action. Archived records stay visible with a neutral square label and a factual Restore action using the primary text-action treatment.

### Navigation

- **Desktop:** Fixed retractable sidebar with quiet dividers and compact labels. Expanded width is 256px and collapsed width is 64px. The main content uses matching large-breakpoint left padding. Header, navigation, and footer account rows share a fixed 64px icon/avatar column so collapsed and expanded icon positions match. The desktop sidebar header has no bottom divider. Active route uses Timeline Row Hover fill with Ink Black text. Inactive route hover uses Cold Surface. Primary navigation rows do not have gaps between them. In collapsed state, active and hover fills apply only to the icon cell, not the full row.
- **Sidebar motion:** Width, brand label opacity, and nav label opacity transition over 200ms. Labels remain in the DOM, collapse visually to `w-0`, and stay `whitespace-nowrap` so text never wraps during rail transitions.
- **Mobile:** Do not use the collapsed rail under 1024px. Use a sticky 64px top header that opens a 60vw left drawer. The drawer keeps the same square navigation vocabulary and its header has no bottom divider. The drawer traps focus while open, locks body scroll, closes from backdrop or Escape, supports edge swipe open from the first 20px of the viewport, and supports left swipe close. The drawer may use a narrow `shadow-lg` only to separate it from the faded backdrop.
- **Routes:** Use the documented app screens: Timeline, Behaviors, Analytics, Export, Settings. Do not copy placeholder labels from the reference screens.

### First-Run Setup

- **Placement:** Timeline may render a dismissible fixed setup pop-up only while required public-launch setup items remain incomplete. It must not take space above the feed. Once the user dismisses it in the current browser, or behavior/notification/timezone setup is complete, the Timeline returns to the normal feed-first rule.
- **Structure:** Use a non-modal pop-up with a quiet header, Skip setup control, and divider-separated rows. Do not use an inline band, wizard, modal takeover, progress meter, reward language, or motivational copy.
- **Rows:** Create first behavior, Browser reminders, Timezone, and Import existing records. Each row uses a small icon, a factual status label, and an underlined text link into existing controls: `/behaviors#create-behavior`, `/settings#notifications`, `/settings#timezone`, and `/export#behaviorlog-import`.
- **State language:** Use direct labels such as Start here, Done, Not enabled, Blocked, Unavailable, Confirmed, Review, Started, and Optional. Import is optional and must not block setup completion.
- **Permission behavior:** The setup pop-up reads browser support and permission state, but it never requests notification permission on page load.

### Timeline Rows

- **Timeline structure:** The current day is the first forward section and uses the strongest date treatment. Do not show a visible Timeline page title above the feed. Day transitions use the date header plus a thin divider, not boxed day sections. Needs decision is reached from a fixed lower-right button on desktop and a full-width lower safe-area button on mobile; it opens a modal rather than appearing as an inline Timeline section.
- **Collapsed unresolved:** Scheduled time as plain text, behavior title, Completed text-link action, and Not Completed text-link action. Rows are compact and unboxed, with collapsed time, title, and action text vertically centered within the row; do not draw a perimeter border around each behavior row. On mobile, the time and title sit first, then unresolved status actions sit in their own full-width touch row before expanded details. Primary status actions are visible for Needs decision rows and current-day unresolved rows. Preset time ranges show only their short label, such as Morning or Evening, in collapsed rows.
- **Timeline status actions:** Render Completed and Not Completed as inline underlined text-link controls with the check and x icons retained. Do not use boxed, filled, or outlined button chrome for these row-level status actions. Keep status action underlines consistently thin; do not use underline thickness to indicate that a row is already Not Completed. Mobile status and Save note actions should have at least a 44px tap target. Hover-capable devices and keyboard focus may add non-reflowing text emphasis as a targeted exception to the base no-bold type experiment, but should not change the action color or move adjacent actions.
- **Expanded details:** Native disclosure reveals description, category, schedule summary, and note directly on the row surface, without a grey panel, enclosing border, boxed card treatment, chevron, or separate disclosure icon. While open, the whole occurrence row holds the same blue background used by that row's hover state. The Note textarea keeps its field border; Save note uses the same underlined text-action vocabulary as Completed and Not Completed.
- **Resolved:** Keep resolved rows visible with distinct states. Completed rows hide primary status actions and use a full Monolith Blue fill instead of a separate status chip. Not Completed rows use the same resolved-row structure with Rust Signal fill, Bleached Newsprint text, and a collapsed Not Completed label; correction is available from the expanded row.
- **Completion feedback:** A successful user-initiated change into Completed may play one short chime. Treat it as state feedback, not a reward loop: no voice, no alarm tone, no repeat sound, and no sound for Not Completed or page load.
- **Needs decision:** The floating button shows the unresolved count to decide and uses Monolith Blue when the count is greater than zero. Keep the count and label on one continuous button surface without an internal divider. On mobile, the button spans the lower safe-area width and the modal becomes a full-height sheet with the same flat row vocabulary. On desktop, the modal uses a flat bordered panel. The open modal has no visible global Needs decision title, global count, Prior unresolved eyebrow, or reserved header row. Pin the close control over the top-right corner and let the first white date group start at the top of a scroll area with equal left and right modal gutters; only the date header text row may reserve space for the close control. Each date group shows the date with the per-date count left to decide underneath. Highlight prior unresolved rows with Cold Surface and thin structural lines, never red error styling. Rows decided from the modal can remain in their original prior-day group through the current local day; Completed retained rows use the full completed treatment, and Not Completed retained rows use the Rust Signal treatment with the same resolved-row structure. Do not write or imply a stored Needs decision status.

### Analytics Heatmaps

- **Analytics structure:** Overall adherence sits first with the active range selector beside it, and the overall calendar lives inside that same area. Analytics sections are unboxed report bands separated by single horizontal dividers where needed, not perimeter panel borders.
- **Legend disclosure:** The overall calendar legend stays hidden behind a simple See Legend disclosure by default.
- **Top summary unresolved count:** Match the Timeline Needs decision count by counting only active unresolved occurrences before the current local day, regardless of the selected Analytics range. Current-day unresolved occurrences may still show in heatmap and detail counts.
- **Completion-intensity cells:** Overall calendar cells mix Monolith Blue with Bleached Newsprint by completed share: 100% uses full Monolith Blue, 50% uses a half-strength blue, and lower shares keep fading toward the background.
- **Not completed cells:** Overall calendar cells with resolved occurrences but no completions use Rust Signal rather than the neutral completion-intensity scale.
- **Unresolved cells:** Cold Surface or background with a neutral border. Do not imply failure.
- **Grid:** Square cells, consistent gutters, no gradients, no rounded cells. Calendar cells show a compact date label on hover or keyboard focus while keeping the longer accessible label available.
- **Behavior rows:** Behavior counts use unboxed divider rows with title, category metadata text, adherence label, tracking-since text, vertical label/value counts, and a seven-column heatmap sized to the row. Full completion is filled blue; partial states use factual diagonal marks; not completed states use Rust Signal. The behavior tracking start date is marked in the heatmap when it falls inside the selected range. Non-empty behavior calendar cells open that behavior's Behavior date review area.
- **Behavior day review:** The selected day appears inside the selected behavior row as a quiet Cold Surface expansion headed by Behavior date. Do not use internal divider lines that compete with the behavior-row separators. Each occurrence uses plain text rows for Time of behavior, Status, and Note; empty notes display italic No note. Status and note correction controls stay hidden behind a Review disclosure by default. Inside the disclosure, Change status and the Completed / Not Completed actions sit on the same row when space allows, followed by the inline Note form. Do not render an empty inspection panel when there are no occurrences on the selected behavior day.

### Export Panels

- **Export structure:** Options, current export counts, downloads, and AI summary stack as separate sections. Keep range and archived-behavior controls at the top so every download reflects the same selected state.
- **Range controls:** Use square segmented radio choices for 7 days, 30 days, 90 days, and All time. Selected range uses Monolith Blue fill. The archived-behavior option uses a plain checkbox.
- **Download actions:** JSONL, CSV, and full JSON backup use divider-separated underlined text links with a download icon and file extension. Avoid explanatory card grids or restore/import promises in the UI.
- **AI summary:** Show a Markdown preview in a Cold Surface preformatted panel, with Copy summary and Download .md controls above it. The preview uses resolver-produced content; the UI does not calculate adherence or format export rows.
- **BehaviorLog import:** Keep import preview sparse and ledger-like. Show privacy warnings, imported-note record counts, inline occurrence-note fill counts, and intervention preview counts before apply. High or restricted note sensitivity requires a separate checkbox acknowledgement. Do not add a generalized note browser here.

### Settings Panels

- **Profile and timezone:** Use divider-based sections with label/value rows. The timezone panel shows current and browser-detected values, a plain IANA timezone field, a secondary Use detected timezone action, and a primary Save timezone action. Keep values readable and avoid explanatory prose unless the state needs it.
- **Notification permission:** Use one divider-based section with Permission and Browser push values plus a single primary text action. Permission prompts must be triggered by the user, not on page load.
- **Unavailable states:** Use factual muted text for denied, unsupported, or unconfigured browser push. Rust Signal is only for an actual save error.
- **Trust and legal:** Link to Terms, Privacy, and Trust from Settings using quiet ledger rows. These pages are public account-information routes, not marketing pages.
- **Account deletion:** Use a flat Settings section with export reminder copy, a checkbox acknowledgement, typed confirmation, and a Rust Signal destructive text action. This is the only destructive account action in the public-launch web app baseline.

### Public Account Information

- **Routes:** `/terms`, `/privacy`, and `/trust` use the same square, flat product vocabulary as the authenticated app.
- **Layout:** Keep public legal/trust pages narrow, text-first, and divided by quiet rules. Use plain navigation between the three pages and simple Sign in / Open settings actions.
- **Copy:** Keep legal/trust copy factual. Explain account isolation, manual statuses, portability, reminders, and deletion without marketing claims or motivational language.

### Astro Marketing Site

- **Routes:** The marketing site lives under `apps/marketing` and implements
  `/`, `/standard`, `/cadence`, `/examples`, `/docs`, and `/about`.
- **Layout:** Use full-width page sections separated by 1px Ash Line rules.
  Keep hero text unboxed and leave the next section visible in the first
  viewport. Use two-column content grids only after the hero.
- **Brand relationship:** The homepage leads with BehaviorLog as the standard.
  Cadence is the demonstration product and main brand object. Keep the existing
  Cadence mark and pair it with a quieter BehaviorLog companion mark built from
  the same square ledger cells and Ash Line stroke.
- **Captures:** Product visuals are sanitized static captures of the Timeline
  and BehaviorLog bundle file set. They reuse real Cadence row language:
  scheduled time, behavior title, Completed, Not Completed, Needs decision,
  Note, and status-history authority. They do not render real account data.
  In the homepage hero, the capture must fit its available lane without
  colliding with the headline or clipping offscreen.
- **CTAs:** Use the same underlined text-action vocabulary for Try Cadence, Read
  the Standard, Download Example Bundle, and View on GitHub. Primary actions use
  Ink Black. Secondary actions use Readable Ash.
- **Docs route:** `/docs` is agent-first. It links to Markdown mirrors,
  `llms.txt`, `llms-full.txt`, `/data/route-manifest.json`, sitemap, robots,
  and the example bundle. Use tables for machine file indexes rather than
  decorative cards. On narrow screens, tables wrap inside the page width
  rather than causing document-level horizontal scroll.
- **SEO and agent readability:** Pages include canonical URLs, page-specific
  descriptions, Open Graph/Twitter metadata, JSON-LD, one H1, semantic
  landmarks, and Markdown alternate links.
- **Marketing boundaries:** No marketing cookies, analytics scripts,
  client-side tracking, desktop/mobile teaser, billing teaser, or AI coaching
  copy appears in the launch site.

## 6. Do's and Don'ts

### Do:

- **Do** use IBM Plex Sans everywhere.
- **Do** use 0px border radius throughout the app.
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
