import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import type { PushSubscription } from "@/lib/types/database";

export type PushSubscriptionInput = {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
};

export async function upsertPushSubscription(
  supabase: AppSupabaseClient,
  input: PushSubscriptionInput,
): Promise<PushSubscription> {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: input.userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        user_agent: input.userAgent,
        active: true,
      },
      {
        onConflict: "user_id,endpoint",
      },
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}
