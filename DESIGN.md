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
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "12px 20px"
  button-secondary:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "12px 20px"
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

The interface is a private field log and public reference surface: square, calm, legible, and exact. It uses IBM Plex Sans type, quiet rules, broad whitespace, muted blue action blocks, compact form controls, small heatmap cells, and flat product captures across the implemented auth shell, Behaviors screen, Timeline screen, Analytics screen, Export screen, Settings screen, and Astro marketing site.

This is product UI, not a poster. The look can be distinctive, but every screen must still work quickly for marking occurrences, reading Needs decision, editing behaviors, checking basic analytics, and exporting records.

**Key Characteristics:**

- IBM Plex Sans-only typography.
- Bleached off-white background with quiet ash dividers.
- Muted blue used for selected recurrence presets, completed cells, and primary actions.
- Pale timeline blue used for the current navigation route state.
- Rust red used rarely for warnings, destructive actions, or errors.
- Square corners, no shadows, no blur, no rounded cards.
- Spacious desktop rhythm with compact, stackable mobile layouts.
- Public marketing pages keep the same square ledger vocabulary while giving
  BehaviorLog the first narrative position and Cadence the main product object.

## 2. Colors

The palette is almost monochrome: black ink, bleached paper, subtle gray, and one muted blue. Red is a rare warning signal.

### Primary

- **Monolith Blue**: `#3572b3`, used for primary buttons, selected states, Timeline status links, hover fills, completed Timeline rows, and completed heatmap cells.
- **Timeline Row Hover**: `#eef6ff`, used for unresolved and Not Completed Timeline occurrence row hover and the current navigation route state.
- **Needs Decision Hover**: `#e8f2ff`, used for prior unresolved Needs decision occurrence row hover.
- **Completed Row Hover**: `#2f669f`, used for Completed Timeline occurrence row hover.

### Secondary

- **Rust Signal**: Warning and destructive color only. Do not use it for ordinary Not Completed status actions by default; Not Completed should feel factual, not punitive.

### Neutral

- **Bleached Newsprint**: Main app background.
- **Cold Surface**: Secondary panels, empty states, skeleton loaders, inline note areas, inactive heatmap cells, and inactive navigation hover.
- **Ink Black**: Main text, icons, and hard text hierarchy.
- **Ash Line**: The single border color for dividers, controls, panels, rows, inputs, and heatmap cells.
- **Readable Ash**: Essential secondary text where the lighter muted gray would not meet contrast.

### Named Rules

**The Four-Color Rule.** Most screens should read as black, background, blue, and surface gray. Rust appears only when the user needs caution.

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

**The Quiet Border Rule.** Use the same 1px Ash Line rule for all product borders. Dividers, controls, panels, rows, inputs, overlays, and heatmap cells share the quiet divider; hierarchy comes from fill, spacing, and typography rather than heavier border weight.

## 5. Components

### Buttons

- **Shape:** Square corners (0px).
- **Primary:** Monolith Blue fill, Bleached Newsprint text, 1px Ash Line border, Label typography, and 12px 20px padding.
- **Secondary:** Bleached Newsprint fill, Ink Black text, 1px Ash Line border, same padding.
- **Destructive:** Rust Signal fill only for destructive or risky actions. Not Completed is not destructive by default.
- **Hover / Focus:** Hover may invert or fill with Monolith Blue. Focus must use a visible 2px outline with offset.

### Chips

- **Style:** Square, compact labels with 1px border.
- **State:** Selected chips use Monolith Blue fill with Bleached Newsprint text. Unselected chips stay background with Ink Black text.

### Cards / Containers

- **Corner Style:** Square corners (0px).
- **Background:** Bleached Newsprint for normal rows; Cold Surface for empty states, expanded details, and low-emphasis panels.
- **Shadow Strategy:** No shadows.
- **Border:** 1px Ash Line for important panels, controls, and internal dividers. Behavior records and Timeline occurrence rows are unboxed list rows and do not use a perimeter border.
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
- **Archive and restore actions:** Archive uses a factual button treatment with Rust Signal only on hover. Archived records stay visible with a neutral square label and a factual Restore action using the primary hover treatment.

### Navigation

- **Desktop:** Fixed retractable sidebar with quiet dividers and compact labels. Expanded width is 256px and collapsed width is 64px. The main content uses matching large-breakpoint left padding. Header, navigation, and footer account rows share a fixed 64px icon/avatar column so collapsed and expanded icon positions match. The desktop sidebar header has no bottom divider. Active route uses Timeline Row Hover fill with Ink Black text. Inactive route hover uses Cold Surface. Primary navigation rows do not have gaps between them. In collapsed state, active and hover fills apply only to the icon cell, not the full row.
- **Sidebar motion:** Width, brand label opacity, and nav label opacity transition over 200ms. Labels remain in the DOM, collapse visually to `w-0`, and stay `whitespace-nowrap` so text never wraps during rail transitions.
- **Mobile:** Do not use the collapsed rail under 1024px. Use a sticky 64px top header that opens a 60vw left drawer. The drawer keeps the same square navigation vocabulary and its header has no bottom divider. The drawer traps focus while open, locks body scroll, closes from backdrop or Escape, supports edge swipe open from the first 20px of the viewport, and supports left swipe close. The drawer may use a narrow `shadow-lg` only to separate it from the faded backdrop.
- **Routes:** Use the documented app screens: Timeline, Behaviors, Analytics, Export, Settings. Do not copy placeholder labels from the reference screens.

### First-Run Setup

- **Placement:** Timeline may render a dismissible setup panel before the feed only while required public-launch setup items remain incomplete. Once the user dismisses it in the current browser, or behavior/notification/timezone setup is complete, the Timeline returns to the normal feed-first rule.
- **Structure:** Use one flat 1px Ash Line panel with a quiet header, Skip setup control, and divider-separated rows. Do not use a wizard, modal, progress meter, reward language, or motivational copy.
- **Rows:** Create first behavior, Browser reminders, Timezone, and Import existing records. Each row uses a small square icon cell, a factual status label, and a square action link into existing controls: `/behaviors#create-behavior`, `/settings#notifications`, `/settings#timezone`, and `/export#behaviorlog-import`.
- **State language:** Use direct labels such as Start here, Done, Not enabled, Blocked, Unavailable, Confirmed, Review, Started, and Optional. Import is optional and must not block setup completion.
- **Permission behavior:** The setup panel reads browser support and permission state, but it never requests notification permission on page load.

### Timeline Rows

- **Timeline structure:** The current day is the first forward section and uses the strongest date treatment. Do not show a visible Timeline page title above the feed. Day transitions use the date header plus a thin divider, not boxed day sections. Needs decision is reached from a fixed lower-right button on desktop and a full-width lower safe-area button on mobile; it opens a modal rather than appearing as an inline Timeline section.
- **Collapsed unresolved and Not Completed:** Scheduled time as plain text, behavior title, Completed text-link action, and Not Completed text-link action. Rows are compact and unboxed, with collapsed time, title, and action text vertically centered within the row; do not draw a perimeter border around each behavior row. On mobile, the time and title sit first, then status actions sit in their own full-width touch row before expanded details. Primary status actions are visible for Needs decision rows, current-day unresolved rows, and Not Completed rows. Preset time ranges show only their short label, such as Morning or Evening, in collapsed rows.
- **Timeline status actions:** Render Completed and Not Completed as inline underlined text-link controls with the check and x icons retained. Do not use boxed, filled, or outlined button chrome for these row-level status actions. Keep status action underlines consistently thin; do not use underline thickness to indicate that a row is already Not Completed. Mobile status and Save note actions should have at least a 44px tap target. Hover-capable devices and keyboard focus may add non-reflowing text emphasis as a targeted exception to the base no-bold type experiment, but should not change the action color or move adjacent actions.
- **Expanded details:** Native disclosure reveals description, category, schedule summary, and note directly on the row surface, without a grey panel, enclosing border, boxed card treatment, chevron, or separate disclosure icon. While open, the whole occurrence row holds the same blue background used by that row's hover state. The Note textarea keeps its field border; Save note uses the same underlined text-action vocabulary as Completed and Not Completed.
- **Resolved:** Keep resolved rows visible with distinct states. Completed rows hide primary status actions and use a full Monolith Blue fill instead of a separate status chip. Not Completed rows visually return to the original unresolved card treatment but show the Completed and Not Completed text-link actions without a separate current-choice cue.
- **Completion feedback:** A successful user-initiated change into Completed may play one short chime. Treat it as state feedback, not a reward loop: no voice, no alarm tone, no repeat sound, and no sound for Not Completed or page load.
- **Needs decision:** The floating button shows the unresolved count to decide and uses Monolith Blue when the count is greater than zero. Keep the count and label on one continuous button surface without an internal divider. On mobile, the button spans the lower safe-area width and the modal becomes a full-height sheet with the same flat row vocabulary. On desktop, the modal uses a flat bordered panel. Highlight prior unresolved rows with Cold Surface and thin structural lines, never red error styling. Rows decided from the modal can remain in their original prior-day group through the current local day; Completed retained rows use the full completed treatment, and Not Completed retained rows keep the normal status-action treatment. Do not write or imply a stored Needs decision status.

### Analytics Heatmaps

- **Analytics structure:** Overall adherence sits first with the active range selector beside it, and the overall calendar lives inside that same area. Analytics sections are unboxed report bands separated by single horizontal dividers where needed, not perimeter panel borders.
- **Legend disclosure:** The overall calendar legend stays hidden behind a simple See Legend disclosure by default.
- **Top summary unresolved count:** Match the Timeline Needs decision count by counting only active unresolved occurrences before the current local day, regardless of the selected Analytics range. Current-day unresolved occurrences may still show in heatmap and detail counts.
- **Completion-intensity cells:** Overall calendar cells mix Monolith Blue with Bleached Newsprint by completed share: 100% uses full Monolith Blue, 50% uses a half-strength blue, and lower shares keep fading toward the background.
- **Not completed cells:** Overall calendar cells with resolved occurrences but no completions use the background end of the completion-intensity scale, without a diagonal overlay.
- **Unresolved cells:** Cold Surface or background with a neutral border. Do not imply failure.
- **Grid:** Square cells, consistent gutters, no gradients, no rounded cells.
- **Behavior rows:** Behavior counts use unboxed divider rows with title, category chip, adherence label, tracking-since text, vertical label/value counts, and a compact seven-column heatmap. Full completion is filled blue; partial and not completed states use factual diagonal marks. The behavior tracking start date is marked in the heatmap when it falls inside the selected range. Non-empty behavior calendar cells open that behavior's Review day area.
- **Behavior day review:** Review day appears inside the selected behavior row and lists only that behavior's occurrences for the selected local date when rows exist. Rows use the same occurrence-row vocabulary: scheduled time chip, status label, note state, Completed and Not Completed text-link controls, and the inline Note form. Do not render an empty inspection panel when there are no occurrences on the selected behavior day.

### Export Panels

- **Export structure:** Options, current export counts, downloads, and AI summary stack as separate sections. Keep range and archived-behavior controls at the top so every download reflects the same selected state.
- **Range controls:** Use square segmented radio choices for 7 days, 30 days, 90 days, and All time. Selected range uses Monolith Blue fill. The archived-behavior option uses a plain checkbox.
- **Download actions:** JSONL, CSV, and full JSON backup use flat 1px Ash Line action rows with a download icon and file extension. Avoid explanatory card grids or restore/import promises in the UI.
- **AI summary:** Show a Markdown preview in a Cold Surface preformatted panel, with Copy summary and Download .md controls above it. The preview uses resolver-produced content; the UI does not calculate adherence or format export rows.
- **BehaviorLog import:** Keep import preview sparse and ledger-like. Show privacy warnings, imported-note record counts, inline occurrence-note fill counts, and intervention preview counts before apply. High or restricted note sensitivity requires a separate checkbox acknowledgement. Do not add a generalized note browser here.

### Settings Panels

- **Profile and timezone:** Use compact 1px Ash Line panels with label/value rows. The timezone panel shows current and browser-detected values, a plain IANA timezone field, a secondary Use detected timezone action, and a primary Save timezone action. Keep values readable and avoid explanatory prose unless the state needs it.
- **Notification permission:** Use one 1px Ash Line panel with Permission and Browser push values plus a single primary action. Permission prompts must be triggered by the user, not on page load.
- **Unavailable states:** Use factual muted text for denied, unsupported, or unconfigured browser push. Rust Signal is only for an actual save error.
- **Trust and legal:** Link to Terms, Privacy, and Trust from Settings using quiet ledger rows. These pages are public account-information routes, not marketing pages.
- **Account deletion:** Use a flat Settings section with export reminder copy, a checkbox acknowledgement, typed confirmation, and a Rust Signal destructive button. This is the only destructive account action in the public-launch web app baseline.

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
- **CTAs:** Use the same square button vocabulary for Try Cadence, Read the
  Standard, Download Example Bundle, and View on GitHub. Primary action uses
  Monolith Blue. Secondary actions stay background with Ash Line borders.
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
- **Do** use the same quiet 1px Ash Line divider for Timeline structure, controls, panels, rows, inputs, overlays, and heatmap cells.
- **Do** keep the Timeline as the primary screen and `/timeline` as the default authenticated route.
- **Do** keep categories hidden from primary navigation and Timeline filtering.
- **Do** make mobile layouts stack vertically with comfortable 24px spacing.
- **Do** use Timeline Row Hover for active navigation and Monolith Blue for selected states, completed cells, and primary actions.
- **Do** use Rust Signal only when the interface truly needs caution.

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
- **Don't** treat Not Completed as an error state.
- **Don't** copy the reference screen content, sample habits, route labels, or flows.
