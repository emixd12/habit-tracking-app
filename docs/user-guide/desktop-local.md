# Local desktop preview

The macOS desktop preview is in development. Native interaction parity and
release readiness are not verified. It stores a local profile without Google
login or cloud synchronization. A browser preview cannot access its SQLite data.

## Retry loading local data

If Cadence cannot open local tracking data, it shows an error and **Try again**.
Choose **Try again** to retry opening the local profile and rebuilding the
Timeline and Behaviors views. Normal occurrence generation can run during this
load. This action does not clear your local profile or restore a backup.

If the error persists, keep the displayed error for troubleshooting. Do not
delete the database to retry.

## Timezone and native reminders

Settings uses the same timezone form as the web app. Choose a timezone or use
the detected timezone, then select **Save timezone**. The local service applies
the scheduling change without rewriting past or resolved Occurrences.

**Request notification permission** opens the macOS permission prompt only
after you choose it. If permission is denied, allow Cadence notifications in
macOS System Settings, then choose **Refresh reminder coverage**. Tracking works
without notification permission.

Reminder coverage shows the actual retained count, eligible count, verified
through time, 30-day target, and last readback check. A **Limited** state means
macOS retained less than the target. A missing earlier reminder limits the
verified horizon even when later reminders exist. **Not verified** means
Cadence cannot currently claim coverage. Reopen Cadence to refresh the horizon.
Scheduling does not prove delivery; macOS controls notification presentation.

## Review setup

The setup guide opens existing Behavior, notification, timezone, and optional
import controls. It does not request permission or change tracking data on load.
**Dismiss setup** and **Skip setup** hide it using a local UI preference.
**Show setup guide** in Settings reopens it for the current session. Controls
for an unavailable preview screen remain disabled.

## Export, import, and restore

The desktop Export screen uses the same range and inclusion options as web.
Occurrence notes and time tracking stay off by default. Apply options before
downloading; unsaved option drafts do not change the displayed export data.

Desktop downloads open a native save dialog. A cancelled dialog writes no file.
Cadence reports save failures instead of claiming the file was saved. Markdown
summary and analysis-prompt copying keep their existing privacy warnings.

Import and restore accept a selected BehaviorLog ZIP and show file-preparation
and processing states. Review the preview and required acknowledgements before
applying. Selecting another file invalidates the earlier preview. App JSON is
an export format, not a supported desktop import format. Native file and restore
workflow verification remains in progress for this preview.

## Open a native reminder

Selecting a Cadence native reminder opens its Occurrence in Timeline. Cadence
expands and focuses the existing row when visible. For a past, archived, or
out-of-range Occurrence, it shows the same row under **Opened reminder**.
Status, Note, and timing controls follow the current saved record. If the
Occurrence no longer exists, Cadence says it is unavailable. A failed read
shows an error instead of claiming the record was deleted.

## App updates

Settings shows **Signed updates are not configured for this build** until the
release configuration exists. Configured builds expose **Check for updates**.
A found update requires **Download and install**, followed by **Restart Cadence**
after installation. Cadence does not check or install updates automatically.
Signed installation and recovery remain release-verification gates for this
preview.
