---
name: Cadence Tracker
description: A sparse, square, mono-forward visual system for a private behavior tracker.
colors:
  primary: "#406C88"
  background: "#FDFCFB"
  surface: "#F4F5F6"
  text: "#0A0B0C"
  muted: "#7A848D"
  muted-readable: "#626C75"
  accent: "#C84A31"
typography:
  display:
    fontFamily: "Courier, Courier New, monospace"
    fontSize: "48px"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "0px"
  headline:
    fontFamily: "Courier, Courier New, monospace"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0px"
  title:
    fontFamily: "Courier, Courier New, monospace"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0px"
  body:
    fontFamily: "Courier, Courier New, monospace"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0px"
  label:
    fontFamily: "Courier, Courier New, monospace"
    fontSize: "14px"
    fontWeight: 700
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

The interface is a private field log: square, calm, legible, and exact. It uses Courier type, heavy rules, broad whitespace, muted blue action blocks, and compact form controls across the implemented auth shell, Behaviors screen, and Timeline screen.

This is product UI, not a poster. The look can be distinctive, but every screen must still work quickly for marking occurrences, reading Needs decision, editing behaviors, checking basic analytics, and exporting records.

**Key Characteristics:**

- Courier-only typography.
- Bleached off-white background with stark black borders.
- Muted blue used for active navigation, selected recurrence presets, completed cells, and primary actions.
- Rust red used rarely for warnings, destructive actions, or errors.
- Square corners, no shadows, no blur, no rounded cards.
- Spacious desktop rhythm with compact, stackable mobile layouts.

## 2. Colors

The palette is almost monochrome: black ink, bleached paper, subtle gray, and one muted blue. Red is a rare warning signal.

### Primary

- **Monolith Blue**: Muted blue for active navigation, primary buttons, selected states, hover fills, key dividers, and completed heatmap cells.

### Secondary

- **Rust Signal**: Warning and destructive color only. Do not use it for ordinary Not Completed buttons by default; Not Completed should feel factual, not punitive.

### Neutral

- **Bleached Newsprint**: Main app background.
- **Cold Surface**: Secondary panels, empty states, skeleton loaders, inline note areas, and inactive heatmap cells.
- **Ink Black**: Main text, icons, heavy borders, and hard dividers.
- **Ash Line**: Thin borders, non-essential metadata, inactive decoration, and quiet separators.
- **Readable Ash**: Essential secondary text where the lighter muted gray would not meet contrast.

### Named Rules

**The Four-Color Rule.** Most screens should read as black, background, blue, and surface gray. Rust appears only when the user needs caution.

**The Contrast Rule.** Use Ash Line for borders and decoration. Use Readable Ash or Ink Black for text that the user must read.

## 3. Typography

**Display Font:** Courier, Courier New, monospace
**Body Font:** Courier, Courier New, monospace
**Label/Mono Font:** Courier, Courier New, monospace

**Character:** The type should feel mechanical and logged, not nostalgic or cute. Use weight, spacing, borders, and layout to create hierarchy instead of introducing another font.

### Hierarchy

- **Display** (700, 48px, 1.08): Page titles and prominent dates on larger screens only.
- **Headline** (700, 32px, 1.15): Section titles such as Timeline, Behaviors, Analytics, Export, and Settings.
- **Title** (700, 20px, 1.25): Behavior titles, occurrence titles, card headings, and form section titles.
- **Body** (400, 16px, 1.5): Notes, descriptions, recurrence summaries, and normal explanatory text. Keep prose to 65-75ch.
- **Label** (700, 14px, 1px tracking): Navigation labels, button labels, status pills, table labels, and compact metadata.

### Named Rules

**The Mono-Only Rule.** Do not introduce sans, serif, display, or script fonts.

**The No-Cramped-Type Rule.** Letter spacing is never negative. The reference aesthetic comes from Courier weight and square layout, not squeezed letters.

**The Uppercase Limit Rule.** Headings, short labels, and buttons may use uppercase. Body copy, notes, descriptions, and helper text must use normal sentence case.

## 4. Elevation

This system is flat by default. Depth is created with borders, spacing, surface color, and full filled states, not shadows.

### Named Rules

**The No-Shadow Rule.** Do not use drop shadows, glass effects, blurred panels, or soft floating cards.

**The Border-As-Structure Rule.** Use 2px Ink Black borders for primary containers and 1px Ash Line borders for secondary dividers. Borders should describe structure, not decorate every pixel.

## 5. Components

### Buttons

- **Shape:** Square corners (0px).
- **Primary:** Monolith Blue fill, Bleached Newsprint text, 2px Ink Black border, Label typography, and 12px 20px padding.
- **Secondary:** Bleached Newsprint fill, Ink Black text, 2px Ink Black border, same padding.
- **Destructive:** Rust Signal fill only for destructive or risky actions. Not Completed is not destructive by default.
- **Hover / Focus:** Hover may invert or fill with Monolith Blue. Focus must use a visible 2px outline with offset.

### Chips

- **Style:** Square, compact labels with 1px border.
- **State:** Selected chips use Monolith Blue fill with Bleached Newsprint text. Unselected chips stay background with Ink Black text.

### Cards / Containers

- **Corner Style:** Square corners (0px).
- **Background:** Bleached Newsprint for normal rows; Cold Surface for empty states, expanded details, and low-emphasis panels.
- **Shadow Strategy:** No shadows.
- **Border:** 2px Ink Black for occurrence rows, behavior rows, and important panels. Use 1px Ash Line for internal dividers.
- **Internal Padding:** 20px for behavior rows, 24px for ordinary rows, 64px for major page sections on desktop, 24px or less on mobile.

### Inputs / Fields

- **Style:** Bleached Newsprint background, 2px Ink Black border, square corners, Courier body text, and 8px 12px padding.
- **Focus:** Keep the square geometry and add a visible outline or border shift.
- **Error / Disabled:** Errors use Rust Signal text or border. Disabled states use Cold Surface and Readable Ash.

### Behavior Management

- **Form layout:** Full-width page section with 2px Ink Black border, stacked field groups, and a two-column desktop rhythm that collapses to one column on mobile.
- **Recurrence presets:** Segmented radio labels use Monolith Blue fill only for the selected preset. Weekday choices use square bordered checkbox chips.
- **Behavior cards:** Active and archived records use flat 2px bordered rows, 20px padding, visible schedule/reminder metadata, and inline disclosure for editing.
- **Archive action:** Archive uses a factual button treatment with Rust Signal only on hover. Archived records stay visible with a neutral square label.

### Navigation

- **Desktop:** Retractable sidebar with hard dividers and compact mono labels. Active route uses Monolith Blue fill.
- **Mobile:** Sidebar can collapse into a top or drawer-like navigation, but it must keep the same square buttons, borders, and labels.
- **Routes:** Use the documented app screens: Timeline, Behaviors, Analytics, Export, Settings. Do not copy placeholder labels from the reference screens.

### Timeline Rows

- **Timeline structure:** Needs decision is a Cold Surface section above the forward timeline. The current day is the first forward section and uses the strongest date treatment. Future days stack as bordered sections, including explicit empty states.
- **Collapsed unresolved:** Scheduled time, status chip, behavior title, Completed button, and Not Completed button. Primary status actions are visible for Needs decision and current-day unresolved rows.
- **Expanded details:** Native disclosure reveals description, category, schedule summary, and note. Category and description remain hidden until expanded.
- **Resolved:** Keep the row visible with a distinct state. Hide primary action buttons and show Completed or Not Completed plainly.
- **Needs decision:** Highlight with Cold Surface plus heavy borders, never red error styling. Do not write or imply a stored Needs decision status.

### Analytics Heatmaps

- **Done cells:** Monolith Blue fill with Ink Black cell borders.
- **Not done cells:** Background fill with Ink Black border and a simple diagonal mark if useful.
- **Unresolved cells:** Cold Surface or background with a neutral border. Do not imply failure.
- **Grid:** Square cells, consistent gutters, no gradients, no rounded cells.

## 6. Do's and Don'ts

### Do:

- **Do** use Courier, Courier New, monospace everywhere.
- **Do** use 0px border radius throughout the app.
- **Do** use 2px Ink Black borders for primary structure.
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
