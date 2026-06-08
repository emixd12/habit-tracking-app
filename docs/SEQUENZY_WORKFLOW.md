# Sequenzy Workflow

Sequenzy is the selected email provider for v1 email reminders. The retired provider must not appear in repo docs or source.

Agents should use the Sequenzy CLI for provider interaction, template inspection, test sends, analytics checks, and account verification. Do not waste tokens looking for an alternate path unless the official docs change or a task explicitly asks for API-level implementation details.

Authoritative upstream docs checked during this setup:
- CLI page: `https://docs.sequenzy.com/concepts/cli`
- Send Email with Next.js page: `https://docs.sequenzy.com/send-email/nextjs`
- Transactional create API: `https://docs.sequenzy.com/api-reference/transactional/create`
- Transactional list API: `https://docs.sequenzy.com/api-reference/transactional/list`
- Transactional send API: `https://docs.sequenzy.com/api-reference/transactional/send`

## Installed pathway

The CLI is installed as a project dev dependency:

```bash
npm run sequenzy -- --version
npm run sequenzy -- <command>
```

The official docs also support:

```bash
npx sequenzy --help
npm install -g @sequenzy/cli
```

In this repo, prefer the project-local `npm run sequenzy -- ...` form for deterministic agent work.

## Authentication

The Sequenzy CLI login flow prints a login URL and approval code. The user approves it in a browser while the terminal stays open.

```bash
npm run sequenzy -- login
npm run sequenzy -- whoami
npm run sequenzy -- logout
```

The Sequenzy CLI does not automatically load Next.js `.env.local`. If `SEQUENZY_API_KEY` is present in `.env.local` but `npm run sequenzy -- whoami` reports that authentication is required, load the env file into the command shell first:

```bash
set -a
source .env.local
set +a
npm run sequenzy -- whoami
```

Use the same pattern before template inspection or approved test sends when relying on `.env.local` for `SEQUENZY_API_KEY`. Do not print or echo the key.

CLI config storage from the docs:

- macOS/Linux: `~/.config/sequenzy/config.json`
- Windows: `%APPDATA%\\sequenzy\\config.json`

Do not commit CLI config, API keys, approval codes, or copied auth output.

## Runtime integration boundary

Agent/provider operations are CLI-first. Application runtime code for Ticket 010 must still be server-only and explicit.

The official Next.js guide says transactional email runtime requires:

- a Sequenzy account with an API key
- a verified sending domain
- `SEQUENZY_API_KEY` in `.env.local`
- server-side code using the Sequenzy SDK or a server-only API route/action

Do not expose `SEQUENZY_API_KEY` to the browser. Do not prefix it with `NEXT_PUBLIC_`.

Ticket 010 should decide whether reminder emails use a Sequenzy template slug or server-rendered HTML. The preferred v1 path is a Sequenzy transactional template managed in Sequenzy, with the app sending variables from a server-only reminder service.

Ticket 010 uses the transactional slug:

```bash
SEQUENZY_REMINDER_TEMPLATE_SLUG=habit-reminder
```

The current Sequenzy CLI can inspect and send transactional templates, but in this environment `templates create` created a regular email template, not a sendable transactional slug. For creating the transactional reminder slug, use Sequenzy's official transactional create API, then return to the CLI for inspection and the approved test send.

## Agent command table

| Scenario | Command |
|---|---|
| Verify CLI version | `npm run sequenzy -- --version` |
| Check authenticated account | `npm run sequenzy -- whoami` |
| Login when needed | `npm run sequenzy -- login` |
| List transactional templates | `npm run sequenzy -- transactional list --json` |
| Inspect one transactional template | `npm run sequenzy -- transactional get <slug> --json` |
| List regular email templates | `npm run sequenzy -- templates list --json` |
| Inspect one regular email template | `npm run sequenzy -- templates get <template_id> --json` |
| Create/update a draft template from HTML | `npm run sequenzy -- templates create <slug> --subject "..." --html-file ./path.html` or `templates update <id> --html-file ./path.html` |
| Send a transactional test with a template | `npm run sequenzy -- send test@example.com --template <slug> --var name=value` |
| Send raw HTML test from file | `npm run sequenzy -- send test@example.com --subject "Test" --html-file ./email.html` |
| View account details | `npm run sequenzy -- account --json` |
| View stats | `npm run sequenzy -- stats --period 30d` |

## Reminder template setup

Use this workflow to configure the v1 reminder email provider. Never print or commit `SEQUENZY_API_KEY`.

1. Load `.env.local` when using the local API key.

```bash
set -a
source .env.local
set +a
npm run sequenzy -- whoami
```

2. Check for an existing transactional slug.

```bash
npm run sequenzy -- transactional list --json
```

3. If `habit-reminder` does not exist, create it with the official transactional API.

```bash
curl --request POST "https://api.sequenzy.com/api/v1/transactional" \
  --header "Authorization: Bearer ${SEQUENZY_API_KEY}" \
  --header "Content-Type: application/json" \
  --data '{
    "name": "Habit Reminder",
    "slug": "habit-reminder",
    "subject": "Reminder: {{BEHAVIOR_TITLE}}",
    "previewText": "A scheduled behavior occurrence is coming up.",
    "html": "<!doctype html><html><body style=\"font-family: Arial, sans-serif; color: #111827; line-height: 1.5;\"><h1 style=\"font-size: 20px; margin: 0 0 12px;\">Reminder: {{BEHAVIOR_TITLE}}</h1><p style=\"margin: 0 0 12px;\">This occurrence is scheduled for {{OCCURRENCE_LOCAL_DATE}} at {{SCHEDULED_TIME}} {{TIMEZONE}}.</p><p style=\"margin: 0 0 12px;\">{{BEHAVIOR_DESCRIPTION}}</p><p style=\"margin: 0 0 16px;\"><a href=\"{{TIMELINE_URL}}\" style=\"color: #2563eb;\">Open timeline</a></p><p style=\"font-size: 12px; color: #6b7280; margin: 0;\">Occurrence ID: {{OCCURRENCE_ID}}</p></body></html>",
    "enabled": true
  }'
```

4. Inspect the transactional template by slug.

```bash
npm run sequenzy -- transactional get habit-reminder --json
```

Confirm that it is enabled and exposes the expected variables:

```text
BEHAVIOR_TITLE
OCCURRENCE_LOCAL_DATE
SCHEDULED_TIME
TIMEZONE
BEHAVIOR_DESCRIPTION
TIMELINE_URL
OCCURRENCE_ID
```

5. Set the app runtime slug in the server environment.

```bash
SEQUENZY_REMINDER_TEMPLATE_SLUG=habit-reminder
```

6. Send exactly one test email only after the user approves the recipient.

```bash
npm run sequenzy -- send approved@example.com \
  --template habit-reminder \
  --var BEHAVIOR_TITLE="Drink water" \
  OCCURRENCE_LOCAL_DATE=2026-06-08 \
  SCHEDULED_TIME=10:00 \
  TIMEZONE=America/New_York \
  BEHAVIOR_DESCRIPTION="Test reminder email from Cadence Tracker." \
  TIMELINE_URL=http://localhost:3000/timeline \
  OCCURRENCE_ID=test-occurrence-1
```

If a regular email template was accidentally created with `templates create`, it is not the same as a transactional slug. Delete the unused regular template by ID after confirming the transactional `habit-reminder` slug exists:

```bash
npm run sequenzy -- templates delete <template_id> --json
```

## Sending safety

- Do not send real emails without an explicit user-approved recipient or test address.
- Prefer `templates get/list` before any update or send.
- Treat `send`, `campaigns schedule`, `sequences enable`, and bulk subscriber/list operations as external side effects.
- Use `--json` when available so agents can parse output instead of summarizing from noisy text.
- For bulk list imports, use `lists import` or `lists add-subscribers --emails-file`; do not loop over `subscribers add`.

## Environment variables

`.env.example` includes:

```bash
SEQUENZY_API_KEY=
SEQUENZY_REMINDER_TEMPLATE_SLUG=
SEQUENZY_API_URL=https://api.sequenzy.com
SEQUENZY_APP_URL=https://sequenzy.com
```

`SEQUENZY_API_URL` and `SEQUENZY_APP_URL` are optional CLI overrides from the official CLI docs. Leave defaults unless debugging a Sequenzy environment issue.

## Ticket 010 implementation constraints

When implementing email reminders:

1. Keep provider send calls out of resolvers.
2. Let `reminder.resolver.ts` decide which delivery records should exist.
3. Let `reminder.service.ts` claim due deliveries idempotently, confirm the occurrence is still unresolved, and call the Sequenzy runtime adapter.
4. Record sent, failed, and cancelled states in `reminder_deliveries`.
5. Add tests for reminder generation, cancellation, idempotence, and provider error handling at the service boundary.
6. Verify the Sequenzy account and transactional template with CLI commands before declaring provider setup complete.

## Ticket 010 provider verification

On 2026-06-08, the provider setup was verified for this app:

- Loaded `SEQUENZY_API_KEY` from `.env.local` for CLI/API commands.
- Confirmed CLI account access with `npm run sequenzy -- whoami`.
- Created transactional template slug `habit-reminder` through `POST /api/v1/transactional`.
- Inspected it with `npm run sequenzy -- transactional get habit-reminder --json`.
- Sent one user-approved test email to `emibache@gmail.com`.
- Set local `SEQUENZY_REMINDER_TEMPLATE_SLUG=habit-reminder`.
