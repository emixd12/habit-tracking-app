# Sign-in incident — September 10, 2026

Status: recovered by authorized restart; macOS Safari sign-in passed.
Physical-iPhone acceptance remains unverified.

The owner reported an unresponsive sign-in button on iPhone around 20:40 EDT.

## Evidence

- Production logs show repeated successful HTTP 307 redirects from `/auth/google`
  around 20:40. Requests reached the app server.
- Supabase session validation returned HTTP 504 and `AuthRetryableFetchError`.
  Validation took approximately 37–39 seconds. A Timeline database read also
  failed with an upstream timeout after approximately 126 seconds.
- An HTTP probe using an iPhone Safari user agent reached the app redirect in
  0.20 seconds. Supabase redirected to Google after 8.15 seconds. This does not
  test mobile Safari's browser engine or touch input.
- The Codex desktop browser reached Google's account chooser. No account
  selection or completed authentication was performed.
- Actual macOS Safari reproduced a stall lasting more than a minute. Its address
  bar changed to the Supabase authorization endpoint while Cadence remained visible.
- No iOS Simulator is installed in the current command-line-tools environment.
- Supabase Management API reported `ACTIVE_HEALTHY`; request timeouts persisted.
- Supabase reports an active Unresponsive Projects incident and recommends
  restarts for projects still affected after its mitigation rollout:
  https://status.supabase.com/incidents/4mkcsnlf6p5x
  This incident's connection to Cadence is inferred, not confirmed.

## Assessment

Evidence points to intermittent Supabase availability. A mobile button defect
is not established. Safari stalls after the app issues its redirect.
Provider root cause and completed iPhone sign-in remain unverified.

The existing auth-route, login-rendering, and Supabase-proxy tests passed:
3 files, 16 tests. No application code, hosted settings, database, or deployment
changed. Full build checks were not run for this investigation-only report.

If failures persist, inspect provider health and obtain owner authorization
before restarting the hosted project. Then verify completed sign-in on iPhone.

## Follow-up investigation

- Vercel recorded an additional `/auth/google` failure at 20:45:30 EDT:
  `ECONNRESET` before TLS establishment to the project's Supabase host.
  This confirms a server-to-Supabase connection failure independent of Safari.
- At 20:57 EDT, a read-only database diagnostic returned 22 connections,
  two active connections, and zero lock waiters. The database start time was
  June 6. Current database lock contention is not supported by this sample.
- A subsequent unauthenticated Auth health request returned HTTP 401 in
  0.20 seconds. This proves gateway reachability only, not Auth health.
- Supabase's status page still listed the Unresponsive Projects incident.
  Neither the project's compute class nor incident membership is confirmed.
- The dashboard requires sign-in. Automatic approval review rejected
  Continue with ChatGPT because explicit dashboard-login authorization was absent.
  No dashboard login or provider mutation occurred.

Next evidence needed: project Auth/gateway logs and infrastructure diagnostics
for 20:30–20:50 EDT. Supabase support may be required to establish membership
in the published incident. A restart resolving symptoms alone would not prove it.

## Authorized CLI/API investigation

The owner authorized dashboard access and corrected the investigation to use
the existing CLI/API pathway. The CLI credential was available in macOS
Keychain. Missing environment/file credentials had not established logout.
Read-only Management API calls succeeded without a dashboard login.

- Supabase gateway logs directly confirm HTTP 504 for `/auth/v1/callback`
  and `/auth/v1/token` during the reported failure window.
- Auth logs show callback flow-state reads exceeding their deadlines.
- Token refresh logs show Auth failing to connect to its local Postgres
  listener, with an IPv6 loopback connection timeout. Other refresh-token
  lookups also exceeded their deadlines.
- Individual service health reports REST `UNHEALTHY`, although Auth and
  database health checks return `ACTIVE_HEALTHY` at the sampling time.
- Between 00:20 and 02:00 UTC on September 11, database logs contain 190
  explicit statement timeouts, plus eight other SQLSTATE 57014 events.
- The disk sample at 01:55 UTC reports approximately 15% usage and 1.76 GB
  available. A full filesystem is not supported by this evidence.
- Billing lists no selected add-ons. Exact compute class remains unverified.

Confirmed immediate failure: Supabase Auth cannot reliably connect to or read
its own database, preventing callback completion and session refresh.
Connection to the published Unresponsive Projects incident remains inferred.
Support confirmation may still be necessary to attribute the underlying cause.
No restart, schema change, provider configuration change, or deployment occurred.

The credential lookup and sanitized GET diagnostic procedure now live in
`docs/SUPABASE_WORKFLOW.md`. No application code changed.

## Authorized restart

The owner explicitly authorized a project restart and sign-in retest.
The Management API restart request was sent at 02:15:34 UTC on September 11.
The response body was empty, so JSON parsing could not establish completion.
A subsequent project read confirmed `RESTARTING`; no duplicate restart was sent.
Database start time is now 02:18:15 UTC. Project status and individual Auth,
database, and REST checks returned healthy after restart.

Post-restart verification passed:

- macOS Safari completed Google sign-in and rendered the authenticated Timeline.
  No Behavior or Occurrence controls were changed during the browser check.
- A credential-free HTTP probe received the app redirect in 0.13 seconds and
  the Supabase-to-Google redirect in 0.41 seconds.
- Supabase logs after 02:19 UTC recorded two authorize responses with HTTP 302,
  one callback response with HTTP 302, and one token response with HTTP 200.
  That sampled authentication window contained no error responses.
- The database responded to a read-only start-time query.

The restart restored observed sign-in and service health. It does not establish
membership in the specific public incident or guarantee continued availability.
Ask the owner to start a fresh sign-in from `/login` on the iPhone, rather than
reloading an old Google callback URL. Physical-iPhone acceptance remains pending.
