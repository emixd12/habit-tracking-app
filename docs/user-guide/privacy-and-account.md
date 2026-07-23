# Privacy, account information, and deletion

Settings shows the signed-in profile email, links to public product boundaries,
and provides the permanent account-deletion flow.

## Sign out

**Prerequisites:** You are signed in to Cadence.

1. Find the account region at the bottom of the expanded desktop rail, collapsed
   desktop rail, or mobile drawer.
2. Choose **Sign out** directly below the account row.
3. Confirm that Login shows **Signed out.**

**Result and persistence:** Cadence ends the current authenticated session and
returns to Login. It does not delete the account or its records.

**Recovery or undo:** Sign in with Google again to start a new session. If sign
out fails, Cadence leaves the session unchanged and shows a factual error.

**Privacy and safety:** Sign out before leaving a shared device. Avoid signing
in through a shared browser profile when another person can access its cookies
or history; use a separate operating-system or browser profile when possible.
Account deletion is permanent and is not a substitute for signing out.

**Keyboard and mobile:** In the desktop rail or mobile drawer, Tab to **Sign
out** and press Enter or Space. The collapsed desktop control has the accessible
name and tooltip **Sign out**. On mobile, submitting closes the drawer.

## Open Trust, Privacy, or Terms from Settings

**Prerequisites:** You are signed in and Settings has loaded.

1. Under **Trust and legal**, choose **Privacy**, **Terms**, or **Trust**.
2. Read the public page and use its legal navigation to switch pages.
3. Use **Open settings** to return to the protected Settings screen, or
   **Cadence overview** and **Sign in** for the other public destinations.

**Result and persistence:** Only navigation changes. No account setting or
hosted record changes.

**Recovery or undo:** Use **Open settings** or browser Back. If the session is
invalid, Cadence routes through sign-in before opening Settings.

**Privacy and safety:** Privacy lists stored account, Behavior, reminder,
provider, export, import, and deletion data. Trust explains account isolation,
manual status truth, portability, and delivery limits. Terms defines the
single-account and non-clinical product boundaries.

**Keyboard and mobile:** Each row is a normal link with a visible title and
summary. Use Tab and Enter. At high zoom, the title and summary stack while the
link remains one focus target.

## Create an export before deletion

**Prerequisites:** You are signed in and considering account deletion.

1. In **Delete account**, choose **Open Export**.
2. Follow the procedure to
   [choose export options](data-portability.md#choose-export-options).
3. Download **App JSON backup (.json)** and/or
   **BehaviorLog bundle (.behaviorlog.zip)** and verify that the browser saved
   the file.
4. Return to Settings only after deciding whether the backup is sufficient.

**Result and persistence:** **Open Export** only navigates. Downloading creates
a local artifact; it does not change hosted records. The deletion form does not
detect whether the file is readable, complete for your needs, or stored safely.

**Recovery or undo:** If a download fails, do not acknowledge the export
decision yet. Retry with a valid session and enough local storage. Delete an
unwanted local copy through the operating system.

**Privacy and safety:** Full JSON and BehaviorLog can contain Behavior titles,
descriptions, definition history, status history, reminders, and optional
Notes. Store the backup securely. Full JSON is not accepted by the current
restore uploader; BehaviorLog is the restore-oriented format.

**Keyboard and mobile:** **Open Export** is a normal link. Use browser Back to
return to Settings. On mobile, use the browser download manager to verify the
file before continuing.

## Complete or clear the deletion gates

**Prerequisites:** Read the deletion warning and decide whether you have a
usable export or intentionally do not need one.

1. Select **I downloaded an export or do not need one.**
2. Read **Type _confirmation label_ to confirm**. The label is normally the
   signed-in profile email; if the account has no email, it is `DELETE`.
3. Enter the label exactly. Leading or trailing whitespace is ignored by the
   server, but the meaningful text and case must match.
4. Confirm that **Delete account** becomes enabled only after both gates are
   satisfied.

**Result and persistence:** The checkbox and typed value are client form state
only. They do not delete anything by themselves. The server revalidates both
values if the form is submitted.

**Recovery or undo:** Clear the checkbox or change the typed text to disable
**Delete account** before submission. Navigate away or reload to discard the
entire unsent form state.

**Privacy and safety:** Selecting **I downloaded an export or do not need one.**
is your explicit decision, not proof that a backup exists. The confirmation
label may be the private account email; do not expose it in screenshots or
shared recordings.

**Keyboard and mobile:** Use Space on the acknowledgement, Tab to the text
field, then type the exact label. Disabled state is programmatic and not shown
by color alone. At high zoom the gates and warning remain in one vertical
sequence.

## Delete the signed-in account

**Prerequisites:** You intentionally want permanent deletion, have handled the
export decision, and both deletion gates above are valid.

1. Verify the profile email and confirm you are deleting the intended Cadence
   account.
2. Recheck the local backup if you want to keep the record.
3. Choose **Delete account** once.
4. Wait for **Deleting...** to finish.
5. Confirm that Cadence returns to the public login screen and shows
   **Account deleted.**

**Result and persistence:** The server revalidates both gates, signs the
account out globally, deletes the Supabase Auth user through server-only
credentials, and relies on ownership cascades to delete the account's hosted
Cadence records. This is permanent and cannot be undone from the deleted
account.

**Recovery or undo:** There is no undo after success. A later Google sign-in may
create a new empty Cadence account; it does not restore deleted records. If
validation, global sign-out, or user deletion fails, Cadence shows an error and
preserves the account so you can review the problem before trying again.

**Privacy and safety:** Account deletion is destructive. Do not use it as a
troubleshooting step for notification, timezone, import, or schedule problems.
A local export is outside Cadence and remains wherever you stored or synced it,
even after hosted deletion.

**Keyboard and mobile:** Focus the enabled **Delete account** button and press
Enter or Space once. The destructive action is text-labeled and uses the form
gates in addition to visual styling. After navigation, focus moves to the
**Account deleted.** status so the result is announced on Login.
