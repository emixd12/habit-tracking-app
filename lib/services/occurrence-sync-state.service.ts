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
import { DEFAULT_TIMEZONE } from "@/lib/types/recurrence";

export type OccurrenceSyncStaleReason =
  | "behavior_changed"
  | "timezone_changed"
  | "behaviorlog_import_applied"
  | "behaviorlog_restore_applied"
  | "sync_failed"
  | "manual_repair";

export type OccurrenceSyncCoverageDecision =
  | { covered: true; reason: "covered" }
  | {
      covered: false;
      reason:
        | "missing_state"
        | "stale"
        | "timezone_mismatch"
        | "missing_coverage"
        | "starts_after_horizon"
        | "ends_before_horizon";
    };

export type OccurrenceSyncFreshInput = {
  userId: string;
  timezone: string;
  lastSyncedLocalDate: string;
  syncedThroughLocalDate: string;
  lastSuccessfulSyncAt: string;
  behaviorCount: number;
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
};

export type OccurrenceSyncPlanSummary = Omit<
  OccurrenceSyncFreshInput,
  "userId" | "lastSuccessfulSyncAt"
>;

const MULTIPLE_TIMEZONES = "multiple";

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

export function summarizeOccurrenceSyncPlans(input: {
  plans: OccurrenceGenerationPlan[];
  fallbackWindow: OccurrenceGenerationWindow;
  timezone?: string | null;
}): OccurrenceSyncPlanSummary {
  const windows =
    input.plans.length > 0
      ? input.plans.map((plan) => plan.generationWindow)
      : [input.fallbackWindow];

  return {
    timezone: resolveSummaryTimezone(windows, input.timezone),
    lastSyncedLocalDate: minLocalDate(
      windows.map((window) => window.startLocalDate),
    ),
    syncedThroughLocalDate: maxLocalDate(
      windows.map((window) => window.endLocalDate),
    ),
    behaviorCount: input.plans.length,
    createdCount: input.plans.reduce(
      (sum, plan) => sum + plan.create.length,
      0,
    ),
    updatedCount: input.plans.reduce(
      (sum, plan) => sum + plan.updateUnresolved.length,
      0,
    ),
    deletedCount: input.plans.reduce(
      (sum, plan) => sum + plan.deleteUnresolved.length,
      0,
    ),
  };
}

export function decideOccurrenceSyncCoverage(
  state: OccurrenceSyncState | null,
  input: {
    timezone?: string | null;
    startLocalDate: string;
    endLocalDate: string;
  },
): OccurrenceSyncCoverageDecision {
  if (!state) {
    return { covered: false, reason: "missing_state" };
  }

  if (state.stale) {
    return { covered: false, reason: "stale" };
  }

  if (input.timezone && state.timezone !== input.timezone) {
    return { covered: false, reason: "timezone_mismatch" };
  }

  if (
    !state.last_synced_local_date ||
    !state.synced_through_local_date ||
    !state.last_successful_sync_at
  ) {
    return { covered: false, reason: "missing_coverage" };
  }

  if (state.last_synced_local_date > input.startLocalDate) {
    return { covered: false, reason: "starts_after_horizon" };
  }

  if (state.synced_through_local_date < input.endLocalDate) {
    return { covered: false, reason: "ends_before_horizon" };
  }

  return { covered: true, reason: "covered" };
}

export function isOccurrenceSyncHorizonCovered(
  state: OccurrenceSyncState | null,
  input: {
    timezone?: string | null;
    startLocalDate: string;
    endLocalDate: string;
  },
): boolean {
  return decideOccurrenceSyncCoverage(state, input).covered;
}

function resolveSummaryTimezone(
  windows: OccurrenceGenerationWindow[],
  timezone?: string | null,
): string {
  if (timezone) {
    return timezone;
  }

  const timezones = new Set(windows.map((window) => window.timezone));

  if (timezones.size === 1) {
    return [...timezones][0] ?? DEFAULT_TIMEZONE;
  }

  return MULTIPLE_TIMEZONES;
}

function minLocalDate(localDates: string[]): string {
  return localDates.reduce((min, localDate) =>
    localDate < min ? localDate : min,
  );
}

function maxLocalDate(localDates: string[]): string {
  return localDates.reduce((max, localDate) =>
    localDate > max ? localDate : max,
  );
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
