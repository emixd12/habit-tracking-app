import type { Weekday } from "./recurrence";
import type {
  BehaviorScheduleView,
  ScheduleSlotView,
} from "./schedule";

export type CategoryOption = {
  description?: string | null;
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

export type ArchiveNote = {
  id: string;
  archivedAt: string;
  note: string | null;
  updatedAt: string;
};

export type BehaviorView = {
  defaultDurationMinutes?: number | null;
  endDate?: string | null;
  autoArchivedAt?: string | null;
  id: string;
  title: string;
  description: string;
  categoryId: string;
  categoryName: string;
  recurrenceSummary: string;
  recurrenceDefaults: BehaviorRecurrenceFormDefaults;
  scheduledTime: string;
  scheduledTimeLabel: string;
  schedules?: BehaviorScheduleView[];
  scheduleSlots: ScheduleSlotView[];
  scheduleSummary: string;
  timezone: string;
  browserReminderEnabled: boolean;
  emailReminderEnabled: boolean;
  reminderOffsetMinutes: number;
  reminderSummary: string;
  active: boolean;
  archivedAt: string | null;
  archiveNotes: ArchiveNote[];
  createdAt: string;
  updatedAt: string;
};

export type BehaviorPageData = {
  categories: CategoryOption[];
  activeBehaviors: BehaviorView[];
  archivedBehaviors: BehaviorView[];
  defaultTimezone: string;
};

export const BEHAVIOR_FORM_FIELDS = [
  "behavior_id",
  "title",
  "description",
  "default_duration_minutes",
  "end_date",
  "category_id",
  "schedule",
  "recurrence",
  "reminders",
  "active",
] as const;

export type BehaviorFormField = (typeof BEHAVIOR_FORM_FIELDS)[number];

export type BehaviorActionState = {
  status: "idle" | "success" | "error";
  message: string;
  behavior?: BehaviorView;
  conflict?: boolean;
  fieldErrors?: Partial<Record<BehaviorFormField, string>>;
};
