# Future Updates

This document tracks ideas that are intentionally deferred until after the first build is complete.

Items in this document are not v1 requirements unless a future task explicitly moves them into the active product docs and tickets.

## Public product surfaces

Cadence's public-product direction is documented in
`docs/PUBLIC_PRODUCT_ARCHITECTURE.md`.

Deferred surface work includes:

- Astro marketing site,
- composable workspace restructuring,
- shared `packages/core`,
- shared tokens/primitives in `packages/ui`,
- desktop app,
- mobile app.

Do not implement these without a scoped ticket.

## Paid shared account and speech features

Future commercial work may add:

- paid web/shared-account access for cross-surface saving,
- optional cloud sync for desktop/mobile,
- future speech-to-speech AI behavior-review features.

Billing and AI features are not launch scope. Do not add payment
infrastructure, subscription gates, AI coaching, or speech features until
product docs and tickets explicitly move them into scope.

## PWA and offline support

Future work may add:
- Installable PWA metadata
- App shell caching
- Cached timeline access
- Local pending status changes while offline
- Upload of pending changes when the connection returns
- Sync conflict handling

Do not implement this in v1.

## Local pending action queue

If offline status logging is added later, use a small local pending action queue rather than cookies.

Candidate storage:
- IndexedDB
- LocalStorage only if the queue remains very small

Pending action shape should include:
- occurrence_id
- user_id if available locally
- desired status
- note change if included
- local action timestamp

Future sync rules must answer:
- What happens if the occurrence was changed on the server before sync?
- Whether latest explicit user action wins
- Whether the user should review conflicts
- How pending actions are surfaced in the UI

## Future cache resolver

If offline/PWA support moves into scope, add:
- `/lib/resolvers/cache.resolver.ts`
- tests for cache shape and pending action planning
- service worker or PWA config files

The cache resolver should stay pure and should not read browser APIs directly.
