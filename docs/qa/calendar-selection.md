# Calendar names and compact selection: Ticket 150

## Diagnosis

On September 20, signed-in Google Calendar Settings identified Northwestern Work
as an Outlook calendar subscription. A read-only production Calendar-list response
returned the exact same calendar ID with name `Calendar` and access role `reader`.
The calendar was present and readable, but its familiar display name was missing.
No subscription URLs, credentials, or calendar IDs are stored in this record.
No live Calendar selections or provider settings changed.

Google's [CalendarList resource](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList)
defines `summaryOverride` as the authenticated user's custom title. Cadence's
field projection omitted it and its adapter read only `summary`.
The shared adapter now requests the override and prefers its sanitized nonempty
value, falling back to the original title. IDs and readable-role checks remain.
Both Settings discovery and event source labels use this adapter.

## Implementation

- `lib/services/google-calendar-provider.ts`: custom display-name mapping.
- `components/settings/GoogleCalendarPanel.tsx`: collapsed native multi-select
  field with selected-name tags, search, a 256px bounded checkbox list, and Escape
  focus restoration. Per-calendar visibility and explicit Save remain.
- Refresh Calendar reloads discovery even without saved selections, preserves
  drafts, and reports failures. A list failure after Save cannot erase the saved
  result or masquerade as a successful list refresh.
- `app/design-system/CalendarBench.tsx`: synthetic long-name and many-choice fixtures.
- Provider and panel tests, UI_SPEC, DESIGN, interaction registry, Settings surface
  catalog, TICKETS, and STATUS record the behavior. No new dependency or schema.

Web and desktop share the panel and hosted adapter. Marketing is not applicable.
Native mobile remains deferred; mobile web uses the same responsive panel.

## Verification

- Focused Calendar suite: 61 passed across eight files, including provider/panel,
  OAuth, web client/service, and desktop coordinator/hook checks.
- `agents:check`, `interactions:check`, `resolvers:check`, `design-system:check`: passed.
- `lint`: no errors; ten existing warnings.
- `typecheck`: passed before concurrent Daily Brief UI changes arrived.
- `desktop:build`: passed (existing bundler directive warnings).
- Full suite with loopback access: 1,844 passed, 29 skipped, 14 failures in the
  concurrently edited `tests/daily-brief-consumer.test.ts`; its imported
  `requestDailyBrief` function was removed during that run.
- `build`: failed in concurrent `components/briefing/DailyBriefSettingsPanel.tsx`:
  a SettingsPanel lacks its required children prop. Calendar code compiled.
- `git diff --check`: passed.

Browser QA used a dedicated Codex session at `http://127.0.0.1:4324`, after finding
ports 4321–4323 occupied. The live shared panel rendered through
`/design-system?preview=module.google-calendar-panel#ds-module-google-calendar-panel`.
At 1280×900 and 390×844, open/closed fields, search, selection, Save, no matches,
long-name wrapping, and Escape passed. Escape returned focus to the summary.
The narrow summary measured 266px client width and 266px scroll width, with three
selected tags including a long title. The list stayed within its scroll bound.
The viewport override was reset after QA.
Local `/settings` and `/timeline` correctly redirected to sign-in. Authenticated
local route integration was not tested; the shared panel used synthetic data.
No deployment, installed-desktop update, or live account preference save occurred.

## Remaining acceptance

Repository-wide acceptance remains open until the concurrent Daily Brief changes
pass their tests and web build. After release, verify Northwestern Work appears
under its custom name in production and can be selected and saved. The current
production list still calls it Calendar until the adapter fix is deployed.
