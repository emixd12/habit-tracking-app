import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import type { Json } from "@/lib/db/database.types";
import { measurePerformanceSpan } from "@/lib/services/performance-timing";
import type {
  BehaviorDefinition,
  BehaviorDefinitionEventPlan,
} from "@/lib/types/behavior-definition-event";
import type {
  Behavior,
  BehaviorUpdate,
  BehaviorDefinitionEvent,
  NewBehavior,
  NewBehaviorDefinitionEvent,
} from "@/lib/types/database";

export async function createBehaviorWithDefinitionEvent(
  supabase: AppSupabaseClient,
  input: {
    behavior: NewBehavior;
    definitionEventPlan: BehaviorDefinitionEventPlan;
  },
): Promise<Behavior> {
  const { data, error } = await supabase.rpc(
    "create_behavior_with_definition_event",
    {
      behavior_payload: toBehaviorPayload(input.behavior),
      definition_event_plan: toDefinitionEventPlanPayload(
        input.definitionEventPlan,
      ),
    },
  );

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Behavior was not created.");
  }

  return data as unknown as Behavior;
}

export async function updateBehaviorWithDefinitionEvent(
  supabase: AppSupabaseClient,
  input: {
    behaviorId: string;
    behavior: BehaviorUpdate;
    expectedDefinition: BehaviorDefinition;
    expectedNormalizedDefinition: BehaviorDefinition;
    definitionEventPlan: BehaviorDefinitionEventPlan | null;
  },
): Promise<Behavior | null> {
  const { data, error } = await supabase.rpc(
    "update_behavior_with_definition_event",
    {
      target_behavior_id: input.behaviorId,
      behavior_payload: toBehaviorPayload(input.behavior),
      expected_definition: {
        stored_title: input.expectedDefinition.title,
        stored_description: input.expectedDefinition.description,
        normalized_title: input.expectedNormalizedDefinition.title,
        normalized_description: input.expectedNormalizedDefinition.description,
      },
      definition_event_plan: input.definitionEventPlan
        ? toDefinitionEventPlanPayload(input.definitionEventPlan)
        : null,
    },
  );

  if (error) {
    throw error;
  }

  return data ? (data as unknown as Behavior) : null;
}

export async function createBehaviorDefinitionEvent(
  supabase: AppSupabaseClient,
  event: NewBehaviorDefinitionEvent,
): Promise<BehaviorDefinitionEvent> {
  const { data, error } = await supabase
    .from("behavior_definition_events")
    .insert(event)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function listBehaviorDefinitionEvents(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<BehaviorDefinitionEvent[]> {
  return measurePerformanceSpan(
    {
      span: "db.list_behavior_definition_events",
      counts: (events) => ({
        behavior_definition_events: events.length,
      }),
    },
    async () => {
      const { data, error } = await supabase
        .from("behavior_definition_events")
        .select("*")
        .eq("user_id", userId)
        .order("recorded_at", { ascending: true })
        .order("id", { ascending: true });

      if (error) {
        throw error;
      }

      return data ?? [];
    },
  );
}

function toBehaviorPayload(
  behavior: NewBehavior | BehaviorUpdate,
): Json {
  return {
    category_id: behavior.category_id ?? null,
    title: behavior.title,
    description: behavior.description ?? null,
    recurrence_rule: behavior.recurrence_rule,
    scheduled_time: behavior.scheduled_time,
    timezone: "timezone" in behavior ? behavior.timezone : undefined,
    browser_reminder_enabled: behavior.browser_reminder_enabled,
    email_reminder_enabled: behavior.email_reminder_enabled,
    reminder_offset_minutes: behavior.reminder_offset_minutes,
    active: behavior.active,
    archived_at: behavior.archived_at ?? null,
    created_at: "created_at" in behavior ? behavior.created_at ?? null : null,
  };
}

function toDefinitionEventPlanPayload(
  plan: BehaviorDefinitionEventPlan,
): Json {
  return {
    previous_title: plan.previousTitle,
    next_title: plan.nextTitle,
    previous_description: plan.previousDescription,
    next_description: plan.nextDescription,
    changed_fields: plan.changedFields,
    recorded_at: plan.recordedAt,
    source: plan.source,
    reason: plan.reason,
  };
}
