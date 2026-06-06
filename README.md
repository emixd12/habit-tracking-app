# Cadence Tracker Codex Bootstrap

This folder is the project-definition layer for a new single-user personal behavior tracker.

It does **not** contain application code yet. It contains the instructions and product docs Codex should read before implementation.

## How to use

1. Create a new empty repo folder.
2. Copy these files into the repo root.
3. Start Codex from that folder.
4. Paste the prompt in `CODEX_FIRST_PROMPT.md`.
5. After Codex confirms the architecture and missing blockers, begin with Ticket 001 from `docs/TICKETS.md`.

## Intended app

A sparse personal behavior tracker web app:

- Google login
- Recurring behaviors
- Timeline-first interface
- Manual statuses: `unresolved`, `done`, `not_done`
- Prior unresolved items grouped under **Needs decision**
- Browser reminders on by default
- Optional email reminders per behavior
- JSONL/CSV/full JSON export for AI-readable history

## Important

The app should stay small. It is not a general task manager, not a medical dosing app, not a quantified-self analytics platform, and not a multi-user SaaS product.
