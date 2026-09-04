# Ticket 118 desktop authentication acceptance

## Current result

Ticket 118 implementation acceptance passes. The installed temporary
legacy-Keychain QA app completed Google PKCE, received the native callback,
exchanged the code once, persisted the session, and retained local product
data unchanged.

## Verified

- The hosted Supabase Auth redirect allowlist contains the narrow
  `cadence://auth/callback?state=*` entry. The base callback remains during
  validation. The broader `cadence://auth/callback*` pattern is absent.
- Cadence puts dynamic state in the callback query. The authorization code and
  provider errors also remain in the query.
- Tauri's official deep-link plugin 2.4.9 owns cold-launch and running-app URL
  delivery for the single `cadence` scheme. A synthetic direct callback changed
  the running Account UI. The manual Objective-C callback handler was removed.
- The configured app bundle builds. Ad hoc code-signature verification passes.
- Fixed production Keychain operations use the non-synchronizing Data
  Protection Keychain.
- Local tests cover origin, state, expiry, replay, fixed storage keys, distinct
  account metadata, one-account enforcement, and session cleanup.

## Installed-app result

- The owner's approved Google account completed provider
  authentication. Supabase Auth logged `/callback` 302 and PKCE `/token` 200.
- Settings showed the linked email and explicitly confirmed that no local data
  was uploaded or replaced.
- A duplicate callback was rejected as already used or cancelled. Restart then
  restored the same linked account, proving the replay did not replace or erase
  the saved session.
- SQLite contains one mapping between one stable local profile and one hosted
  account. Its only columns are `local_profile_id`, `hosted_user_id`, `email`,
  and `authenticated_at`.
- Token-shaped scans found zero matches in the live SQLite database and the
  protected backup. Source scans found no auth token logging.
- Focused tests cover matching denial, cancellation cleanup, stale callbacks,
  wrong or missing state, different-account rejection, metadata-write rollback,
  initialization mismatch cleanup, and fixed Keychain keys.

## Apple-signing limitation

An ad hoc build cannot use the Data Protection Keychain without a valid
Keychain access-group entitlement. A test access-group entitlement made macOS
reject application launch. The production Data Protection Keychain path
therefore remains automated-only until an Apple-signed build is available
under Tickets 115/122.

The owner explicitly authorized a separate temporary legacy-Keychain QA build.
That build validates Ticket 118 behavior but does not validate Apple signing,
Data Protection Keychain entitlements, notarization, or release distribution.
