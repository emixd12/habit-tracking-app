import { Temporal } from "@js-temporal/polyfill";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256 } from "@cadence/core/hash";
import { resolveBehaviorLogImportMergePreview } from "@cadence/core/resolvers/behaviorlog-import.resolver";
import { assembleBehaviorLogExistingRecords } from "@cadence/core/services/behaviorlog-existing";
import { graphRecord } from "@cadence/core/services/behaviorlog-write-plan";
import type { BehaviorLogFile } from "@cadence/core/types/export";
import type { BehaviorLogImportMergePreviewResult } from "@cadence/core/types/behaviorlog-import";
import type { PortabilitySnapshot } from "@cadence/core/types/portability-rows";
import type { Json } from "@cadence/core/types/json";
import { accountSyncFingerprint, resolveAccountSync, resolveFirstLinkReplacement, resolveReviewedAccountSync, type AccountSyncConflict, type AccountSyncConflictDecision, type AccountSyncEntity, type AccountSyncPlan, type AccountSyncSnapshot } from "@cadence/core/resolvers/account-sync.resolver";
import type { Profile } from "../../../../lib/types/database";
import { getLocalExportPageData } from "../local-export.service";
import { localCommand } from "../local-store";
import { createProtectedLocalBackup } from "../local-database";
import { applyHostedAccountSync, normalizeAccountSyncBaseline, portabilityEntities, readHostedAccountSyncEnvelope, type AccountSyncInputs, type HostedEnvelope } from "./account-sync";
import { canonicalJson } from "./canonical-json";

type Choice = "import" | "ignore" | "hydrate";
type JsonRow = Record<string, Json | undefined>;
export type FirstLinkConflict = { inputs: AccountSyncInputs; conflicts: readonly AccountSyncConflict[]; attempt: Attempt & { choice: Choice }; backupPath?: string | null };
export type FirstLinkResult = { status: "complete"; backupPath: string | null } | ({ status: "conflict"; count: number } & Partial<FirstLinkConflict>);
export type FirstLinkCommitOps<T> = {
  importHosted: () => Promise<{ conflictCount: number; conflict?: FirstLinkConflict }>;
  backupLocal: () => Promise<string>;
  readHosted: () => Promise<T>;
  applyLocal: (snapshot: T, backupPath: string | null) => Promise<FirstLinkConflict | { baseline: unknown } | void>;
  saveBaseline: (snapshot: unknown, backupPath: string | null) => Promise<void>;
};
type Attempt = { attemptId: string; localFingerprint: string; hostedFingerprint: string; preAttemptBaselineJson: string };
class FirstLinkCommitError extends Error {
  constructor(message: string, readonly backupPath: string, cause: unknown) { super(message, { cause }); }
}

export function firstLinkFailureBackupPath(error: unknown) {
  return error instanceof FirstLinkCommitError ? error.backupPath : undefined;
}

export function stabilizeFirstLinkAttempt(proposed: Attempt, begin: (value: Attempt) => Promise<Attempt>): Promise<Attempt> {
  return begin(proposed);
}

export function assertFirstLinkLocalUnchanged(currentFingerprint: string, pendingFingerprint: string) {
  if (currentFingerprint !== pendingFingerprint) throw new Error("Local data changed after the first-link choice. Cancel the account link and start it again before uploading data.");
}

export async function commitFirstLink<T>(choice: Choice, operations: FirstLinkCommitOps<T>): Promise<FirstLinkResult> {
  if (choice === "import") {
    const imported = await operations.importHosted();
    if (imported.conflictCount) return { status: "conflict", count: imported.conflictCount, ...imported.conflict };
  }
  const backupPath = choice === "ignore" ? await operations.backupLocal() : null;
  try {
    const snapshot = await operations.readHosted();
    const local = await operations.applyLocal(snapshot, backupPath);
    if (local && "conflicts" in local && local.conflicts.length) return { status: "conflict", count: local.conflicts.length, ...local, backupPath };
    await operations.saveBaseline(local && "baseline" in local ? local.baseline : snapshot, backupPath);
    return { status: "complete", backupPath };
  } catch (error) {
    if (!backupPath) throw error;
    throw new FirstLinkCommitError(error instanceof Error ? error.message : "First account link failed.", backupPath, error);
  }
}

export async function finishFirstAccountLink(input: { client: SupabaseClient; profile: Profile; hostedUserId: string; choice: Choice; attemptId?: string }): Promise<FirstLinkResult> {
  return run(input);
}

export function completedFirstLinkState(result: Extract<FirstLinkResult, { status: "complete" }>) {
  return { firstLink: { recognized: false, complete: true, backupPath: result.backupPath ?? undefined }, syncReady: true } as const;
}

export function recoverRejectedFirstLinkReview(reviewed: FirstLinkConflict, message: string) {
  return { recognized: true, backupPath: reviewed.backupPath ?? undefined,
    error: `The account data changed before those decisions were applied. Choose the data path again. ${message}` };
}

export async function finishReviewedFirstAccountLink(input: { client: SupabaseClient; profileId: string; reviewed: FirstLinkConflict; decisions: readonly AccountSyncConflictDecision[] }): Promise<Extract<FirstLinkResult, { status: "complete" }>> {
  const [local, hosted] = await Promise.all([
    localCommand("readImportSnapshot", { profileId: input.profileId }),
    readHostedSnapshot(input.client, input.reviewed.inputs.accountLinkId),
  ]);
  const current: AccountSyncInputs = { ...input.reviewed.inputs, local: { entities: portabilityEntities(local) }, hosted: { fingerprint: hosted.fingerprint, entities: hosted.entities },
    hostedFingerprint: hosted.fingerprint, outboxHighWater: local.revision };
  const plan = resolveReviewedAccountSync({ ...current, reviewedFingerprints: {
    baseline: accountSyncFingerprint(input.reviewed.inputs.baseline), local: accountSyncFingerprint(input.reviewed.inputs.local), hosted: input.reviewed.inputs.hostedFingerprint,
  }, decisions: input.decisions });
  const localReplacement = resolveFirstLinkReplacement({ ...current, hosted: { entities: plan.mergedEntities } });
  const reviewedPlan: AccountSyncPlan = { ...plan, localWrites: localReplacement.localWrites };
  const applied = await applyFirstLinkPlan(input.client, input.profileId, current, reviewedPlan, { hostedUserId: current.accountLinkId,
    choice: input.reviewed.attempt.choice, attemptId: input.reviewed.attempt.attemptId,
    localFingerprint: input.reviewed.attempt.localFingerprint, hostedFingerprint: input.reviewed.attempt.hostedFingerprint,
    expectedRevision: local.revision, backupPath: input.reviewed.backupPath ?? null });
  void applied;
  return { status: "complete", backupPath: input.reviewed.backupPath ?? null };
}

async function run({ client, profile, hostedUserId, choice, attemptId: requestedAttemptId = crypto.randomUUID() }: { client: SupabaseClient; profile: Profile; hostedUserId: string; choice: Choice; attemptId?: string }): Promise<FirstLinkResult> {
  let completionCommitted = false;
  const completed = await localCommand("readImportSnapshot", { profileId: profile.id });
  const proposedLocalFingerprint = fingerprint(completed);
  const preAttemptBaselineJson = canonicalJson({ entities: portabilityEntities(completed) });
  const initialHosted = await readHostedSnapshot(client, hostedUserId);
  const proposedHostedFingerprint = initialHosted.fingerprint;
  const pending = await stabilizeFirstLinkAttempt({ attemptId: requestedAttemptId, localFingerprint: proposedLocalFingerprint, hostedFingerprint: proposedHostedFingerprint, preAttemptBaselineJson },
    (value) => invokeBegin({ hostedUserId, choice, ...value, createdAt: Temporal.Now.instant().toString() }));
  const { attemptId, localFingerprint, hostedFingerprint, preAttemptBaselineJson: savedPreAttemptBaselineJson } = pending;
  assertFirstLinkLocalUnchanged(proposedLocalFingerprint, localFingerprint);
  return commitFirstLink(choice, {
    importHosted: async () => {
      const files = (await getLocalExportPageData(profile, { range: "all", includeArchived: true, includeNotes: true, includeTimeTracking: true })).behaviorLog.files;
      const preview = resolveBehaviorLogImportMergePreview({ files, existing: existingRecordsFromHostedEnvelope(initialHosted), reminderChannel: "browser_push" });
      const conflictCount = preview.mergePreview.conflictCount || preview.errors.length;
      if (!preview.valid || conflictCount) {
        const { inputs, plan } = planFirstLinkReconciliation({ accountLinkId: hostedUserId, local: { entities: portabilityEntities(completed) },
          hosted: { fingerprint: initialHosted.fingerprint, entities: initialHosted.entities }, choice, localUnchanged: false, outboxHighWater: completed.revision });
        if (!plan.conflicts.length) throw new Error("The first-link import cannot be reconciled automatically. Cancel the account link or change the conflicting records first.");
        return { conflictCount: plan.conflicts.length, conflict: { inputs, conflicts: plan.conflicts, attempt: { attemptId, localFingerprint, hostedFingerprint, preAttemptBaselineJson: savedPreAttemptBaselineJson, choice } } };
      }
      await applyHostedImport(client, hostedUserId, files, preview, attemptId);
      return { conflictCount: 0 };
    },
    backupLocal: createProtectedLocalBackup,
    readHosted: () => readHostedSnapshot(client, hostedUserId),
    applyLocal: async (snapshot, backupPath) => {
      const result = await replaceLocalFromHosted(client, profile, hostedUserId, snapshot, choice, attemptId, localFingerprint, hostedFingerprint, backupPath, savedPreAttemptBaselineJson);
      if (result && "baseline" in result) completionCommitted = true;
      return result && "conflicts" in result ? { ...result, attempt: { attemptId, localFingerprint, hostedFingerprint, preAttemptBaselineJson: savedPreAttemptBaselineJson, choice } } : result;
    },
    saveBaseline: async () => { if (!completionCommitted) throw new Error("The first-link replacement did not commit."); },
  });
}

async function readHostedSnapshot(client: SupabaseClient, userId: string): Promise<HostedEnvelope> {
  const envelope = await readHostedAccountSyncEnvelope(client);
  if (envelope.userId !== userId) throw new Error("The hosted snapshot belongs to another account.");
  return envelope;
}

export function existingRecordsFromHostedEnvelope(envelope: HostedEnvelope) {
  const categories = hostedRows<PortabilitySnapshot["categories"][number]>(envelope, "category");
  const behaviors = hostedRows<PortabilitySnapshot["graphs"][number]["behavior"]>(envelope, "behavior");
  const schedules = hostedRows<PortabilitySnapshot["graphs"][number]["schedules"][number]>(envelope, "schedule");
  const slots = hostedRows<PortabilitySnapshot["graphs"][number]["slots"][number]>(envelope, "schedule_slot");
  const graphs: PortabilitySnapshot["graphs"] = behaviors.map((behavior) => ({ behavior,
    schedules: schedules.filter((row) => row.behavior_id === behavior.id), slots: slots.filter((row) => row.behavior_id === behavior.id), revision: 0 }));
  return assembleBehaviorLogExistingRecords({
    behaviors: graphs.map((graph) => graphRecord(graph, categories)),
    occurrences: hostedRows<PortabilitySnapshot["occurrences"][number]>(envelope, "occurrence"),
    statusEvents: hostedRows<PortabilitySnapshot["statusEvents"][number]>(envelope, "status_event"),
    definitionEvents: hostedRows<PortabilitySnapshot["definitionEvents"][number]>(envelope, "definition_event"),
    configurationEvents: hostedRows<PortabilitySnapshot["configurationEvents"][number]>(envelope, "configuration_event"),
    timeSessions: hostedRows<PortabilitySnapshot["timeSessions"][number]>(envelope, "time_session"),
    importRuns: hostedRows<PortabilitySnapshot["importRuns"][number]>(envelope, "import_run"),
    mappings: hostedRows<PortabilitySnapshot["mappings"][number]>(envelope, "mapping"),
    importedNotes: hostedRows<PortabilitySnapshot["importedNotes"][number]>(envelope, "imported_note"),
    importedInterventions: hostedRows<PortabilitySnapshot["importedInterventions"][number]>(envelope, "imported_intervention"),
  });
}

function hostedRows<T>(envelope: HostedEnvelope, kind: AccountSyncEntity["kind"]): T[] {
  return envelope.entities.filter((entity) => entity.kind === kind).map((entity) => ({ ...object(entity.value), id: entity.id, user_id: envelope.userId }) as T);
}

function object(value: Json | undefined): JsonRow {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("The hosted account snapshot contains an invalid row.");
  return value;
}

async function applyHostedImport(client: SupabaseClient, userId: string, files: BehaviorLogFile[], preview: BehaviorLogImportMergePreviewResult, attemptId: string) {
  const now = Temporal.Now.instant().toString();
  const previewId = uuidFrom(attemptId, "hosted-preview");
  const prior = await client.from("behaviorlog_import_runs").select("id").eq("accepted_preview_run_id", previewId).eq("status", "applied").maybeSingle();
  if (prior.error) throw prior.error;
  if (prior.data) return;
  const summary = visiblePreview(preview);
  const run = { id: previewId, user_id: userId, bundle_format: "behaviorlog.bundle", schema_version: preview.summary.schemaVersion, manifest_sha256: manifestHash(files), bundle_fingerprint: preview.bundleFingerprint,
    producer_name: "Cadence Tracker", producer_version: "0.1.0", subject_id_strategy: null, privacy_redaction_level: null, import_mode: "merge_preview", status: "previewed",
    accepted_preview_run_id: null, accepted_preview_fingerprint: null, dry_run_summary: summary, failure_message: null, started_at: now, completed_at: now, created_at: now, updated_at: now };
  const inserted = await client.from("behaviorlog_import_runs").upsert(run, { onConflict: "id", ignoreDuplicates: true });
  if (inserted.error) throw inserted.error;
  const payload = { accepted_preview_run_id: previewId, accepted_preview_fingerprint: preview.previewFingerprint, import_mode: "merge_by_user_approved_plan", completed_at: now,
    intervention_rules_present: files.some(({ path }) => path === "data/intervention_rules.jsonl"), run: { bundle_format: run.bundle_format, schema_version: run.schema_version, manifest_sha256: run.manifest_sha256,
      bundle_fingerprint: run.bundle_fingerprint, producer_name: run.producer_name, producer_version: run.producer_version, subject_id_strategy: null, privacy_redaction_level: null,
      dry_run_summary: { ...summary, ...(preview.portability ? { portability: preview.portability } : {}) } }, preview };
  const { data, error } = await client.rpc("apply_behaviorlog_import", { import_payload: payload });
  if (error) throw error;
  if (!data || typeof data !== "object" || (data as Record<string, unknown>).status === "failed") throw new Error("Hosted first-link import failed atomically.");
}

async function replaceLocalFromHosted(client: SupabaseClient, profile: Profile, hostedUserId: string, hosted: HostedEnvelope, choice: Choice, attemptId: string,
  originalLocalFingerprint: string, hostedFingerprint: string, backupPath: string | null, preAttemptBaselineJson: string) {
  const local = await localCommand("readImportSnapshot", { profileId: profile.id });
  return reconcileLocalFromHosted(client, profile.id, hostedUserId, hosted, local, choice, attemptId, originalLocalFingerprint, hostedFingerprint, backupPath, preAttemptBaselineJson);
}

export function localChangedSinceFirstLinkAttempt(snapshot: unknown, originalFingerprint: string) {
  return fingerprint(snapshot) !== originalFingerprint;
}

async function reconcileLocalFromHosted(client: SupabaseClient, profileId: string, hostedUserId: string, hosted: HostedEnvelope, local: PortabilitySnapshot, choice: Choice,
  attemptId: string, localFingerprint: string, hostedFingerprint: string, backupPath: string | null, preAttemptBaselineJson: string) {
  const localSnapshot: AccountSyncSnapshot = { entities: portabilityEntities(local) };
  const hostedSnapshot: AccountSyncSnapshot = { fingerprint: hosted.fingerprint, entities: hosted.entities };
  const baseline = parseAccountSyncSnapshot(preAttemptBaselineJson);
  const { inputs, plan } = planFirstLinkReconciliation({ accountLinkId: hostedUserId, baseline, local: localSnapshot, hosted: hostedSnapshot, choice,
    localUnchanged: false, outboxHighWater: local.revision });
  if (plan.conflicts.length) return { inputs, conflicts: plan.conflicts };
  const applied = await applyFirstLinkPlan(client, profileId, inputs, plan, { hostedUserId, choice, attemptId,
    localFingerprint, hostedFingerprint, expectedRevision: local.revision, backupPath });
  return { baseline: applied.snapshot };
}

export function planFirstLinkReconciliation(input: { accountLinkId: string; baseline?: AccountSyncSnapshot; local: AccountSyncSnapshot; hosted: AccountSyncSnapshot; choice: Choice; localUnchanged: boolean; outboxHighWater: number }) {
  const baseline = input.baseline ?? (input.localUnchanged ? input.local : { entities: [] });
  const inputs: AccountSyncInputs = { accountLinkId: input.accountLinkId, baseline, local: input.local, hosted: input.hosted,
    baselineFingerprint: accountSyncFingerprint(baseline), hostedFingerprint: accountSyncFingerprint(input.hosted), outboxHighWater: input.outboxHighWater };
  return { inputs, plan: resolveAccountSync({ ...inputs, firstHostedHydration: input.choice === "hydrate" }) };
}

function parseAccountSyncSnapshot(value: string): AccountSyncSnapshot {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { entities?: unknown }).entities)) throw new Error("The saved first-link retry baseline is invalid. Cancel the account link and try again.");
  return parsed as AccountSyncSnapshot;
}

async function applyFirstLinkPlan(client: SupabaseClient, profileId: string, inputs: AccountSyncInputs, plan: AccountSyncPlan,
  guard: { hostedUserId: string; choice: Choice; attemptId: string; localFingerprint: string; hostedFingerprint: string; expectedRevision: number; backupPath: string | null }) {
  const completedAt = Temporal.Now.instant().toString();
  return applyVerifiedFirstLinkPlan(plan.fingerprints.merged, () => applyHostedAccountSync(client, inputs, plan), async (applied) => {
    const baseline = normalizeAccountSyncBaseline(applied.snapshot as AccountSyncSnapshot | PortabilitySnapshot);
    await localCommand("applyFirstLinkAccountSync", { profileId, ...guard, idempotencyKey: plan.idempotencyKey!, baselineFingerprint: accountSyncFingerprint(baseline),
      baselineJson: canonicalJson(baseline), completedAt, writes: [...plan.localWrites] });
  });
}

export async function applyVerifiedFirstLinkPlan<T extends { fingerprint: string }>(expectedFingerprint: string | null, applyHosted: () => Promise<T>, applyLocal: (applied: T) => Promise<unknown>) {
  const applied = await applyHosted();
  if (!expectedFingerprint || applied.fingerprint !== expectedFingerprint) throw new Error("The reconciled account snapshot fingerprint is invalid.");
  await applyLocal(applied);
  return applied;
}

async function invokeBegin(value: Record<string, unknown>): Promise<Attempt> { const { invoke } = await import("@tauri-apps/api/core"); return invoke("auth_begin_first_link", value); }
function visiblePreview(preview: BehaviorLogImportMergePreviewResult) { const value = { ...preview } as Record<string, unknown>; delete value.portability; return value; }
function manifestHash(files: BehaviorLogFile[]) { return sha256(files.find(({ path }) => path === "manifest.json")?.content ?? ""); }
function fingerprint(value: unknown) { return sha256(canonicalJson(value)); }
function uuidFrom(seed: string, label: string) { const hex = sha256(`${seed}:${label}`).slice(0, 32).split(""); hex[12] = "4"; hex[16] = "8"; return `${hex.slice(0,8).join("")}-${hex.slice(8,12).join("")}-${hex.slice(12,16).join("")}-${hex.slice(16,20).join("")}-${hex.slice(20).join("")}`; }
