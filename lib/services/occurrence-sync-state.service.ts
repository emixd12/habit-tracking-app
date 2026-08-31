import { summarizeOccurrenceSyncPlans, type OccurrenceSyncFreshInput } from "@cadence/core/services/occurrence-sync";
export { summarizeOccurrenceSyncPlans, decideOccurrenceSyncCoverage, isOccurrenceSyncHorizonCovered } from "@cadence/core/services/occurrence-sync";
export type { OccurrenceSyncFreshInput, OccurrenceSyncCoverageDecision, OccurrenceSyncPlanSummary } from "@cadence/core/services/occurrence-sync";
import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import {
  getOccurrenceSyncState,
  upsertOccurrenceSyncStateFresh,
  upsertOccurrenceSyncStateFreshIfConfigurationCurrent,
  upsertOccurrenceSyncStateStale,
} from "@/lib/db/occurrenceSyncState.repo";
import type {
  OccurrenceGenerationPlan,
  OccurrenceGenerationWindow,
} from "@/lib/resolvers/occurrence.resolver";
import type { OccurrenceSyncState } from "@/lib/types/database";

export type OccurrenceSyncStaleReason =
  | "behavior_changed"
  | "timezone_changed"
  | "behaviorlog_import_applied"
  | "behaviorlog_restore_applied"
  | "sync_failed"
  | "manual_repair";

export async function readOccurrenceSyncState(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<OccurrenceSyncState | null> {
  return getOccurrenceSyncState(supabase, userId);
}

export async function markOccurrenceSyncStale(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    reason: OccurrenceSyncStaleReason;
    timezone?: string | null;
  },
): Promise<OccurrenceSyncState> {
  return upsertOccurrenceSyncStateStale(supabase, input);
}

export async function markOccurrenceSyncFresh(
  supabase: AppSupabaseClient,
  input: OccurrenceSyncFreshInput,
): Promise<OccurrenceSyncState> {
  validateFreshInput(input);

  return upsertOccurrenceSyncStateFresh(supabase, input);
}

export async function markOccurrenceSyncFreshForPlans(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    plans: OccurrenceGenerationPlan[];
    fallbackWindow: OccurrenceGenerationWindow;
    syncedAt: string;
    timezone?: string | null;
    expectedBehaviorConfigurationEvents: Array<{
      behaviorId: string;
      configurationEventId: string;
    }>;
    expectedSyncState: Pick<OccurrenceSyncState, "state_version"> | null;
  },
): Promise<OccurrenceSyncState> {
  const freshInput = {
    userId: input.userId,
    lastSuccessfulSyncAt: input.syncedAt,
    ...summarizeOccurrenceSyncPlans({
      plans: input.plans,
      fallbackWindow: input.fallbackWindow,
      timezone: input.timezone,
    }),
  };
  validateFreshInput(freshInput);

  return upsertOccurrenceSyncStateFreshIfConfigurationCurrent(supabase, {
    ...freshInput,
    expectedBehaviorConfigurationEvents:
      input.expectedBehaviorConfigurationEvents,
    expectedSyncStateExists: input.expectedSyncState !== null,
    expectedSyncStateVersion: input.expectedSyncState?.state_version ?? null,
  });
}

function validateFreshInput(input: OccurrenceSyncFreshInput): void {
  validateNonNegativeInteger(input.behaviorCount, "behaviorCount");
  validateNonNegativeInteger(input.createdCount, "createdCount");
  validateNonNegativeInteger(input.updatedCount, "updatedCount");
  validateNonNegativeInteger(input.deletedCount, "deletedCount");

  if (input.lastSyncedLocalDate > input.syncedThroughLocalDate) {
    throw new RangeError(
      "lastSyncedLocalDate must be on or before syncedThroughLocalDate.",
    );
  }
}

function validateNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
}
