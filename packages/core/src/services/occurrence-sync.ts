import type { OccurrenceGenerationPlan, OccurrenceGenerationWindow } from "../resolvers/occurrence.resolver";
import { DEFAULT_TIMEZONE } from "../types/recurrence";

type CoverageState = {
  stale: boolean;
  timezone: string;
  last_synced_local_date: string | null;
  synced_through_local_date: string | null;
  last_successful_sync_at: string | null;
};

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
      windows.map((coverageWindow) => coverageWindow.startLocalDate),
    ),
    syncedThroughLocalDate: maxLocalDate(
      windows.map((coverageWindow) => coverageWindow.endLocalDate),
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
  state: CoverageState | null,
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
  state: CoverageState | null,
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

  const timezones = new Set(windows.map((coverageWindow) => coverageWindow.timezone));

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
