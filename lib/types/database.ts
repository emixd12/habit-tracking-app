import type { Tables, TablesInsert, TablesUpdate } from "@/lib/db/database.types";

export type Profile = Tables<"profiles">;
export type Category = Tables<"categories">;
export type Behavior = Tables<"behaviors">;
export type BehaviorScheduleSlot = Tables<"behavior_schedule_slots">;
export type Occurrence = Tables<"occurrences">;
export type OccurrenceStatusEvent = Tables<"occurrence_status_events">;
export type BehaviorLogImportRun = Tables<"behaviorlog_import_runs">;
export type BehaviorLogImportRecordMapping =
  Tables<"behaviorlog_import_record_mappings">;
export type ReminderDelivery = Tables<"reminder_deliveries">;
export type PushSubscription = Tables<"push_subscriptions">;

export type NewCategory = TablesInsert<"categories">;
export type NewBehavior = TablesInsert<"behaviors">;
export type NewBehaviorScheduleSlot = TablesInsert<"behavior_schedule_slots">;
export type NewOccurrence = TablesInsert<"occurrences">;
export type NewOccurrenceStatusEvent = TablesInsert<"occurrence_status_events">;
export type NewBehaviorLogImportRun =
  TablesInsert<"behaviorlog_import_runs">;
export type NewBehaviorLogImportRecordMapping =
  TablesInsert<"behaviorlog_import_record_mappings">;
export type NewReminderDelivery = TablesInsert<"reminder_deliveries">;
export type NewPushSubscription = TablesInsert<"push_subscriptions">;

export type CategoryUpdate = TablesUpdate<"categories">;
export type BehaviorUpdate = TablesUpdate<"behaviors">;
export type BehaviorScheduleSlotUpdate = TablesUpdate<"behavior_schedule_slots">;
export type OccurrenceUpdate = TablesUpdate<"occurrences">;
export type OccurrenceStatusEventUpdate = TablesUpdate<"occurrence_status_events">;
export type BehaviorLogImportRunUpdate =
  TablesUpdate<"behaviorlog_import_runs">;
export type BehaviorLogImportRecordMappingUpdate =
  TablesUpdate<"behaviorlog_import_record_mappings">;
export type ReminderDeliveryUpdate = TablesUpdate<"reminder_deliveries">;
export type PushSubscriptionUpdate = TablesUpdate<"push_subscriptions">;

export type OccurrenceStatus = "unresolved" | "completed" | "not_completed";
export type ReminderChannel = "browser_push" | "email";
export type ReminderDeliveryStatus = "pending" | "sent" | "failed" | "cancelled";

export const DEFAULT_CATEGORY_NAMES = [
  "Medical",
  "Grooming",
  "Fitness",
  "Food / Drink",
  "Home",
  "Measurements",
  "Admin",
  "Other",
] as const;

export type DefaultCategoryName = (typeof DEFAULT_CATEGORY_NAMES)[number];
