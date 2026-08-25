# Cadence

This repository contains Cadence, a public, open-source personal behavior tracker. The implemented surfaces are the authenticated Next.js web app and the sibling Astro marketing site under `apps/marketing`.

Future agents should treat the docs as source-of-truth and use `STATUS.md` to understand what has actually been implemented.

## How to use

1. Start the coding agent from this repository root.
2. Have the agent read `AGENTS.md`, then `STATUS.md`, then `docs/OPERATIONS.md`, then the relevant files under `docs/`.
3. Use `STATUS.md` to confirm what has already been implemented, verified, blocked, or deferred.
4. Use `docs/TICKETS.md` for ticket scope and acceptance criteria. For a fresh build, begin with the first ticket whose status is not `complete`.
5. Update `STATUS.md` whenever a ticket starts, completes, becomes blocked, or materially changes scope.

If these bootstrap files are copied into a new repository, copy the full project-definition layer, including `AGENTS.md`, `STATUS.md`, `docs/PRODUCT_SPEC.md`, `DESIGN.md`, `.env.example`, `.agents/`, and `docs/`.

Cadence requires Node.js 22.12 or newer. Use Node.js 24 for local release
verification so local builds match the Vercel runtime. Install the locked
workspace with `npm ci`.

## Intended product

A sparse personal behavior tracker product:

- Google login
- Recurring behaviors
- Timeline-first interface
- Manual statuses: `unresolved`, `completed`, `not_completed`
- Prior unresolved items grouped under **Needs decision**
- Browser reminders on by default
- Optional email reminders per behavior through Sequenzy
- JSONL/CSV/full JSON and BehaviorLog bundle export for AI-readable history
- An Astro marketing site for Cadence and the BehaviorLog Bundle standard
- Future free open-source desktop and mobile apps

Cadence remains single-player per account. It is not a collaboration product,
social tracker, or general productivity platform.

The target public-product architecture is documented in
`docs/PUBLIC_PRODUCT_ARCHITECTURE.md`.

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
- Vercel: `docs/VERCEL_WORKFLOW.md`

Marketing workspace commands:

```bash
npm run marketing:dev
npm run marketing:build
npm run marketing:check
npm run marketing:preview
```

## License and security

Cadence source code, repository documentation, and synthetic sample content
are licensed under the [MIT License](LICENSE). Third-party material retains its
original license. Copied source notices are recorded in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The MIT grant does not cover tracked binary non-code assets pending provenance
review. The excluded groups are:

- `app/icon.png` and `app/apple-icon.png`;
- `public/brand/**`, `public/icons/**`, and `public/sounds/**`;
- `apps/marketing/public/brand/**`;
- `docs/design-exploration/**`; and
- image files under `docs/qa/**`.

Those groups include Cadence logos, brand illustrations, product captures,
custom notification icons, design exploration, QA screenshots, and audio. The
Cadence name and logos remain reserved as trademarks. The MIT license grants no
permission to use them as source-identifying marks. Rights available under
applicable nominative-use doctrines are unaffected.

Report suspected vulnerabilities through the private route in
[SECURITY.md](SECURITY.md). Never include credentials, real user data,
behavioral content, or private exports in a public issue.

The source license grants no hosted Cadence service access and no rights to
user-owned behavioral data. Hosted Terms, Privacy, and Trust pages govern the
deployed service separately.

Self-hosters own their deployment, provider accounts, access controls, secret
storage, upgrades, backups, monitoring, and incident response. Values prefixed
with `NEXT_PUBLIC_` and the VAPID public key are browser configuration and may
appear in client artifacts. Supabase service-role keys, OAuth client secrets,
Sequenzy keys, VAPID private keys, process secrets, database credentials,
AgentMail keys, and provider tokens must remain server-only. Use
`.env.example` as the configuration inventory and never commit real values.

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

The app should stay small. It is not a general task manager, not a medical
dosing app, not a quantified-self analytics platform, and not a collaboration
or admin-heavy SaaS product.
