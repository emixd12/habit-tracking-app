# Feature Ideas

This is a lightweight idea inbox for concepts that are not ready to become
implementation tickets.

Ideas in this document are not v1 scope. Before any item here moves into
implementation, promote it into the relevant source-of-truth docs, add or
update a scoped ticket in `docs/TICKETS.md`, and resolve any product, privacy,
data-model, route, operations, or legal implications.

Keep the ideas in Cadence's language:

- Behavior
- Occurrence
- Unresolved
- Completed
- Not Completed
- Needs decision

Do not use this document to bypass `docs/FUTURE_UPDATES.md`,
`docs/DECISIONS.md`, or the ticket process.

## Intake Format

For new rough ideas, add:

- `Status`: one of `idea`, `needs research`, `candidate`, `deferred`, or
  `rejected`.
- `Why`: the user or product problem.
- `Possible shape`: a rough product or technical direction.
- `Open questions`: decisions needed before ticketing.
- `Scope guardrails`: what must not be accidentally pulled into v1.

## Day-Progress Timeline And Optional External Context

Status: promoted to Tickets 132–137; implementation not_started.

Promoted on 2026-09-15. `docs/TICKETS.md` owns the implementation sequence;
the planned sections in `docs/PRODUCT_SPEC.md` and `docs/UI_SPEC.md` own scope.
The exploration below remains context where those contracts are more specific.

The owner selected web and desktop together, the same signed-in Google account
for Calendar, tracked averages with an unknown-duration fallback, overlap cues
without rearranging, and a bounded desktop event cache with stale-data labels.

Why:
Users need to see where they are in the day alongside the Occurrences they
mark Completed or Not Completed. External events could add context and help
users notice possible scheduling conflicts without switching applications.

Direction recorded from the owner, 2026-09-15:

- Place one continuous vertical time line to the **left of the existing ledger
  rows**. It spans the whole current day and continues through future days.
  Include time before the first item and after the last item, plus empty days
  within the displayed range. Day boundaries remain identifiable.
- Show clock-time labels only where a Cadence Occurrence or external event
  exists. Do not add an hourly ruler through empty space.
- A single moving dot indicates the current temporal position. It progresses
  dynamically through today's segment. At the day boundary, remove past days
  from the forward feed and keep the new current day at the top, following the
  existing behavior. This removes sections from view, not historical records.
- Prior unresolved Occurrences retain the existing Needs decision flow.
- Favor a clear, ergonomic view of what happened and what comes next.
  Proportional spacing is desirable, but item legibility takes priority.
  Preserve current row sizing and existing expanded-row behavior.
- Use platform icons for external events, connected to the line by short
  perpendicular stems. Vary their distance from the line to separate nearby
  or overlapping items. Distance indicates collision avoidance, not importance.
- Provide a separate all-day-event lane with a show/hide toggle. All-day items
  need not compete with timed items or imply a Behavior conflict.
- Hover expands an external item's preview inline near its icon. Clicking
  opens a modal with fuller details and a link to open the source app.
- Explore Google Calendar first and other sources, such as Focus Keeper,
  later. Expose the available event detail, including description, time,
  duration, and location. Scope each connector independently.

Layout proposal, not a finalized design:

Use minimum item spacing with connector lines to true time anchors. Preserve
the current row typography, internal spacing, square surfaces, and controls.
Allocate space around rows and within the new timeline gutter instead of
stretching or shrinking the rows themselves.

- For isolated Occurrences, align the row with its scheduled-time anchor.
  The current-time dot reaches that anchor when the scheduled time arrives.
- For simultaneous Occurrences, use one time anchor and a bracket connecting
  their separate rows. Do not imply that stacked rows happened sequentially.
- For closely spaced items, keep rows distinguishable and expand the gap
  between time anchors as needed. External icons can occupy staggered lanes
  with different stem lengths. If lanes fill, a count cluster could reveal
  the individual events on hover or activation.
- Compress long empty gaps, with a quiet scale-break cue where useful.
  Empty time still belongs to the day even when it occupies little space.
- Map the dot and event spans through the same time anchors as the rows.
  The dot's screen speed may vary through expanded and compressed intervals;
  its temporal meaning must remain accurate. Avoid implying uniform scale.
- Keep previews inside the event gutter where possible. They should not
  resize ledger rows or cover their status controls. Keyboard focus should
  expose the preview; click, tap, Enter, or Space should open the modal.
  Provide readable event names, dismissible previews, and reduced-motion support.

Duration and overlap options, for discussion:

Cadence already records timing sessions and shows Average tracked time in
Behavior analytics. That average uses recorded totals per timed Occurrence.
It describes recorded activity, which may be partial; it is not an expected
duration contract. See `packages/core/src/resolvers/analytics.resolver.ts` and
`components/behaviors/BehaviorList.tsx`.

| Option | Treatment | Pros | Cons |
| --- | --- | --- | --- |
| Scheduled instant only | Flag an Occurrence whose scheduled time falls inside an external event. | Simple; works without timing history. | Misses a Behavior that starts before an event but continues into it. Cannot support duration-aware rearranging. |
| Conditional duration estimate | Use that Behavior's average tracked time when history is sufficient; otherwise keep a point with duration unknown. | Reuses recorded history; enables estimated overlap spans and later scheduling suggestions without requiring new input. | Partial tracking, outliers, and small samples can mislead. Unknown duration cannot establish that a slot is free. |
| User-set expected duration | Let the user supply or confirm an expected duration, optionally seeded from tracking history. | Handles new Behaviors and gives the user control over planning assumptions. | Adds setup and a new product field. Estimates can become stale. |
| Current-activity overlay | Highlight relevant ledger rows while the gutter emphasizes active external events near the dot. | Preserves row size and keeps the timeline sparse. Works alongside any duration option. | A highlight alone cannot predict future conflicts. A scheduled window or estimate does not prove actual activity. |

Selected for ticketing: conditional estimates plus supplementary activity cues.
User-set expected duration remains a later option. Ticket 132 validates sample
eligibility and the layout before dependent implementation.

- For estimated overlap, compare time intervals rather than only start times.
  A Behavior estimated for 09:00–09:30 could overlap an event at 09:20–10:00.
  An unknown-duration Behavior at 09:00 remains uncertain in that example.
- Define a minimum sample, recent history window, and treatment of partial
  sessions before using averages. Do not count missing tracking as zero or
  treat running-session elapsed time as a completed duration sample.
- Label estimates and their sample counts. Call overlap a possibility, not
  proof that the user cannot perform both activities.
- Distinguish Scheduled now or Estimated window from Tracking now. Only a
  running Cadence timer supplies the latter signal; even it records timer
  state rather than independently verifying activity.
- An activity tint or overlay must preserve Completed and Not Completed
  colors and labels. Include a text cue so color does not carry the meaning
  alone. Multiple rows may be active simultaneously.
- Duration could later support intelligent rearranging suggestions. Moving
  icons to avoid visual collisions never changes scheduled times. Actual
  rescheduling would need separate scope and explicit user review.

Connector policy exploration, now refined by Ticket 134:

- Start with read-only access and explicit selection of calendars or sources.
  Offer per-source visibility controls and a separate all-day-lane toggle.
  Hiding a source changes presentation; disconnecting ends its connection.
- Investigate reuse of the existing Google account-linking entry point.
  Do not assume Google sign-in already grants Calendar access. Request any
  additional access explicitly when enabling the connector. Whether existing
  credentials can support this flow remains unverified.
- Preserve rich event details wherever the provider and granted access allow.
  Define a field contract for each connector: title, description, start/end,
  duration, location, source link, and any supported organizer, attendee,
  meeting, recurrence, or attachment-link details. Show fields progressively
  in the preview and modal, with a fuller-details disclosure if needed.
- Distinguish unavailable or restricted details from empty fields. Do not
  claim full fidelity until the connector's field coverage has been verified.
  Render provider descriptions safely and keep attachments as links initially.
- Use a bounded desktop cache covering the displayed days, with stale labels.
  Ticket 134 finalizes refresh and retention details before implementation.
  Rich detail access does not require an indefinite archive.
- Show last successful refresh and stale/unavailable states. A refresh failure
  must not make an empty lane appear to prove that no events exist.
- Disconnect should stop refresh, remove Cadence-held connector credentials,
  and clear cached external details. Define provider-grant revocation per
  connector. Preserve Cadence Behaviors, Occurrences, Notes, and timing history.
- Keep external content out of Cadence logs, exports, account synchronization,
  and external analysis by default. Any inclusion needs its own explicit scope.
  Connector secrets require secure storage under the existing platform rules.

Design and provider questions assigned to Tickets 132 and 134:

- Retain today's section plus seven future days initially, extending in
  seven-day steps to the existing thirty-future-day cap. Validate continuous
  line behavior as later days load.
- How should existing multiple-time Behavior stacks connect to chronological
  anchors without resizing rows or suggesting false ordering?
- What minimum sample and history window make a duration estimate useful?
  How should users correct an estimate without editing their recorded history?
- What lane width and overflow treatment keep dense event clusters usable
  beside unchanged rows, especially in narrow windows?
- Which details, permissions, retention, refresh guarantees, and source-app
  links can each connector actually provide?

Deferred design work:
Defer timezone and daylight-saving presentation refinements to future upgrades.
This idea introduces no new timezone controls. Preserve Cadence's existing
local-time and day-boundary contract in `docs/DATETIME_STRATEGY.md`; deferring
design exploration does not authorize incorrect event placement.

Potential platform impact:

- Web: explore the left-side time line beside the existing Timeline list.
- Desktop: explore the same presentation; local tracking remains useful
  offline and without a connector. External refresh behavior needs later scope.
- Marketing: verified privacy/help copy in Tickets 134 and 137; avoid promises
  before implementation acceptance.
- Future mobile: explore a compact left-side gutter with tap-accessible event
  details. No mobile implementation is proposed here.

Scope guardrails:
This is now planned work under Tickets 132–137, not implemented launch scope.
Read-only Google Calendar context is the scoped extension. Two-way Calendar
sync, source-event editing, rearranging, and other connectors remain deferred.
External items remain context, separate from Cadence Occurrences. They must
not automatically create Behaviors or change manual statuses. Passing a time
anchor must not imply Not Completed. Do not turn the concept into a calendar
replacement or broad productivity hub. No connector research or capability
verification has been performed for this idea.

## Conversational Voice And Speech-To-Action Logging

Status: idea.

Why:
Logging behaviors is itself another task. Voice input could make Cadence easier
to use when a user wants to quickly record several Completed or Not Completed
occurrences, add notes, or correct prior decisions without manually tapping
through each row.

Possible shape:

- Push-to-talk logging inside the app.
- Speech-to-text command capture for basic actions.
- Realtime speech-to-speech review for more fluid correction and note entry.
- Text-to-speech readback for confirmation.
- A tightly scoped action layer that can only produce approved Cadence actions:
  mark Completed, mark Not Completed, return to Unresolved, add or replace a
  note, ask what still needs decision, or cancel.
- Candidate provider family to evaluate later: OpenAI Realtime and speech
  APIs. The exact model, API, cost, latency, and privacy posture should be
  selected during ticketing rather than locked here.

Example commands:

- "I completed brushing my teeth this morning."
- "Mark the evening walk as not completed and add a note that it was raining."
- "I did the stretching routine around 7:30."
- "Show me what still needs decision."
- "Actually, change yesterday's medication prep to Not Completed."

Implementation constraints:

- Speech models must not write directly to the database.
- The model should produce a structured proposed action, and services should
  apply it through existing resolver-first flows.
- Corrections, ambiguous behavior names, and date references should require
  confirmation before write.
- Audio, transcript, and command logs need explicit retention rules.
- Provider keys must remain server-only.
- Testing should include command permutations, ambiguity cases, interruption,
  correction, wrong behavior matches, and malicious or unrelated speech.

Open questions:

- Should the first version be speech-to-text only, with ordinary UI
  confirmation?
- Should users be able to set an effective completion time by voice?
- Should voice commands be available on mobile web only, desktop web only, or
  both?
- How should source provenance appear in BehaviorLog exports?

Scope guardrails:
This is outside current launch scope. It must not become AI coaching, open-ended
chat, or unsupervised data mutation.

## Scheduled End-Of-Day Voice Review

Status: idea.

Why:
Some users may prefer a short guided review at the end of the day instead of
opening the app. A voice questionnaire could walk through unresolved
occurrences, collect Completed or Not Completed answers, and optionally capture
notes.

Possible shape:

- User chooses a review time.
- Cadence starts a voice session or call-like review.
- The review asks about unresolved occurrences for the day and older Needs
  decision items.
- The user can answer yes/no, skip, add a note, or correct an earlier answer.
- The session summarizes proposed changes before applying them.

Open questions:

- Is this an in-browser voice session, a notification that opens the app, or a
  true phone-call experience through a telephony provider?
- What happens if the user misses the review time?
- How should reminders, browser push, email reminders, and voice review avoid
  duplicate prompting?
- What consent and recording disclosures are required?

Scope guardrails:
Do not add telephony, recurring automated calls, or provider billing until the
feature is explicitly scoped and reviewed.

## Behavior-Scoped Recurring Note Suggestions

Status: promoted to Tickets 126–128; implementation not_started.

Promoted tickets:

- Ticket 126: Recurring Note suggestions contract and model evaluation.
- Ticket 127: Behavior-scoped Note shortcuts on web and desktop.
- Ticket 128: Bounded recurring Note pattern analysis.

`docs/TICKETS.md` owns the planned scope and acceptance criteria.
`docs/PRODUCT_SPEC.md` records the planned product boundary. The original idea
below remains context. Ticket 126 finalizes its open questions before dependent
implementation. Periodic analysis is deferred; the first analysis trigger is
on demand.

Why:
Users may repeatedly type the same explanation for one Behavior. For example,
a user may complete brushing their teeth but repeatedly note that they did not
wear their Invisalign. Recognizing that pattern could make later logging faster
and help the user notice recurring context without requiring a broad coaching
feature.

Possible shape:

- An opt-in agent periodically reviews recent Notes for one Behavior only.
- The agent identifies recurring, concrete note patterns and proposes short
  reusable choices, such as `Did not wear Invisalign`.
- The Note editor shows accepted suggestions as compact quick-fill choices or
  small cards. Selecting one fills or appends text for the user to review before
  saving.
- The user can accept, edit, dismiss, or remove a suggestion and disable the
  feature for that Behavior. A global off control may also be useful.
- Suggestions can evolve as the Behavior's Notes change. Cadence should require
  repeated evidence and avoid treating one Note as a pattern.
- Evaluate a small, low-cost model during ticketing. Do not lock a provider or
  model before testing privacy, structured-output reliability, latency, and
  cost.

Implementation constraints:

- Keep analysis and suggestions scoped to the authenticated user and one
  Behavior. Do not mix Notes across Behaviors or accounts.
- Treat model output as a proposed text shortcut. It must not change an
  Occurrence status, save a Note, or trigger another product action without the
  user's explicit choice.
- Use structured output with length and count limits. Ignore unsupported or
  unsafe output rather than rendering arbitrary model content.
- Define the Note history window, minimum recurrence threshold, analysis
  trigger, provider retention, deletion, and provenance rules before
  implementation.
- Preserve the user's original Notes. Removing a suggestion must not rewrite
  historical Occurrences.
- Notes may contain sensitive information. The feature needs clear consent,
  factual privacy copy, server-only credentials, and a non-AI fallback.

Open questions:

- Should Cadence analyze only Notes attached to Not Completed Occurrences, or
  all Notes for the Behavior?
- Should selecting a suggestion replace the draft, append to it, or offer both?
- Should suggestions remain private UI shortcuts, or also appear in exports
  with their provenance?
- Where should the global and per-Behavior controls live?
- Should analysis run on demand, after a minimum number of new Notes, or on a
  bounded schedule?
- How should dismissed suggestions affect future recommendations?
- Should web and desktop share accepted suggestions through account sync while
  keeping account-free desktop analysis local?

Scope guardrails:
This remains outside current launch scope. Keep it to user-approved Note-entry
shortcuts. Do not turn it into AI coaching, diagnosis, automatic status changes,
or open-ended chat.

## Home Camera Or Image Recognition Evidence

Status: deferred.

Why:
A much later concept is to let users optionally connect camera or image
recognition signals to behaviors, so observed actions in the home can be
associated with goals or scheduled occurrences.

Possible shape:
An opt-in camera or image-recognition system detects candidate behavior events
and proposes them as evidence for the user to confirm. It should not silently
mark occurrences without a clear user-approved policy.

Open questions:

- Can this be done locally on device rather than streaming private home video?
- What consent, retention, deletion, and security rules are required?
- How are false positives and household bystanders handled?
- Does this fit Cadence's small personal tracker scope at all?

Scope guardrails:
This is not near-term work. It should not affect the current data model,
timeline, reminders, or export features without a future scoped proposal.

## Goals And Target Thresholds

Status: idea.

Why:
Users may eventually want targets for a specific behavior, a category, or the
overall behavior log. Examples include maintaining a percentage target over a
period, hitting a count target, or seeing whether a category is meeting a
defined adherence threshold.

Possible shape:

- Behavior-level targets.
- Category-level targets.
- Overall log targets.
- Target types such as adherence percentage, completed count, or completion
  within a time window.
- Analytics views that compare resolved occurrences against the target while
  keeping Unresolved excluded from final adherence calculations.

Open questions:

- Which target types are useful without turning Cadence into a broad
  productivity app?
- Should targets be private analytics only, or visible on Timeline rows?
- How should targets handle Unresolved occurrences and Needs decision items?
- Should targets be exported for agents and BehaviorLog consumers?

Scope guardrails:
Avoid gamification, streak pressure, social comparison, and complex goal
management.

## User-Defined Category Context

Status: promoted to Tickets 123–124; complete locally with browser and native acceptance.

Promoted tickets:

- Ticket 123: User-defined categories and descriptions.
- Ticket 124: Behaviors category filtering and sorting.

`docs/TICKETS.md` now owns the implementation scope and acceptance criteria.
The original idea below is retained for context. Ticket 123 chooses deletion
to No category and simple reordering; a separate category archive state is not
part of that ticket.

Why:
Cadence ships with base categories, but users should eventually be able to add
their own categories and describe what each category means. That context can
make exports more useful for agents and external analysis.

Possible shape:

- Create, rename, reorder, archive, or delete user-owned categories.
- Add an optional category description or agent-facing context field.
- Let BehaviorLog and AI-summary exports include category descriptions.
- Keep defaults editable or removable once category management is fully scoped.

Current implementation notes:

- Categories are user-owned.
- Default categories are seeded for convenience.
- `docs/DATA_MODEL.md` already notes that public launch should allow category
  management once fully scoped.

Open questions:

- Should category descriptions be shown in-app, export-only, or both?
- Should deleting a category set existing behaviors to uncategorized or require
  reassignment?
- Should descriptions be plain text only?

Scope guardrails:
Keep category management simple. Do not introduce team taxonomies, admin
controls, or complex tagging.

## Export Prompt Library For External AI Analysis

Status: implemented by Ticket 061.

Promoted ticket:
`docs/TICKETS.md` Ticket 061.

Why:
Cadence exports can give users and their agents a useful behavior dataset, but
users may need guidance on what to ask. A prompt library could help them use
Cadence data alongside other data sources they have already connected to their
own AI assistant, such as Gmail, calendar, location history, wearable data, or
medical context.

Possible shape:

- Add copyable prompt templates near the existing export and AI-summary
  controls.
- Include prompts for trend discovery, weekday patterns, category-level
  adherence, and behavior-specific barriers.
- Include optional cross-source prompts, for example asking the user's own agent
  to compare Wednesday adherence dips against calendar events, Gmail threads,
  travel, classes, concerts, sleep, or other user-approved context.
- Include prompts for protocol adherence and circadian rhythm exploration
  without Cadence directly storing medical records or diagnosing users.

Example prompt directions:

- "Use the Cadence export as the source of behavior adherence. Look for days or
  times where completion drops, then use my connected calendar or email only if
  available to identify possible schedule patterns."
- "Compare adherence by category and suggest which behaviors need simpler
  timing, clearer reminders, or fewer occurrences."
- "Treat Unresolved as missing decision data, not failure. Use status event
  history when analyzing corrections or late logging."

Open questions:

- Should prompts be static templates, generated from the selected export range,
  or both?
- How much warning should the UI give before users paste health-sensitive data
  into external tools?
- Should prompts mention specific external services, or stay generic?
- Should prompt templates be included in exported bundles?

Scope guardrails:
Cadence should not directly connect to Gmail, calendar, medical records, or
wearable data as part of this idea. This is guidance for user-controlled
external analysis unless future docs explicitly add integrations.
