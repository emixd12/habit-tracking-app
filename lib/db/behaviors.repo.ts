import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";
import type {
  Behavior,
  BehaviorScheduleSlot,
  BehaviorScheduleSlotUpdate,
  BehaviorUpdate,
  Category,
  NewBehaviorScheduleSlot,
  NewBehavior,
} from "@/lib/types/database";

export type AppSupabaseClient = SupabaseClient<Database>;

export type BehaviorWithCategory = Behavior & {
  category: Pick<Category, "id" | "name"> | null;
  schedule_slots: BehaviorScheduleSlot[];
};

const BEHAVIOR_WITH_CATEGORY_SELECT =
  "*, category:categories!behaviors_category_id_fkey(id, name), schedule_slots:behavior_schedule_slots!behavior_schedule_slots_behavior_owner_fkey(*)";

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

  return sortBehaviorScheduleSlots(
    (data ?? []) as unknown as BehaviorWithCategory[],
  );
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

  return data
    ? sortBehaviorScheduleSlots([data as unknown as BehaviorWithCategory])[0]
    : null;
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

  return sortBehaviorScheduleSlots([data as unknown as BehaviorWithCategory])[0];
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

  return data
    ? sortBehaviorScheduleSlots([data as unknown as BehaviorWithCategory])[0]
    : null;
}

export async function listBehaviorScheduleSlots(
  supabase: AppSupabaseClient,
  userId: string,
  behaviorId: string,
): Promise<BehaviorScheduleSlot[]> {
  const { data, error } = await supabase
    .from("behavior_schedule_slots")
    .select("*")
    .eq("user_id", userId)
    .eq("behavior_id", behaviorId)
    .order("sort_order", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function replaceBehaviorScheduleSlots(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    behaviorId: string;
    slots: Array<
      Omit<NewBehaviorScheduleSlot, "user_id" | "behavior_id"> & {
        id?: string | null;
      }
    >;
  },
): Promise<void> {
  const existingSlots = await listBehaviorScheduleSlots(
    supabase,
    input.userId,
    input.behaviorId,
  );
  const existingIds = new Set(existingSlots.map((slot) => slot.id));
  const retainedIds = new Set(
    input.slots
      .map((slot) => slot.id)
      .filter((id): id is string => Boolean(id && existingIds.has(id))),
  );

  for (const slot of input.slots) {
    const baseSlot = {
      kind: slot.kind,
      preset: slot.preset,
      start_time: slot.start_time,
      end_time: slot.end_time,
      sort_order: slot.sort_order,
    } satisfies BehaviorScheduleSlotUpdate;

    if (slot.id && existingIds.has(slot.id)) {
      const { error } = await supabase
        .from("behavior_schedule_slots")
        .update(baseSlot)
        .eq("user_id", input.userId)
        .eq("behavior_id", input.behaviorId)
        .eq("id", slot.id);

      if (error) {
        throw error;
      }
      continue;
    }

    const { error } = await supabase.from("behavior_schedule_slots").insert({
      ...baseSlot,
      user_id: input.userId,
      behavior_id: input.behaviorId,
    });

    if (error) {
      throw error;
    }
  }

  const deleteIds = existingSlots
    .filter((slot) => !retainedIds.has(slot.id))
    .map((slot) => slot.id);

  if (deleteIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("behavior_schedule_slots")
    .delete()
    .eq("user_id", input.userId)
    .eq("behavior_id", input.behaviorId)
    .in("id", deleteIds);

  if (error) {
    throw error;
  }
}

function sortBehaviorScheduleSlots(
  behaviors: BehaviorWithCategory[],
): BehaviorWithCategory[] {
  return behaviors.map((behavior) => ({
    ...behavior,
    schedule_slots: [...(behavior.schedule_slots ?? [])].sort(
      (left, right) => {
        const sortComparison = left.sort_order - right.sort_order;

        if (sortComparison !== 0) {
          return sortComparison;
        }

        return left.start_time.localeCompare(right.start_time);
      },
    ),
  }));
}
