# Cadence Tracker Codex Bootstrap

This folder is the project-definition layer for a new single-user personal behavior tracker.

It does **not** contain application code yet. It contains the instructions and product docs Codex should read before implementation.

## How to use

1. Start the coding agent from this repository root.
2. Have the agent read `AGENTS.md`, then `STATUS.md`, then the relevant files under `docs/`.
3. Use `STATUS.md` to confirm what has already been implemented, verified, blocked, or deferred.
4. Use `docs/TICKETS.md` for ticket scope and acceptance criteria. For a fresh build, begin with Ticket 001.
5. Update `STATUS.md` whenever a ticket starts, completes, becomes blocked, or materially changes scope.

If these bootstrap files are copied into a new repository, copy the full project-definition layer, including `AGENTS.md`, `STATUS.md`, `PRODUCT.md`, `DESIGN.md`, `.env.example`, `.agents/`, and `docs/`.

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
