# Interaction audit static findings

## Status and baseline

This is a pre-freeze static evidence report. It is not the immutable
`issues-before-fixes.md` report and does not assign final `IA-###` identifiers.
The parent audit should reconcile these candidates with browser evidence before
freezing the complete issue list.

Evidence was collected from commit
`79b964ac76f37d7dea1e40ae7a896afea086ebb1` with the existing `STATUS.md`
change preserved. The audited `interaction-registry.json` SHA-256 is
`852e30ff18a2dd45d31d3d13537d7d3f65c3f43a42ee30b57bf262735cc097a0`.
At capture time the registry contained 83 interactions, 97 triggers, and 55
variants. `npm run agents:check`, `npm run interactions:check`,
`npm run resolvers:check`, and `npm run test` passed.

Severity meanings for these candidates:

- P0: blocks safe use or causes unrecoverable harm.
- P1: breaks a primary journey or creates serious security/privacy risk.
- P2: materially breaks an interaction, its auditability, or a required
  contract.
- P3: lower-impact documentation, traceability, or coverage debt.

## SF-001 — P2 — Example-bundle route is stale in the registry

Affected interaction: `INT-MKT-009`.

Expected:

- The canonical registry route should name the artifact used by every
  marketing download control and produced by the marketing build.

Actual:

- `interaction-registry.json:650` declares
  `/examples/cadence-example.behaviorlog.zip`.
- `apps/marketing/src/data/site.ts:13` and the CTA at lines 34-36 use
  `/examples/cadence-demo.behaviorlog.zip`.
- `apps/marketing/scripts/check-agent-readability.mjs:45` and lines 111-112
  verify `cadence-demo.behaviorlog.zip`; repository-wide search found no source
  for `cadence-example.behaviorlog.zip` outside the registry.

Impact:

- A registry-driven audit or guide can request a nonexistent artifact and
  incorrectly classify the real download interaction as failed or blocked.
- The user-facing links appear to use the correct `siteConfig` value; this is a
  registry/audit defect, not evidence that the visible CTA itself is broken.

Recommendation:

- Replace the stale registered path with
  `/examples/cadence-demo.behaviorlog.zip` and add a check that the declared
  file-download destination matches the marketing route constant or built
  artifact.

## SF-002 — P2 — Backdrop close is implemented but absent from registry coverage

Affected interaction: `INT-TIMELINE-003`.

Expected:

- Every Cadence-owned pointer, keyboard, and touch trigger should be represented
  by the interaction entry, and the drift checker should recognize the owning
  event handler, as required by `docs/INTERACTION_REGISTRY.md:37-43` and
  `docs/INTERACTION_REGISTRY.md:73-83`.

Actual:

- `interaction-registry.json:940-943` lists only the close button and Escape.
- `components/timeline/NeedsDecisionDialog.tsx:113-116` closes the dialog when
  the backdrop itself is pressed, wired through `onMouseDown` at line 153.
- `scripts/check-interactions.mjs:92-97` does not recognize `onMouseDown`, so
  `interactions:check` passes without counting or requiring traceability for
  this real close path.

Impact:

- The generated 97-trigger matrix omits a real pointer interaction, so an
  exhaustive audit would not cover its target filtering, close behavior, or
  focus restoration.
- Future changes to that handler remain invisible to the current marker-count
  drift check.

Recommendation:

- Add the backdrop activation to `INT-TIMELINE-003`, extend the marker scanner
  to cover the chosen backdrop event, refresh the source marker count, and add
  focused browser or component coverage for backdrop-only close plus focus
  return.

## SF-003 — P3 — Footer machine-resource link is missing source-inventory traceability

Affected interaction: `INT-MKT-010`.

Expected:

- The source inventory should link every interactive source that implements a
  registered intent, including controls shared by two grouped intents.

Actual:

- `interaction-registry.json:677-684` says this interaction is available from
  the footer agent link and names `apps/marketing/src/layouts/BaseLayout.astro`
  as an implementation source.
- `apps/marketing/src/layouts/BaseLayout.astro:88` implements the `llms.txt`
  footer link.
- The BaseLayout inventory entry at `interaction-registry.json:108-117` lists
  `INT-MKT-001` through `INT-MKT-005`, but not `INT-MKT-010`.
- The validator only requires an interaction ID to appear in at least one
  inventory entry (`scripts/check-interactions.mjs:363-370`), so the Docs-page
  mapping masks this per-source omission.

Impact:

- Source-based ownership queries omit one real origin for the machine-resource
  interaction, and a footer change can pass traceability review as long as the
  overall marker count stays unchanged.

Recommendation:

- Add `INT-MKT-010` to the BaseLayout inventory entry and introduce a targeted
  consistency rule or explicit source-role metadata so interactive
  implementation references cannot silently diverge from source inventory.

## SF-004 — P3 — Several coverage references do not exercise the registered trigger

Affected interactions: `INT-AUTH-003`, `INT-MKT-009`, `INT-MKT-010`,
`INT-SETTINGS-001`, and `INT-SETTINGS-004`.

Expected:

- `test_coverage.level` and its references should describe evidence for the
  registered user intent and trigger, not only adjacent service or artifact
  logic.

Actual:

- `INT-AUTH-003` is marked direct with `tests/legal-content.test.tsx`, but that
  test renders `LegalPageContent` and never renders the login page that owns the
  three pre-sign-in links (`tests/legal-content.test.tsx:1-30`).
- `INT-MKT-009` points to `tests/behaviorlog-conformance.test.ts`; lines 294-333
  validate a resolver-generated app export, not the marketing CTA or its built
  `cadence-demo.behaviorlog.zip` artifact. The artifact check that does exist is
  `apps/marketing/scripts/check-agent-readability.mjs:34-112`, which is not
  referenced by the entry.
- `INT-MKT-010` calls coverage indirect but references the production generator
  `apps/marketing/src/data/agent-output.ts` rather than the marketing validation
  script or an interaction test.
- `INT-SETTINGS-001` is marked direct with `tests/settings.service.test.ts`,
  whose relevant cases validate IANA normalization and the save service
  (`tests/settings.service.test.ts:76-88` and 134-214), not the select/manual
  fallback draft interaction declared at `interaction-registry.json:1861-1873`.
- `INT-SETTINGS-004` points to browser helper and API-route tests. They validate
  support, subscription, and persistence logic, but do not render or activate
  `NotificationPermissionPanel` or assert its button-state and recovery UI.

Impact:

- Coverage queries can overstate automation for the exact UI interaction while
  hiding the manual work still required. This does not by itself prove that any
  of the five user-facing interactions is broken.

Recommendation:

- Add focused component/browser assertions for the registered controls and
  state transitions, or lower the coverage level to manual/indirect and cite
  the actual adjacent checks precisely. Reference the marketing artifact check
  where it is the true evidence owner.

## Static parity notes

- All 83 registry IDs are unique and represented once in `results.json`.
- `results.json` contains 97 trigger cases and 55 variant cases, for 152 pending
  cases total.
- Every trigger and variant object in the baseline registry is copied into a
  corresponding case with its original zero-based source index.
- No product source, registry/schema file, checker, or immutable pre-fix issue
  report was changed by this static pass.
