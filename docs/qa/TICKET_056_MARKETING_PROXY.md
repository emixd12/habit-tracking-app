# Ticket 056 Marketing Proxy QA

Date: 2026-07-09

This is owner-approved agent-proxy browser testing, not real-user research. It
does not validate external user comprehension. Independent first-time human
testing remains necessary before making that claim.

## Method

Three independent agents started with only the local public marketing site at
`http://localhost:4322/`. Each completed a distinct first-time visitor task
before the copy correction and repeated it after the correction. No agent read
repository source or documentation before its initial walkthrough. Browser DOM
evidence and full-page screenshots were captured where the browser session
permitted it. The rerun screenshots retained here show the corrected public
surface, not private account data.

## Initial Walkthroughs

### 1. Simple Tracker Shopper

- Persona: First-time visitor comparing simple habit trackers.
- Task: Identify the product, its scope boundaries, BehaviorLog's role, and a
  practical next step.
- Route evidence: `/` -> `/cadence` -> `/about`.
- Outcome: Identified a private, single-person recurring-behavior tracker with
  manual Completed, Not Completed, and Unresolved decisions; found the login
  path and exclusions for teams, social features, gamification, medical dosing,
  calendar sync, billing, and AI coaching.
- Hesitation: BehaviorLog appeared before the plain-language Cadence overview,
  creating a brief product-versus-format distinction burden.
- Evidence: Browser DOM walkthrough and agent-session full-page screenshots;
  durable corrected-surface evidence is
  [Cadence scope screenshot](ticket-056-cadence-after-desktop.png).

### 2. Portability-Focused Visitor

- Persona: Technically literate visitor bringing CSV or JSON behavior data.
- Task: Distinguish Cadence from BehaviorLog, identify what history is
  preserved, and find documentation, examples, and the app entry path.
- Route evidence: `/` -> `/cadence` -> `/standard` -> `/docs` -> `/examples`.
- Outcome: Identified Cadence as the private single-player tracker and
  BehaviorLog as the open export/import record format with behavior,
  schedule, occurrence, status-event, note, provenance, and hash records.
  Found the documentation, machine-readable files, example bundle, and login
  path.
- Hesitation: "Open tracker" could mean open source or an unresolved tracking
  state; "JSONL is authoritative" requires format familiarity.
- Evidence: Browser DOM walkthrough and agent-session screenshots; durable
  corrected-surface evidence is
  [BehaviorLog screenshot](ticket-056-standard-after-desktop.png).

### 3. Privacy-Conscious Account Evaluator

- Persona: First-time visitor deciding whether to create a personal account.
- Task: Identify Cadence's purpose and account boundary, find Trust, Privacy,
  and Terms before login, understand portability, and choose a next step.
- Route evidence: `/` -> `/cadence` -> `/about` -> `/standard` -> `/docs` ->
  `/examples` -> public Trust, Privacy, and Terms links.
- Outcome: Identified the personal recurring-behavior tracker, private
  single-player posture, visible legal and trust paths, BehaviorLog
  portability, and the login path.
- Hesitation: The Cadence versus BehaviorLog relationship was initially less
  immediate than the privacy/legal path. Reminder channels and permissions were
  not explained.
- Evidence: Browser DOM walkthrough and agent-session screenshots; durable
  corrected-surface evidence is
  [public Trust screenshot](ticket-056-trust-after-desktop.png).

## Correction

The homepage now names Cadence as the open-source personal behavior tracker and
defines BehaviorLog as the portable export file format that Cadence reads and
writes. This fixes the two repeated initial findings without adding navigation,
tracking, or unsupported product claims.

## Rerun Walkthroughs

### 1. Simple Tracker Shopper

- Task: Repeat product, scope, BehaviorLog, and next-step discovery.
- Outcome: Correctly identified Cadence as a one-person open-source tracker,
  the manual status model, exclusions, BehaviorLog's file-format role, and the
  login path.
- Remaining confusion: Reminder setup details are not explained. This is not
  material to the ticket's discovery goal.
- Evidence: Browser DOM for `/` and `/cadence`; see
  [desktop Cadence scope](ticket-056-cadence-after-desktop.png) and
  [390px homepage](ticket-056-home-after-390.png).

### 2. Portability-Focused Visitor

- Task: Repeat product-versus-format, history, docs, examples, and app entry
  discovery.
- Outcome: Correctly identified Cadence as the tracker and BehaviorLog as the
  portable interoperable format. Correctly identified `status_events.jsonl` as
  history authority and CSV as non-authoritative.
- Remaining confusion: None material to the task.
- Evidence: Browser DOM for `/`, `/standard`, `/docs`, and `/examples`; see
  [desktop homepage](ticket-056-home-after-desktop.png) and
  [desktop BehaviorLog page](ticket-056-standard-after-desktop.png).

### 3. Privacy-Conscious Account Evaluator

- Task: Repeat purpose, account-boundary, pre-login legal/trust, portability,
  and next-step discovery.
- Outcome: Correctly identified a one-person tracker, the manual status model,
  the portable BehaviorLog export, and pre-login Trust, Privacy, Terms, and
  login paths.
- Remaining confusion: JSONL details remain intentionally technical, but the
  product-versus-format relationship was clear.
- Evidence: Browser DOM for `/` and public legal routes; see
  [desktop homepage](ticket-056-home-after-desktop.png) and
  [public Trust page](ticket-056-trust-after-desktop.png).

## Result

The three proxy personas completed the Ticket 056 discovery, portability, and
pre-login trust tasks after the correction without material Cadence-versus-
BehaviorLog confusion. The result is sufficient only for the owner-approved
proxy acceptance of this ticket. It is not evidence of externally validated
comprehension.
