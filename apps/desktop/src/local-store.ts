import type { LocalImportWritePlan, PortabilityImportRunRow, PortabilitySnapshot, PortabilityNoteRow, PortabilityInterventionRow, PortabilityMappingRow } from "@cadence/core/types/portability-rows";
import { invoke } from "@tauri-apps/api/core";
import type { NativeDeliveryProof } from "./native-spike";
import type {
  Behavior, BehaviorConfigurationEvent, BehaviorDefinitionEvent,
  BehaviorSchedule, BehaviorScheduleSlot, Category, OccurrenceSyncState,
  OccurrenceTimeSession, Profile, ReminderDelivery,
} from "../../../lib/types/database";
import type {
  OccurrenceRecord, OccurrenceStatusEventRecord, StatusTransitionResult,
  StatusTransitionCommit,
} from "@cadence/core/data-store";

export type LocalBehaviorGraph = {
  behavior: Behavior;
  schedules: BehaviorSchedule[];
  slots: BehaviorScheduleSlot[];
};
type Owned = { profileId: string };
export type Mutation = Owned & { mutationId: string; now: string };
export type NativeReminderRow = {
  user_id: string; id: string; occurrence_id: string; request_id: string; fire_at: string;
  title: string; body: string; status: "planned" | "scheduled" | "cancelled" | "failed" | "delivered";
  error: string | null; verified_at: string | null; created_at: string; updated_at: string;
};
export type NativeCoverageRow = {
  user_id: string; status: "complete" | "limited" | "unverified";
  target_through: string; scheduled_through: string; first_unscheduled_at: string | null;
  expected_count: number; scheduled_count: number; missing_ids: string[]; reason: string | null;
  verified_at: string | null; updated_at: string; dataset_revision: number;
};
export type NativeReminderState = { revision: number; reminders: NativeReminderRow[]; coverage: NativeCoverageRow | null };
export type LocalCommandMap = {
  readImportRuns: { input: Owned & { limit: number; kind?: "import" | "restore" }; result: PortabilityImportRunRow[] };
  readImportSnapshot: { input: Owned; result: PortabilitySnapshot };
  prepareBehaviorLogImport: {
    input: Mutation & { expectedRevision: number; previewRun: PortabilityImportRunRow; plan: LocalImportWritePlan | null };
    result: { previewRun: PortabilityImportRunRow; revision: number };
  };
  applyBehaviorLogImport: {
    input: Mutation & { previewRunId: string; importMode: LocalImportWritePlan["mode"]; previewFingerprint: string; localDataFingerprint: string; bundleFingerprint: string; bundlePayloadFingerprint: string | null };
    result: { status: "applied" | "failed"; importRun: PortabilityImportRunRow; result?: import("@cadence/core/types/json").Json; error?: string; alreadyApplied: boolean };
  };
  updateProfileTimezone: {
    input: Mutation & { expectedTimezone: string; expectedSyncVersion: number; timezone: string;
      updates: { graph: LocalBehaviorGraph; expectedRevision: number; configurationEvent: BehaviorConfigurationEvent | null }[] };
    result: Profile;
  };
  readNativeReminderState: { input: Owned; result: NativeReminderState };
  commitNativeReminderPlan: {
    input: Mutation & { expectedRevision: number; reminders: NativeReminderRow[]; cancelIds: string[] };
    result: NativeReminderState;
  };
  recordNativeReminderCoverage: {
    input: Mutation & { expectedRevision: number;
      coverage: Omit<NativeCoverageRow, "user_id" | "dataset_revision" | "updated_at">;
      observed: { id: string; status: "scheduled" | "cancelled" | "failed" | "delivered"; error: string | null; delivery?: NativeDeliveryProof }[] };
    result: NativeReminderState;
  };
  readExportSnapshot: {
    input: Owned & { startLocalDate: string | null; endLocalDate: string; includeTimeTracking: boolean; throughStartedAt: string };
    result: { categories: Category[]; graphs: (LocalBehaviorGraph & { revision: number })[];
      behaviorDefinitionEvents: BehaviorDefinitionEvent[]; behaviorConfigurationEvents: BehaviorConfigurationEvent[];
      occurrences: OccurrenceRecord[]; statusEvents: OccurrenceStatusEventRecord[]; reminderDeliveries: ReminderDelivery[];
      timeSessions: OccurrenceTimeSession[]; nativeReminders: NativeReminderRow[];
      importedNotes: PortabilityNoteRow[]; importedInterventions: PortabilityInterventionRow[];
      importRuns: PortabilityImportRunRow[]; importMappings: PortabilityMappingRow[] };
  };
  readProfile: { input: Record<string, never>; result: Profile };
  readCategories: { input: Owned; result: Category[] };
  readBehaviorGraphs: { input: Owned; result: (LocalBehaviorGraph & { revision: number })[] };
  readOccurrence: { input: Owned & { occurrenceId: string }; result: OccurrenceRecord | null };
  readOccurrences: {
    input: Owned & { startLocalDate: string; endLocalDate: string; behaviorId?: string; status?: OccurrenceRecord["status"] };
    result: OccurrenceRecord[];
  };
  readOccurrenceHistory: {
    input: Owned & { occurrenceIds: string[] };
    result: { statusEvents: OccurrenceStatusEventRecord[]; timeSessions: OccurrenceTimeSession[] };
  };
  readSyncState: { input: Owned; result: OccurrenceSyncState };
  createBehaviorGraph: {
    input: Mutation & { graph: LocalBehaviorGraph; definitionEvent: BehaviorDefinitionEvent; configurationEvent: BehaviorConfigurationEvent };
    result: LocalBehaviorGraph & { revision: number };
  };
  updateBehaviorGraph: {
    input: Mutation & { graph: LocalBehaviorGraph; expectedRevision: number;
      expectedNormalizedDefinition: { title: string; description: string | null };
      definitionEvent: BehaviorDefinitionEvent | null; configurationEvent: BehaviorConfigurationEvent | null };
    result: LocalBehaviorGraph & { revision: number };
  };
  applyOccurrenceGeneration: {
    input: Mutation & {
      behaviorId: string; expectedConfigurationEventId: string;
      create: OccurrenceRecord[];
      update: { expected: OccurrenceRecord; next: OccurrenceRecord }[];
      delete: OccurrenceRecord[];
    };
    result: { insertedCount: number; updatedCount: number; deletedCount: number };
  };
  applyStatusTransition: {
    input: Mutation & Omit<StatusTransitionCommit, "event"> & { event: OccurrenceStatusEventRecord | null };
    result: StatusTransitionResult;
  };
  updateOccurrenceNote: {
    input: Mutation & { occurrenceId: string; expectedNote: string | null; note: string | null };
    result: OccurrenceRecord | null;
  };
  startTimeSession: { input: Mutation & { session: OccurrenceTimeSession }; result: OccurrenceTimeSession | null };
  stopTimeSession: { input: Mutation & { occurrenceId: string; sessionId: string; stoppedAt: string }; result: OccurrenceTimeSession | null };
  resetTimeSessions: {
    input: Mutation & { occurrenceId: string; expectedSessions: OccurrenceTimeSession[] };
    result: { deletedIds: string[] };
  };
  commitSyncState: { input: Mutation & { expectedVersion: number; state: OccurrenceSyncState }; result: OccurrenceSyncState };
};

// No SQL, arbitrary table names, filesystem paths, or provider credentials cross IPC.
export async function localCommand<K extends keyof LocalCommandMap>(
  operation: K,
  input: LocalCommandMap[K]["input"],
): Promise<LocalCommandMap[K]["result"]> {
  try {
    return await invoke("local_store", { request: { operation, ...input } });
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export function localMutation(profileId: string, now: string): Mutation {
  return { profileId, now, mutationId: crypto.randomUUID() };
}
