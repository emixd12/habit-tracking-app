# Reminders and timezone

Cadence reminders supplement the manual record. Tracking continues if a
browser blocks notifications, a device is unsupported, email reminders are
off, or a delivery is delayed or fails.

## Enable browser notifications on this device

**Prerequisites:** You are signed in on the device and browser you want to
enable. The browser must support notifications, service workers, and push, and
Cadence must have its public push configuration.

1. Open **Settings**, then find **Notifications**.
2. Read the **Browser notifications** state:
   - **Checking** while Cadence reads the device state.
   - **Not enabled on this device** when permission or a saved subscription is
     missing.
   - **Enabled on this device** when permission and the subscription are ready.
   - **Blocked in this browser** when the origin is denied.
   - **Not supported on this device** when required browser support is absent.
3. Choose **Enable notifications on this device**.
4. If the browser asks, allow or decline in the browser-owned prompt.
5. Confirm **Enabled on this device**. If already enabled, use
   **Refresh this device** to register the current subscription again.
6. When a reminder is delivered, activate the browser notification. Cadence
   navigates an existing same-origin window to the notification target and
   focuses it, or opens a new window. A missing or unsafe target falls back to
   `/timeline`.

**Result and persistence:** On success, the browser grants notification
permission, Cadence registers its service worker and push subscription, and the
owner-scoped subscription is stored for this device/browser profile. This
does not enable reminder intent for a Behavior whose **Browser notifications**
checkbox is off.

**Recovery or undo:** If you decline while the browser still treats permission
as undecided, choose **Enable notifications on this device** again. If the
state is **Blocked in this browser**, change the site's notification permission
in browser settings, return to Cadence, and use **Refresh this device**. This
blocked-state recovery remains visible after reload. If the initial device
check fails, Cadence settles on a retryable not-enabled state instead of
remaining on **Checking**. If support or configuration is unavailable,
continue tracking without push. Cadence has no v1 test-notification button.

**Privacy and safety:** A push subscription contains delivery addressing data
and is stored for the signed-in account. Do not copy subscription data into a
Note or share it. Browser notifications can appear on a locked or shared
device; choose Behavior titles accordingly. Notification targets are limited
to the Cadence origin before a window is navigated or opened. The endpoint-
ownership database migration found by the July 2026 audit is not deployed from
this working tree. Until it is deployed before the matching application build,
do not enable push for different Cadence accounts in one shared browser
profile; use separate browser profiles instead.

**Keyboard and mobile:** Focus **Enable notifications on this device** or
**Refresh this device** and press Enter or Space. Complete the browser-owned
prompt with the browser or operating system's accessibility controls. The
state is written in text and does not rely on color.

## Configure reminders for a Behavior

**Prerequisites:** Open **Create behavior** or an active Behavior's
**Details and Settings** form. Browser delivery also requires the device setup
above. Email delivery uses the signed-in account and configured provider.

1. Select or clear **Browser notifications**. New Behaviors start with this
   selected.
2. Select or clear **Email reminder**. New Behaviors start with this cleared.
3. Choose one **Reminder offset**:
   - **At scheduled start**
   - **15 minutes before**
   - **1 hour before**
   - **1 day before**
   - **3 days before**
4. Choose **Save behavior**. Changing checkboxes or the offset without saving
   changes only the draft.

**Result and persistence:** A successful Behavior save persists reminder
intent and the offset for all Occurrences from every schedule on that Behavior.
Future eligible reminder deliveries are planned through the normal schedule
sync path. The checkboxes do not send a reminder immediately and do not open a
browser permission prompt.

**Recovery or undo:** Reopen **Details and Settings**, change the reminder
fields, and choose **Save behavior** again. If saving fails, the last stored
settings remain in effect. To stop a channel for future planning, clear its
checkbox and save. Resolving an Occurrence cancels its eligible pending
deliveries; already-sent reminders cannot be recalled.

**Privacy and safety:** Email reminders are off by default. Enable them only if
messages at the account address are appropriate. Browser reminders use every
active subscription for the account that the delivery service can reach.
Delivery is not guaranteed, so do not use reminders for emergencies, clinical
decisions, or medication dosing.

**Keyboard and mobile:** Use Space on each checkbox and arrow keys in
**Reminder offset**. Reminder settings have text labels and explanatory copy,
so their meaning is available without color. On mobile they stack before the
save action.

## Choose and save a timezone

**Prerequisites:** You are signed in and know the intended IANA timezone, such
as `America/New_York`. If precise schedule interpretation matters, create an
export before changing many future Occurrences.

1. Open **Settings**, then **Timezone**.
2. Choose the intended value in **Timezone**. If the browser cannot enumerate
   supported timezones, enter the IANA value in the text field instead.
3. When Cadence detects a different browser timezone, review the
   **Detected _timezone_** message and choose **Use detected timezone** if it is
   correct. This changes the draft only.
4. Choose **Save timezone**.
5. Read the result message and confirm the saved selection.

**Result and persistence:** Cadence saves the profile timezone, updates active
Behavior timezones, and resynchronizes future Unresolved Occurrences. Past and
resolved history stays unchanged. The detected timezone comes from the
browser/operating system through `Intl`; Cadence does not use geolocation for
this setting.

**Recovery or undo:** Invalid or unsupported values are rejected and the
stored timezone and schedule graph remain unchanged. Correct the IANA name and
save again. To undo a successful change, select the prior timezone and save;
future Unresolved Occurrences are resynchronized again, while history remains
unchanged.

**Privacy and safety:** A timezone change can materially move future scheduled
instants and reminder times. Review active Behavior schedules and the future
Timeline after saving. Do not assume the browser-detected value is correct for
travel, remote work, or an intentionally fixed home timezone.

**Keyboard and mobile:** Use the labeled select with arrow keys, or type in the
fallback text field. **Use detected timezone** and **Save timezone** are
keyboard-operable. The saving and error states are announced in text. At high
zoom, controls stay in one vertical column.
