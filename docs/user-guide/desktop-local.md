# Local desktop preview

## Connect a Google account

Open Settings and choose **Sign in with Google**. Cadence opens the system
browser. Local tracking remains available while signed out. Completing sign-in
does not upload, delete, or replace local data; the next step asks how to link
the local working copy. Choose **Cancel sign in** to invalidate a pending
browser callback.

The macOS desktop preview is in development. Native interaction parity and
release readiness are not verified. Local mode needs no account. A linked
account can synchronize while the app runs. A browser preview cannot access
the desktop SQLite data.

## Choose data for the first account link

If Cadence finds tracking data on this Mac after sign-in, choose **Import local
data into the account**, **Ignore local data and use account data**, or **Cancel
account link**. Ignore must first create a protected database backup and show
its exact path. Cancel returns to local mode without changing product data.
Cadence hydrates an untouched seeded profile from the account without showing a
false conflict choice. A failed operation leaves the saved baseline unchanged
and can be retried. An irreconcilable preview waits for conflict review instead
of silently choosing one copy.

## Synchronize a linked account

After the first account-link choice completes, Settings shows account
synchronization state. Cadence synchronizes on launch, resume, connectivity
recovery, and local changes. Choose **Sync now** to retry immediately. Offline
and failed states keep local tracking available. A conflict stops the complete
plan and waits for the conflict-review flow; Cadence does not choose one copy
silently.

## Review synchronization conflicts

A persistent **Review sync conflicts** cue opens Settings while a conflict
pauses the complete synchronization plan. Review the Mac and account values for
each item. Choose **Use account version** or **Use this Mac version**, then
choose **Apply conflict decisions**. Cadence rereads both copies and rejects the
review if either changed. **Keep both** appears only when Cadence can duplicate
the full referenced graph safely. The current synchronized graph has no such
conflict class, so Cadence does not show that action.

Expired or revoked account sessions stop synchronization. Reconnect the same
account or disconnect it. Local tracking remains available.

## Disconnect an account

Choose **Keep a local copy** to remove account secrets and link state while
preserving the current SQLite data. Cadence shows the exact Application Support
path afterward.

To remove the linked working copy from this Mac, type `REMOVE` and choose
**Remove account data**. Cadence first creates a protected owner-only backup,
then creates a fresh local profile and shows both exact paths. Neither choice
deletes hosted account data. Raw database restore remains unavailable until the
native account link state is removed.

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

## Back up or restore the local database

Settings shows the exact absolute path to `cadence.sqlite3` in Cadence's macOS
Application Support folder. **Reveal in Finder** selects that managed file.
Cadence does not support moving the live database.

**Back Up** opens a native save dialog. Cadence copies one consistent SQLite
snapshot, checks database integrity and record relationships, then replaces the
chosen destination only after the copy is complete.

Raw database restore is available only in local mode. Type `RESTORE`, choose a
Cadence `.sqlite3` backup, and wait for completion. Cadence rejects corrupt,
incompatible, and non-Cadence files before replacement. It creates a protected
pre-restore backup under Application Support, then reopens the restored database.
If replacement or reopen fails, Cadence restores the original database.

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
