# Vercel Workflow

This repository deploys to the existing Vercel project `cadence` under team
`Emi's projects`. Do not create a duplicate Vercel project for this app.

The current Vercel project owns the authenticated web app. A future Astro
marketing site may use a separate Vercel project or a multi-app workspace
configuration, but that decision should be made in the marketing/workspace
ticket. Do not change the current production routing casually: authenticated
app routes and Supabase OAuth redirects must remain stable.

Authoritative upstream docs used for this workflow:

- Vercel deployments: `https://vercel.com/docs/deployments/overview`
- Vercel Git integration: `https://vercel.com/docs/git`
- Vercel environment variables: `https://vercel.com/docs/environment-variables`
- Vercel Cron Jobs: `https://vercel.com/docs/cron-jobs`

## Current Project

Verified on 2026-06-08 with the Vercel plugin:

- Project: `cadence`
- Team slug: `emis-projects-4c886aeb`
- Team ID: `team_BxWfRYU1gqrl6Ba6t7Vm3wp1`
- Project ID: `prj_9tZKRXZ6IdT56ZLKVSmoJH5AAYhs`
- Framework: Next.js
- Repository: `emixd12/habit-tracking-app`
- Production branch: `main`
- Repository root/build entrypoint: `.`
- Node runtime setting: `24.x`
- Build command observed in production logs: `npm run build`
- Canonical production URL: `https://cadence-blush-three.vercel.app`
- Secondary production alias: `https://cadence-emis-projects-4c886aeb.vercel.app`

The production deployment observed during Ticket 013 was
`dpl_3t9JNdQxUEZsR5MnYpVumE4Tc4aJ`, ready at commit
`64fa1045492b8f0fc3a89babd470a043174b5227`.

## Environment Variables

Set these in Vercel for both Production and Preview unless a preview environment
intentionally uses separate Supabase or Sequenzy resources:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SEQUENZY_API_KEY=
SEQUENZY_REMINDER_TEMPLATE_SLUG=habit-reminder
SEQUENZY_API_URL=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
REMINDER_PROCESS_SECRET=
CRON_SECRET=
```

Rules:

- `NEXT_PUBLIC_SITE_URL` should be the canonical production URL in Production.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is preferred. Keep
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` only for legacy Supabase projects that still
  need it.
- `SUPABASE_SERVICE_ROLE_KEY`, `SEQUENZY_API_KEY`, `VAPID_PRIVATE_KEY`,
  `REMINDER_PROCESS_SECRET`, and `CRON_SECRET` are server-only secrets. Never
  prefix them with `NEXT_PUBLIC_`.
- For Vercel Cron, set `CRON_SECRET` to the same value as
  `REMINDER_PROCESS_SECRET` unless there is a deliberate secret rotation plan.
- `SEQUENZY_API_URL` can be omitted when using the default
  `https://api.sequenzy.com`.

## Supabase Auth

In Supabase Auth URL configuration, keep the production site URL and redirect
URL aligned with the Vercel production alias:

```text
Site URL: https://cadence-blush-three.vercel.app
Redirect URL: https://cadence-blush-three.vercel.app/auth/callback
```

Only add preview callback URLs when preview OAuth QA is intentionally supported.
Do not use wildcard preview redirects for this single-player public app unless
the Supabase project owner accepts that operational tradeoff.

## Cron Processing

`vercel.json` owns the scheduled trigger:

```json
{
  "crons": [
    {
      "path": "/api/reminders/process",
      "schedule": "0 * * * *"
    }
  ]
}
```

Vercel Cron calls the route with `GET`. The route also supports protected
manual `POST` calls. Both paths require an `Authorization: Bearer ...` header
or the manual `x-reminder-process-secret` header. The accepted secret can be
either `REMINDER_PROCESS_SECRET` or `CRON_SECRET`.

Hourly processing keeps reminder sends reasonably close to their planned
`scheduled_send_at`. If the Vercel plan cannot run hourly cron jobs, switch to a
plan that supports hourly cron or document an external scheduler that calls the
same route with the same bearer secret.

Manual production check, with a user-approved email-send plan if due email
deliveries may exist:

```bash
curl -X POST \
  -H "Authorization: Bearer $REMINDER_PROCESS_SECRET" \
  "https://cadence-blush-three.vercel.app/api/reminders/process?limit=1"
```

## Deployment

Normal production deployment is via the Git integration:

1. Push `main` to `emixd12/habit-tracking-app`.
2. Confirm the production deployment is `READY`.
3. Confirm deployment metadata points at the intended commit.
4. Inspect build logs for warnings or failures.

If using the Vercel CLI locally, link to the existing project only:

```bash
vercel link --yes --project cadence --scope emis-projects-4c886aeb
vercel deploy --prod
```

Do not commit `.vercel/project.json`; `.vercel/` is gitignored.

## Production Smoke QA

Unauthenticated checks:

- `/login` renders without server errors.
- `/timeline`, `/behaviors`, `/settings`, `/analytics`, and `/export` redirect
  unauthenticated users to `/login?next=...`.
- `/api/reminders/process` rejects missing or wrong secrets.

Authenticated checks:

- Google login completes through `/auth/callback`.
- Behavior create/edit/archive still syncs occurrences.
- Timeline status marking and notes work.
- Settings shows browser notification support and can save a push subscription
  when browser permission allows it.
- Analytics renders.
- Export download links respond.

Check both a desktop viewport and a narrow viewport around 390px wide.

## Public launch additions

Before broad public launch, add smoke checks for:

- new-user signup through Google,
- first-run onboarding,
- account deletion,
- export/account portability,
- rate-limit or abuse-protection behavior where implemented,
- monitoring/error-reporting capture without sensitive behavior content.

## Rollback

Rollback through Vercel by promoting or rolling back to a previous ready
production deployment. The latest known rollback candidate before Ticket 013 was
`dpl_BkZ4Xmh2CCSzhan2zZQ1jqg29Hxp`, but verify the current deployment list
before choosing a target.
