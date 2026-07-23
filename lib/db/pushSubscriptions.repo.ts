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

export async function hasActivePushSubscriptionForUser(
  supabase: AppSupabaseClient,
  input: Pick<
    PushSubscriptionInput,
    "userId" | "endpoint" | "p256dh" | "auth"
  >,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("user_id", input.userId)
    .eq("endpoint", input.endpoint)
    .eq("p256dh", input.p256dh)
    .eq("auth", input.auth)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data !== null;
}

export async function listActivePushSubscriptionsForUser(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<PushSubscription[]> {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function deactivatePushSubscriptionById(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    subscriptionId: string;
  },
): Promise<void> {
  const { error } = await supabase
    .from("push_subscriptions")
    .update({
      active: false,
    })
    .eq("user_id", input.userId)
    .eq("id", input.subscriptionId);

  if (error) {
    throw error;
  }
}
