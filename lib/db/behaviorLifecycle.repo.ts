import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";

export type ArchivedBehaviorOwner = {
  behavior_id: string;
  user_id: string;
};

export async function archiveMyDueBehaviors(
  supabase: AppSupabaseClient,
  batchLimit: number,
): Promise<ArchivedBehaviorOwner[]> {
  const { data, error } = await supabase.rpc("archive_my_due_behaviors", {
    batch_limit: batchLimit,
  });

  if (error) throw error;
  return data ?? [];
}

export async function archiveDueBehaviors(
  supabase: AppSupabaseClient,
  input: { processedAt: string; batchLimit: number },
): Promise<ArchivedBehaviorOwner[]> {
  const { data, error } = await supabase.rpc("archive_due_behaviors", {
    processed_at: input.processedAt,
    batch_limit: input.batchLimit,
  });

  if (error) throw error;
  return data ?? [];
}
