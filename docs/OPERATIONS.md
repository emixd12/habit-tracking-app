# Agent Operations Runbook

Use this file after `AGENTS.md` and `STATUS.md` to run the repository consistently.

## Current state

The repository contains the v1 app implementation through Ticket 012 plus the project-definition layer. `STATUS.md` remains the detailed implementation ledger and should be checked before starting or continuing any ticket.

## Setup

```bash
npm install
npm run agents:check
npm run resolvers:check
npm run lint
npm run typecheck
npm run test
npm run build
```

If local `npm` or `node` is not on the shell path in an agent environment, use the user's local binary path or a login shell. On this machine, npm and node are available under `/Users/emi/.local/bin`.

## Installed CLIs

Project-local CLI tools:

```bash
npm run supabase -- --version
npm run sequenzy -- --version
```

The Supabase and Sequenzy CLIs are dev dependencies so agents do not need global installs.

## Standard verification

Before marking a coding task complete, run:

```bash
npm run agents:check
npm run resolvers:check
npm run lint
npm run typecheck
npm run test
npm run build
```

For UI changes, also run the app and inspect at least:

- `/timeline`
- the affected route
- a desktop viewport
- a narrow mobile viewport around 390px wide

## Source-of-truth order

1. `AGENTS.md`: operating rules and architecture constraints.
2. `STATUS.md`: current implementation state and handoff notes.
3. This runbook plus provider workflow docs.
4. Product docs under `docs/`.
5. Tests and implementation.
6. Current user prompt, when it intentionally changes scope.

If docs conflict, report and fix the conflict before implementing product code.

## Provider workflows

- Supabase: `docs/SUPABASE_WORKFLOW.md`
- Sequenzy: `docs/SEQUENZY_WORKFLOW.md`
- Vercel: `docs/VERCEL_WORKFLOW.md`

Use those files instead of searching repeatedly for provider setup.

## Design workflow

For UI/design tasks, use the project-local impeccable workflow:

```bash
node .agents/skills/impeccable/scripts/context.mjs
```

Then read `.agents/skills/impeccable/reference/product.md` for app UI guidance. If a specific impeccable command is relevant, read its reference before implementing.

`DESIGN.md` is seeded. After real UI exists beyond the scaffold, run the impeccable `document` workflow or otherwise update `DESIGN.md` from actual code rather than from intentions.

## Secrets and local files

- Never commit `.env`, `.env.local`, `.env.*.local`, CLI auth config, service-role keys, API keys, approval codes, or generated secrets.
- `.env.example` is names only plus safe default URLs.
- If a tool prints credentials, redact them in final summaries.

## Status updates

Update `STATUS.md` when a ticket starts, completes, becomes blocked, is reopened, or materially changes scope. Record verification commands with real pass/fail results.

Do not use `STATUS.md` to expand v1 product scope. Put future ideas in `docs/FUTURE_UPDATES.md` unless the user explicitly changes v1 scope.
