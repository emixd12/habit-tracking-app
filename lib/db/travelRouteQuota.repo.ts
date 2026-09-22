import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";

export async function consumeTravelRouteQuota(
  supabase: AppSupabaseClient,
): Promise<Readonly<{ allowed: boolean; retryAfterSeconds: number }>> {
  const { data, error } = await supabase.rpc("consume_travel_route_quota");
  if (error) throw error;
  const row = data?.[0];
  if (!row || typeof row.allowed !== "boolean" || !Number.isInteger(row.retry_after_seconds) || row.retry_after_seconds < 0) {
    throw new Error("Travel route quota did not return a decision.");
  }
  return { allowed: row.allowed, retryAfterSeconds: row.retry_after_seconds };
}
