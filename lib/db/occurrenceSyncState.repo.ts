import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import type { Json } from "@/lib/db/database.types";
import type {
  NewOccurrenceSyncState,
  OccurrenceSyncState,
} from "@/lib/types/database";

export async function getOccurrenceSyncState(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<OccurrenceSyncState | null> {
  const { data, error } = await supabase
    .from("occurrence_sync_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function upsertOccurrenceSyncStateStale(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    reason: string;
    timezone?: string | null;
  },
): Promise<OccurrenceSyncState> {
  const state: NewOccurrenceSyncState = {
    user_id: input.userId,
    stale: true,
    stale_reason: input.reason,
    ...(input.timezone ? { timezone: input.timezone } : {}),
  };
  const { data, error } = await supabase
    .from("occurrence_sync_state")
    .upsert(state, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function upsertOccurrenceSyncStateFresh(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    timezone: string;
    lastSyncedLocalDate: string;
    syncedThroughLocalDate: string;
    lastSuccessfulSyncAt: string;
    behaviorCount: number;
    createdCount: number;
    updatedCount: number;
    deletedCount: number;
  },
): Promise<OccurrenceSyncState> {
  const state: NewOccurrenceSyncState = {
    user_id: input.userId,
    timezone: input.timezone,
    last_synced_local_date: input.lastSyncedLocalDate,
    synced_through_local_date: input.syncedThroughLocalDate,
    last_successful_sync_at: input.lastSuccessfulSyncAt,
    stale: false,
    stale_reason: null,
    last_sync_behavior_count: input.behaviorCount,
    last_sync_created_count: input.createdCount,
    last_sync_updated_count: input.updatedCount,
    last_sync_deleted_count: input.deletedCount,
  };
  const { data, error } = await supabase
    .from("occurrence_sync_state")
    .upsert(state, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function upsertOccurrenceSyncStateFreshIfConfigurationCurrent(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    expectedBehaviorConfigurationEvents: Array<{
      behaviorId: string;
      configurationEventId: string;
    }>;
    expectedSyncStateExists: boolean;
    expectedSyncStateVersion: number | null;
    timezone: string;
    lastSyncedLocalDate: string;
    syncedThroughLocalDate: string;
    lastSuccessfulSyncAt: string;
    behaviorCount: number;
    createdCount: number;
    updatedCount: number;
    deletedCount: number;
  },
): Promise<OccurrenceSyncState> {
  const { data, error } = await supabase.rpc(
    "mark_occurrence_sync_fresh_if_configuration_current",
    {
      target_user_id: input.userId,
      expected_behavior_configuration_events:
        input.expectedBehaviorConfigurationEvents.map((expected) => ({
          behavior_id: expected.behaviorId,
          configuration_event_id: expected.configurationEventId,
        })) as Json,
      expected_sync_state_exists: input.expectedSyncStateExists,
      expected_sync_state_version: input.expectedSyncStateVersion ?? -1,
      target_timezone: input.timezone,
      target_last_synced_local_date: input.lastSyncedLocalDate,
      target_synced_through_local_date: input.syncedThroughLocalDate,
      target_last_successful_sync_at: input.lastSuccessfulSyncAt,
      target_behavior_count: input.behaviorCount,
      target_created_count: input.createdCount,
      target_updated_count: input.updatedCount,
      target_deleted_count: input.deletedCount,
    },
  );

  if (error) {
    throw error;
  }

  return data as unknown as OccurrenceSyncState;
}
