import type { Json } from "@/lib/db/database.types";
import type {
  BehaviorActionState,
  BehaviorFormField,
  BehaviorRecurrenceFormDefaults,
  CategoryOption,
} from "@/lib/types/behavior";
import type { RecurrenceRule, Weekday } from "@/lib/types/recurrence";
import { WEEKDAYS } from "@/lib/types/recurrence";

export type ParsedBehaviorFormData = {
  behaviorId: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  recurrenceRule: RecurrenceRule;
  scheduledTime: string;
  browserReminderEnabled: boolean;
  emailReminderEnabled: boolean;
  reminderOffsetMinutes: number;
  active: boolean;
};

export type ParseBehaviorFormOptions = {
  mode: "create" | "update";
  categories: CategoryOption[];
};

export class BehaviorValidationError extends Error {
  readonly fieldErrors: Partial<Record<BehaviorFormField, string>>;

  constructor(
    message: string,
    fieldErrors: Partial<Record<BehaviorFormField, string>>,
  ) {
    super(message);
    this.name = "BehaviorValidationError";
    this.fieldErrors = fieldErrors;
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCHEDULED_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const ALLOWED_REMINDER_OFFSETS = new Set([0, 15, 60, 1440, 4320]);
const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export function parseBehaviorFormData(
  formData: FormData,
  options: ParseBehaviorFormOptions,
): ParsedBehaviorFormData {
  const fieldErrors: Partial<Record<BehaviorFormField, string>> = {};
  const behaviorId = getOptionalString(formData, "behavior_id");
  const title = getOptionalString(formData, "title").trim();
  const description = getOptionalString(formData, "description").trim();
  const categoryId = getOptionalString(formData, "category_id").trim();
  const scheduledTime = getOptionalString(formData, "scheduled_time").trim();

  if (options.mode === "update" && !UUID_PATTERN.test(behaviorId)) {
    fieldErrors.behavior_id = "Choose an existing behavior to edit.";
  }

  if (!title) {
    fieldErrors.title = "Enter a title.";
  } else if (title.length > 160) {
    fieldErrors.title = "Keep the title to 160 characters or fewer.";
  }

  if (description.length > 1000) {
    fieldErrors.description =
      "Keep the description to 1,000 characters or fewer.";
  }

  if (categoryId && !UUID_PATTERN.test(categoryId)) {
    fieldErrors.category_id = "Choose one of your categories.";
  } else if (
    categoryId &&
    !options.categories.some((category) => category.id === categoryId)
  ) {
    fieldErrors.category_id = "Choose one of your categories.";
  }

  if (!SCHEDULED_TIME_PATTERN.test(scheduledTime)) {
    fieldErrors.scheduled_time = "Choose a scheduled time.";
  }

  const recurrenceRule = parseRecurrenceRuleFromForm(formData, fieldErrors);
  const reminderOffsetMinutes = parseReminderOffset(formData, fieldErrors);

  if (Object.keys(fieldErrors).length > 0) {
    throw new BehaviorValidationError("Check the highlighted fields.", fieldErrors);
  }

  return {
    behaviorId,
    title,
    description: description || null,
    categoryId: categoryId || null,
    recurrenceRule,
    scheduledTime,
    browserReminderEnabled: getCheckboxValue(formData, "browser_reminder"),
    emailReminderEnabled: getCheckboxValue(formData, "email_reminder"),
    reminderOffsetMinutes,
    active:
      options.mode === "create" ? true : getCheckboxValue(formData, "active"),
  };
}

export function normalizeRecurrenceRule(value: unknown): RecurrenceRule {
  if (!isRecord(value)) {
    throw new BehaviorValidationError("Stored recurrence is invalid.", {
      recurrence: "Stored recurrence is invalid.",
    });
  }

  switch (value.frequency) {
    case "daily":
      return {
        frequency: "daily",
        interval: requirePositiveInteger(value.interval, "recurrence"),
      };

    case "interval_days":
      return {
        frequency: "interval_days",
        intervalDays: requirePositiveInteger(value.intervalDays, "recurrence"),
      };

    case "weekly":
      return {
        frequency: "weekly",
        interval: requirePositiveInteger(value.interval, "recurrence"),
        daysOfWeek: requireWeekdays(value.daysOfWeek),
      };

    case "monthly":
      return {
        frequency: "monthly",
        interval: requirePositiveInteger(value.interval, "recurrence"),
        dayOfMonth: requireIntegerInRange(value.dayOfMonth, 1, 31, "recurrence"),
      };

    default:
      throw new BehaviorValidationError("Stored recurrence is invalid.", {
        recurrence: "Stored recurrence is invalid.",
      });
  }
}

export function recurrenceRuleToJson(recurrenceRule: RecurrenceRule): Json {
  return recurrenceRule as unknown as Json;
}

export function recurrenceDefaultsFromRule(
  recurrenceRule: RecurrenceRule,
): BehaviorRecurrenceFormDefaults {
  switch (recurrenceRule.frequency) {
    case "daily":
      return {
        ...defaultRecurrenceDefaults(),
        kind: "daily",
        dailyInterval: recurrenceRule.interval,
      };

    case "interval_days":
      return {
        ...defaultRecurrenceDefaults(),
        kind: "every_days",
        everyDays: recurrenceRule.intervalDays,
      };

    case "weekly":
      return {
        ...defaultRecurrenceDefaults(),
        kind: "weekly",
        weeklyInterval: recurrenceRule.interval,
        weeklyDays: recurrenceRule.daysOfWeek,
      };

    case "monthly":
      return {
        ...defaultRecurrenceDefaults(),
        kind: "monthly",
        monthlyInterval: recurrenceRule.interval,
        monthlyDay: recurrenceRule.dayOfMonth,
      };
  }
}

export function defaultRecurrenceDefaults(): BehaviorRecurrenceFormDefaults {
  return {
    kind: "daily",
    dailyInterval: 1,
    everyDays: 2,
    weeklyInterval: 1,
    weeklyDays: ["monday"],
    monthlyInterval: 1,
    monthlyDay: 1,
  };
}

export function summarizeRecurrenceRule(recurrenceRule: RecurrenceRule): string {
  switch (recurrenceRule.frequency) {
    case "daily":
      return recurrenceRule.interval === 1
        ? "Daily"
        : `Every ${recurrenceRule.interval} days`;

    case "interval_days":
      return recurrenceRule.intervalDays === 1
        ? "Daily"
        : `Every ${recurrenceRule.intervalDays} days`;

    case "weekly": {
      const dayList = recurrenceRule.daysOfWeek
        .map((weekday) => WEEKDAY_LABELS[weekday])
        .join(", ");
      return recurrenceRule.interval === 1
        ? `Weekly on ${dayList}`
        : `Every ${recurrenceRule.interval} weeks on ${dayList}`;
    }

    case "monthly":
      return recurrenceRule.interval === 1
        ? `Monthly on day ${recurrenceRule.dayOfMonth}`
        : `Every ${recurrenceRule.interval} months on day ${recurrenceRule.dayOfMonth}`;
  }
}

export function normalizeScheduledTime(value: string): string {
  return value.slice(0, 5);
}

export function formatScheduledTimeLabel(value: string): string {
  const normalized = normalizeScheduledTime(value);
  const [hourValue, minuteValue] = normalized.split(":");
  const hour = Number(hourValue);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;

  return `${hour12}:${minuteValue} ${period}`;
}

export function summarizeReminders(input: {
  browserReminderEnabled: boolean;
  emailReminderEnabled: boolean;
  reminderOffsetMinutes: number;
}): string {
  const channels = [
    input.browserReminderEnabled ? "Browser" : null,
    input.emailReminderEnabled ? "Email" : null,
  ].filter(Boolean);

  if (channels.length === 0) {
    return "No reminders";
  }

  return `${channels.join(" + ")} ${formatReminderOffset(input.reminderOffsetMinutes)}`;
}

export function formatReminderOffset(minutes: number): string {
  switch (minutes) {
    case 0:
      return "at scheduled time";
    case 15:
      return "15 minutes before";
    case 60:
      return "1 hour before";
    case 1440:
      return "1 day before";
    case 4320:
      return "3 days before";
    default:
      return `${minutes} minutes before`;
  }
}

export function behaviorErrorToActionState(error: unknown): BehaviorActionState {
  if (error instanceof BehaviorValidationError) {
    return {
      status: "error",
      message: error.message,
      fieldErrors: error.fieldErrors,
    };
  }

  if (error instanceof Error) {
    return {
      status: "error",
      message: error.message,
    };
  }

  return {
    status: "error",
    message: "Something went wrong while saving this behavior.",
  };
}

function parseRecurrenceRuleFromForm(
  formData: FormData,
  fieldErrors: Partial<Record<BehaviorFormField, string>>,
): RecurrenceRule {
  const kind = getOptionalString(formData, "recurrence_kind");

  switch (kind) {
    case "daily":
      return {
        frequency: "daily",
        interval: parsePositiveIntegerField(
          formData,
          "daily_interval",
          "recurrence",
          fieldErrors,
        ),
      };

    case "every_days":
      return {
        frequency: "interval_days",
        intervalDays: parsePositiveIntegerField(
          formData,
          "every_days",
          "recurrence",
          fieldErrors,
        ),
      };

    case "weekly":
      return {
        frequency: "weekly",
        interval: parsePositiveIntegerField(
          formData,
          "weekly_interval",
          "recurrence",
          fieldErrors,
        ),
        daysOfWeek: parseWeekdays(formData, fieldErrors),
      };

    case "monthly":
      return {
        frequency: "monthly",
        interval: parsePositiveIntegerField(
          formData,
          "monthly_interval",
          "recurrence",
          fieldErrors,
        ),
        dayOfMonth: parseIntegerFieldInRange(
          formData,
          "monthly_day",
          1,
          31,
          "recurrence",
          fieldErrors,
        ),
      };

    default:
      fieldErrors.recurrence = "Choose a recurrence.";
      return { frequency: "daily", interval: 1 };
  }
}

function parseWeekdays(
  formData: FormData,
  fieldErrors: Partial<Record<BehaviorFormField, string>>,
): Weekday[] {
  const weekdays = formData
    .getAll("weekly_days")
    .filter((value): value is string => typeof value === "string")
    .filter(isWeekday);

  if (weekdays.length === 0) {
    fieldErrors.recurrence = "Choose at least one weekday.";
  }

  return weekdays;
}

function parseReminderOffset(
  formData: FormData,
  fieldErrors: Partial<Record<BehaviorFormField, string>>,
): number {
  const value = parseIntegerFieldInRange(
    formData,
    "reminder_offset",
    0,
    4320,
    "reminders",
    fieldErrors,
  );

  if (!ALLOWED_REMINDER_OFFSETS.has(value)) {
    fieldErrors.reminders = "Choose a reminder offset.";
  }

  return value;
}

function parsePositiveIntegerField(
  formData: FormData,
  fieldName: string,
  errorField: BehaviorFormField,
  fieldErrors: Partial<Record<BehaviorFormField, string>>,
): number {
  return parseIntegerFieldInRange(
    formData,
    fieldName,
    1,
    999,
    errorField,
    fieldErrors,
  );
}

function parseIntegerFieldInRange(
  formData: FormData,
  fieldName: string,
  minimum: number,
  maximum: number,
  errorField: BehaviorFormField,
  fieldErrors: Partial<Record<BehaviorFormField, string>>,
): number {
  const value = Number(getOptionalString(formData, fieldName));

  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    fieldErrors[errorField] =
      `Enter a whole number from ${minimum} to ${maximum}.`;
    return minimum;
  }

  return value;
}

function requirePositiveInteger(
  value: unknown,
  errorField: BehaviorFormField,
): number {
  return requireIntegerInRange(value, 1, 999, errorField);
}

function requireIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  errorField: BehaviorFormField,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new BehaviorValidationError("Stored recurrence is invalid.", {
      [errorField]: "Stored recurrence is invalid.",
    });
  }

  return value;
}

function requireWeekdays(value: unknown): Weekday[] {
  if (!Array.isArray(value)) {
    throw new BehaviorValidationError("Stored recurrence is invalid.", {
      recurrence: "Stored recurrence is invalid.",
    });
  }

  const weekdays = value.filter(
    (weekday): weekday is Weekday =>
      typeof weekday === "string" && isWeekday(weekday),
  );

  if (weekdays.length === 0 || weekdays.length !== value.length) {
    throw new BehaviorValidationError("Stored recurrence is invalid.", {
      recurrence: "Stored recurrence is invalid.",
    });
  }

  return weekdays;
}

function isWeekday(value: string): value is Weekday {
  return WEEKDAYS.includes(value as Weekday);
}

function getOptionalString(formData: FormData, fieldName: string): string {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value : "";
}

function getCheckboxValue(formData: FormData, fieldName: string): boolean {
  const value = formData.get(fieldName);

  return value === "on" || value === "true";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
