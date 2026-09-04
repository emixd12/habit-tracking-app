import { sha256 } from "../hash";
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
const PROTECTED_DELETE = new Set<AccountSyncEntityKind>(["behavior", "import_run", "imported_note", "imported_intervention", "reminder_delivery"]);

export function accountSyncFingerprint(snapshot: AccountSyncSnapshot): string { return fingerprint(prepare(snapshot).values()); }

export function resolveFirstLinkReplacement(input: Readonly<{ accountLinkId: string; baseline: AccountSyncSnapshot; local: AccountSyncSnapshot; hosted: AccountSyncSnapshot }>): AccountSyncPlan {
  const baseline = prepare(input.baseline), local = prepare(input.local), hosted = prepare(input.hosted);
  const fingerprints = { baseline: fingerprint(baseline.values()), local: fingerprint(local.values()), hosted: fingerprint(hosted.values()) };
  const mergedEntities = [...hosted.values()].sort(compareEntity), merged = fingerprint(mergedEntities);
  return { localWrites: writesBetween(local, hosted), hostedWrites: [], conflicts: [], mergedEntities,
    fingerprints: { ...fingerprints, merged }, idempotencyKey: sha256(`${input.accountLinkId}:${fingerprints.baseline}:${fingerprints.local}:${fingerprints.hosted}:${merged}:first-link-replacement`) };
}

export function resolveAccountSync(input: Readonly<{ accountLinkId?: string; baseline: AccountSyncSnapshot; local: AccountSyncSnapshot; hosted: AccountSyncSnapshot; firstHostedHydration?: boolean }>): AccountSyncPlan {
  const accountLinkId = input.accountLinkId ?? "account-link";
  const baseline = prepare(input.baseline), local = prepare(input.local), hosted = prepare(input.hosted);
  const fingerprints = { baseline: fingerprint(baseline.values()), local: fingerprint(local.values()), hosted: fingerprint(hosted.values()) };
  const keys = [...new Set([...baseline.keys(), ...local.keys(), ...hosted.keys()])].sort();
  const localWrites: AccountSyncWrite[] = [], hostedWrites: AccountSyncWrite[] = [], conflicts: AccountSyncConflict[] = [], mergedEntities: AccountSyncEntity[] = [];
  for (const key of keys) {
    const base = baseline.get(key) ?? null, left = local.get(key) ?? null, right = hosted.get(key) ?? null;
    const historyConflict = historyProblem(base, left, right);
    if (historyConflict === "history_rewrite" && base) {
      if (HISTORY.has(base.kind) && ((left && !same(left, base)) || (right && !same(right, base)))) throw new Error("The account snapshot rewrites append-only history.");
      const retained = left ?? right ?? base;
      mergedEntities.push(retained);
      if (!same(left, retained)) localWrites.push(writeFor(left, retained));
      if (!same(right, retained)) hostedWrites.push(writeFor(right, retained));
    }
    else if (historyConflict) throw new Error("The account snapshot contains incompatible append-only history.");
    else if (same(left, right)) { if (left) mergedEntities.push(left); }
    else if (same(left, base)) { if (right) mergedEntities.push(right); localWrites.push(writeFor(left, right)); }
    else if (same(right, base)) { if (left) mergedEntities.push(left); hostedWrites.push(writeFor(right, left)); }
    else conflicts.push(conflict(base, left, right, !base ? "append_id_collision" : !left || !right ? "delete_vs_update" : "concurrent_update"));
  }
  historyBranches(baseline, local, hosted, input.firstHostedHydration === true);
  if (conflicts.length) return { localWrites: [], hostedWrites: [], conflicts: uniqueConflicts(conflicts), mergedEntities: [], fingerprints: { ...fingerprints, merged: null }, idempotencyKey: null };
  const merged = [...mergedEntities].sort(compareEntity), mergedFingerprint = fingerprint(merged);
  return { localWrites, hostedWrites, conflicts: [], mergedEntities: merged, fingerprints: { ...fingerprints, merged: mergedFingerprint }, idempotencyKey: sha256(`${accountLinkId}:${fingerprints.baseline}:${fingerprints.local}:${fingerprints.hosted}`) };
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
}>): AccountSyncPlan {
  const initial = resolveAccountSync(input);
  if (initial.fingerprints.baseline !== input.reviewedFingerprints.baseline || initial.fingerprints.local !== input.reviewedFingerprints.local || initial.fingerprints.hosted !== input.reviewedFingerprints.hosted) {
    throw new Error("The synchronization conflict review is stale. Review the current changes again.");
  }
  const decisions = new Map(input.decisions.map((decision) => [`${decision.kind}:${decision.id}`, decision]));
  const local = prepare(input.local), hosted = prepare(input.hosted);
  for (const conflict of initial.conflicts) {
    const key = `${conflict.kind}:${conflict.id}`, decision = decisions.get(key);
    if (!decision) throw new Error("Every synchronization conflict requires a decision.");
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
  const resolved = resolveAccountSync({ ...input, local: { entities: [...local.values()] }, hosted: { entities: [...hosted.values()] } });
  if (resolved.conflicts.length) throw new Error("The synchronization conflict decisions do not produce a valid account state.");
  const actualLocal = prepare(input.local), actualHosted = prepare(input.hosted), merged = prepare({ entities: resolved.mergedEntities });
  const fingerprints = { baseline: initial.fingerprints.baseline, local: initial.fingerprints.local, hosted: initial.fingerprints.hosted, merged: fingerprint(merged.values()) };
  return { ...resolved, localWrites: writesBetween(actualLocal, merged), hostedWrites: writesBetween(actualHosted, merged), fingerprints,
    idempotencyKey: sha256(`${input.accountLinkId ?? "account-link"}:${fingerprints.baseline}:${fingerprints.local}:${fingerprints.hosted}:${fingerprints.merged}`) };
}

function replace(target: Map<string, AccountSyncEntity>, key: string, value: AccountSyncEntity | null) { if (value) target.set(key, value); else target.delete(key); }
function jsonId(value: Json | null): string | null { return value && !Array.isArray(value) && typeof value === "object" && typeof value.id === "string" ? value.id : null; }
function writesBetween(previous: Map<string, AccountSyncEntity>, next: Map<string, AccountSyncEntity>): AccountSyncWrite[] {
  return [...new Set([...previous.keys(), ...next.keys()])].sort().flatMap((key) => same(previous.get(key) ?? null, next.get(key) ?? null) ? [] : [writeFor(previous.get(key) ?? null, next.get(key) ?? null)]);
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
  return { kind: entity.kind, id: entity.id, value: normalizeRow(stripOwnership(entity.value)) };
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
