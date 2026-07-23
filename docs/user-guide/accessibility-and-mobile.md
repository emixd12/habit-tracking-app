# Keyboard, zoom, focus, touch, and non-color operation

This guide collects the interaction patterns used throughout Cadence. The task
guides also include a **Keyboard and mobile** note beside each procedure so the
accessible operation stays connected to the task.

## Navigate by keyboard

**Before you start:** Use the browser's normal Tab and Shift+Tab navigation.
Enable a system screen reader or browser caret navigation if you normally use
either one.

- On the public marketing site, **Skip to content** is the first focusable link
  and moves directly to the main landmark.
- Activate links and buttons with Enter. Space also activates buttons and
  native disclosure summaries in common browsers.
- Native disclosures include **Create behavior**, **Details and Settings**,
  **Archived behaviors (n)**, Occurrence rows, **Review**, and each analysis
  prompt.
- Use arrow keys in selects and radio groups and Space on checkboxes.
- In the mobile drawer and **Needs decision**, Tab and Shift+Tab stay inside
  the open overlay. Escape closes it and restores focus when the page remains.
- A visible focus ring identifies the focused control. If you cannot see it,
  check whether custom browser or operating-system contrast settings are
  overriding page styles.

**Persistent effect:** Moving focus and opening a disclosure does not write
product data. Activating a save, status, apply, restore, or delete control has
the effect described in its task guide.

**Recovery:** Escape closes the mobile drawer and **Needs decision**. Activate
a disclosure again to close it. If focus is lost after navigation, use the
browser's main-landmark command or start Tab navigation on the new page.

**Privacy and safety:** Screen readers can announce private Behavior and Note
text. Use headphones or a private environment when that content is sensitive.

## Work at 200% zoom or with larger text

**Before you start:** Set browser zoom to 200% or the text size you normally
use. Avoid forcing a desktop viewport when testing the mobile layout.

- Expect desktop multi-column areas to stack into one reading column.
- Navigation below 1024 pixels uses **Open navigation** instead of the desktop
  rail.
- Timeline titles may truncate visually so **Completed** and
  **Not Completed** keep usable action targets. Open the row or use assistive
  text navigation to read the complete title.
- Long import and restore previews require vertical scrolling. Review all
  warnings and actions before reaching an acknowledgement.
- Raw machine-readable resources and preformatted Markdown may scroll within
  their own area; use browser Find to locate a key or heading.

**Persistent effect:** Zoom and text size are browser preferences. Cadence does
not store them in the account.

**Recovery:** Reset browser zoom with the browser's standard command. If a
control appears clipped, reload after setting zoom, then report the route,
viewport, zoom level, and control label rather than completing a high-risk
action through an uncertain layout.

**Privacy and safety:** Zoom can expose less surrounding context. Before
**Archive behavior**, **Apply approved merge**, **Apply restore**, or
**Delete account**, scroll back to the relevant title and warning to confirm
the target.

## Use touch and mobile gestures

**Before you start:** The mobile shell is used below the desktop breakpoint.

- Choose **Open navigation** for the drawer. A right swipe beginning within the
  first 20 pixels of the viewport also opens it.
- Close the drawer with **Close navigation**, the backdrop, Escape, a
  destination, or a left swipe. A gesture must be mostly horizontal and about
  48 pixels or more; the labeled buttons are always the clearer fallback.
- Timeline **Completed** and **Not Completed** actions preserve at least a
  44-pixel tap target.
- The mobile **Needs decision** launcher spans the lower safe-area width. Its
  dialog fills the viewport and keeps background content from scrolling.
- Browser file pickers, permission prompts, download managers, and clipboard
  controls are owned by the device or browser and may look different from
  Cadence.

**Persistent effect:** Gestures only open or close navigation and dialogs.
Touching a labeled status or submit control performs the action named on that
control.

**Recovery:** If a gesture is ignored, use the matching labeled button. If a
fixed action covers content at an unusual browser size, rotate only if useful,
then use keyboard or assistive navigation and report the exact viewport.

**Privacy and safety:** Mobile notifications can appear outside Cadence. Review
device lock-screen notification settings before enabling Behavior reminders
whose titles are sensitive.

## Read status without relying on color

- Occurrence state is written as **Completed**, **Not Completed**, or
  **Unresolved**. **Needs decision** names a review group, not a fourth status.
- Status actions combine text and icons. Saving states use text such as
  **Saving Completed...**.
- Behavior calendars have accessible date labels and a text legend for
  **100% Completed**, **Partial**, **Not Completed**, and **Unresolved**.
  Partial cells also use a diagonal mark.
- Current navigation and range links expose a current state programmatically.
- Errors, success messages, counts, disabled controls, and confirmation text
  communicate state in addition to visual styling.

If a decision, warning, or selected state is understandable only from its
color in your setup, do not proceed with a destructive action. Record the
route, control, browser contrast mode, and assistive technology so the problem
can be reproduced.

## Reduce motion

Cadence uses the operating system's reduced-motion preference for shell and
overlay transitions. Enable that preference before loading the page when
motion is uncomfortable. Status changes, navigation, saves, and data effects
remain the same; only the transition is reduced.
