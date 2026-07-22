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
- explicit test-coverage level and references.

`implementation` references use repository-relative paths. A `#symbol` suffix
may identify an exported action or function in that file.

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
6. Run `npm run interactions:check`.
7. For UI work, also run the project-required design and full verification
   commands.

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
