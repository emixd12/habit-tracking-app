import type { Weekday } from "@/lib/types/recurrence";

export type CategoryOption = {
  id: string;
  name: string;
};

export type BehaviorRecurrenceKind =
  | "daily"
  | "every_days"
  | "weekly"
  | "monthly";

export type BehaviorRecurrenceFormDefaults = {
  kind: BehaviorRecurrenceKind;
  dailyInterval: number;
  everyDays: number;
  weeklyInterval: number;
  weeklyDays: Weekday[];
  monthlyInterval: number;
  monthlyDay: number;
};

export type BehaviorView = {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  categoryName: string;
  recurrenceSummary: string;
  recurrenceDefaults: BehaviorRecurrenceFormDefaults;
  scheduledTime: string;
  scheduledTimeLabel: string;
  timezone: string;
  browserReminderEnabled: boolean;
  emailReminderEnabled: boolean;
  reminderOffsetMinutes: number;
  reminderSummary: string;
  active: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BehaviorPageData = {
  categories: CategoryOption[];
  activeBehaviors: BehaviorView[];
  archivedBehaviors: BehaviorView[];
  defaultTimezone: string;
};

export type BehaviorFormField =
  | "behavior_id"
  | "title"
  | "description"
  | "category_id"
  | "scheduled_time"
  | "recurrence"
  | "reminders"
  | "active";

export type BehaviorActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Partial<Record<BehaviorFormField, string>>;
};

export type BehaviorFormAction = (
  previousState: BehaviorActionState,
  formData: FormData,
) => Promise<BehaviorActionState>;
