# Notification Spec

## Notification model

The app supports two reminder channels:

1. Browser push
2. Email through Sequenzy

Browser reminders default to on for every behavior.

Email reminders default to off and are enabled per behavior.

Public launch does not include marketing or product lifecycle emails. Reminder
emails remain transactional behavior reminders.

## Browser reminders

Requirements:
- User must grant notification permission.
- User must have an active push subscription.
- If browser push is denied or unavailable, the app still works.
- Settings should provide the control that triggers the browser notification permission prompt.
- Clicking the Settings save control should retry the browser permission request
  while the browser still reports an undecided permission state. Browsers do
  not show the native prompt again after the origin is explicitly allowed or
  blocked; a blocked origin needs browser/site settings changed before Cadence
  can save a working subscription.
- Public launch onboarding may also request notification permission after the
  user creates the first behavior, but only through a user-clicked control that
  routes to the existing Settings subscription action. The onboarding prompt
  must not call browser permission APIs on page load.
- V1 does not need a test notification button.

Behavior fields:
- `browser_reminder_enabled`

Default:
- `true`

## Email reminders

Provider:
- Use Sequenzy.
- Use `docs/SEQUENZY_WORKFLOW.md` for CLI login, template inspection, test sends, and provider operations.
- Keep runtime sending in server-only services/adapters.
- Do not send from resolvers, UI components, or client-side code.
- Sequenzy may later handle other transactional product emails, but marketing
  or promotional email is not launch scope.

Behavior fields:
- `email_reminder_enabled`
- `reminder_offset_minutes`

Default:
- `email_reminder_enabled = false`
- `reminder_offset_minutes = 0`

Examples:
- `0` = at scheduled start
- `15` = 15 minutes before
- `60` = 1 hour before
- `1440` = 1 day before
- `4320` = 3 days before

## Reminder deliveries

Reminder deliveries are stored in `reminder_deliveries`.

Fields:
- occurrence_id
- channel
- scheduled_send_at
- sent_at
- processing_started_at (internal claim timestamp for idempotent processing)
- import_run_id (nullable provenance for explicitly promoted imported
  interventions)
- imported_intervention_id (nullable provenance for explicitly promoted
  imported interventions)
- status
- error

Statuses:
- pending
- sent
- failed
- cancelled

## BehaviorLog intervention import history

BehaviorLog `data/interventions.jsonl` records are passive import-history
records. They may describe exported reminders or related notification history,
but imported rows are not active Cadence reminder deliveries.

Rules:
- Preview may validate and summarize intervention rows by channel, delivery
  status, and linked behavior.
- Preview must show which intervention fields will be stored in passive
  `imported_interventions` rows and which sensitive transport fields will be
  dropped or redacted.
- Preview must warn about message bodies, raw endpoints, provider identifiers or
  secrets, subscription keys, recipient identifiers, and similar sensitive
  delivery payload.
- Accepted create-only or merge import runs may store passive
  `imported_interventions` rows and intervention provenance mappings.
- Imported intervention history must not write `reminder_deliveries`.
- Imported intervention history must not schedule, send, cancel, retry, or claim
  reminders.
- Imported intervention history must not call Sequenzy, Web Push, browser APIs,
  provider SDKs, or notification processing routes.

## Imported intervention promotion

Imported intervention promotion is a separate explicit opt-in workflow after
passive `imported_interventions` history exists. It is not part of BehaviorLog
preview, create-only apply, or user-approved merge apply.

Promotion rules:
- Require a non-empty selected imported-intervention id list.
- Require explicit confirmation for the selected group.
- Promote only future pending records whose `intervention_type` is `reminder`.
- Require a safely linked current behavior and occurrence owned by the same
  user.
- Require the occurrence to still be unresolved and the behavior to still be
  active.
- Require the imported channel to still be enabled on the behavior.
- Require the imported scheduled send time to match the current
  `resolveReminderDeliveries` output for that behavior, occurrence, channel,
  and reminder offset.
- Leave sent, failed, cancelled, dismissed, past, ambiguous, unresolved-parent,
  resolved-occurrence, inactive-behavior, disabled-channel, and mismatched
  current-setting records as passive history.
- Create or link `reminder_deliveries` idempotently through the normal
  `(occurrence_id, channel, scheduled_send_at)` key.
- Store `import_run_id` and `imported_intervention_id` on promoted operational
  deliveries for durable provenance.
- Do not call Sequenzy, Web Push, browser APIs, provider SDKs, or notification
  processing routes during promotion.

## Delivery generation

Reminder deliveries should be generated from:
- Behavior reminder settings
- Occurrence scheduled start
- Reminder offset

For exact-time occurrences, the scheduled start is the exact time. For range
occurrences, the scheduled start is the beginning of the preset range.

Browser reminders:
- Generate if `browser_reminder_enabled = true`
- Processing sends the due delivery to active `push_subscriptions` for the
  owning user through the server-only VAPID configuration.
- If a push service reports a subscription as gone or not found, mark that
  subscription inactive.
- If no active subscription exists, or browser push sending is not configured,
  mark the claimed browser delivery failed with a factual error.

Email reminders:
- Generate if `email_reminder_enabled = true`
- Use Sequenzy only at the service/provider boundary after a pending email delivery is due and still valid.

## Cancellation

When an occurrence changes from `unresolved` to:
- `completed`
- `not_completed`

Then pending reminder deliveries for that occurrence should be cancelled.

Do not cancel reminders that were already sent.

## Idempotence

Reminder processing must be idempotent.

Rules:
- Do not create duplicate pending deliveries for the same occurrence/channel/scheduled_send_at.
- Do not send the same reminder twice.
- Claim a due pending delivery before provider calls so overlapping process runs skip already-claimed work.
- If a send fails, log the failure.
- A retry strategy may be added later, but v1 only needs to avoid duplicate sends.

## Processing

A scheduled backend process should periodically:
1. Find pending reminders whose scheduled_send_at is due.
2. Confirm the occurrence is still unresolved.
3. Send through the correct channel.
4. Mark as sent or failed.
5. Store error text for failed sends.

The process route must be protected by `REMINDER_PROCESS_SECRET`,
`CRON_SECRET`, or an equivalent server-only mechanism. Repeated auth failures
are rate-limited, and manual `limit` query values are bounded so a valid secret
cannot request an unbounded batch.

## Resolver contract

Reminder logic belongs in:

`/lib/resolvers/reminder.resolver.ts`

Function shape:

```ts
export function resolveReminderDeliveries(input: {
  occurrence: Occurrence;
  behavior: Behavior;
}): NewReminderDelivery[];
```

The resolver must not send reminders. It only returns delivery records that should exist.

Sending belongs in services/API routes.

## Required tests

- Browser delivery generated when browser reminders are enabled.
- Email delivery generated only when email reminders are enabled.
- Reminder offset is applied correctly.
- No delivery generated for resolved occurrence if resolver receives status information.
- Pending reminders are cancelled when occurrence is resolved.
- Duplicate delivery protection is handled by service/repository layer.
- Sequenzy provider errors are recorded as failed deliveries by the service layer.
