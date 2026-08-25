# Sequenzy reminder email delivery receipt (2026-07-23)

Owner-authorized follow-up resolving the audit's blocked Sequenzy delivery
verification. All data below is synthetic and task-scoped; no personal
account or recipient was used.

- Environment: local dev server (post-remediation working tree) against the
  hosted Supabase project; provider send through the production Sequenzy
  `habit-reminder` template path.
- Account: disposable `/auth/test-login` user (deleted after the test); its
  profile email was pointed at a task-scoped AgentMail inbox. The published
  placeholder is `cadence-delivery-receipt@example.invalid`; the real test
  address is intentionally redacted.
- Setup: behavior "QA Email Due", daily schedule, exact time 11:48 AM
  America/New_York, email reminder at scheduled start, created through the
  real product UI. Reminder deliveries were planned immediately at save by
  the IA-001 reconciliation path.
- Safety: immediately before processing, the system-wide due pending
  delivery count was 1 and belonged solely to the disposable account, so
  `POST /api/reminders/process?limit=1` could not touch any other user.
- Result: `{ checked: 1, claimed: 1, sent: 1, failed: 0, cancelled: 0 }`.
- Receipt: the AgentMail inbox received one message, subject
  "Reminder: QA Email Due", containing the scheduled occurrence date/time in
  the account timezone, the Open timeline link, and the occurrence ID —
  matching the `habit-reminder` template fields. Sender was the
  Sequenzy-managed domain.
- Negative-path note: an earlier attempt that artificially retimed a
  delivery row was cancelled by the processor's expected-set revalidation —
  the IA-001/IA-007 reconciliation correctly refuses tampered delivery
  rows. The successful run used only product-created rows.
