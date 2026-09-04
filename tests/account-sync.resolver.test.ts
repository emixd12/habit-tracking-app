import { describe, expect, it } from "vitest";
import { ACCOUNT_SYNC_ROW_LIMIT, accountSyncFingerprint, resolveAccountSync, resolveFirstLinkReplacement, resolveReviewedAccountSync, type AccountSyncEntity, type AccountSyncSnapshot } from "@cadence/core/resolvers/account-sync.resolver";

const row = (id: string, title: string, user_id = "owner"): AccountSyncEntity => ({ kind: "behavior", id, value: { id, title, user_id } });
const history = (id: string, occurrence: string, predecessor: string | null, status = "completed"): AccountSyncEntity => ({ kind: "status_event", id, value: { id, occurrence_id: occurrence, revises_event_id: predecessor, status, user_id: "owner" } });
const snapshot = (entities: AccountSyncEntity[]): AccountSyncSnapshot => ({ entities });
const empty = snapshot([]);
const plan = (baseline: AccountSyncSnapshot, local: AccountSyncSnapshot, hosted: AccountSyncSnapshot) => resolveAccountSync({ accountLinkId: "link", baseline, local, hosted });

describe("resolveAccountSync", () => {
  it("replaces remapped first-link behavior and history IDs exactly without hosted writes", () => {
    const local = snapshot([row("local-behavior", "Local"), history("local-event", "local-occurrence", null)]);
    const hosted = snapshot([row("hosted-behavior", "Local"), history("hosted-event", "hosted-occurrence", null)]);
    const result = resolveFirstLinkReplacement({ accountLinkId: "link", baseline: local, local, hosted });
    expect(result.hostedWrites).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.localWrites).toMatchObject([
      { id: "hosted-behavior", operation: "upsert" }, { id: "local-behavior", operation: "delete" },
      { id: "hosted-event", operation: "upsert" }, { id: "local-event", operation: "delete" },
    ]);
    expect(result.mergedEntities.map(({ id }) => id)).toEqual(["hosted-behavior", "hosted-event"]);
  });
  it("merges independent changes and normalizes local and hosted ownership", () => {
    const base = snapshot([row("a", "A"), row("b", "B")]);
    const result = plan(base, snapshot([row("a", "Local", "local"), row("b", "B", "local")]), snapshot([row("a", "A", "hosted"), row("b", "Hosted", "hosted")]));
    expect(result.conflicts).toEqual([]);
    expect(result.hostedWrites).toMatchObject([{ id: "a", operation: "upsert", value: { id: "a", title: "Local" } }]);
    expect(result.localWrites).toMatchObject([{ id: "b", operation: "upsert", value: { id: "b", title: "Hosted" } }]);
    expect(result.idempotencyKey!).toHaveLength(64);
  });

  it("synchronizes only profile timezone and includes reminder delivery rows", () => {
    const profile = (id: string, timezone: string, email: string): AccountSyncEntity => ({ kind: "profile", id, value: { id, timezone, email } });
    const delivery: AccountSyncEntity = { kind: "reminder_delivery", id: "r", value: { id: "r", status: "sent", user_id: "hosted" } };
    const base = snapshot([profile("hosted", "UTC", "old@example.test")]);
    const result = plan(base, snapshot([profile("local", "UTC", "local@example.test")]), snapshot([profile("hosted", "America/New_York", "hosted@example.test"), delivery]));
    expect(result.conflicts).toEqual([]);
    expect(result.localWrites.map(({ kind }) => kind)).toEqual(["profile", "reminder_delivery"]);
    expect(result.mergedEntities.find(({ kind }) => kind === "profile")?.value).toEqual({ timezone: "America/New_York" });
  });

  it("propagates one-sided deletes and makes repeated snapshots no-ops", () => {
    const base = snapshot([{ kind: "category", id: "a", value: { id: "a", name: "A" } }]);
    expect(plan(base, empty, base).hostedWrites).toMatchObject([{ id: "a", operation: "delete" }]);
    const replay = plan(base, base, base);
    expect(replay.localWrites).toEqual([]); expect(replay.hostedWrites).toEqual([]);
  });

  it("normalizes equivalent UTC instant encodings without changing local dates or times", () => {
    const local: AccountSyncEntity = { kind: "occurrence", id: "o", value: { id: "o", scheduled_for: "2026-09-01T12:00:00.123456789Z", local_date: "2026-09-01", scheduled_time: "08:00:00" } };
    const hosted: AccountSyncEntity = { ...local, value: { ...local.value as object, scheduled_for: "2026-09-01T12:00:00.123457+00:00" } };
    const result = plan(snapshot([local]), snapshot([local]), snapshot([hosted]));
    expect(result.conflicts).toEqual([]);
    expect(result.localWrites).toEqual([]);
    expect(result.hostedWrites).toEqual([]);
    expect(result.fingerprints.local).toBe(result.fingerprints.hosted);
    expect(result.mergedEntities[0].value).toMatchObject({ local_date: "2026-09-01", scheduled_time: "08:00:00", scheduled_for: "2026-09-01T12:00:00.123457Z" });
  });

  it("uses PostgreSQL bytewise entity ordering and half-even microsecond rounding", () => {
    const entities: AccountSyncEntity[] = [
      { kind: "schedule_slot", id: "slot", value: { id: "slot", created_at: "2026-09-01T12:00:00.123456500Z" } },
      { kind: "schedule", id: "schedule", value: { id: "schedule", created_at: "2026-09-01T12:00:00.123457500Z", metadata: { "𐀀": 2, "": 1 } } },
      { kind: "occurrence", id: "carry", value: { id: "carry", scheduled_for: "2026-09-01T12:00:00.999999500Z" } },
    ];
    const result = plan(empty, snapshot(entities), empty);
    expect(result.mergedEntities.map(({ kind }) => kind)).toEqual(["occurrence", "schedule", "schedule_slot"]);
    expect(result.mergedEntities.map(({ value }) => value)).toMatchObject([
      { scheduled_for: "2026-09-01T12:00:01.000000Z" },
      { created_at: "2026-09-01T12:00:00.123458Z", metadata: { "𐀀": 2, "": 1 } },
      { created_at: "2026-09-01T12:00:00.123456Z" },
    ]);
    expect(accountSyncFingerprint({ entities })).toBe(result.fingerprints.merged);
  });

  it("ignores database-generated occurrence range identity across stores", () => {
    const occurrence = (identity: number): AccountSyncEntity => ({ kind: "occurrence", id: "o", value: { id: "o", status: "unresolved", schedule_range_identity: identity } });
    const local = snapshot([occurrence(-1)]), hosted = snapshot([occurrence(999)]);
    expect(plan(local, local, hosted).localWrites).toEqual([]);
    expect(plan(local, local, hosted).fingerprints.local).toBe(plan(local, local, hosted).fingerprints.hosted);
  });

  it("ignores only server-managed updated_at drift in comparisons and fingerprints", () => {
    const local = snapshot([{ kind: "category", id: "c", value: { id: "c", name: "A", updated_at: "2026-09-01T12:00:00Z", metadata: { updated_at: "keep-a" } } }]);
    const hosted = snapshot([{ kind: "category", id: "c", value: { id: "c", name: "A", updated_at: "2026-09-01T12:01:00Z", metadata: { updated_at: "keep-a" } } }]);
    const result = plan(local, local, hosted);
    expect(result.localWrites).toEqual([]);
    expect(result.hostedWrites).toEqual([]);
    expect(result.fingerprints.local).toBe(result.fingerprints.hosted);
  });

  it("repairs deletion of protected Behavior, provenance, and delivery rows from the retained copy", () => {
    for (const kind of ["behavior", "import_run", "imported_note", "imported_intervention", "reminder_delivery"] as const) {
      const base = snapshot([{ kind, id: kind, value: { id: kind } }]);
      expect(plan(base, empty, base)).toMatchObject({ conflicts: [], localWrites: [{ kind, id: kind, operation: "upsert" }] });
    }
  });

  it("repairs deletion of a resolved Occurrence but reviews an unresolved Occurrence", () => {
    const occurrence = (status: "unresolved" | "completed"): AccountSyncEntity => ({ kind: "occurrence", id: "o", value: { id: "o", status } });
    const resolved = snapshot([occurrence("completed")]);
    expect(plan(resolved, empty, resolved)).toMatchObject({ conflicts: [], localWrites: [{ kind: "occurrence", id: "o", operation: "upsert" }] });
    const unresolved = snapshot([occurrence("unresolved")]), hosted = snapshot([{ ...occurrence("unresolved"), value: { id: "o", status: "unresolved", note: "changed" } }]);
    expect(plan(unresolved, empty, hosted).conflicts).toMatchObject([{ kind: "occurrence", id: "o", reason: "delete_vs_update" }]);
  });

  it("fails the whole plan on concurrent updates and delete versus update", () => {
    const base = snapshot([row("a", "A"), row("b", "B"), row("c", "C")]);
    const result = plan(base, snapshot([row("a", "Local"), row("c", "Local")]), snapshot([row("a", "Hosted"), row("b", "Changed"), row("c", "C")]));
    expect(result.conflicts.map(({ id, reason }) => [id, reason])).toEqual([["a", "concurrent_update"]]);
    expect(result.localWrites).toEqual([]); expect(result.hostedWrites).toEqual([]); expect(result.mergedEntities).toEqual([]); expect(result.idempotencyKey).toBeNull();
  });

  it("unions append-only history but rejects rewrites, deletions, id collisions, and branches", () => {
    const prior = history("prior", "occ", null), localNext = history("local", "occ", "prior"), hostedNext = history("hosted", "occ", "prior");
    expect(plan(snapshot([prior]), snapshot([prior, history("l", "other", null)]), snapshot([prior, history("h", "third", null)])).conflicts).toEqual([]);
    expect(plan(snapshot([prior]), empty, snapshot([prior]))).toMatchObject({ conflicts: [], localWrites: [{ id: "prior", operation: "upsert" }] });
    expect(() => plan(empty, snapshot([history("same", "occ", null)]), snapshot([{ ...history("same", "occ", null), value: { id: "same", occurrence_id: "different" } }]))).toThrow("incompatible append-only history");
    expect(() => plan(snapshot([prior]), snapshot([prior, localNext]), snapshot([prior, hostedNext]))).toThrow("branched status history");
  });

  it("accepts a linear multi-event status chain created on one side", () => {
    const prior = history("prior", "occ", null), next = history("next", "occ", "prior"), final = history("final", "occ", "next");
    expect(plan(snapshot([prior]), snapshot([prior, next, final]), snapshot([prior])).conflicts).toEqual([]);
  });

  it("preserves same-status hosted branches only during first hydration", () => {
    const first = history("first", "occ", null), second = history("second", "occ", null);
    const hydrated = resolveAccountSync({ accountLinkId: "link", baseline: empty, local: empty, hosted: snapshot([first, second]), firstHostedHydration: true });
    expect(hydrated.conflicts).toEqual([]);
    expect(hydrated.hostedWrites).toEqual([]);
    expect(hydrated.localWrites).toMatchObject([{ id: "first", operation: "upsert" }, { id: "second", operation: "upsert" }]);
    expect(hydrated.mergedEntities.map(({ id }) => id)).toEqual(["first", "second"]);

    expect(() => resolveAccountSync({ accountLinkId: "link", baseline: empty, local: empty,
      hosted: snapshot([first, history("different", "occ", null, "not_completed")]), firstHostedHydration: true })).toThrow("hosted account snapshot contains branched status history");
    expect(() => resolveAccountSync({ accountLinkId: "link", baseline: empty, local: snapshot([first, second]), hosted: empty, firstHostedHydration: true })).toThrow("local account snapshot contains branched status history");
    const prior = history("prior", "later", null);
    expect(() => resolveAccountSync({ accountLinkId: "link", baseline: snapshot([prior]), local: snapshot([prior]),
      hosted: snapshot([prior, history("next-a", "later", "prior"), history("next-b", "later", "prior")]), firstHostedHydration: true })).toThrow("hosted account snapshot contains branched status history");
  });

  it("produces stable fingerprints regardless of row, object-key, and owner order", () => {
    const first = snapshot([row("b", "B"), { kind: "category", id: "a", value: { name: "A", id: "a" } }]);
    const second = snapshot([{ kind: "category", id: "a", value: { id: "a", name: "A" } }, row("b", "B", "different-owner")]);
    expect(plan(first, first, first).fingerprints!).toEqual(plan(second, second, second).fingerprints!);
    expect(plan(first, first, first).idempotencyKey).toBe(plan(second, second, second).idempotencyKey);
  });

  it("preserves domain revision fields while removing ownership", () => {
    const revised: AccountSyncEntity = { kind: "behavior", id: "a", value: { id: "a", revision: 3, user_id: "local", metadata: { user_id: "provenance-owner" } } };
    expect(plan(empty, snapshot([revised]), empty).hostedWrites[0].value).toEqual({ id: "a", revision: 3, metadata: { user_id: "provenance-owner" } });
  });

  it("rejects duplicate identities and collection rows above the ceiling", () => {
    expect(() => plan(empty, snapshot([row("a", "A"), row("a", "A")]), empty)).toThrow("Duplicate account synchronization entity");
    const rows = Array.from({ length: ACCOUNT_SYNC_ROW_LIMIT + 1 }, (_, index) => row(String(index), "A"));
    expect(() => plan(empty, snapshot(rows), empty)).toThrow("exceeds 100,000 rows");
  });

  it("applies reviewed winners and rejects a stale review", () => {
    const base = snapshot([row("a", "A")]), local = snapshot([row("a", "Local")]), hosted = snapshot([row("a", "Hosted")]);
    const review = plan(base, local, hosted);
    const resolved = resolveReviewedAccountSync({ accountLinkId: "link", baseline: base, local, hosted,
      reviewedFingerprints: review.fingerprints, decisions: [{ kind: "behavior", id: "a", choice: "local" }] });
    expect(resolved.conflicts).toEqual([]);
    expect(resolved.hostedWrites).toMatchObject([{ id: "a", value: { id: "a", title: "Local" } }]);
    expect(resolved.localWrites).toEqual([]);
    const accountWinner = resolveReviewedAccountSync({ accountLinkId: "link", baseline: base, local, hosted,
      reviewedFingerprints: review.fingerprints, decisions: [{ kind: "behavior", id: "a", choice: "hosted" }] });
    expect(accountWinner.localWrites).toMatchObject([{ id: "a", operation: "upsert", value: { id: "a", title: "Hosted" } }]);
    expect(accountWinner.hostedWrites).toEqual([]);
    expect(() => resolveReviewedAccountSync({ accountLinkId: "link", baseline: base, local: snapshot([row("a", "Changed again")]), hosted,
      reviewedFingerprints: review.fingerprints, decisions: [{ kind: "behavior", id: "a", choice: "local" }] })).toThrow("review is stale");
  });

  it("produces legal upsert or delete plans for both delete-versus-update choices", () => {
    const category = (name: string): AccountSyncEntity => ({ kind: "category", id: "c", value: { id: "c", name } });
    const base = snapshot([category("Base")]), local = empty, hosted = snapshot([category("Account")]), review = plan(base, local, hosted);
    expect(review.conflicts).toMatchObject([{ kind: "category", id: "c", reason: "delete_vs_update" }]);
    const keepDeleted = resolveReviewedAccountSync({ accountLinkId: "link", baseline: base, local, hosted,
      reviewedFingerprints: review.fingerprints, decisions: [{ kind: "category", id: "c", choice: "local" }] });
    expect(keepDeleted.hostedWrites).toMatchObject([{ kind: "category", id: "c", operation: "delete" }]);
    const keepAccount = resolveReviewedAccountSync({ accountLinkId: "link", baseline: base, local, hosted,
      reviewedFingerprints: review.fingerprints, decisions: [{ kind: "category", id: "c", choice: "hosted" }] });
    expect(keepAccount.localWrites).toMatchObject([{ kind: "category", id: "c", operation: "upsert" }]);
  });

  it("does not offer Keep both when duplicating one identity would break graph references", () => {
    const category = (name: string): AccountSyncEntity => ({ kind: "category", id: "c", value: { id: "c", name } });
    const base = snapshot([category("Base")]), local = snapshot([category("Mac")]), hosted = snapshot([category("Account")]);
    const review = plan(base, local, hosted);
    expect(() => resolveReviewedAccountSync({ accountLinkId: "link", baseline: base, local, hosted,
      reviewedFingerprints: review.fingerprints, decisions: [{ kind: "category", id: "c", choice: "both", duplicateId: "copy" }] })).toThrow("Keep both is unavailable");
  });

  it("rejects invalid same-side and cross-side history branches before review", () => {
    const prior = history("prior", "occ", null), first = history("first", "occ", "prior"), second = history("second", "occ", "prior");
    expect(() => plan(snapshot([prior]), snapshot([prior, first, second]), snapshot([prior]))).toThrow("local account snapshot contains branched status history");
    expect(() => plan(snapshot([prior]), snapshot([prior]), snapshot([prior, first, second]))).toThrow("hosted account snapshot contains branched status history");
    expect(() => plan(snapshot([prior]), snapshot([prior, first]), snapshot([prior, second]))).toThrow("branched status history");
  });
});
