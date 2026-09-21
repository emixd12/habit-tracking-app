# Cadence Daily Brief implementation evidence

September 19, 2026 historical evidence. Under that scope, Ticket 146 completed
in source and Tickets 147–148 remained blocked. The September 20 owner correction
reopens 146 and re-scopes 147–148 for an in-app horse briefing. This record does
not establish acceptance of the revised flow; see `../plans/first-external-consumer.md`.

## Implementation boundary

Ticket 146 adds a minimized current-day contract, a consistent owner-scoped
database snapshot, and bounded Calendar reads. The service reads persisted
Occurrences. It does not generate Occurrences, reconcile archives, mark statuses,
send reminders, or modify Google events. Stale Cadence coverage requires the owner
to open Timeline before requesting context again.

Ticket 147 exposes a disabled endpoint. It denies every credential and performs
no source reads. [Authentication isolation](advisor-auth-isolation.md) records
why the proposed Supabase OAuth token cannot yet satisfy the access boundary.
No grant storage, consent controls, token issuance, or provider configuration is
claimed. First-party authentication remains unchanged.

Ticket 148 adds a synthetic consumer transport and priority-advice contract in
`lib/services/daily-brief-consumer.ts`. It uses one fixed HTTP read operation,
rejects redirected or oversized responses, validates context before disclosure,
and checks account/grant identity and freshness. The host must implement the
`isCurrent` check against current account, grant, timezone, and source revisions.
The model receives JSON data and instructions, without credentials or tools.
Output contains known Occurrence references and no applied changes.

The consumer has no installed model adapter or deployable private host. Its tests
inject a synthetic adapter. Priority advice is the implemented subset; actual
timing and proposed schedule changes remain part of Ticket 148 after destination
selection and the authorization boundary pass. Tests cannot establish that a
future model obeys every instruction or that an external provider deletes data.

## Evidence classes

The shared contract lives in `packages/core/src/types/advisor-day-context.ts` and
`packages/core/src/services/advisor-day-context.ts`. Hosted orchestration lives in
`lib/services/advisor-day-context.service.ts`; `lib/db/advisor-context.repo.ts` and
`lib/db/advisor-read-admission.repo.ts` own database calls. The two September 19
advisor migrations add snapshot/revision RPCs and private admission metadata.
`lib/services/google-calendar.service.ts` applies consented calendar subsets.
`app/api/advisor/day-context/route.ts` uses `lib/services/advisor-auth.service.ts`
to deny access. `lib/services/daily-brief-consumer.ts` owns the synthetic client.

| Evidence | Result |
|---|---|
| Source | Contract/service, disabled route, and synthetic consumer are implemented; verification results follow below. |
| Synthetic | Core, service, route, and consumer fixtures exercise the implemented boundaries. No real prompt or provider data is used. |
| Local database | Clean migration replay and both authenticated SQL isolation checks passed. Fixtures rolled back. |
| Deployed | Not performed. No hosted migration or application deployment is authorized by this work. |
| Live consumer/model | Not performed. Destination, model, retention, credentials, and exact live authority remain unset. |
| Live Google provider | Not performed. Existing Calendar display consent does not authorize advisor disclosure. |
| Installed desktop | No new native implementation. Hosted context excludes local-only and unsynced records. |
| Public approval | No new approval or claim. Tickets 137, 141, and 115 remain separate. |

## Provider-policy review

Google's [Workspace user-data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)
was checked on September 19, 2026. It requires purpose-specific disclosure and
affirmative consent before collection. It limits transfers to permitted purposes,
including consented user-facing features. Sensitive-scope derived data remains
covered. The [API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
also applies. These rules do not establish that this advisor purpose has passed
Google review. The operator must verify requirements for the actual destination
before enabling Calendar disclosure.

No model provider was selected. No provider-specific retention or deletion
guarantee is asserted. A future destination must document retention, deletion
limits, credential storage, operator ownership, and any required provider review.
Revocation cannot recall copies already disclosed outside controlled memory.

## Rollback and cleanup

The Cadence operator keeps the endpoint disabled until authentication passes.
No advisor credentials or grants currently exist to revoke. A future activation
must assign an operator to disable issuance, revoke grants and sessions, and
clear controlled context. The additive snapshot RPCs can remain unused during
application rollback; remove them only through a later migration.

Consumer context stays in invocation-local memory. The consumer persists no
prompt, response, or history. The synthetic adapter adds no operational security
metadata. A concrete security-metadata retention policy remains required before
grant storage and activation. Tests use rollback-only SQL fixtures and synthetic
HTTP/model responses. Source records and existing desktop synchronization remain
unchanged.

## Platform impact

| Platform | Evidence or remaining work |
|---|---|
| Web | Shared read service and disabled HTTP endpoint; no embedded advisor UI. Consent remains gated under Ticket 147. |
| Desktop | Existing Calendar callers retain their behavior. No SQLite, Keychain, sync, cache, or offline tracking change. |
| Marketing | No advisor capability claim or runtime change in this task. |
| Future mobile | Portable contract only; no client or authentication implementation. |

The interaction registry needs no new owner interaction while the endpoint denies
all requests. Register consent and invocation controls when those controls exist.

## Verification record

Node 24.19.0 verification passed agent, interaction, resolver, lint, and TypeScript
checks. Lint reported ten existing warnings. The full suite passed 1,849 tests
with 29 skipped. Five fake-email tests initially failed because the sandbox denied
loopback listening; the authorized full rerun passed.

The project CLI wrapper failed local signature verification. Its installed Go
binary had a valid signature and ran through `SUPABASE_CLI_BINARY_OVERRIDE`.
The project-scoped Docker proxy bound published ports to `127.0.0.1`.
Initial aggregate counts showed no Auth users, Behaviors, Occurrences, or Storage
objects. The final `npm run supabase -- db reset` completed successfully through
`20260919010200`. Both `tests/sql/ticket-146-advisor-snapshot-smoke.sql` and
`tests/sql/ticket-146-advisor-admission-smoke.sql` passed after clean replay.
Each fixture rolled back. Generated types include the four public advisor RPCs.

Snapshot reads and revision checks are product read-only. Admission and release
write private operational metadata. Release runs after the final data/grant checks
without delaying disclosure; a 60-second lease expires if cleanup cannot finish.
Provider token refresh and existing reconnect-health bookkeeping retain their
existing operational authority. No reminder or source-event mutation occurs.

Production build passed. The built endpoint at `127.0.0.1:4324` returned the
expected 401 without a token, 403 with a synthetic Bearer token, and 405 for POST.
All responses carried no-store/no-referrer headers and no CORS allow header.
The scoped Codex browser reported `ERR_BLOCKED_BY_CLIENT`; browser rendering
is not verified. Direct HTTP checks establish the endpoint behavior.

Final aggregate counts showed zero Auth users, admission rows, Behaviors, and
Occurrences. The temporary app server, local Supabase, and Docker proxy stopped
after the checks. Independent review found that Calendar overflow became partial
provider-unavailable context. The shared validator now identifies limit errors,
and the service preserves `context_limit_exceeded`. A 501-event regression passes.
The parent reran all seven required repository checks after the correction.
Fresh independent review returned `ship` with no findings for the implemented
subset. This acceptance does not close the blocked work in Tickets 147–148.
