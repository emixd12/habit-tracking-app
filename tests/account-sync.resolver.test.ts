import { describe, expect, it } from "vitest";
import { ACCOUNT_SYNC_ROW_LIMIT, accountSyncFingerprint, resolveAccountSync, resolveFirstLinkReplacement, resolveReviewedAccountSync, type AccountSyncEntity, type AccountSyncSnapshot } from "@cadence/core/resolvers/account-sync.resolver";

const row = (id: string, title: string, user_id = "owner"): AccountSyncEntity => ({ kind: "behavior", id, value: { id, title, user_id } });
const history = (id: string, occurrence: string, predecessor: string | null, status = "completed"): AccountSyncEntity => ({ kind: "status_event", id, value: { id, occurrence_id: occurrence, revises_event_id: predecessor, status, user_id: "owner" } });
const rawSnapshot = (entities: AccountSyncEntity[]): AccountSyncSnapshot => ({ entities });
const snapshot = (entities: AccountSyncEntity[]): AccountSyncSnapshot => {
  const rows = new Map<string, AccountSyncEntity>();
  const add = (entity: AccountSyncEntity) => rows.set(entity.kind === "profile" ? "profile:profile" : `${entity.kind}:${entity.id}`, entity);
  add({ kind: "profile", id: "profile", value: { timezone: "UTC" } });
  for (const source of entities) {
    const value = source.value && !Array.isArray(source.value) && typeof source.value === "object" ? { ...source.value } : source.value;
    if (value && !Array.isArray(value) && typeof value === "object") {
      if (["schedule", "schedule_slot", "definition_event", "configuration_event", "occurrence", "status_event", "time_session"].includes(source.kind)) value.behavior_id ??= "fixture-behavior";
      if (["mapping", "imported_note", "imported_intervention"].includes(source.kind)) value.import_run_id ??= "fixture-import";
    }
    add({ ...source, value });
  }
  for (const entity of [...rows.values()]) {
    const value = entity.value && !Array.isArray(entity.value) && typeof entity.value === "object" ? entity.value : {};
    const behaviorId = typeof value.behavior_id === "string" ? value.behavior_id : null;
    if (behaviorId && !rows.has(`behavior:${behaviorId}`)) add(row(behaviorId, "Fixture Behavior"));
    const occurrenceId = typeof value.occurrence_id === "string" ? value.occurrence_id : null;
    if (occurrenceId && !rows.has(`occurrence:${occurrenceId}`)) add({ kind: "occurrence", id: occurrenceId, value: { id: occurrenceId, behavior_id: behaviorId ?? "fixture-behavior", status: "unresolved" } });
    const importRunId = typeof value.import_run_id === "string" ? value.import_run_id : null;
    if (importRunId && !rows.has(`import_run:${importRunId}`)) add({ kind: "import_run", id: importRunId, value: { id: importRunId } });
  }
  if ([...rows.values()].some(({ kind, value }) => kind === "occurrence" && value && !Array.isArray(value) && typeof value === "object" && value.behavior_id === "fixture-behavior") && !rows.has("behavior:fixture-behavior")) add(row("fixture-behavior", "Fixture Behavior"));
  return rawSnapshot([...rows.values()]);
};
const empty = snapshot([]);
const rawEmpty = rawSnapshot([]);
const plan = (baseline: AccountSyncSnapshot, local: AccountSyncSnapshot, hosted: AccountSyncSnapshot) => resolveAccountSync({ accountLinkId: "link", baseline, local, hosted });
const completeRows = (extra: AccountSyncEntity[] = []): AccountSyncEntity[] => [
  { kind: "profile", id: "profile", value: { timezone: "UTC" } },
  { kind: "behavior", id: "b", value: { id: "b", title: "Behavior", status: "active" } },
  ...extra,
];
const occurrence = (status = "unresolved", note: string | null = null): AccountSyncEntity => ({
  kind: "occurrence", id: "o", value: { id: "o", behavior_id: "b", status, note, scheduled_for: "2026-09-01T12:00:00Z" },
});
const reminder = (status: "pending" | "sent" | "failed" | "cancelled" = "pending"): AccountSyncEntity => ({
  kind: "reminder_delivery", id: `r-${status}`, value: { id: `r-${status}`, occurrence_id: "o", status },
});
const shortcutBehaviorId = "11111111-1111-4111-8111-111111111111";
const excludedA = "22222222-2222-4222-8222-222222222222";
const excludedB = "33333333-3333-4333-8333-333333333333";
const excludedLocal = "44444444-4444-4444-8444-444444444444";
const excludedHosted = "55555555-5555-4555-8555-555555555555";
const acceptedShortcut = (key: string, text: string) => ({
  key: key.repeat(64), text, status: "accepted" as const, source: "repeated_text" as const,
  evidence: [], created_at: "2026-09-01T12:00:00Z", expires_at: null,
});
const shortcutState = (excluded: string[], revision: number, entry?: ReturnType<typeof acceptedShortcut>): AccountSyncEntity => ({
  kind: "note_shortcut_state", id: shortcutBehaviorId, value: {
    id: shortcutBehaviorId, user_id: "normalized-owner", behavior_id: shortcutBehaviorId, enabled: true,
    entries: entry ? [entry] : [], excluded_occurrence_ids: excluded, revision, updated_at: `2026-09-01T12:00:0${revision}Z`,
  },
});

describe("resolveAccountSync", () => {
  it("replaces remapped first-link behavior and history IDs exactly without hosted writes", () => {
    const local = snapshot([row("local-behavior", "Local"), history("local-event", "local-occurrence", null)]);
    const hosted = snapshot([row("hosted-behavior", "Local"), history("hosted-event", "hosted-occurrence", null)]);
    const result = resolveFirstLinkReplacement({ accountLinkId: "link", baseline: local, local, hosted });
    expect(result.hostedWrites).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.localWrites.filter(({ id }) => ["hosted-behavior", "hosted-event", "local-behavior", "local-event"].includes(id))).toMatchObject([
      { id: "hosted-behavior", operation: "upsert" }, { id: "hosted-event", operation: "upsert" },
      { id: "local-behavior", operation: "delete" }, { id: "local-event", operation: "delete" },
    ]);
    expect(result.mergedEntities.filter(({ id }) => ["hosted-behavior", "hosted-event"].includes(id)).map(({ id }) => id)).toEqual(["hosted-behavior", "hosted-event"]);
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
    const behavior = row("b", "Behavior");
    const occurrence: AccountSyncEntity = { kind: "occurrence", id: "o", value: { id: "o", behavior_id: "b", status: "unresolved" } };
    const delivery: AccountSyncEntity = { kind: "reminder_delivery", id: "r", value: { id: "r", occurrence_id: "o", status: "sent", user_id: "hosted" } };
    const base = snapshot([profile("hosted", "UTC", "old@example.test"), behavior, occurrence]);
    const result = plan(base, snapshot([profile("local", "UTC", "local@example.test"), behavior, occurrence]), snapshot([profile("hosted", "America/New_York", "hosted@example.test"), behavior, occurrence, delivery]));
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

  it("deletes an attached reminder when an unresolved Occurrence deletion is accepted", () => {
    const occurrence: AccountSyncEntity = { kind: "occurrence", id: "o", value: { id: "o", behavior_id: "b", status: "unresolved", note: null } };
    const reminder: AccountSyncEntity = { kind: "reminder_delivery", id: "r", value: { id: "r", occurrence_id: "o", status: "sent" } };
    const baseline = snapshot(completeRows([occurrence, reminder]));
    const result = plan(baseline, snapshot(completeRows()), baseline);

    expect(result.localWrites).toEqual([]);
    expect(result.hostedWrites).toMatchObject([
      { kind: "reminder_delivery", id: "r", operation: "delete" },
      { kind: "occurrence", id: "o", operation: "delete" },
    ]);
  });

  it("deletes every reminder status with an accepted parent in either direction", () => {
    const reminders = (["pending", "sent", "failed", "cancelled"] as const).map(reminder);
    const baseline = snapshot(completeRows([occurrence(), ...reminders]));
    const deleted = snapshot(completeRows());
    const localDeletion = plan(baseline, deleted, baseline);
    expect(localDeletion.hostedWrites.map(({ kind, operation }) => [kind, operation])).toEqual([
      ...reminders.map(() => ["reminder_delivery", "delete"]),
      ["occurrence", "delete"],
    ]);
    const hostedDeletion = plan(baseline, baseline, deleted);
    expect(hostedDeletion.localWrites.map(({ kind, operation }) => [kind, operation])).toEqual([
      ...reminders.map(() => ["reminder_delivery", "delete"]),
      ["occurrence", "delete"],
    ]);
    expect(plan(baseline, deleted, deleted).mergedEntities.some(({ kind }) => kind === "reminder_delivery" || kind === "occurrence")).toBe(false);
  });

  it("rejects incomplete input graphs instead of inferring parent deletion", () => {
    const baseline = snapshot(completeRows([occurrence(), reminder()]));
    expect(() => plan(baseline, rawEmpty, baseline)).toThrow("requires complete baseline, local, and hosted graphs");
    expect(() => plan(rawEmpty, rawEmpty, rawEmpty)).toThrow("requires complete baseline, local, and hosted graphs");
    const orphaned = rawSnapshot(completeRows([reminder()]));
    expect(() => plan(baseline, orphaned, baseline)).toThrow("references missing occurrence o; read a complete graph");
    const malformed = rawSnapshot(completeRows([{ kind: "reminder_delivery", id: "r", value: { id: "r", status: "pending" } }]));
    expect(() => plan(baseline, malformed, baseline)).toThrow("missing required reference occurrence_id");
  });

  it("rejects a merge that would retain a child after deleting its parent", () => {
    const category: AccountSyncEntity = { kind: "category", id: "c", value: { id: "c", name: "Category" } };
    const behavior: AccountSyncEntity = { kind: "behavior", id: "linked", value: { id: "linked", category_id: "c", title: "Linked" } };
    const baseline = snapshot([category]);
    expect(() => plan(baseline, empty, snapshot([category, behavior]))).toThrow("references missing category c; read a complete graph");
  });

  it("restores Occurrences and reminders that contain protected user data", () => {
    const protectedGraphs = [
      completeRows([occurrence("completed"), reminder("sent")]),
      completeRows([occurrence("unresolved", "User Note"), reminder("failed")]),
      completeRows([occurrence(), { kind: "status_event", id: "s", value: { id: "s", behavior_id: "b", occurrence_id: "o", revises_event_id: null, status: "completed" } }, reminder("cancelled")]),
      completeRows([occurrence(), { kind: "time_session", id: "t", value: { id: "t", behavior_id: "b", occurrence_id: "o" } }, reminder("pending")]),
    ];
    for (const rows of protectedGraphs) {
      const baseline = snapshot(rows);
      const deleted = snapshot(completeRows());
      const result = plan(baseline, deleted, baseline);
      expect(result.conflicts).toEqual([]);
      expect(result.localWrites.some(({ kind, operation }) => kind === "occurrence" && operation === "upsert")).toBe(true);
      expect(result.localWrites.some(({ kind, operation }) => kind === "reminder_delivery" && operation === "upsert")).toBe(true);
      expect(result.hostedWrites).toEqual([]);
    }
  });

  it("deletes reminders after reviewed acceptance of an unprotected parent deletion", () => {
    const baseline = snapshot(completeRows([occurrence(), reminder("sent")]));
    const local = snapshot(completeRows());
    const hosted = snapshot(completeRows([{ ...occurrence(), value: { ...(occurrence().value as object), scheduled_for: "2026-09-01T13:00:00Z" } }, reminder("sent")]));
    const review = plan(baseline, local, hosted);
    const resolved = resolveReviewedAccountSync({ accountLinkId: "link", baseline, local, hosted,
      reviewedFingerprints: review.fingerprints, decisions: [{ kind: "occurrence", id: "o", choice: "local" }] });
    expect(resolved.hostedWrites.map(({ kind, operation }) => [kind, operation])).toEqual([
      ["reminder_delivery", "delete"], ["occurrence", "delete"],
    ]);
    expect(resolved.localWrites).toEqual([]);
  });

  it("does not let conflict review delete protected Occurrence content", () => {
    const baseline = snapshot(completeRows([occurrence(), reminder()]));
    const local = snapshot(completeRows());
    const hosted = snapshot(completeRows([occurrence("unresolved", "Account Note"), reminder()]));
    const review = plan(baseline, local, hosted);
    expect(() => resolveReviewedAccountSync({ accountLinkId: "link", baseline, local, hosted,
      reviewedFingerprints: review.fingerprints, decisions: [{ kind: "occurrence", id: "o", choice: "local" }] }))
      .toThrow("cannot be deleted during synchronization");
  });

  it("routes deletion versus newly tracked time through conflict review", () => {
    const baseline = snapshot(completeRows([occurrence(), reminder()]));
    const local = snapshot(completeRows());
    const hosted = snapshot(completeRows([occurrence(), { kind: "time_session", id: "t", value: { id: "t", behavior_id: "b", occurrence_id: "o" } }, reminder()]));
    expect(plan(baseline, local, hosted).conflicts).toMatchObject([
      { kind: "occurrence", id: "o", reason: "delete_vs_update" },
    ]);
  });

  it("synchronizes Note shortcut state as a mutable whole row", () => {
    const shortcut = (revision: number, enabled = true): AccountSyncEntity => ({ kind: "note_shortcut_state", id: "global", value: {
      id: "global", behavior_id: null, enabled, entries: [], excluded_occurrence_ids: [], revision, updated_at: `2026-09-01T12:00:0${revision}Z`,
    } });
    const base = snapshot([shortcut(1)]);
    expect(plan(base, snapshot([shortcut(2, false)]), base).hostedWrites).toMatchObject([{ kind: "note_shortcut_state", operation: "upsert", value: { revision: 2, enabled: false } }]);
    expect(plan(base, empty, base).hostedWrites).toMatchObject([{ kind: "note_shortcut_state", operation: "delete" }]);
    expect(plan(base, snapshot([shortcut(2)]), snapshot([shortcut(3)])).conflicts).toMatchObject([{ kind: "note_shortcut_state", reason: "concurrent_update" }]);
  });

  it("restores exclusions cleared by an ordinary one-sided state edit", () => {
    const behavior = row(shortcutBehaviorId, "Behavior");
    const base = snapshot([behavior, shortcutState([excludedA], 1)]);
    const result = plan(base, snapshot([behavior, shortcutState([], 2)]), base);
    expect(result.mergedEntities.find(({ kind }) => kind === "note_shortcut_state")?.value).toMatchObject({ excluded_occurrence_ids: [excludedA], revision: 3 });
    expect(result.localWrites).toMatchObject([{ kind: "note_shortcut_state", operation: "upsert", value: { excluded_occurrence_ids: [excludedA], revision: 3 } }]);
    expect(result.hostedWrites).toMatchObject([{ kind: "note_shortcut_state", operation: "upsert", value: { excluded_occurrence_ids: [excludedA], revision: 3 } }]);
  });

  it("retains exclusions but clears text when an ordinary state deletion wins", () => {
    const behavior = row(shortcutBehaviorId, "Behavior");
    const state = shortcutState([excludedA], 1, acceptedShortcut("d", "Private text"));
    const base = snapshot([behavior, state]);
    const result = plan(base, snapshot([behavior]), base);
    expect(result.mergedEntities.find(({ kind }) => kind === "note_shortcut_state")?.value).toEqual({
      id: shortcutBehaviorId, behavior_id: shortcutBehaviorId, enabled: false, entries: [], excluded_occurrence_ids: [excludedA], revision: 2, updated_at: "2026-09-01T12:00:01.000000Z",
    });
    expect(result.hostedWrites).toMatchObject([{ kind: "note_shortcut_state", operation: "upsert", value: { enabled: false, entries: [], excluded_occurrence_ids: [excludedA] } }]);
  });

  it("unions exclusions after reviewed state conflict without merging losing text", () => {
    const behavior = row(shortcutBehaviorId, "Behavior");
    const baseline = snapshot([behavior, shortcutState([], 1, acceptedShortcut("a", "Base"))]);
    const local = snapshot([behavior, shortcutState([excludedA], 2, acceptedShortcut("b", "Local"))]);
    const hosted = snapshot([behavior, shortcutState([excludedB], 2, acceptedShortcut("c", "Hosted"))]);
    const review = plan(baseline, local, hosted);
    const resolved = resolveReviewedAccountSync({ accountLinkId: "link", baseline, local, hosted,
      reviewedFingerprints: review.fingerprints, decisions: [{ kind: "note_shortcut_state", id: shortcutBehaviorId, choice: "hosted" }] });
    expect(resolved.mergedEntities.find(({ kind }) => kind === "note_shortcut_state")?.value).toMatchObject({
      entries: [{ key: "c".repeat(64), text: "Hosted" }], excluded_occurrence_ids: [excludedA, excludedB], revision: 3,
    });
    expect(JSON.stringify(resolved.mergedEntities)).not.toContain("Local");
  });

  it("turns a reviewed state deletion into a text-free exclusion marker", () => {
    const behavior = row(shortcutBehaviorId, "Behavior");
    const baseline = snapshot([behavior, shortcutState([excludedA], 1, acceptedShortcut("a", "Base"))]);
    const local = snapshot([behavior]);
    const hosted = snapshot([behavior, shortcutState([excludedA, excludedB], 2, acceptedShortcut("c", "Hosted"))]);
    const review = plan(baseline, local, hosted);
    const resolved = resolveReviewedAccountSync({ accountLinkId: "link", baseline, local, hosted,
      reviewedFingerprints: review.fingerprints, decisions: [{ kind: "note_shortcut_state", id: shortcutBehaviorId, choice: "local" }] });
    expect(resolved.mergedEntities.find(({ kind }) => kind === "note_shortcut_state")?.value).toEqual({
      id: shortcutBehaviorId, behavior_id: shortcutBehaviorId, enabled: false, entries: [], excluded_occurrence_ids: [excludedA, excludedB], revision: 3, updated_at: "2026-09-01T12:00:02.000000Z",
    });
    expect(JSON.stringify(resolved.mergedEntities)).not.toContain("Hosted");
  });

  it("discards local exclusions only under the explicit first-link policy", () => {
    const behavior = row(shortcutBehaviorId, "Behavior");
    const baseline = snapshot([behavior, shortcutState([excludedLocal], 1)]);
    const local = baseline;
    const hosted = snapshot([behavior, shortcutState([excludedHosted], 2)]);
    const result = resolveAccountSync({ accountLinkId: "link", baseline, local, hosted, noteShortcutExclusionPolicy: "discard_local" });
    expect(result.mergedEntities.find(({ kind }) => kind === "note_shortcut_state")?.value).toMatchObject({ excluded_occurrence_ids: [excludedHosted], revision: 2 });
  });

  it("keeps explicit first-link replacement exact and enforces the exclusion ceiling", () => {
    const behavior = row(shortcutBehaviorId, "Behavior");
    const replacement = resolveFirstLinkReplacement({ accountLinkId: "link", baseline: empty,
      local: snapshot([behavior, shortcutState([excludedLocal], 1)]), hosted: snapshot([behavior, shortcutState([excludedHosted], 1)]) });
    expect(replacement.mergedEntities.find(({ kind }) => kind === "note_shortcut_state")?.value).toMatchObject({ excluded_occurrence_ids: [excludedHosted], revision: 1 });
    const tooMany = Array.from({ length: ACCOUNT_SYNC_ROW_LIMIT + 1 }, (_, index) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`);
    expect(() => plan(empty, snapshot([behavior, shortcutState(tooMany, 1)]), empty)).toThrow("invalid for synchronization");
    const exhausted: AccountSyncEntity = { ...shortcutState([excludedA], 1), value: { ...(shortcutState([excludedA], 1).value as object), revision: 2_147_483_647 } };
    expect(() => plan(snapshot([behavior, exhausted]), snapshot([behavior, shortcutState([], 1)]), snapshot([behavior, exhausted]))).toThrow("revision cannot be advanced");
    const invalid: AccountSyncEntity = { ...exhausted, value: { ...(exhausted.value as object), revision: 2_147_483_648 } };
    expect(() => accountSyncFingerprint(snapshot([behavior, invalid]))).toThrow("invalid for synchronization");
    expect(() => plan(empty, snapshot([behavior, invalid]), snapshot([behavior, invalid]))).toThrow("invalid for synchronization");
  });

  it("rejects malformed Note shortcut state before fingerprinting or no-op planning", () => {
    const valid = shortcutState([], 1, acceptedShortcut("a", "Valid shortcut"));
    const value = valid.value as Record<string, unknown>;
    const malformedValues = [
      { ...value, enabled: "yes" },
      { ...value, entries: "invalid" },
      { ...value, entries: [{ ...acceptedShortcut("a", "Valid shortcut"), evidence: "invalid" }] },
      { ...value, entries: [{ ...acceptedShortcut("a", "Valid shortcut"), created_at: "invalid" }] },
      { ...value, updated_at: "invalid" },
      { ...value, schedule_range_identity: 1 },
    ];
    for (const malformedValue of malformedValues) {
      const malformed = { ...valid, value: malformedValue } as AccountSyncEntity;
      expect(() => accountSyncFingerprint(snapshot([malformed]))).toThrow("invalid for synchronization");
      expect(() => plan(snapshot([malformed]), snapshot([malformed]), snapshot([malformed]))).toThrow("invalid for synchronization");
    }
  });

  it("normalizes equivalent UTC instant encodings without changing local dates or times", () => {
    const local: AccountSyncEntity = { kind: "occurrence", id: "o", value: { id: "o", scheduled_for: "2026-09-01T12:00:00.123456789Z", local_date: "2026-09-01", scheduled_time: "08:00:00" } };
    const hosted: AccountSyncEntity = { ...local, value: { ...local.value as object, scheduled_for: "2026-09-01T12:00:00.123457+00:00" } };
    const result = plan(snapshot([local]), snapshot([local]), snapshot([hosted]));
    expect(result.conflicts).toEqual([]);
    expect(result.localWrites).toEqual([]);
    expect(result.hostedWrites).toEqual([]);
    expect(result.fingerprints.local).toBe(result.fingerprints.hosted);
    expect(result.mergedEntities.find(({ kind }) => kind === "occurrence")?.value).toMatchObject({ local_date: "2026-09-01", scheduled_time: "08:00:00", scheduled_for: "2026-09-01T12:00:00.123457Z" });
  });

  it("uses PostgreSQL bytewise entity ordering and half-even microsecond rounding", () => {
    const entities: AccountSyncEntity[] = [
      { kind: "schedule_slot", id: "slot", value: { id: "slot", created_at: "2026-09-01T12:00:00.123456500Z" } },
      { kind: "schedule", id: "schedule", value: { id: "schedule", created_at: "2026-09-01T12:00:00.123457500Z", metadata: { "𐀀": 2, "": 1 } } },
      { kind: "occurrence", id: "carry", value: { id: "carry", scheduled_for: "2026-09-01T12:00:00.999999500Z" } },
    ];
    const result = plan(empty, snapshot(entities), empty);
    expect(result.mergedEntities.filter(({ kind }) => ["occurrence", "schedule", "schedule_slot"].includes(kind)).map(({ kind }) => kind)).toEqual(["occurrence", "schedule", "schedule_slot"]);
    expect(result.mergedEntities.filter(({ kind }) => ["occurrence", "schedule", "schedule_slot"].includes(kind)).map(({ value }) => value)).toMatchObject([
      { scheduled_for: "2026-09-01T12:00:01.000000Z" },
      { created_at: "2026-09-01T12:00:00.123458Z", metadata: { "𐀀": 2, "": 1 } },
      { created_at: "2026-09-01T12:00:00.123456Z" },
    ]);
    expect(accountSyncFingerprint(snapshot(entities))).toBe(result.fingerprints.merged);
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

  it("repairs deletion of protected Behavior and provenance rows from the retained copy", () => {
    for (const kind of ["behavior", "import_run", "imported_note", "imported_intervention"] as const) {
      const base = snapshot([{ kind, id: kind, value: { id: kind } }]);
      const result = plan(base, empty, base);
      expect(result.conflicts).toEqual([]);
      expect(result.localWrites).toContainEqual(expect.objectContaining({ kind, id: kind, operation: "upsert" }));
    }
  });

  it("retains every reminder while its Occurrence remains", () => {
    const occurrence: AccountSyncEntity = { kind: "occurrence", id: "o", value: { id: "o", status: "unresolved" } };
    const reminder: AccountSyncEntity = { kind: "reminder_delivery", id: "r", value: { id: "r", occurrence_id: "o", status: "failed" } };
    const baseline = snapshot([occurrence, reminder]);
    expect(plan(baseline, snapshot([occurrence]), baseline).localWrites).toMatchObject([
      { kind: "reminder_delivery", id: "r", operation: "upsert" },
    ]);
  });

  it("repairs deletion of a resolved Occurrence but reviews an unresolved Occurrence", () => {
    const occurrence = (status: "unresolved" | "completed"): AccountSyncEntity => ({ kind: "occurrence", id: "o", value: { id: "o", status } });
    const resolved = snapshot([occurrence("completed")]);
    expect(plan(resolved, empty, resolved).localWrites).toContainEqual(expect.objectContaining({ kind: "occurrence", id: "o", operation: "upsert" }));
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
    expect(plan(snapshot([prior]), empty, snapshot([prior])).localWrites).toContainEqual(expect.objectContaining({ id: "prior", operation: "upsert" }));
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
    expect(hydrated.localWrites.filter(({ kind }) => kind === "status_event")).toMatchObject([{ id: "first", operation: "upsert" }, { id: "second", operation: "upsert" }]);
    expect(hydrated.mergedEntities.filter(({ kind }) => kind === "status_event").map(({ id }) => id)).toEqual(["first", "second"]);

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
    expect(plan(empty, snapshot([revised]), empty).hostedWrites[0].value).toEqual({ archive_notes: [], id: "a", revision: 3, metadata: { user_id: "provenance-owner" } });
  });

  it("rejects duplicate identities and collection rows above the ceiling", () => {
    expect(() => plan(empty, rawSnapshot([{ kind: "profile", id: "profile", value: { timezone: "UTC" } }, row("a", "A"), row("a", "A")]), empty)).toThrow("Duplicate account synchronization entity");
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

  it("retains processing claims when a reviewed reminder winner has no claim", () => {
    const claim = "2026-09-11T03:00:39.179039Z";
    const delivery = (status: string, processing_started_at: string | null): AccountSyncEntity => ({
      kind: "reminder_delivery", id: "r", value: { id: "r", occurrence_id: "o", status, processing_started_at },
    });
    const baseline = snapshot([delivery("pending", null)]);
    for (const status of ["pending", "sent", "failed"]) {
      for (const choice of ["local", "hosted"] as const) {
        const cancelled = snapshot([delivery("cancelled", null)]), processed = snapshot([delivery(status, claim)]);
        const local = choice === "local" ? cancelled : processed, hosted = choice === "local" ? processed : cancelled;
        const review = plan(baseline, local, hosted);
        expect(review.conflicts).toMatchObject([{ kind: "reminder_delivery", id: "r" }]);
        const input = { accountLinkId: "link", baseline, local, hosted, reviewedFingerprints: review.fingerprints,
          decisions: [{ kind: "reminder_delivery" as const, id: "r", choice }] };
        const resolved = resolveReviewedAccountSync(input);
        expect(resolved.mergedEntities.find(({ id }) => id === "r")?.value).toMatchObject({ status: "cancelled", processing_started_at: claim });
        for (const writes of [resolved.localWrites, resolved.hostedWrites]) {
          expect(writes.find(({ id }) => id === "r")?.value).toMatchObject({ status: "cancelled", processing_started_at: claim });
        }
        expect(resolveReviewedAccountSync(input)).toEqual(resolved);
        const merged = { entities: resolved.mergedEntities };
        expect(plan(merged, merged, merged).hostedWrites).toEqual([]);
      }
    }
  });

  it("retains processing claims in ordinary synchronization without resurrecting deleted reminders", () => {
    const claimed: AccountSyncEntity = { kind: "reminder_delivery", id: "r", value: {
      id: "r", occurrence_id: "o", status: "pending", processing_started_at: "2026-09-11T03:00:39.179039Z",
    } };
    const cancelled: AccountSyncEntity = { ...claimed, value: { id: "r", occurrence_id: "o", status: "cancelled", processing_started_at: null } };
    const baseline = snapshot([claimed]), changed = snapshot([cancelled]);
    for (const [local, hosted] of [[changed, baseline], [baseline, changed]]) {
      const result = plan(baseline, local, hosted);
      expect(result.conflicts).toEqual([]);
      expect(result.mergedEntities.find(({ id }) => id === "r")?.value).toMatchObject({
        status: "cancelled", processing_started_at: "2026-09-11T03:00:39.179039Z",
      });
    }
    const retained = snapshot(completeRows([{ kind: "occurrence", id: "o", value: { id: "o", behavior_id: "b", status: "unresolved" } }, claimed]));
    expect(plan(retained, snapshot(completeRows()), retained).mergedEntities.some(({ id }) => id === "r")).toBe(false);
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


describe("archive notes in account synchronization", () => {
  const first = { id: "11111111-1111-4111-8111-111111111111", archived_at: "2026-09-01T12:00:00Z", updated_at: "2026-09-01T12:00:00Z", note: "Program finished" };
  const withNotes = (notes: typeof first[]): AccountSyncSnapshot => snapshot([{ kind: "behavior", id: "b", value: { id: "b", title: "Walk", archive_notes: notes } }]);
  it("treats an older baseline as empty and transfers all later archive entries", () => {
    const base = snapshot([row("b", "Walk")]);
    expect(plan(base, withNotes([]), withNotes([])).hostedWrites).toEqual([]);
    const second = { ...first, id: "22222222-2222-4222-8222-222222222222", note: "Routine established" };
    const result = plan(base, withNotes([first, second]), withNotes([]));
    expect(result.conflicts).toEqual([]);
    expect(result.hostedWrites[0].value).toMatchObject({ archive_notes: [first, second] });
  });
  it("requires review for concurrent note edits without issuing writes", () => {
    const result = plan(withNotes([first]), withNotes([{ ...first, note: "Local correction" }]), withNotes([{ ...first, note: "Account correction" }]));
    expect(result.conflicts).toMatchObject([{ kind: "behavior", reason: "concurrent_update" }]);
    expect(result.hostedWrites).toEqual([]);
    expect(result.localWrites).toEqual([]);
  });
  it("rejects malformed archive history before planning a write", () => {
    expect(() => plan(empty, withNotes([first, first]), empty)).toThrow(/duplicated/);
  });
});
