---
name: Cadence Tracker
description: A sparse, square, IBM Plex Sans-forward visual system for a private behavior tracker.
colors:
  primary: "#3572b3"
  background: "#FDFCFB"
  surface: "#F4F5F6"
  text: "#0A0B0C"
  muted: "#7A848D"
  muted-readable: "#626C75"
  accent: "#C84A31"
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
  behavior-card:
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
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "12px"
---

# Design System: Cadence Tracker

## 1. Overview

**Creative North Star: "The Quiet Ledger"**

The interface is a private field log: square, calm, legible, and exact. It uses IBM Plex Sans type, quiet rules, broad whitespace, muted blue action blocks, compact form controls, and small heatmap cells across the implemented auth shell, Behaviors screen, Timeline screen, Analytics screen, Export screen, and Settings screen.

This is product UI, not a poster. The look can be distinctive, but every screen must still work quickly for marking occurrences, reading Needs decision, editing behaviors, checking basic analytics, and exporting records.

**Key Characteristics:**

- IBM Plex Sans-only typography.
- Bleached off-white background with quiet ash dividers.
- Muted blue used for active navigation, selected recurrence presets, completed cells, and primary actions.
- Rust red used rarely for warnings, destructive actions, or errors.
- Square corners, no shadows, no blur, no rounded cards.
- Spacious desktop rhythm with compact, stackable mobile layouts.

## 2. Colors

The palette is almost monochrome: black ink, bleached paper, subtle gray, and one muted blue. Red is a rare warning signal.

### Primary

- **Monolith Blue**: `#3572b3`, used for active navigation, primary buttons, selected states, hover fills, completed Timeline rows, and completed heatmap cells.

### Secondary

- **Rust Signal**: Warning and destructive color only. Do not use it for ordinary Not Completed buttons by default; Not Completed should feel factual, not punitive.

### Neutral

- **Bleached Newsprint**: Main app background.
- **Cold Surface**: Secondary panels, empty states, skeleton loaders, inline note areas, and inactive heatmap cells.
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
- **Border:** 1px Ash Line for occurrence rows, behavior rows, important panels, and internal dividers.
- **Internal Padding:** 20px for behavior rows, 24px for ordinary rows, 64px for major page sections on desktop, 24px or less on mobile.

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
- **Behavior cards:** Active and archived records use flat 1px Ash Line rows, 20px padding, visible schedule/reminder metadata, and lazy-mounted inline disclosure for editing.
- **Archive and restore actions:** Archive uses a factual button treatment with Rust Signal only on hover. Archived records stay visible with a neutral square label and a factual Restore action using the primary hover treatment.

### Navigation

- **Desktop:** Fixed retractable sidebar with quiet dividers and compact labels. Keep the expanded rail compact, around 256px, so product forms stay dominant. Active route uses Monolith Blue fill. The collapsed state is a very narrow icon rail, around 56px, with centered icons and no boxed borders around inactive navigation items.
- **Mobile:** Sidebar can collapse into a top or drawer-like navigation, but it must keep the same square buttons, borders, and labels.
- **Routes:** Use the documented app screens: Timeline, Behaviors, Analytics, Export, Settings. Do not copy placeholder labels from the reference screens.

### Timeline Rows

- **Timeline structure:** The current day is the first forward section and uses the strongest date treatment. Day transitions use the date header plus a thin divider, not boxed day sections. Needs decision is reached from a fixed lower-right button and opens a modal rather than appearing as an inline Timeline section.
- **Collapsed unresolved and Not Completed:** Scheduled time as plain text, behavior title, Completed button, and Not Completed button. Primary status actions are visible for Needs decision rows, current-day unresolved rows, and Not Completed rows.
- **Expanded details:** Native disclosure reveals description, category, schedule summary, and note. Category and description remain hidden until expanded.
- **Resolved:** Keep resolved rows visible with distinct states. Completed rows hide primary action buttons and use a full Monolith Blue fill instead of a separate status chip. Not Completed rows visually return to the original unresolved card treatment but show the Completed and Not Completed buttons, with Not Completed indicated as the current choice.
- **Completion feedback:** A successful user-initiated change into Completed may play one short chime. Treat it as state feedback, not a reward loop: no voice, no alarm tone, no repeat sound, and no sound for Not Completed or page load.
- **Needs decision:** The floating button shows the count to decide and uses Monolith Blue when the count is greater than zero. The modal uses a flat bordered panel, Cold Surface sections, and the same occurrence-row vocabulary as Timeline. Highlight prior unresolved rows with Cold Surface and thin structural lines, never red error styling. Do not write or imply a stored Needs decision status.

### Analytics Heatmaps

- **Analytics structure:** Overall adherence sits first in a single bordered section with the active range selector beside it. The overall calendar, selected-day Not Completed list, behavior counts, and category counts stack as separate page sections, not nested dashboards.
- **Done cells:** Monolith Blue fill with Ash Line cell borders.
- **Not done cells:** Background fill with Ash Line border and a simple diagonal mark if useful.
- **Unresolved cells:** Cold Surface or background with a neutral border. Do not imply failure.
- **Grid:** Square cells, consistent gutters, no gradients, no rounded cells.
- **Behavior rows:** Behavior counts use flat bordered rows with title, category chip, adherence label, counts, and a compact seven-column heatmap. Full completion is filled blue; partial and not completed states use factual diagonal marks.
- **Selected day:** Not Completed inspection uses the same occurrence-row vocabulary: scheduled time chip, category chip, title, and note when present.

### Export Panels

- **Export structure:** Options, current export counts, downloads, and AI summary stack as separate sections. Keep range and archived-behavior controls at the top so every download reflects the same selected state.
- **Range controls:** Use square segmented radio choices for 7 days, 30 days, 90 days, and All time. Selected range uses Monolith Blue fill. The archived-behavior option uses a plain checkbox.
- **Download actions:** JSONL, CSV, and full JSON backup use flat 1px Ash Line action rows with a download icon and file extension. Avoid explanatory card grids or restore/import promises in the UI.
- **AI summary:** Show a Markdown preview in a Cold Surface preformatted panel, with Copy summary and Download .md controls above it. The preview uses resolver-produced content; the UI does not calculate adherence or format export rows.

### Settings Panels

- **Profile and timezone:** Use compact 1px Ash Line panels with label/value rows. Keep values readable and avoid explanatory prose unless the state needs it.
- **Notification permission:** Use one 1px Ash Line panel with Permission and Browser push values plus a single primary action. Permission prompts must be triggered by the user, not on page load.
- **Unavailable states:** Use factual muted text for denied, unsupported, or unconfigured browser push. Rust Signal is only for an actual save error.

## 6. Do's and Don'ts

### Do:

- **Do** use IBM Plex Sans everywhere.
- **Do** use 0px border radius throughout the app.
- **Do** use the same quiet 1px Ash Line divider for Timeline structure, controls, panels, rows, inputs, overlays, and heatmap cells.
- **Do** keep the Timeline as the primary screen and `/timeline` as the default authenticated route.
- **Do** keep categories hidden from primary navigation and Timeline filtering.
- **Do** make mobile layouts stack vertically with comfortable 24px spacing.
- **Do** use Monolith Blue for active navigation, selected states, completed cells, and primary actions.
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
