# Notification Spec

## Notification model

The app supports two reminder channels:

1. Browser push
2. Email through Sequenzy

Browser reminders default to on for every behavior.

Email reminders default to off and are enabled per behavior.

## Browser reminders

Requirements:
- User must grant notification permission.
- User must have an active push subscription.
- If browser push is denied or unavailable, the app still works.
- Settings should provide the control that triggers the browser notification permission prompt.
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
- status
- error

Statuses:
- pending
- sent
- failed
- cancelled

## Delivery generation

Reminder deliveries should be generated from:
- Behavior reminder settings
- Occurrence scheduled start
- Reminder offset

For exact-time occurrences, the scheduled start is the exact time. For range
occurrences, the scheduled start is the beginning of the preset range.

Browser reminders:
- Generate if `browser_reminder_enabled = true`

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

The process route must be protected by `REMINDER_PROCESS_SECRET`, `CRON_SECRET`, or an equivalent server-only mechanism.

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
