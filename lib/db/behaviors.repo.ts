import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";
import { measurePerformanceSpan } from "@/lib/services/performance-timing";
import type {
  Behavior,
  BehaviorSchedule,
  BehaviorScheduleUpdate,
  BehaviorScheduleSlot,
  BehaviorScheduleSlotUpdate,
  BehaviorUpdate,
  Category,
  NewBehaviorSchedule,
  NewBehaviorScheduleSlot,
  NewBehavior,
} from "@/lib/types/database";

export type AppSupabaseClient = SupabaseClient<Database>;

export type BehaviorWithCategory = Behavior & {
  category: Pick<Category, "id" | "name"> | null;
  schedules?: BehaviorScheduleWithSlots[];
  schedule_slots: BehaviorScheduleSlot[];
};

export type BehaviorScheduleWithSlots = BehaviorSchedule & {
  schedule_slots: BehaviorScheduleSlot[];
};

const BEHAVIOR_WITH_CATEGORY_SELECT =
  "*, category:categories!behaviors_category_id_fkey(id, name), schedules:behavior_schedules!behavior_schedules_behavior_owner_fkey(*, schedule_slots:behavior_schedule_slots!behavior_schedule_slots_schedule_owner_fkey(*)), schedule_slots:behavior_schedule_slots!behavior_schedule_slots_behavior_owner_fkey(*)";

export async function listBehaviorCategories(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<Category[]> {
  return measurePerformanceSpan(
    {
      span: "db.list_behavior_categories",
      counts: (categories) => ({ categories: categories.length }),
    },
    async () => {
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
    },
  );
}

export async function listUserBehaviors(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<BehaviorWithCategory[]> {
  return measurePerformanceSpan(
    {
      span: "db.list_user_behaviors",
      counts: (behaviors) => ({
        behaviors: behaviors.length,
        active_behaviors: behaviors.filter((behavior) => behavior.active).length,
        schedule_slots: behaviors.reduce(
          (sum, behavior) => sum + behavior.schedule_slots.length,
          0,
        ),
        schedules: behaviors.reduce(
          (sum, behavior) => sum + (behavior.schedules?.length ?? 0),
          0,
        ),
      }),
    },
    async () => {
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
    },
  );
}

export async function getBehaviorById(
  supabase: AppSupabaseClient,
  userId: string,
  behaviorId: string,
): Promise<BehaviorWithCategory | null> {
  return measurePerformanceSpan(
    {
      span: "db.get_behavior_by_id",
      counts: (behavior) => ({
        behaviors: behavior ? 1 : 0,
        schedule_slots: behavior?.schedule_slots.length ?? 0,
        schedules: behavior?.schedules?.length ?? 0,
      }),
    },
    async () => {
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
    },
  );
}

export async function getProfileTimezone(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<string | null> {
  return measurePerformanceSpan(
    {
      span: "db.get_profile_timezone",
      counts: (timezone) => ({ profiles: timezone ? 1 : 0 }),
    },
    async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("timezone")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data?.timezone ?? null;
    },
  );
}

export async function createBehavior(
  supabase: AppSupabaseClient,
  behavior: NewBehavior,
): Promise<Behavior> {
  const { data, error } = await supabase
    .from("behaviors")
    .insert(behavior)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
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

export async function updateActiveBehaviorTimezones(
  supabase: AppSupabaseClient,
  userId: string,
  timezone: string,
): Promise<BehaviorWithCategory[]> {
  const { data, error } = await supabase
    .from("behaviors")
    .update({ timezone })
    .eq("user_id", userId)
    .eq("active", true)
    .select(BEHAVIOR_WITH_CATEGORY_SELECT);

  if (error) {
    throw error;
  }

  return sortBehaviorScheduleSlots(
    (data ?? []) as unknown as BehaviorWithCategory[],
  );
}

export async function listBehaviorSchedules(
  supabase: AppSupabaseClient,
  userId: string,
  behaviorId: string,
): Promise<BehaviorScheduleWithSlots[]> {
  return measurePerformanceSpan(
    {
      span: "db.list_behavior_schedules",
      counts: (schedules) => ({
        schedules: schedules.length,
        schedule_slots: schedules.reduce(
          (sum, schedule) => sum + schedule.schedule_slots.length,
          0,
        ),
      }),
    },
    async () => {
      const { data, error } = await supabase
        .from("behavior_schedules")
        .select(
          "*, schedule_slots:behavior_schedule_slots!behavior_schedule_slots_schedule_owner_fkey(*)",
        )
        .eq("user_id", userId)
        .eq("behavior_id", behaviorId)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });

      if (error) {
        throw error;
      }

      return sortBehaviorSchedules(
        (data ?? []) as unknown as BehaviorScheduleWithSlots[],
      );
    },
  );
}

export async function replaceBehaviorSchedules(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    behaviorId: string;
    schedules: Array<
      Omit<NewBehaviorSchedule, "user_id" | "behavior_id"> & {
        id?: string | null;
        slots: Array<
          Omit<
            NewBehaviorScheduleSlot,
            "user_id" | "behavior_id" | "behavior_schedule_id"
          > & {
            id?: string | null;
          }
        >;
      }
    >;
  },
): Promise<void> {
  const existingSchedules = await listBehaviorSchedules(
    supabase,
    input.userId,
    input.behaviorId,
  );
  const existingIds = new Set(existingSchedules.map((schedule) => schedule.id));
  const retainedIds = new Set<string>();

  for (const schedule of input.schedules) {
    const baseSchedule = {
      recurrence_rule: schedule.recurrence_rule,
      sort_order: schedule.sort_order,
    } satisfies BehaviorScheduleUpdate;
    const savedSchedule =
      schedule.id && existingIds.has(schedule.id)
        ? await updateBehaviorSchedule(supabase, {
            userId: input.userId,
            behaviorId: input.behaviorId,
            scheduleId: schedule.id,
            schedule: baseSchedule,
          })
        : await createBehaviorSchedule(supabase, {
            ...baseSchedule,
            user_id: input.userId,
            behavior_id: input.behaviorId,
          });

    retainedIds.add(savedSchedule.id);
    await replaceBehaviorScheduleTimeEntries(supabase, {
      userId: input.userId,
      behaviorId: input.behaviorId,
      behaviorScheduleId: savedSchedule.id,
      existingSlots:
        existingSchedules.find((existing) => existing.id === savedSchedule.id)
          ?.schedule_slots ?? [],
      slots: schedule.slots,
    });
  }

  const deleteIds = existingSchedules
    .filter((schedule) => !retainedIds.has(schedule.id))
    .map((schedule) => schedule.id);

  if (deleteIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("behavior_schedules")
    .delete()
    .eq("user_id", input.userId)
    .eq("behavior_id", input.behaviorId)
    .in("id", deleteIds);

  if (error) {
    throw error;
  }
}

export async function listBehaviorScheduleSlots(
  supabase: AppSupabaseClient,
  userId: string,
  behaviorId: string,
): Promise<BehaviorScheduleSlot[]> {
  return measurePerformanceSpan(
    {
      span: "db.list_behavior_schedule_slots",
      counts: (slots) => ({ schedule_slots: slots.length }),
    },
    async () => {
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
    },
  );
}

export async function getBehaviorScheduleSlotByStartTime(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    behaviorId: string;
    startTime: string;
  },
): Promise<BehaviorScheduleSlot | null> {
  const { data, error } = await supabase
    .from("behavior_schedule_slots")
    .select("*")
    .eq("user_id", input.userId)
    .eq("behavior_id", input.behaviorId)
    .eq("start_time", input.startTime)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function getBehaviorScheduleSlotById(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    scheduleSlotId: string;
  },
): Promise<BehaviorScheduleSlot | null> {
  const { data, error } = await supabase
    .from("behavior_schedule_slots")
    .select("*")
    .eq("user_id", input.userId)
    .eq("id", input.scheduleSlotId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function createBehaviorScheduleSlot(
  supabase: AppSupabaseClient,
  slot: NewBehaviorScheduleSlot,
): Promise<BehaviorScheduleSlot> {
  const { data, error } = await supabase
    .from("behavior_schedule_slots")
    .insert(slot)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createBehaviorScheduleSlots(
  supabase: AppSupabaseClient,
  slots: NewBehaviorScheduleSlot[],
): Promise<void> {
  if (slots.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("behavior_schedule_slots")
    .insert(slots);

  if (error) {
    throw error;
  }
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

async function createBehaviorSchedule(
  supabase: AppSupabaseClient,
  schedule: NewBehaviorSchedule,
): Promise<BehaviorSchedule> {
  const { data, error } = await supabase
    .from("behavior_schedules")
    .insert(schedule)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function updateBehaviorSchedule(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    behaviorId: string;
    scheduleId: string;
    schedule: BehaviorScheduleUpdate;
  },
): Promise<BehaviorSchedule> {
  const { data, error } = await supabase
    .from("behavior_schedules")
    .update(input.schedule)
    .eq("user_id", input.userId)
    .eq("behavior_id", input.behaviorId)
    .eq("id", input.scheduleId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function replaceBehaviorScheduleTimeEntries(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    behaviorId: string;
    behaviorScheduleId: string;
    existingSlots: BehaviorScheduleSlot[];
    slots: Array<
      Omit<
        NewBehaviorScheduleSlot,
        "user_id" | "behavior_id" | "behavior_schedule_id"
      > & {
        id?: string | null;
      }
    >;
  },
): Promise<void> {
  const existingIds = new Set(input.existingSlots.map((slot) => slot.id));
  const retainedIds = new Set(
    input.slots
      .map((slot) => slot.id)
      .filter((id): id is string => Boolean(id && existingIds.has(id))),
  );

  for (const slot of input.slots) {
    const baseSlot = {
      behavior_schedule_id: input.behaviorScheduleId,
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
        .eq("behavior_schedule_id", input.behaviorScheduleId)
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

  const deleteIds = input.existingSlots
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
    .eq("behavior_schedule_id", input.behaviorScheduleId)
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
    schedules: sortBehaviorSchedules(behavior.schedules ?? []),
    schedule_slots: sortScheduleSlots(behavior.schedule_slots ?? []),
  }));
}

function sortBehaviorSchedules(
  schedules: BehaviorScheduleWithSlots[],
): BehaviorScheduleWithSlots[] {
  return [...schedules]
    .sort((left, right) => {
      const sortComparison = left.sort_order - right.sort_order;

      if (sortComparison !== 0) {
        return sortComparison;
      }

      return left.id.localeCompare(right.id);
    })
    .map((schedule) => ({
      ...schedule,
      schedule_slots: sortScheduleSlots(schedule.schedule_slots ?? []),
    }));
}

function sortScheduleSlots(
  slots: BehaviorScheduleSlot[],
): BehaviorScheduleSlot[] {
  return [...slots].sort((left, right) => {
    const sortComparison = left.sort_order - right.sort_order;

    if (sortComparison !== 0) {
      return sortComparison;
    }

    return left.start_time.localeCompare(right.start_time);
  });
}
