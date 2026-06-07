# Cadence Tracker Bootstrap and App Scaffold

This repository contains the project-definition layer and the Ticket 001 Next.js scaffold for a single-user personal behavior tracker.

Future agents should treat the docs as source-of-truth and use `STATUS.md` to understand what has actually been implemented.

## How to use

1. Start the coding agent from this repository root.
2. Have the agent read `AGENTS.md`, then `STATUS.md`, then `docs/OPERATIONS.md`, then the relevant files under `docs/`.
3. Use `STATUS.md` to confirm what has already been implemented, verified, blocked, or deferred.
4. Use `docs/TICKETS.md` for ticket scope and acceptance criteria. For a fresh build, begin with the first ticket whose status is not `complete`.
5. Update `STATUS.md` whenever a ticket starts, completes, becomes blocked, or materially changes scope.

If these bootstrap files are copied into a new repository, copy the full project-definition layer, including `AGENTS.md`, `STATUS.md`, `PRODUCT.md`, `DESIGN.md`, `.env.example`, `.agents/`, and `docs/`.

## Intended app

A sparse personal behavior tracker web app:

- Google login
- Recurring behaviors
- Timeline-first interface
- Manual statuses: `unresolved`, `done`, `not_done`
- Prior unresolved items grouped under **Needs decision**
- Browser reminders on by default
- Optional email reminders per behavior through Sequenzy
- JSONL/CSV/full JSON export for AI-readable history

## Agent checks

```bash
npm run agents:check
npm run resolvers:check
npm run lint
npm run typecheck
npm run test
npm run build
```

Provider workflows are CLI-first:

- Supabase: `docs/SUPABASE_WORKFLOW.md`
- Sequenzy: `docs/SEQUENZY_WORKFLOW.md`

## Supabase auth setup

Ticket 002 adds Supabase SSR auth with Google login.

Local `.env.local` needs:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is still supported as a legacy fallback for older Supabase projects. Do not expose or use the service-role key in browser code.

For Google OAuth, configure the Supabase provider with the app callback URL:

```text
http://localhost:3000/auth/callback
```

For local Supabase CLI auth testing, `supabase/config.toml` reads the Google client ID and secret from the `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` environment variables.

## Important

The app should stay small. It is not a general task manager, not a medical dosing app, not a quantified-self analytics platform, and not a multi-user SaaS product.
