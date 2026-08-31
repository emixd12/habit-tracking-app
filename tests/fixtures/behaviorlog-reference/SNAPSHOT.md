# BehaviorLog Reference Validator Snapshot

Source: `https://github.com/emixd12/BehaviorLog-Bundle`

Snapshot: local BehaviorLog Bundle `0.3.0-draft` working tree, `2026-08-30`.
This implementation is not yet committed upstream. The file digests identify
the exact adopted snapshot:

- Schema SHA-256: `decc5f8beee90f1d5f1c9c176fb0ecf255e72516a21b4f6fdc26f6f2b05ad340`
- Validator SHA-256: `52a77f1c9ec52e38c1b7fe9aaf941487cb0809eb62620a3794cc31acb5b9adcb`

Vendored files:
- `reference/validate.mjs` stored at `tests/fixtures/behaviorlog-reference/validate.mjs`
- `schema/behaviorlog.schema.json` stored at `packages/core/src/behaviorlog.schema.json`

Local adaptation:
- None. Both vendored files are byte-exact copies of the local standard snapshot.

Purpose:
- Keep Cadence's BehaviorLog core conformance harness deterministic while the upstream draft evolves.
- Update this snapshot intentionally when adopting a newer upstream BehaviorLog Bundle draft.
