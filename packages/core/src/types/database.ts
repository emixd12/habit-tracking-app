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
