# Interaction Registry

## Purpose

`interaction-registry.json` is the canonical inventory of implemented user
interaction intents across Cadence. It gives product, design, QA, and coding
agents one index for answering:

- What can a user intentionally do?
- Where and when is the interaction available?
- What state or side effect can it produce?
- Does it require confirmation?
- Which source files and tests own it?

The registry complements, but does not replace, `docs/UI_SPEC.md`,
`docs/USER_FLOWS.md`, or `docs/UX_JOURNEY_INVENTORY.md`. Those documents define
the product behavior and end-to-end experience. The registry provides stable
interaction IDs and implementation traceability.

## Canonical files

- `interaction-registry.json`: canonical data.
- `interaction-registry.schema.json`: field contract.
- `scripts/check-interactions.mjs`: structural, reference, coverage, and drift
  validation.

The current additive schema version is `1.2.0`. Version 1.1 added required
`user_guidance` metadata without changing the meaning of existing interaction
fields. Version 1.2 adds optional `effect_checks`. Each check binds one recorded
effect to a named implementation handler and stable evidence inside that
handler. `npm run interactions:check` fails when that evidence disappears. It
reports entries without complete mechanical effect coverage for human review
and never counts those entries as mechanically checked.

Do not maintain a second hand-written list of interaction entries. Query or
transform the JSON registry when another representation is needed.

## Registry unit

One entry represents one meaningful user intent, not every DOM event or every
keystroke. Equivalent controls may be grouped as variants when they have the
same intent and effect. For example, primary navigation is one interaction with
Timeline, Behaviors, Export & Import, and Settings variants.

The registry includes:

- the Astro marketing site;
- public login, Terms, Privacy, and Trust pages;
- the authenticated Next.js application;
- pointer, keyboard, and touch triggers implemented by Cadence;
- confirmation fields when changing them is part of a gated action.

The registry excludes:

- passive scrolling, hover, focus, and text selection;
- browser-native controls inside notification permission prompts, file pickers,
  save dialogs, and download shelves;
- interactions inside Google or other provider-owned pages;
- direct API and cron invocation, because those are operator/system actions;
- the local, dev-only design-system bench;
- planned or deferred behavior that has no user-facing implementation.

## Required entry fields

Each interaction records:

- a stable `INT-<DOMAIN>-NNN` ID;
- surface and route ownership;
- linked UX journey IDs;
- intent, triggers, availability, and optional variants;
- success and failure results;
- material effects, risk, and confirmation level;
- implementation references;
- user-guidance audience and one or more task-guide references;
- explicit test-coverage level and references.

`implementation` references use repository-relative paths. A `#symbol` suffix
may identify an exported action or function in that file.

`user_guidance.audience` is `user` for product interactions and `internal_qa`
for test-only interactions. `user_guidance.references` contains unique,
repository-relative `docs/user-guide/*.md#anchor` references. The anchor must be
the GitHub-style slug of an existing Markdown heading. Only `INT-AUTH-002` and
`INT-SHELL-007` use `internal_qa`; their references stay in
`docs/user-guide/internal-qa.md`.

### Test-coverage levels

Coverage describes evidence for the registered user intent and trigger, not
only for adjacent resolver, service, route, or artifact logic:

- `direct`: every cited reference is an automated test under `tests/` that
  renders the registered control or activates the registered interaction and
  asserts its user-visible result or material effect.
- `indirect`: cited automated tests or repository check scripts verify adjacent
  logic, routes, generated artifacts, or state transitions without rendering
  or activating the registered control itself.
- `manual`: the trigger or a browser/provider-owned outcome still requires
  browser, device, or human QA. References may name adjacent automated tests,
  but the notes must state what remains manual.
- `none`: no current test or recorded manual evidence covers the interaction.

Production components, resolvers, services, data modules, and generators are
implementation references, not test evidence. `direct` references must use
`tests/*.test.*` or `tests/*.spec.*`. `indirect` references may additionally use
repository `check-*` scripts.

## Updating the registry

Update the registry in the same change whenever a user-facing interaction is
added, removed, renamed, gated differently, moved to another route, given a new
side effect, or receives materially different test coverage.

1. Reuse an existing ID when the user intent is unchanged.
2. Add a new ID when a genuinely new user intent is introduced.
3. Do not recycle removed IDs for unrelated interactions.
4. Update `source_inventory` for new or removed interactive UI source files and
   refresh `interaction_marker_count` when a file's recognized controls or
   event handlers change. The validator reports the expected and actual count.
5. Add or update the relevant implementation and test references.
6. Add or update `user_guidance` so every interaction points to the applicable
   task procedure. Add the guide procedure in the same change when no suitable
   heading exists.
7. Classify test coverage at the registered trigger boundary. Do not call
   adjacent service, route, parser, resolver, or artifact checks `direct`.
8. Run `npm run interactions:check`. The validator checks the declared
   audience, guide path, file existence, resolved Markdown heading anchor, and
   whether automated evidence references use test or check-script paths.
9. For UI work, also run the project-required design and full verification
   commands.

The one occurrence-time interaction also covers **Reset tracked time** inside
the Behaviors Review disclosure. It reuses the Timing interaction ID because
the owner-scoped deletion intent and service semantics are unchanged. Its
Behaviors component and action must remain listed beside the Timeline controls.

## Load-test companion manifest

`interaction-registry.json` continues to describe user intent. HTTP execution
metadata belongs in `load-tests/scenarios/interaction-map.json`, keyed by the
stable interaction ID; do not add routes, load weights, environment
eligibility, fixture preconditions, or cleanup ownership to the canonical
registry schema.

Every live interaction must have exactly one companion classification:
`loadable_http`, `browser_only`, `external_provider`,
`destructive_serial_only`, or `not_load_bearing`. A loadable interaction may
map to multiple HTTP requests. Non-loadable entries require a concise reason
without copying the registry's intent, risk, effects, success/failure, or
guidance prose.

When either inventory changes, run both checks:

```bash
npm run interactions:check
npm run load:manifest:check
```

The load validator rejects missing, duplicate, unknown, or misclassified IDs
and prevents destructive interactions from entering ordinary mixed profiles.
See `docs/LOAD_TESTING_PLAN.md` for request naming, environment, secret,
artifact, and execution rules.

Ticket 068 classifies occurrence time tracking as `not_load_bearing`. Its
elapsed duration is user-paced and the ordinary authenticated Timeline document
request remains the shared route-capacity proof.

Ticket 070 registers `INT-EXPORT-019` for the default-off time-tracking export
choice. It is `browser_only` because it changes an unsaved sensitive-data scope
draft before the existing export-options request.

Ticket 071 registers `INT-TIMELINE-010` for mobile Timeline pull-to-refresh.
It is `browser_only` because threshold, direction locking, native-refresh
suppression, and touch feedback require a rendered browser. Existing Timeline
read profiles remain the route-capacity proof.

## Useful queries

List all IDs and names:

```bash
jq -r '.interactions[] | "\(.id)\t\(.name)"' interaction-registry.json
```

List destructive interactions:

```bash
jq -r '.interactions[] | select(.risk == "destructive") | .id + "\t" + .name' interaction-registry.json
```

List interactions without direct automated coverage:

```bash
jq -r '.interactions[] | select(.test_coverage.level != "direct") | .id + "\t" + .name + "\t" + .test_coverage.level' interaction-registry.json
```

List interactions for one journey:

```bash
jq -r '.interactions[] | select(.journeys | index("J07")) | .id + "\t" + .name' interaction-registry.json
```

List interaction guide references:

```bash
jq -r '.interactions[] | .id as $id | .user_guidance.references[] | $id + "\t" + .' interaction-registry.json
```
