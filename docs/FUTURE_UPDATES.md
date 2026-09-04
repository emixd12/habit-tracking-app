# Future Updates

This document tracks ideas that are intentionally deferred until after the first build is complete.

Items in this document are not v1 requirements unless a future task explicitly moves them into the active product docs and tickets.

Rough feature ideas that are not ready for tickets live in
`docs/FEATURE_IDEAS.md`. That file is an idea inbox, not an implementation
contract.

## Public product surfaces

Cadence's public-product direction is documented in
`docs/PUBLIC_PRODUCT_ARCHITECTURE.md`.

Deferred surface work includes:

- broader workspace restructuring or moving Next.js out of the repository root,
- mobile app.

Do not implement these without a scoped ticket.

Tickets 107–114 implement the macOS desktop app and incremental extraction
of `packages/core` and `packages/ui`. Their contract lives in
`docs/DESKTOP_BUILD.md`. Ticket 115 defers Apple-trusted distribution. Tickets
116–122 plan optional Google account linking and offline-capable desktop
synchronization. Intel releases and desktop email delivery remain deferred.

Ticket 116's contract is active product architecture, not a future idea.
Tickets 117–122 own its implementation. A hosted change journal remains future
work unless Ticket 120 measurements prove the bounded snapshot design
insufficient.

Implemented surface work:

- Astro marketing site under `apps/marketing`.

## Agent readability roadmap

The Ticket 031 marketing site includes static HTML, Markdown mirrors,
`llms.txt`, `llms-full.txt`, a route manifest, sitemap, and robots output.

Deferred agent-readability work:

- Add a server or edge log measurement pipeline for agent and crawler traffic.
  Client-side analytics cannot measure this traffic because agents and crawlers
  do not execute JavaScript.
- Revisit emerging agent discovery and verification layers when they become
  stable enough to adopt, including Web Bot Auth or `Signature-Agent`, inline
  `text/llms.txt`, MCP server cards, A2A agent cards, and agentic-commerce
  protocols.

Do not add measurement providers, bot-management rules, MCP tools, or emerging
agent-commerce protocols without a scoped ticket and privacy review.

## Paid shared account and speech features

Future commercial work may add:

- paid product capabilities that do not gate the account synchronization
  planned in Tickets 116–122,
- optional cloud sync for a future mobile client,
- future speech-to-speech AI behavior-review features.

Billing and AI features are not launch scope. Do not add payment
infrastructure, subscription gates, AI coaching, or speech features until
product docs and tickets explicitly move them into scope.

## Web PWA and offline support

Future work may add:
- Installable PWA metadata
- App shell caching
- Cached timeline access
- Local pending status changes while offline
- Upload of pending changes when the connection returns
- Sync conflict handling

Do not implement this in v1.

This restriction applies to the web app. Desktop tracking uses local SQLite
and requires offline writes. Tickets 116–122 may activate its mutation outbox
and cursors without authorizing web offline work.

## Local pending action queue

If web offline status logging is added later, use a small local pending action queue rather than cookies.

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
