# Export, import, and restore

**Export & Import** is the portability surface. Export produces local files or
clipboard text. Import and restore first show a preview. Import can create or
merge supported records; restore can replace, archive, or delete records and
therefore has stronger gates.

## Choose export options

**Prerequisites:** You are signed in and **Export & Import** has loaded.

1. Under **Options**, choose **7 days**, **30 days**, **90 days**, or
   **All time**.
2. Select **Include archived behaviors** if archived Behavior records belong in
   the output.
3. Select **Include occurrence notes** only when the output should contain Note
   text. It is off by default.
4. Choose **Apply export options**.
5. Confirm the **Selected range**, timezone, Behavior count, Occurrence count,
   and default adherence before downloading or copying anything.

**Result and persistence:** The applied options become the normalized URL query
and drive every count, structured download, and the Markdown AI summary on the
page. The controls are only a local draft until **Apply export options**. The
query can be bookmarked, but no Behavior or Occurrence record changes.

**Recovery or undo:** Change the options and apply again. Invalid query values
normalize to safe defaults. If submission fails, the last applied URL remains
authoritative.

**Privacy and safety:** Notes can contain private context, so they stay omitted
unless explicitly included. Full JSON and BehaviorLog include complete prior
and next Behavior title and Description values by default for included
Behaviors, regardless of the Note option. Historical definitions can contain
sensitive text.

**Keyboard and mobile:** Export ranges are labeled radio choices. Use arrow
keys or Tab/Space as supported by the browser, Space on checkboxes, and Enter
on **Apply export options**. Selection is communicated by control state and
text, not color alone. At high zoom, options and counts stack vertically.

## Download structured data

**Prerequisites:** Apply the intended export options and review the counts.
Your browser must allow downloads.

1. Under **Downloads**, choose the **Download** action associated with one of
   these exact format labels:
   - **JSONL (.jsonl)**: line-oriented app-native current snapshots for tools
     and quick inspection. It does not contain Behavior definition history.
   - **CSV (.csv)**: spreadsheet-friendly Occurrence snapshots. It does not
     contain Behavior definition history. Cadence prefixes a leading formula
     marker (`=`, `+`, `-`, or `@`, including after leading whitespace) with
     an apostrophe so user-authored text stays inert when opened in a
     spreadsheet.
   - **App JSON backup (.json)**: app-native categories, Behaviors,
     Occurrences, status-event history, and Behavior definition history.
   - **BehaviorLog bundle (.behaviorlog.zip)**: interoperable BehaviorLog core
     records, authoritative status events, manifest, CSV views, and Cadence
     definition history.
2. Confirm that the downloaded file name and extension match the selected row.
3. Store the artifact somewhere appropriate for its sensitivity.

**Result and persistence:** The authenticated export endpoint creates and
downloads an artifact using the applied range, archive, and Note options. The
file persists locally according to browser and operating-system download
settings. Export does not change hosted tracker records.

**Recovery or undo:** If authentication expired or generation fails, no partial
artifact is intentionally returned. Sign in again, reload Export & Import,
reapply options, and retry. Delete an unwanted local copy through the operating
system.

**Privacy and safety:** JSONL and CSV are snapshots; their latest status fields
are not complete decision history. Use Full JSON `status_events` or BehaviorLog
`data/status_events.jsonl` for corrections and chronology. Only a BehaviorLog
bundle can be uploaded to the current import or restore controls; a full JSON
backup is not a restore input. Any downloaded file can leave Cadence's account
boundary when shared or synced.

**Keyboard and mobile:** Each repeated visible **Download** link has an
accessible name such as **Download JSONL (.jsonl)**. Use that name to confirm
the format with a screen reader. On mobile, use the browser download manager to
find or remove the artifact.

## Copy or download the Markdown AI summary

**Prerequisites:** Apply the intended export options and review the rendered
**AI summary**.

1. Choose **Copy summary** to write the Markdown summary to the clipboard.
2. Confirm the **Copied** announcement. If clipboard access is unavailable,
   Cadence announces **Copy unavailable**.
3. Or choose **Download .md** to save the summary as a Markdown file.

**Result and persistence:** Copy writes only to the device clipboard. Download
creates a temporary browser object URL and a local `.md` file. Neither action
changes hosted data. The summary follows the applied range, archived-Behavior,
and Note options and includes guidance that Unresolved is not failure.

**Recovery or undo:** Clipboard content can be replaced by copying something
else. If the download is blocked, use **Copy summary** or allow the browser
download and retry. Delete the local `.md` file when it is no longer needed.

**Privacy and safety:** Pasting the summary into an external AI assistant makes
its contents visible to that service. If Notes are included, review the Notes
section before sharing. The summary reports Behavior definition-history counts
but does not reproduce the full revision text.

**Keyboard and mobile:** Focus **Copy summary** or **Download .md** and press
Enter or Space. Copy success or failure is announced as text. The summary area
can scroll independently when long or viewed at high zoom.

## Use an analysis prompt

**Prerequisites:** The **Analysis prompts** library is visible after the AI
summary.

1. Activate a named prompt disclosure to open it.
2. Read the prompt's required export format, options, and status-history rules.
3. Choose **Copy prompt**.
4. Paste it into your own assistant together with an export that satisfies the
   stated requirements.

**Result and persistence:** Opening a prompt changes only disclosure state.
**Copy prompt** writes that static template to the clipboard and announces
**Copied** or **Copy unavailable**. Prompts are not added to downloads, the
BehaviorLog manifest, or the AI summary.

**Recovery or undo:** Activate the disclosure again to close it. Replace the
clipboard by copying another value. If copy is unavailable, select the visible
prompt text with normal browser controls.

**Privacy and safety:** Whatever the paired export contains—including Notes and
historical definitions when selected—becomes visible to the assistant that
receives it. Review both prompt and export before pasting. An external
assistant must keep Unresolved distinct from Not Completed.

**Keyboard and mobile:** Native prompt disclosures open with Enter or Space.
Focus **Copy prompt** and activate it normally. At high zoom, prompt text wraps
and the copy action stays in the disclosure's reading order.

## Import a BehaviorLog bundle

**Prerequisites:** You are signed in and have a `.behaviorlog.zip` bundle.
Create an export first if you need a rollback reference. Import is for supported
create or merge behavior-data actions, not a full account restore. Cadence's
bundle limit is **2 MB**; the file picker workflow and server both enforce it.
Cadence also limits entries, expanded bytes, and compression ratio. A 2 MB ZIP
fits the 4 MB Server Action ceiling after base64 encoding with margin below the
hosted 4.5 MB request cap.

1. In **BehaviorLog import**, choose a file in
   **Upload .behaviorlog.zip**.
2. Choose **Preview import**.
3. Review the dry-run counts, errors, warnings, Privacy section, fingerprints,
   conflicts, merge actions, imported Note handling, and passive intervention
   handling. A valid safe preview exposes supported apply forms; an unsafe
   preview does not.
4. Choose the appropriate form:
   - **Create-only** with **Apply create-only import** creates supported missing
     records without mapping onto existing records.
   - **Approved merge** with **Apply approved merge** applies only the
     supported create, map, and skip actions in the accepted merge preview.
5. In that form, select **I reviewed this exact preview.**
6. If shown, also select
   **I reviewed high or restricted note sensitivity warnings.**
7. Activate the apply action and read the result.

**Result and persistence:** Preview parses and validates the bundle, compares
current owned data, persists a preview-run ledger entry and the exact archive's
SHA-256 fingerprint, and does not write product records. Apply transports the
archive once, recomputes its raw fingerprint, re-parses it, and rechecks the
exact accepted preview, bundle, local-data, and combined fingerprints before it
writes only supported
owner-scoped records and records the applied run and mappings. Passive imported
intervention history does not schedule or send reminders. Safe non-AI imported
Notes may fill an empty matched Occurrence Note or remain passive imported Note
records according to the preview.

**Recovery or undo:** A missing, invalid, unsupported, or unsafe bundle shows
errors and no usable apply path. If local data or the bundle changes after
preview, apply is refused; run **Preview import** again and review the new exact
plan. A failed apply must not silently recompute a different plan or leave a
partial Behavior graph. Import has no general one-click undo, so retain a
pre-import export and use deliberate edits or a separately previewed restore if
recovery is necessary.

**Privacy and safety:** The exact-preview checkbox is a required gate, not an
informational preference. High or restricted Note data requires the separate
sensitivity acknowledgement. Raw push endpoints, subscription keys, provider
secrets, and similar transport details are dropped or redacted rather than
made operational. Imported definition revision trails are not replayed; the
current imported snapshot becomes the local baseline or transition.

**Keyboard and mobile:** File selection opens a browser-owned picker. After it
returns, use Tab to **Preview import**, then review content in document order
before reaching the acknowledgement checkboxes and apply action. Disabled
apply actions remain unavailable until the preview supports that mode. At high
zoom, large action and conflict lists may require vertical scrolling.

## Restore from a trusted BehaviorLog bundle

**Prerequisites:** Use only a trusted `.behaviorlog.zip` bundle. First create or
download a fresh backup of the current account. Restore is destructive and can
replace, archive, or delete records represented by the accepted plan. The same
2 MB bundle limit and archive-safety limits described for Import apply here.
Preview and Apply both refuse a larger file with **This file is larger than the
2 MB limit for BehaviorLog bundles.**

1. In **BehaviorLog restore**, choose a file in
   **Upload trusted .behaviorlog.zip**.
2. Choose **Preview restore**.
3. Before continuing, review:
   - **Restore preview** counts for **Create**, **Replace**, **Archive**,
     **Delete**, **Keep**, and **Skip**.
   - the number of destructive actions, sensitive Notes, and redacted fields;
   - bundle, local-data, and preview fingerprints;
   - restore boundaries, status-history policy, and every listed restore
     action.
4. Confirm that there are no validation errors, skipped actions, or unsupported
   actions. Otherwise **Apply restore** remains unavailable.
5. In the apply form, select
   **I created or downloaded a fresh backup before restoring.**
6. If shown, select
   **I reviewed high or restricted note sensitivity warnings.**
7. In **Type RESTORE**, enter `RESTORE` exactly.
8. Choose **Apply restore** and wait for the final result.

**Result and persistence:** Preview writes only its ledger entry and comparison
evidence; it does not create, update, archive, delete, schedule, send, or cancel
product records or reminders. Apply transports the archive once, verifies its
raw SHA-256 against the accepted preview, re-parses it, and revalidates the
exact accepted preview and stale-row preconditions before performing the
accepted product writes,
definition-history changes, provenance, and applied ledger work atomically. It
does not call browser push, email, or other notification providers.

**Recovery or undo:** If local data changes after preview, if the bundle or
fingerprints differ, or if a required gate is missing, apply is refused without
silently substituting a new plan. Run a new preview and review it from the
start. A database error rolls back the destructive transaction rather than
keeping partial product writes. After a successful restore, there is no
one-click undo; recovery requires another deliberate restore from the fresh
backup or manual changes.

**Privacy and safety:** **Apply restore** is destructive. The backup
acknowledgement and typed `RESTORE` are mandatory safeguards. BehaviorLog is
behavior-data portability, not a full account image: it does not restore the
Google identity, profile email, browser permissions, push subscriptions,
provider accounts, secrets, or external provider state. JSONL and
`data/status_events.jsonl` are authoritative; CSV files do not drive restore
decisions, and Unresolved is never converted to Not Completed.

**Keyboard and mobile:** The browser owns the file picker. Review the complete
preview with headings or landmark navigation, then use Space on acknowledgements,
type the case-sensitive confirmation, and activate **Apply restore**. Disabled
controls communicate unavailable state beyond color. On mobile or at 200%
zoom, action inventories are long; reach the end before confirming.
