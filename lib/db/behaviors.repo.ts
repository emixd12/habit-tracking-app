import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";
import type {
  Behavior,
  BehaviorUpdate,
  Category,
  NewBehavior,
} from "@/lib/types/database";

export type AppSupabaseClient = SupabaseClient<Database>;

export type BehaviorWithCategory = Behavior & {
  category: Pick<Category, "id" | "name"> | null;
};

const BEHAVIOR_WITH_CATEGORY_SELECT =
  "*, category:categories!behaviors_category_id_fkey(id, name)";

export async function listBehaviorCategories(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function listUserBehaviors(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<BehaviorWithCategory[]> {
  const { data, error } = await supabase
    .from("behaviors")
    .select(BEHAVIOR_WITH_CATEGORY_SELECT)
    .eq("user_id", userId)
    .order("active", { ascending: false })
    .order("scheduled_time", { ascending: true })
    .order("title", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as BehaviorWithCategory[];
}

export async function getBehaviorById(
  supabase: AppSupabaseClient,
  userId: string,
  behaviorId: string,
): Promise<BehaviorWithCategory | null> {
  const { data, error } = await supabase
    .from("behaviors")
    .select(BEHAVIOR_WITH_CATEGORY_SELECT)
    .eq("user_id", userId)
    .eq("id", behaviorId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as unknown as BehaviorWithCategory | null;
}

export async function getProfileTimezone(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.timezone ?? null;
}

export async function createBehavior(
  supabase: AppSupabaseClient,
  behavior: NewBehavior,
): Promise<BehaviorWithCategory> {
  const { data, error } = await supabase
    .from("behaviors")
    .insert(behavior)
    .select(BEHAVIOR_WITH_CATEGORY_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data as unknown as BehaviorWithCategory;
}

export async function updateBehavior(
  supabase: AppSupabaseClient,
  userId: string,
  behaviorId: string,
  behavior: BehaviorUpdate,
): Promise<BehaviorWithCategory | null> {
  const { data, error } = await supabase
    .from("behaviors")
    .update(behavior)
    .eq("user_id", userId)
    .eq("id", behaviorId)
    .select(BEHAVIOR_WITH_CATEGORY_SELECT)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as unknown as BehaviorWithCategory | null;
}
