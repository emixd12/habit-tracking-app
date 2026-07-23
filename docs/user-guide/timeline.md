# Timeline, statuses, and Notes

Timeline begins with the current local day and is the primary daily screen. It
shows the next seven days by default. Prior-day Unresolved Occurrences are kept
out of the forward feed and appear in **Needs decision**.

## Reveal more future days

**Prerequisites:** The generated future horizon contains days beyond the ones
currently shown.

1. Scroll below the visible Timeline days.
2. Choose **Show more days**.
3. Continue using **Show more days** until the control disappears or you have
   enough context.

**Result and persistence:** Cadence reloads Timeline with a larger, bounded
`days` value in the URL. This changes only the view; it does not resolve,
create, or reschedule an Occurrence.

**Recovery or undo:** Return to `/timeline` without the `days` query or use
browser Back to restore the prior visible range. Unsupported query values are
normalized to a supported range.

**Privacy and safety:** Future Occurrences are previews of the generated
schedule, not claims that the Behavior was completed or due now.

**Keyboard and mobile:** Focus **Show more days** and press Enter. The page
preserves useful scroll context. On mobile, allow the bottom fixed
**Needs decision** action enough space when reaching the link.

## Open or close Occurrence details

**Prerequisites:** At least one Occurrence row is visible on Timeline or in
**Needs decision**.

1. Activate the row summary outside **Completed** and **Not Completed**.
2. Read **Description**, **Category**, and **Schedule** in the expanded area.
3. Use the same summary again to collapse it.

**Result and persistence:** The native disclosure opens or closes in the
current page only. No record changes.

**Recovery or undo:** Activate the summary again. If navigation replaced the
page, reopen the row after returning.

**Privacy and safety:** Expanded details can expose private Description,
Category, schedule, status, and Note text to anyone viewing the screen.

**Keyboard and mobile:** Focus the row summary and press Enter or Space. The
summary has no separate chevron control. On mobile, the time, title, and status
actions share a compact row; the title may truncate visually, while its full
accessible text remains available.

## Record an Occurrence status

**Prerequisites:** The Occurrence is visible and you are signed in with a valid
session.

1. On an Unresolved row, choose **Completed** or **Not Completed**.
2. Wait for the saving state to finish before making another correction.
3. A resolved row shows its status as text. To change a resolved choice, open
   the row and use **Completed** or **Not Completed** under **Change status**.
4. To return a just-decided expanded Timeline Occurrence to Unresolved, use
   **Unmark**. For a later deliberate correction, use **Clear decision** from
   the Behavior's dated review. See
   [Review and correct one day](behaviors-and-review.md#review-and-correct-one-day).

**Result and persistence:** Cadence atomically updates the Occurrence snapshot,
appends a status-history event when the choice actually changes, cancels
eligible pending reminders, and refreshes the view. A new transition to
**Completed** may play a short completion sound. **Not Completed** does not
play it. Repeating the already-current resolved choice does not add duplicate
history.

**Recovery or undo:** If saving fails, Cadence rolls back the optimistic row
state, shows an error, and keeps the last stored status. Change an incorrect
resolved choice from the expanded row during the immediate workflow, or use
the Behavior dated review later.

**Privacy and safety:** **Not Completed** is an explicit record, not an
automatic missed or failed state. A status change affects adherence and may
cancel a reminder that has not sent yet. It does not recall reminders already
sent.

**Keyboard and mobile:** **Completed** and **Not Completed** are real buttons
with text and icons; do not identify state by blue or red color alone. Tab to
the action and press Enter or Space. Each action keeps at least a 44-pixel
mobile target, even when adjacent text truncates. Saving status is announced to
assistive technology.

## Unmark a decision from the Timeline

**Prerequisites:** You just marked an expanded Timeline Occurrence
**Completed** or **Not Completed**, and the resolved row remains expanded.

1. Choose **Unmark** under **Change status**.
2. Wait for the saving state to finish.

**Result and persistence:** The Occurrence returns to **Unresolved**, Cadence
appends a correction event, and only reminders whose scheduled send time is
still in the future are restored.

**Recovery or undo:** If saving fails, Cadence shows a factual error and keeps
the resolved status. To clear the decision later, open the Behavior's dated
review and choose **Clear decision**.

**Keyboard and mobile:** **Unmark** is a real button with a text label and a
44-pixel minimum target. Tab to it and press Enter or Space.

## Save or edit an Occurrence Note

**Prerequisites:** Expand the Occurrence on Timeline, in **Needs decision**, or
in a Behavior dated review.

1. Enter or edit text in **Note**, whose placeholder is **Add a note** when
   empty.
2. Choose **Save note**.
3. Wait for **Saving...** to finish and confirm the success or error message.

**Result and persistence:** Only the Occurrence Note changes. Saving a Note
does not change status, status timestamps, or status-history events.

**Recovery or undo:** If saving fails, the stored Note remains unchanged. Edit
the field and submit again. To remove a Note, clear its text and choose
**Save note**.

**Privacy and safety:** Notes are free text and may be included in exports only
when **Include occurrence notes** is applied. Do not store sensitive details
you do not want hosted or exported. Imported note records do not necessarily
become this inline Note field.

**Keyboard and mobile:** Use Tab to enter **Note**, type normally, then Tab to
**Save note** and press Enter. The textarea can be resized where the browser
supports it. At high zoom it stacks above its action rather than requiring a
horizontal pointer gesture.

## Review Needs decision

**Prerequisites:** At least one prior-day Unresolved Occurrence exists, or a
prior-day decision made today is retained for immediate review. Otherwise the
launcher is not rendered.

1. Choose the floating **Needs decision** action. If no Unresolved items remain
   but today's prior-day corrections are retained, its detail reads
   **Review decisions from today**.
2. Review the date groups. Each group states how many items remain to decide;
   a retained group with none left says **None left to decide**.
3. For an Unresolved row, choose **Completed** or **Not Completed**.
4. Expand a row to edit its Note or correct a resolved choice.
5. Close the dialog with **Close Needs decision** or Escape.

**Result and persistence:** Opening and closing the dialog changes no data,
locks or unlocks background scrolling, and restores focus to the launcher.
Status and Note actions persist exactly as described above. A prior-day row
resolved today remains in its original date group through the current local
day so an accidental choice can be reviewed; it leaves this dialog after the
next local midnight.

**Recovery or undo:** If the dialog is already closed, Escape has no effect.
If a status save fails, the last stored status is restored and the dialog stays
usable. For a later correction after the retained window, open the Behavior's
non-empty calendar day and use **Review**.

**Privacy and safety:** **Needs decision** does not write a separate status and
does not mean missed. Its count includes only prior-day Unresolved Occurrences,
not resolved rows retained for same-day correction.

**Keyboard and mobile:** Focus moves into the dialog when it opens and remains
inside until close. Tab and Shift+Tab cycle through the dialog; Escape closes
it and returns focus. On mobile, the launcher spans the lower safe-area width
and the dialog fills the viewport. Dates, counts, status words, and icons
communicate meaning without relying on color.
