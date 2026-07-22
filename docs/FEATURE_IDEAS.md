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

Status: candidate.

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
