import type { Tables, TablesInsert, TablesUpdate } from "@/lib/db/database.types";

export type Profile = Tables<"profiles">;
export type Category = Tables<"categories">;
export type Behavior = Tables<"behaviors">;
export type Occurrence = Tables<"occurrences">;
export type ReminderDelivery = Tables<"reminder_deliveries">;
export type PushSubscription = Tables<"push_subscriptions">;

export type NewCategory = TablesInsert<"categories">;
export type NewBehavior = TablesInsert<"behaviors">;
export type NewOccurrence = TablesInsert<"occurrences">;
export type NewReminderDelivery = TablesInsert<"reminder_deliveries">;
export type NewPushSubscription = TablesInsert<"push_subscriptions">;

export type CategoryUpdate = TablesUpdate<"categories">;
export type BehaviorUpdate = TablesUpdate<"behaviors">;
export type OccurrenceUpdate = TablesUpdate<"occurrences">;
export type ReminderDeliveryUpdate = TablesUpdate<"reminder_deliveries">;
export type PushSubscriptionUpdate = TablesUpdate<"push_subscriptions">;

export type OccurrenceStatus = "unresolved" | "done" | "not_done";
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
