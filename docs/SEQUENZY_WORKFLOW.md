# Sequenzy Workflow

Sequenzy is the selected email provider for v1 email reminders. The retired provider must not appear in repo docs or source.

Agents should use the Sequenzy CLI for provider interaction, template inspection, test sends, analytics checks, and account verification. Do not waste tokens looking for an alternate path unless the official docs change or a task explicitly asks for API-level implementation details.

Authoritative upstream docs checked during this setup:
- CLI page: `https://docs.sequenzy.com/concepts/cli`
- Send Email with Next.js page: `https://docs.sequenzy.com/send-email/nextjs`

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

## Agent command table

| Scenario | Command |
|---|---|
| Verify CLI version | `npm run sequenzy -- --version` |
| Check authenticated account | `npm run sequenzy -- whoami` |
| Login when needed | `npm run sequenzy -- login` |
| List templates | `npm run sequenzy -- templates list --json` |
| Inspect one template | `npm run sequenzy -- templates get <template_id_or_slug> --json` |
| Create/update a draft template from HTML | `npm run sequenzy -- templates create <slug> --subject "..." --html-file ./path.html` or `templates update <id> --html-file ./path.html` |
| Send a transactional test with a template | `npm run sequenzy -- send test@example.com --template <slug> --var name=value` |
| Send raw HTML test from file | `npm run sequenzy -- send test@example.com --subject "Test" --html-file ./email.html` |
| View account details | `npm run sequenzy -- account --json` |
| View stats | `npm run sequenzy -- stats --period 30d` |

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
6. Verify the Sequenzy account/template with CLI commands before declaring provider setup complete.
