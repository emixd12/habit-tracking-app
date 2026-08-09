# Internal QA-only interactions

This appendix is for controlled development and QA environments. Its controls
are intentionally unavailable in production and are not part of the public
user workflow.

## INT-AUTH-002: Continue as a temporary test user

**Prerequisites:** Run on `localhost`, outside production, with
`CADENCE_ENABLE_TEST_LOGIN=1`, valid public and service-role Supabase server
configuration, and an authorized test database. If the configured Supabase URL
is hosted rather than local, `CADENCE_ALLOW_HOSTED_TEST_LOGIN=1` is also an
explicit safety gate. Never enable or exercise this route against production.

1. Open `/login` in the allowed environment.
2. Confirm the copy **Local QA only.** and the control
   **Continue as temporary test user** are visible.
3. Activate **Continue as temporary test user** with a sanitized local `next`
   route if a specific protected destination is required.
4. Confirm that Cadence creates and signs in a disposable
   `cadence-test-...@example.invalid` account through the ordinary auth session
   and RLS path, then opens the safe destination.

**Result and persistence:** The route creates a confirmed disposable Supabase
Auth user, signs it in with a generated password, and establishes the normal
session cookie. If sign-in fails after creation, the route attempts to delete
the created user. A successful account remains until explicitly cleaned up.

**Recovery and cleanup:** If a safety gate fails, Cadence returns to `/login`
with a factual unavailable error and creates no user. After QA, delete the
disposable account through the normal **Delete account** flow or the approved
test-fixture cleanup path, then verify the synthetic user and owned records are
gone. Do not retain generated credentials in logs or screenshots.

**Safety:** The hosted-Supabase allow flag is not blanket authorization to
mutate a shared project. Use only a task-approved synthetic account and never a
personal identity. The temporary-login action must remain hidden and refused
in production.

**Keyboard and viewport:** The control is a normal link and works with Tab plus
Enter at desktop and mobile widths.

## INT-SHELL-007: Preview the login screen while authenticated

**Prerequisites:** Be authenticated. The app shell exposes **Preview login**
only outside production. In production, open `/login?preview=1` directly.

1. Outside production, activate **Preview login** from the desktop rail or
   mobile drawer. Its accessible name is **Preview login screen**. In
   production, open `/login?preview=1` directly.
2. Confirm that `/login?preview=1` renders while the current protected path is
   retained as the safe `next` value.
3. Inspect the login screen without completing an unnecessary provider flow.
4. Use browser Back or the retained app destination to return to the protected
   app.

**Result and persistence:** Only navigation changes. The authenticated session
and product records remain unchanged. A `/login` request without `preview=1`
keeps the normal authenticated redirect behavior.

**Recovery:** Use browser Back. If an environment unexpectedly loses the
session, sign in through the normal test identity and record the environment,
route, and cookie behavior as a QA issue.

**Safety:** Login preview is for visual and interaction QA, not an account
switcher. Do not start Google OAuth with an unintended account merely to leave
the preview.

**Keyboard and viewport:** In the mobile drawer, focus remains trapped until
the link navigates. The link works with Tab plus Enter in expanded and
collapsed desktop navigation and at mobile widths.
