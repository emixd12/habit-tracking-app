import { sha256 } from "../hash";
import { parseArchiveNotes } from "./archive-note.resolver";
import { Temporal } from "@js-temporal/polyfill";
import type { Json } from "../types/json";

export const ACCOUNT_SYNC_ENTITY_KINDS = ["profile", "category", "behavior", "schedule", "schedule_slot", "definition_event", "configuration_event", "occurrence", "status_event", "time_session", "import_run", "mapping", "imported_note", "imported_intervention", "reminder_delivery"] as const;
export const ACCOUNT_SYNC_ROW_LIMIT = 100_000;
export const ACCOUNT_SYNC_BYTE_LIMIT = 64 * 1024 * 1024;
export const ACCOUNT_SYNC_TIME_LIMIT_MS = 30_000;
export type AccountSyncEntityKind = (typeof ACCOUNT_SYNC_ENTITY_KINDS)[number];
export type AccountSyncEntity = Readonly<{ kind: AccountSyncEntityKind; id: string; value: Json }>;
export type AccountSyncSnapshot = Readonly<{ fingerprint?: string; entities: readonly AccountSyncEntity[] }>;
export type AccountSyncWrite = Readonly<{ kind: AccountSyncEntityKind; id: string; operation: "upsert" | "delete"; expected: Json | null; value?: Json }>;
export type AccountSyncConflict = Readonly<{ kind: AccountSyncEntityKind; id: string; reason: "concurrent_update" | "delete_vs_update" | "append_id_collision" | "history_rewrite" | "history_branch"; baseline: Json | null; local: Json | null; hosted: Json | null }>;
export type AccountSyncConflictChoice = "hosted" | "local" | "both";
export type AccountSyncConflictDecision = Readonly<{ kind: AccountSyncEntityKind; id: string; choice: AccountSyncConflictChoice; duplicateId?: string }>;
export type AccountSyncPlan = Readonly<{ localWrites: readonly AccountSyncWrite[]; hostedWrites: readonly AccountSyncWrite[]; conflicts: readonly AccountSyncConflict[]; mergedEntities: readonly AccountSyncEntity[]; fingerprints: Readonly<{ baseline: string; local: string; hosted: string; merged: string | null }>; idempotencyKey: string | null }>;

const HISTORY = new Set<AccountSyncEntityKind>(["definition_event", "configuration_event", "status_event", "mapping"]);
const PROTECTED_DELETE = new Set<AccountSyncEntityKind>(["behavior", "import_run", "imported_note", "imported_intervention", "reminder_delivery", "time_session"]);

export function accountSyncFingerprint(snapshot: AccountSyncSnapshot): string { return fingerprint(prepare(snapshot).values()); }

export function resolveFirstLinkReplacement(input: Readonly<{ accountLinkId: string; baseline: AccountSyncSnapshot; local: AccountSyncSnapshot; hosted: AccountSyncSnapshot }>): AccountSyncPlan {
  const baseline = prepare(input.baseline), local = prepare(input.local), hosted = prepare(input.hosted);
  validateInputGraphs(true, baseline, local, hosted);
  const fingerprints = { baseline: fingerprint(baseline.values()), local: fingerprint(local.values()), hosted: fingerprint(hosted.values()) };
  const mergedEntities = [...hosted.values()].sort(compareEntity), merged = fingerprint(mergedEntities);
  return { localWrites: writesBetween(local, hosted), hostedWrites: [], conflicts: [], mergedEntities,
    fingerprints: { ...fingerprints, merged }, idempotencyKey: sha256(`${input.accountLinkId}:${fingerprints.baseline}:${fingerprints.local}:${fingerprints.hosted}:${merged}:first-link-replacement`) };
}

export function resolveAccountSync(input: Readonly<{ accountLinkId?: string; baseline: AccountSyncSnapshot; local: AccountSyncSnapshot; hosted: AccountSyncSnapshot; firstLink?: boolean; firstHostedHydration?: boolean }>): AccountSyncPlan {
  const accountLinkId = input.accountLinkId ?? "account-link";
  const baseline = prepare(input.baseline), local = prepare(input.local), hosted = prepare(input.hosted);
  validateInputGraphs(input.firstLink === true, baseline, local, hosted);
  const baselineProtectedOccurrences = protectedOccurrenceIds(baseline);
  const protectedOccurrences = protectedOccurrenceIds(baseline, local, hosted);
  const fingerprints = { baseline: fingerprint(baseline.values()), local: fingerprint(local.values()), hosted: fingerprint(hosted.values()) };
  const keys = [...new Set([...baseline.keys(), ...local.keys(), ...hosted.keys()])].sort();
  const conflicts: AccountSyncConflict[] = [], mergedEntities: AccountSyncEntity[] = [];
  for (const key of keys) {
    const base = baseline.get(key) ?? null, left = local.get(key) ?? null, right = hosted.get(key) ?? null;
    if (base?.kind === "occurrence" && (!left || !right) && protectedOccurrences.has(base.id)) {
      const retained = left ?? right;
      if (retained && (!same(retained, base) || !baselineProtectedOccurrences.has(base.id))) conflicts.push(conflict(base, left, right, "delete_vs_update"));
      else mergedEntities.push(retained ?? base);
      continue;
    }
    const historyConflict = historyProblem(base, left, right);
    if (historyConflict === "history_rewrite" && base) {
      if (HISTORY.has(base.kind) && ((left && !same(left, base)) || (right && !same(right, base)))) throw new Error("The account snapshot rewrites append-only history.");
      const retained = left ?? right ?? base;
      mergedEntities.push(retained);
    }
    else if (historyConflict) throw new Error("The account snapshot contains incompatible append-only history.");
    else if (same(left, right)) { if (left) mergedEntities.push(left); }
    else if (same(left, base)) { if (right) mergedEntities.push(right); }
    else if (same(right, base)) { if (left) mergedEntities.push(left); }
    else conflicts.push(conflict(base, left, right, !base ? "append_id_collision" : !left || !right ? "delete_vs_update" : "concurrent_update"));
  }
  historyBranches(baseline, local, hosted, input.firstHostedHydration === true);
  if (conflicts.length) return { localWrites: [], hostedWrites: [], conflicts: uniqueConflicts(conflicts), mergedEntities: [], fingerprints: { ...fingerprints, merged: null }, idempotencyKey: null };
  const retained = reconcileOccurrenceReminders(mergedEntities);
  const merged = prepare({ entities: retained }), mergedRows = [...merged.values()].sort(compareEntity), mergedFingerprint = fingerprint(mergedRows);
  validateInputGraphs(false, merged);
  return { localWrites: writesBetween(local, merged), hostedWrites: writesBetween(hosted, merged), conflicts: [], mergedEntities: mergedRows, fingerprints: { ...fingerprints, merged: mergedFingerprint }, idempotencyKey: sha256(`${accountLinkId}:${fingerprints.baseline}:${fingerprints.local}:${fingerprints.hosted}:${mergedFingerprint}`) };
}

export function canKeepBothAccountSyncConflict(_conflict: AccountSyncConflict): boolean {
  // Synchronized rows carry identity and graph references. Duplicating one row alone cannot preserve both graphs.
  void _conflict;
  return false;
}

export function resolveReviewedAccountSync(input: Readonly<{
  accountLinkId?: string; baseline: AccountSyncSnapshot; local: AccountSyncSnapshot; hosted: AccountSyncSnapshot;
  reviewedFingerprints: Readonly<{ baseline: string; local: string; hosted: string }>;
  decisions: readonly AccountSyncConflictDecision[];
  firstLink?: boolean;
}>): AccountSyncPlan {
  const initial = resolveAccountSync(input);
  if (initial.fingerprints.baseline !== input.reviewedFingerprints.baseline || initial.fingerprints.local !== input.reviewedFingerprints.local || initial.fingerprints.hosted !== input.reviewedFingerprints.hosted) {
    throw new Error("The synchronization conflict review is stale. Review the current changes again.");
  }
  const decisions = new Map(input.decisions.map((decision) => [`${decision.kind}:${decision.id}`, decision]));
  const local = prepare(input.local), hosted = prepare(input.hosted);
  const protectedOccurrences = protectedOccurrenceIds(prepare(input.baseline), local, hosted);
  for (const conflict of initial.conflicts) {
    const key = `${conflict.kind}:${conflict.id}`, decision = decisions.get(key);
    if (!decision) throw new Error("Every synchronization conflict requires a decision.");
    if (conflict.kind === "occurrence"
      && protectedOccurrences.has(conflict.id)
      && ((decision.choice === "local" && conflict.local === null) || (decision.choice === "hosted" && conflict.hosted === null))) {
      throw new Error("An Occurrence with a Note, status history, tracked time, or resolved status cannot be deleted during synchronization.");
    }
    if (conflict.reason === "history_branch") {
      const localKey = `${conflict.kind}:${jsonId(conflict.local) ?? conflict.id}`, hostedKey = `${conflict.kind}:${jsonId(conflict.hosted) ?? conflict.id}`;
      if (decision.choice === "hosted") { local.delete(localKey); replace(local, hostedKey, hosted.get(hostedKey) ?? null); }
      else if (decision.choice === "local") { hosted.delete(hostedKey); replace(hosted, localKey, local.get(localKey) ?? null); }
      else throw new Error("Keep both is unavailable for this synchronization conflict.");
    } else if (decision.choice === "hosted") replace(local, key, hosted.get(key) ?? null);
    else if (decision.choice === "local") replace(hosted, key, local.get(key) ?? null);
    else {
      if (!canKeepBothAccountSyncConflict(conflict) || !decision.duplicateId) throw new Error("Keep both is unavailable for this synchronization conflict.");
      throw new Error("Keep both is unavailable for this synchronization conflict.");
    }
  }
  removeOrphanReminders(local);
  removeOrphanReminders(hosted);
  const resolved = resolveAccountSync({ ...input, local: { entities: [...local.values()] }, hosted: { entities: [...hosted.values()] } });
  if (resolved.conflicts.length) throw new Error("The synchronization conflict decisions do not produce a valid account state.");
  const actualLocal = prepare(input.local), actualHosted = prepare(input.hosted), merged = prepare({ entities: resolved.mergedEntities });
  validateInputGraphs(false, merged);
  const fingerprints = { baseline: initial.fingerprints.baseline, local: initial.fingerprints.local, hosted: initial.fingerprints.hosted, merged: fingerprint(merged.values()) };
  return { ...resolved, localWrites: writesBetween(actualLocal, merged), hostedWrites: writesBetween(actualHosted, merged), fingerprints,
    idempotencyKey: sha256(`${input.accountLinkId ?? "account-link"}:${fingerprints.baseline}:${fingerprints.local}:${fingerprints.hosted}:${fingerprints.merged}`) };
}

function replace(target: Map<string, AccountSyncEntity>, key: string, value: AccountSyncEntity | null) { if (value) target.set(key, value); else target.delete(key); }
function jsonId(value: Json | null): string | null { return value && !Array.isArray(value) && typeof value === "object" && typeof value.id === "string" ? value.id : null; }
function writesBetween(previous: Map<string, AccountSyncEntity>, next: Map<string, AccountSyncEntity>): AccountSyncWrite[] {
  return [...new Set([...previous.keys(), ...next.keys()])].sort().flatMap((key) => same(previous.get(key) ?? null, next.get(key) ?? null) ? [] : [writeFor(previous.get(key) ?? null, next.get(key) ?? null)])
    .sort((left, right) => writeOrder(left) - writeOrder(right) || compareText(`${left.kind}:${left.id}`, `${right.kind}:${right.id}`));
}

function writeOrder(write: AccountSyncWrite): number {
  if (write.operation !== "delete") return 0;
  if (write.kind === "reminder_delivery") return 1;
  if (write.kind === "occurrence") return 2;
  return 1;
}

function reconcileOccurrenceReminders(entities: readonly AccountSyncEntity[]): AccountSyncEntity[] {
  const occurrenceIds = new Set(entities.filter(({ kind }) => kind === "occurrence").map(({ id }) => id));
  return entities.filter((entity) => {
    if (entity.kind !== "reminder_delivery") return true;
    const occurrenceId = field(entity.value, "occurrence_id");
    return occurrenceId === null || occurrenceIds.has(occurrenceId);
  });
}

function removeOrphanReminders(graph: Map<string, AccountSyncEntity>): void {
  for (const [key, entity] of graph) {
    if (entity.kind === "reminder_delivery") {
      const occurrenceId = field(entity.value, "occurrence_id");
      if (occurrenceId && !graph.has(`occurrence:${occurrenceId}`)) graph.delete(key);
    }
  }
}

function protectedOccurrenceIds(...graphs: readonly Map<string, AccountSyncEntity>[]): Set<string> {
  const protectedIds = new Set<string>();
  for (const graph of graphs) for (const entity of graph.values()) {
    if (entity.kind === "occurrence") {
      const status = field(entity.value, "status");
      const note = field(entity.value, "note");
      if (status !== "unresolved" || (note !== null && note.trim() !== "")) protectedIds.add(entity.id);
    } else if (entity.kind === "status_event" || entity.kind === "time_session") {
      const occurrenceId = field(entity.value, "occurrence_id");
      if (occurrenceId) protectedIds.add(occurrenceId);
    }
  }
  return protectedIds;
}

function validateInputGraphs(allowEmptyBaseline: boolean, ...graphs: readonly Map<string, AccountSyncEntity>[]): void {
  for (const [index, graph] of graphs.entries()) {
    if (index === 0 && allowEmptyBaseline && graph.size === 0) continue;
    if (!graph.has("profile:profile")) throw new Error("Account synchronization requires complete baseline, local, and hosted graphs with a profile.");
    for (const entity of graph.values()) for (const [fieldName, parentKind] of dependencies(entity)) {
      const parentId = field(entity.value, fieldName);
      if (!parentId && requiredDependency(entity.kind, fieldName)) {
        throw new Error(`The account ${entity.kind} ${entity.id} is missing required reference ${fieldName}; read a complete graph before synchronizing.`);
      }
      if (parentId && !graph.has(`${parentKind}:${parentId}`)) {
        throw new Error(`The account ${entity.kind} ${entity.id} references missing ${parentKind} ${parentId}; read a complete graph before synchronizing.`);
      }
    }
  }
}

function requiredDependency(kind: AccountSyncEntityKind, fieldName: string): boolean {
  return !(
    (kind === "behavior" && (fieldName === "category_id" || fieldName === "current_configuration_event_id"))
    || (kind === "schedule_slot" && fieldName === "behavior_schedule_id")
    || (kind === "occurrence" && (fieldName === "behavior_configuration_event_id" || fieldName === "behavior_schedule_slot_id"))
    || (kind === "status_event" && fieldName === "revises_event_id")
    || (kind === "import_run" && fieldName === "accepted_preview_run_id")
    || (kind === "imported_intervention" && (fieldName === "behavior_id" || fieldName === "occurrence_id"))
    || (kind === "reminder_delivery" && (fieldName === "import_run_id" || fieldName === "imported_intervention_id"))
  );
}

function dependencies(entity: AccountSyncEntity): readonly (readonly [string, AccountSyncEntityKind])[] {
  switch (entity.kind) {
    case "behavior": return [["category_id", "category"], ["current_configuration_event_id", "configuration_event"]];
    case "schedule":
    case "definition_event":
    case "configuration_event": return [["behavior_id", "behavior"]];
    case "schedule_slot": return [["behavior_id", "behavior"], ["behavior_schedule_id", "schedule"]];
    case "occurrence": return [["behavior_id", "behavior"], ["behavior_configuration_event_id", "configuration_event"], ["behavior_schedule_slot_id", "schedule_slot"]];
    case "status_event": return [["behavior_id", "behavior"], ["occurrence_id", "occurrence"], ["revises_event_id", "status_event"]];
    case "time_session": return [["behavior_id", "behavior"], ["occurrence_id", "occurrence"]];
    case "import_run": return [["accepted_preview_run_id", "import_run"]];
    case "mapping":
    case "imported_note": return [["import_run_id", "import_run"]];
    case "imported_intervention": return [["import_run_id", "import_run"], ["behavior_id", "behavior"], ["occurrence_id", "occurrence"]];
    case "reminder_delivery": return [["occurrence_id", "occurrence"], ["import_run_id", "import_run"], ["imported_intervention_id", "imported_intervention"]];
    default: return [];
  }
}

function prepare(snapshot: AccountSyncSnapshot): Map<string, AccountSyncEntity> {
  const counts = new Map<AccountSyncEntityKind, number>(), result = new Map<string, AccountSyncEntity>();
  for (const source of snapshot.entities) {
    if (!source.id) throw new Error("Account synchronization entities require an id.");
    const count = (counts.get(source.kind) ?? 0) + 1;
    if (count > ACCOUNT_SYNC_ROW_LIMIT) throw new Error(`The account ${source.kind} collection exceeds 100,000 rows.`);
    counts.set(source.kind, count);
    const entity = normalize(source), key = entityKey(entity);
    if (result.has(key)) throw new Error(`Duplicate account synchronization entity: ${key}.`);
    result.set(key, entity);
  }
  if (utf8Bytes(canonical([...result.values()].sort(compareEntity))) > ACCOUNT_SYNC_BYTE_LIMIT) throw new Error("The account snapshot exceeds 64 MiB.");
  return result;
}

function normalize(entity: AccountSyncEntity): AccountSyncEntity {
  if (entity.kind === "profile") {
    const value = entity.value && !Array.isArray(entity.value) && typeof entity.value === "object" ? entity.value : {};
    return { kind: "profile", id: "profile", value: { timezone: typeof value.timezone === "string" ? value.timezone : null } };
  }
  let value = normalizeRow(stripOwnership(entity.value));
  if (entity.kind === "behavior" && value && !Array.isArray(value) && typeof value === "object") {
    parseArchiveNotes(value.archive_notes);
    // Older saved baselines predate the column; omission means an empty history.
    value = { archive_notes: [], ...value };
  }
  return { kind: entity.kind, id: entity.id, value };
}
function normalizeRow(value: Json): Json {
  if (!value || Array.isArray(value) || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "schedule_range_identity").map(([key, item]) => {
    if (!(key.endsWith("_at") || key === "scheduled_for") || typeof item !== "string") return [key, item];
    try {
      const instant = Temporal.Instant.from(item).round({ smallestUnit: "microsecond", roundingMode: "halfEven" });
      return [key, instant.toString({ fractionalSecondDigits: 6 })];
    } catch { return [key, item]; }
  })) as Json;
}
function stripOwnership(value: Json): Json {
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter((entry): entry is [string, Json] => entry[0] !== "user_id" && entry[1] !== undefined)
  ) as Json;
}
function historyProblem(base: AccountSyncEntity | null, left: AccountSyncEntity | null, right: AccountSyncEntity | null): AccountSyncConflict["reason"] | null {
  const sample = base ?? left ?? right;
  if (!sample) return null;
  if (base && protectedDelete(sample) && (!left || !right)) return "history_rewrite";
  if (!HISTORY.has(sample.kind)) return null;
  if (base && (!same(base, left) || !same(base, right))) return "history_rewrite";
  if (!base && left && right && !same(left, right)) return "append_id_collision";
  return null;
}
function protectedDelete(entity: AccountSyncEntity): boolean {
  return PROTECTED_DELETE.has(entity.kind) || (entity.kind === "occurrence" && field(entity.value, "status") !== "unresolved");
}
function historyBranches(baseline: Map<string, AccountSyncEntity>, local: Map<string, AccountSyncEntity>, hosted: Map<string, AccountSyncEntity>, firstHostedHydration: boolean): void {
  const successors = (rows: Map<string, AccountSyncEntity>) => {
    const result = new Map<string, AccountSyncEntity[]>();
    for (const row of rows.values()) {
      if (row.kind !== "status_event" || baseline.has(entityKey(row))) continue;
      const predecessor = field(row.value, "revises_event_id") ?? `root:${field(row.value, "occurrence_id") ?? row.id}`;
      result.set(predecessor, [...(result.get(predecessor) ?? []), row]);
    }
    return result;
  };
  const left = successors(local), right = successors(hosted);
  const hasStatusBaseline = [...baseline.values()].some(({ kind }) => kind === "status_event");
  for (const predecessor of new Set([...left.keys(), ...right.keys()])) {
    const localRows = [...new Map((left.get(predecessor) ?? []).map((row) => [row.id, row])).values()];
    const hostedRows = [...new Map((right.get(predecessor) ?? []).map((row) => [row.id, row])).values()];
    const hostedIds = new Set(hostedRows.map(({ id }) => id));
    const status = field(hostedRows[0]?.value ?? null, "status");
    if (firstHostedHydration && !hasStatusBaseline && hostedRows.length > 1 && status !== null
      && hostedRows.every((row) => field(row.value, "status") === status) && localRows.every(({ id }) => hostedIds.has(id))) continue;
    if (localRows.length > 1) throw new Error("The local account snapshot contains branched status history.");
    if (hostedRows.length > 1) throw new Error("The hosted account snapshot contains branched status history.");
    if (localRows[0] && hostedRows[0] && localRows[0].id !== hostedRows[0].id) throw new Error("The account snapshot contains branched status history.");
  }
}
function field(value: Json, key: string): string | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : null;
}
function same(left: AccountSyncEntity | null, right: AccountSyncEntity | null): boolean { return left === right || (left !== null && right !== null && canonical(comparableValue(left.value)) === canonical(comparableValue(right.value))); }
function writeFor(previous: AccountSyncEntity | null, next: AccountSyncEntity | null): AccountSyncWrite {
  const entity = next ?? previous;
  if (!entity) throw new Error("Account synchronization cannot write an unknown entity.");
  return next ? { kind: next.kind, id: next.id, operation: "upsert", expected: previous?.value ?? null, value: next.value } : { kind: entity.kind, id: entity.id, operation: "delete", expected: entity.value };
}
function conflict(base: AccountSyncEntity | null, local: AccountSyncEntity | null, hosted: AccountSyncEntity | null, reason: AccountSyncConflict["reason"]): AccountSyncConflict {
  const sample = local ?? hosted ?? base;
  if (!sample) throw new Error("Account synchronization cannot report an unknown entity.");
  return { kind: sample.kind, id: sample.id, reason, baseline: base?.value ?? null, local: local?.value ?? null, hosted: hosted?.value ?? null };
}
function uniqueConflicts(values: AccountSyncConflict[]): AccountSyncConflict[] { return [...new Map(values.map((value) => [`${value.kind}:${value.id}:${value.reason}`, value])).values()].sort((a, b) => compareText(`${a.kind}:${a.id}:${a.reason}`, `${b.kind}:${b.id}:${b.reason}`)); }
function entityKey(entity: AccountSyncEntity): string { return `${entity.kind}:${entity.id}`; }
function compareEntity(left: AccountSyncEntity, right: AccountSyncEntity): number { return compareText(entityKey(left), entityKey(right)); }
function compareText(left: string, right: string): number {
  const leftPoints = Array.from(left), rightPoints = Array.from(right);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index++) {
    const difference = leftPoints[index].codePointAt(0)! - rightPoints[index].codePointAt(0)!;
    if (difference) return difference < 0 ? -1 : 1;
  }
  return leftPoints.length < rightPoints.length ? -1 : leftPoints.length > rightPoints.length ? 1 : 0;
}
function fingerprint(entities: Iterable<AccountSyncEntity>): string {
  return sha256(canonical([...entities].sort(compareEntity).map((entity) => ({ ...entity, value: comparableValue(entity.value) }))));
}
function comparableValue(value: Json): Json {
  if (!value || Array.isArray(value) || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "updated_at")) as Json;
}
function utf8Bytes(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes++;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) { bytes += 4; index++; }
    else bytes += 3;
  }
  return bytes;
}
function canonical(value: Json | readonly AccountSyncEntity[]): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item as Json)).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => compareText(a, b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item as Json)}`).join(",")}}`;
  return JSON.stringify(value);
}
