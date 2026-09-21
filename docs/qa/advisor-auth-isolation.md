# Advisor authorization isolation

Historical scope: September 20 replaced external delegation with first-party
in-app generation. This finding no longer blocks revised Ticket 147; the old
endpoint remains disabled until explicitly retired or repurposed. This record
covers the fail-closed route added on
September 19, 2026. It does not enable Supabase OAuth server support, create a
client, issue a credential, add a grant, change a provider, or transmit data.

## Current boundary

`GET /api/advisor/day-context` returns `401 unauthenticated` without an
Authorization header. It returns `403 access_denied` for every syntactically
valid Bearer value. Every supported non-GET method returns
`405 write_not_supported`. Each response has `Cache-Control: no-store`,
`Referrer-Policy: no-referrer`, and no CORS allow header. The route imports no
Cadence read service, Supabase client, Google Calendar service, or provider
adapter. `tests/advisor-day-context-route.test.ts` proves those responses and
the absence of a reachable read call.

The route keeps the response version at `1.0`. It deliberately does not
validate the planned request fields or Accept version yet. Validation after a
credential is rejected would create unused policy code. Ticket 147 can add it
only after a credential passes the isolation gate.

## Supabase OAuth finding

The official [OAuth flow](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows)
supports authorization code with PKCE and refresh tokens. It requires an exact
registered redirect URI. Authorization codes are single-use, PKCE-bound, and
valid for ten minutes. The documented token includes `sub`, `role`, `aud`,
`session_id`, and `client_id`. The current
[token-security guide](https://supabase.com/docs/guides/auth/oauth-server/token-security)
states that OAuth scopes control OIDC data only. It states that OAuth tokens are
standard Supabase JWTs with `role: authenticated` and `aud: authenticated`.
The [OAuth-server changelog](https://supabase.com/changelog/38022-oauth-2-1-server-capabilities-for-supabase-auth)
still labels the feature Public Beta.

This repository cannot safely issue that token. Local
[`supabase/config.toml`](../../supabase/config.toml) has
`auth.oauth_server.enabled = false`. Hosted configuration was not inspected.

## Direct-access audit

Counts below describe historical statements in the pre-advisor migrations.
They are not an inventory of effective hosted policies or new advisor RPCs.

| Boundary | Source evidence | Result for an OAuth JWT |
|---|---|---|
| Public data API | 67 historical `create policy` statements and 28 authenticated table-grant statements in `supabase/migrations`; the initial policies use only `auth.uid()` | Unsafe. The current owner predicates admit an OAuth token for the same `sub`. |
| Public RPC | 38 historical `grant execute on function public.* to authenticated` statements in migrations | Unsafe. Several functions mutate owner data and use only `auth.uid()`; `public.apply_occurrence_status_transition` is one example. |
| Rich Calendar API | `lib/services/google-calendar-request.ts` accepts Bearer tokens and calls `auth.getUser(token)` | Unsafe. An OAuth bearer would satisfy the same user-session check unless this path adds a client-specific denial. |
| Existing application routes | Export routes use first-party cookie authentication; calendar routes explicitly accept Bearer tokens | Not fully audited against a live OAuth token. The raw Data API and RPC findings already fail the required perimeter. |
| Storage | `supabase/config.toml` enables Storage and S3 protocol. No bucket or Storage-object policy exists in repository migrations. | Hosted buckets and policies were not inspected. The absence of source configuration is not a proof of denial. |
| Realtime | `supabase/config.toml` enables Realtime. No publication configuration exists in repository migrations. | Hosted publications were not inspected. The absence of source configuration is not a proof of denial. |
| Supabase Auth user API | The documented [`getUser(jwt)`](https://supabase.com/docs/reference/javascript/auth-getuser) accepts a supplied access token. The documented [`updateUser`](https://supabase.com/docs/guides/auth/password-security) operates on the current session. | No documented `client_id` or RLS control blocks these Auth endpoints. A live OAuth client test was not authorized, so this is an unresolved security gap, not a verified denial. |

OAuth-client `client_id` predicates can constrain Postgres RLS. Supabase documents
this option and [Custom Access Token Hooks](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)
can alter claims. That would require replacing every permissive owner policy,
revoking or guarding every authenticated RPC, and testing Data, GraphQL,
Storage, Realtime, and every application bearer path. It cannot prove the
Supabase Auth user API is denied. A new permissive policy with a restrictive
predicate is ineffective because permissive policies compose with OR. PostgreSQL
`AS RESTRICTIVE` policies compose with AND, but this repository has not designed
or tested that separate policy mode for the OAuth client.

Revoking an OAuth grant removes its sessions and refresh tokens. It does not
invalidate an already-issued access JWT before `exp`; Supabase documents that
in [sessions](https://supabase.com/docs/guides/auth/sessions) and
[sign-out](https://supabase.com/docs/guides/auth/signout). Cadence would still
need a current server-owned grant and session check before releasing a response.

## Supported next step

Keep OAuth issuance disabled. Ask Supabase for a supported OAuth-client control
that prevents `/auth/v1/user` reads and updates while allowing Cadence to verify
the same delegated token. If Supabase documents and supports that control, test
it locally with a registered private client before any hosted client, grant, or
provider change. Without that proof, the only implementation consistent with
Ticket 147 is this fail-closed route; a custom OAuth or opaque-token framework
would violate the ticket's stated constraint.

Native runtime model and reasoning-effort metadata are not observable from this
repository or its local Supabase configuration.
