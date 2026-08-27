import type { Json } from "@/lib/db/database.types";
import type {
  BehaviorActionState,
  BehaviorFormField,
  BehaviorRecurrenceFormDefaults,
  CategoryOption,
} from "@/lib/types/behavior";
import type { RecurrenceRule, Weekday } from "@/lib/types/recurrence";
import { WEEKDAYS } from "@/lib/types/recurrence";
import {
  formatClockTimeLabel,
  formatScheduleSlotLabel,
  isValidTime,
  normalizeTime,
  timeRangePresetToSlot,
} from "@/lib/services/schedule";
import {
  TIME_RANGE_PRESETS,
  type BehaviorScheduleInput,
  type ScheduleSlotInput,
  type TimeRangePreset,
} from "@/lib/types/schedule";

export type ParsedBehaviorFormData = {
  behaviorId: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  recurrenceRule: RecurrenceRule;
  scheduledTime: string;
  schedules: BehaviorScheduleInput[];
  scheduleSlots: ScheduleSlotInput[];
  browserReminderEnabled: boolean;
  emailReminderEnabled: boolean;
  reminderOffsetMinutes: number;
  active: boolean;
};

export type ParseBehaviorFormOptions = {
  mode: "create" | "update";
  categories?: CategoryOption[];
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
const MAX_BEHAVIOR_SCHEDULES = 6;
const MAX_TIME_ENTRIES_PER_SCHEDULE = 8;
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
    options.categories &&
    !options.categories.some((category) => category.id === categoryId)
  ) {
    fieldErrors.category_id = "Choose one of your categories.";
  }

  const { recurrenceRule, schedules, scheduleSlots } =
    parseSchedulesAndLegacyFieldsFromForm(formData, fieldErrors);
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
    scheduledTime: scheduleSlots[0]?.startTime ?? "09:00",
    schedules,
    scheduleSlots,
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
  return normalizeTime(value);
}

export function formatScheduledTimeLabel(value: string): string {
  return formatClockTimeLabel(value);
}

export { formatScheduleSlotLabel };

export function summarizeReminders(input: {
  browserReminderEnabled: boolean;
  emailReminderEnabled: boolean;
  reminderOffsetMinutes: number;
}): string {
  const channels = [
    input.browserReminderEnabled ? "Browser notifications" : null,
    input.emailReminderEnabled ? "Email" : null,
  ].filter(Boolean);

  if (channels.length === 0) {
    return "No reminders";
  }

  return `${channels.join(" + ")}, ${formatReminderOffset(input.reminderOffsetMinutes)}`;
}

export function formatReminderOffset(minutes: number): string {
  switch (minutes) {
    case 0:
      return "at scheduled start";
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

  const message = getErrorMessage(error);

  if (message === "Behavior schedule graph changed after it was read.") {
    return {
      status: "error",
      message: "This behavior changed elsewhere. Reload it before saving again. Your draft is still here.",
      conflict: true,
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

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return null;
}

function parseSchedulesAndLegacyFieldsFromForm(
  formData: FormData,
  fieldErrors: Partial<Record<BehaviorFormField, string>>,
): {
  recurrenceRule: RecurrenceRule;
  schedules: BehaviorScheduleInput[];
  scheduleSlots: ScheduleSlotInput[];
} {
  if (getOptionalString(formData, "behavior_schedule_count")) {
    const schedules = parseBehaviorSchedulesFromForm(formData, fieldErrors);
    const recurrenceRule = schedules[0]?.recurrenceRule ?? {
      frequency: "daily",
      interval: 1,
    };
    const scheduleSlots = schedules.flatMap((schedule) => schedule.timeEntries);

    return {
      recurrenceRule,
      schedules,
      scheduleSlots,
    };
  }

  const recurrenceRule = parseRecurrenceRuleFromForm(formData, fieldErrors);
  const scheduleSlots = parseScheduleSlotsFromForm(formData, fieldErrors);

  return {
    recurrenceRule,
    schedules: [
      {
        id: null,
        recurrenceRule,
        timeEntries: scheduleSlots,
        sortOrder: 0,
      },
    ],
    scheduleSlots,
  };
}

function parseBehaviorSchedulesFromForm(
  formData: FormData,
  fieldErrors: Partial<Record<BehaviorFormField, string>>,
): BehaviorScheduleInput[] {
  const rawCount = getOptionalString(formData, "behavior_schedule_count");
  const count = Number(rawCount);

  if (!Number.isInteger(count) || count < 1) {
    fieldErrors.schedule = "Add at least one schedule.";
    return [
      {
        id: null,
        recurrenceRule: { frequency: "daily", interval: 1 },
        timeEntries: [
          {
            id: null,
            kind: "exact",
            preset: null,
            startTime: "09:00",
            endTime: null,
            sortOrder: 0,
          },
        ],
        sortOrder: 0,
      },
    ];
  }

  if (count > MAX_BEHAVIOR_SCHEDULES) {
    fieldErrors.schedule = `Use ${MAX_BEHAVIOR_SCHEDULES} or fewer schedules.`;
  }

  const upperBound = Math.min(count, MAX_BEHAVIOR_SCHEDULES);
  const schedules: BehaviorScheduleInput[] = [];

  for (let index = 0; index < upperBound; index += 1) {
    schedules.push(parseBehaviorScheduleAtIndex(formData, index, fieldErrors));
  }

  if (schedules.every((schedule) => schedule.timeEntries.length === 0)) {
    fieldErrors.schedule = "Add at least one time entry.";
  }

  return schedules;
}

function parseBehaviorScheduleAtIndex(
  formData: FormData,
  index: number,
  fieldErrors: Partial<Record<BehaviorFormField, string>>,
): BehaviorScheduleInput {
  const id = getOptionalString(formData, `behavior_schedule_id_${index}`).trim();

  if (id && !UUID_PATTERN.test(id)) {
    fieldErrors.schedule = "Choose one of this behavior's schedules.";
  }

  return {
    id: id || null,
    recurrenceRule: parseRecurrenceRuleFromForm(
      formData,
      fieldErrors,
      `schedule_${index}`,
    ),
    timeEntries: parseTimeEntriesForSchedule(formData, index, fieldErrors),
    sortOrder: index,
  };
}

function parseTimeEntriesForSchedule(
  formData: FormData,
  scheduleIndex: number,
  fieldErrors: Partial<Record<BehaviorFormField, string>>,
): ScheduleSlotInput[] {
  const rawCount = getOptionalString(
    formData,
    `schedule_${scheduleIndex}_time_entry_count`,
  );
  const count = Number(rawCount);

  if (!Number.isInteger(count) || count < 1) {
    fieldErrors.schedule = "Each schedule needs at least one time.";
    return [
      {
        id: null,
        kind: "exact",
        preset: null,
        startTime: "09:00",
        endTime: null,
        sortOrder: 0,
      },
    ];
  }

  if (count > MAX_TIME_ENTRIES_PER_SCHEDULE) {
    fieldErrors.schedule = `Use ${MAX_TIME_ENTRIES_PER_SCHEDULE} or fewer times per schedule.`;
  }

  const upperBound = Math.min(count, MAX_TIME_ENTRIES_PER_SCHEDULE);
  const seenStartTimes = new Set<string>();
  const entries: ScheduleSlotInput[] = [];

  for (let index = 0; index < upperBound; index += 1) {
    const entry = parseTimeEntryAtIndex(
      formData,
      scheduleIndex,
      index,
      fieldErrors,
    );
    const entryKey = entry.startTime;

    if (seenStartTimes.has(entryKey)) {
      fieldErrors.schedule = "Use each start time only once within a schedule.";
    }

    seenStartTimes.add(entryKey);
    entries.push({
      ...entry,
      sortOrder: index,
    });
  }

  return entries;
}

function parseTimeEntryAtIndex(
  formData: FormData,
  scheduleIndex: number,
  index: number,
  fieldErrors: Partial<Record<BehaviorFormField, string>>,
): ScheduleSlotInput {
  const id = getOptionalString(
    formData,
    `schedule_${scheduleIndex}_time_entry_id_${index}`,
  ).trim();
  const kind = getOptionalString(
    formData,
    `schedule_${scheduleIndex}_time_entry_kind_${index}`,
  );

  if (id && !UUID_PATTERN.test(id)) {
    fieldErrors.schedule = "Choose one of this schedule's time entries.";
  }

  if (kind === "range") {
    const preset = getOptionalString(
      formData,
      `schedule_${scheduleIndex}_time_entry_range_preset_${index}`,
    );

    if (isTimeRangePreset(preset)) {
      return timeRangePresetToSlot({
        id: id || null,
        preset,
        sortOrder: index,
      });
    }

    const startTime = getOptionalString(
      formData,
      `schedule_${scheduleIndex}_time_entry_range_start_${index}`,
    ).trim();
    const endTime = getOptionalString(
      formData,
      `schedule_${scheduleIndex}_time_entry_range_end_${index}`,
    ).trim();

    if (
      !SCHEDULED_TIME_PATTERN.test(startTime) ||
      !isValidTime(startTime) ||
      !SCHEDULED_TIME_PATTERN.test(endTime) ||
      !isValidTime(endTime)
    ) {
      fieldErrors.schedule = "Choose a valid time range.";
      return {
        id: id || null,
        kind: "range",
        preset: null,
        startTime: "09:00",
        endTime: "09:30",
        sortOrder: index,
      };
    }

    if (normalizeTime(startTime) === normalizeTime(endTime)) {
      fieldErrors.schedule = "Use a range with different start and end times.";
    }

    return {
      id: id || null,
      kind: "range",
      preset: null,
      startTime: normalizeTime(startTime),
      endTime: normalizeTime(endTime),
      sortOrder: index,
    };
  }

  if (kind !== "exact") {
    fieldErrors.schedule = "Choose exact time or time range.";
  }

  const startTime = getOptionalString(
    formData,
    `schedule_${scheduleIndex}_time_entry_exact_time_${index}`,
  ).trim();

  if (!SCHEDULED_TIME_PATTERN.test(startTime) || !isValidTime(startTime)) {
    fieldErrors.schedule = "Choose a scheduled time.";
    return {
      id: id || null,
      kind: "exact",
      preset: null,
      startTime: "09:00",
      endTime: null,
      sortOrder: index,
    };
  }

  return {
    id: id || null,
    kind: "exact",
    preset: null,
    startTime: normalizeTime(startTime),
    endTime: null,
    sortOrder: index,
  };
}

function parseRecurrenceRuleFromForm(
  formData: FormData,
  fieldErrors: Partial<Record<BehaviorFormField, string>>,
  prefix = "",
): RecurrenceRule {
  const kind = getOptionalString(formData, recurrenceFieldName(prefix, "recurrence_kind"));

  switch (kind) {
    case "daily":
      return {
        frequency: "daily",
        interval: parsePositiveIntegerField(
          formData,
          recurrenceFieldName(prefix, "daily_interval"),
          "recurrence",
          fieldErrors,
        ),
      };

    case "every_days":
      return {
        frequency: "interval_days",
        intervalDays: parsePositiveIntegerField(
          formData,
          recurrenceFieldName(prefix, "every_days"),
          "recurrence",
          fieldErrors,
        ),
      };

    case "weekly":
      return {
        frequency: "weekly",
        interval: parsePositiveIntegerField(
          formData,
          recurrenceFieldName(prefix, "weekly_interval"),
          "recurrence",
          fieldErrors,
        ),
        daysOfWeek: parseWeekdays(formData, fieldErrors, prefix),
      };

    case "monthly":
      return {
        frequency: "monthly",
        interval: parsePositiveIntegerField(
          formData,
          recurrenceFieldName(prefix, "monthly_interval"),
          "recurrence",
          fieldErrors,
        ),
        dayOfMonth: parseIntegerFieldInRange(
          formData,
          recurrenceFieldName(prefix, "monthly_day"),
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

function recurrenceFieldName(prefix: string, fieldName: string): string {
  return prefix ? `${prefix}_${fieldName}` : fieldName;
}

function parseWeekdays(
  formData: FormData,
  fieldErrors: Partial<Record<BehaviorFormField, string>>,
  prefix = "",
): Weekday[] {
  const weekdays = formData
    .getAll(recurrenceFieldName(prefix, "weekly_days"))
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

function parseScheduleSlotsFromForm(
  formData: FormData,
  fieldErrors: Partial<Record<BehaviorFormField, string>>,
): ScheduleSlotInput[] {
  const rawCount = getOptionalString(formData, "schedule_slot_count");

  if (!rawCount) {
    return [parseLegacyScheduledTimeSlot(formData, fieldErrors)];
  }

  const count = Number(rawCount);

  if (!Number.isInteger(count) || count < 1) {
    fieldErrors.schedule = "Add at least one scheduled time or range.";
    return [
      {
        id: null,
        kind: "exact",
        preset: null,
        startTime: "09:00",
        endTime: null,
        sortOrder: 0,
      },
    ];
  }

  if (count > MAX_TIME_ENTRIES_PER_SCHEDULE) {
    fieldErrors.schedule = `Use ${MAX_TIME_ENTRIES_PER_SCHEDULE} or fewer scheduled times or ranges.`;
  }

  const slots: ScheduleSlotInput[] = [];
  const seenStartTimes = new Set<string>();
  const upperBound = Math.min(count, MAX_TIME_ENTRIES_PER_SCHEDULE);

  for (let index = 0; index < upperBound; index += 1) {
    const slot = parseScheduleSlotAtIndex(formData, index, fieldErrors);

    if (seenStartTimes.has(slot.startTime)) {
      fieldErrors.schedule = "Use each scheduled start time only once.";
    }

    seenStartTimes.add(slot.startTime);
    slots.push({
      ...slot,
      sortOrder: index,
    });
  }

  if (slots.length === 0) {
    fieldErrors.schedule = "Add at least one scheduled time or range.";
  }

  return slots;
}

function parseLegacyScheduledTimeSlot(
  formData: FormData,
  fieldErrors: Partial<Record<BehaviorFormField, string>>,
): ScheduleSlotInput {
  const scheduledTime = getOptionalString(formData, "scheduled_time").trim();

  if (!SCHEDULED_TIME_PATTERN.test(scheduledTime) || !isValidTime(scheduledTime)) {
    fieldErrors.schedule = "Choose a scheduled time.";
    return {
      id: null,
      kind: "exact",
      preset: null,
      startTime: "09:00",
      endTime: null,
      sortOrder: 0,
    };
  }

  return {
    id: null,
    kind: "exact",
    preset: null,
    startTime: normalizeTime(scheduledTime),
    endTime: null,
    sortOrder: 0,
  };
}

function parseScheduleSlotAtIndex(
  formData: FormData,
  index: number,
  fieldErrors: Partial<Record<BehaviorFormField, string>>,
): ScheduleSlotInput {
  const id = getOptionalString(formData, `schedule_slot_id_${index}`).trim();
  const kind = getOptionalString(formData, `schedule_kind_${index}`);

  if (id && !UUID_PATTERN.test(id)) {
    fieldErrors.schedule = "Choose one of this behavior's schedule rows.";
  }

  if (kind === "range") {
    const preset = getOptionalString(formData, `schedule_range_preset_${index}`);

    if (isTimeRangePreset(preset)) {
      return timeRangePresetToSlot({
        id: id || null,
        preset,
        sortOrder: index,
      });
    }

    fieldErrors.schedule = "Choose a time range.";
    return timeRangePresetToSlot({
      id: id || null,
      preset: "morning",
      sortOrder: index,
    });
  }

  if (kind !== "exact") {
    fieldErrors.schedule = "Choose exact time or time range.";
  }

  const startTime = getOptionalString(
    formData,
    `schedule_exact_time_${index}`,
  ).trim();

  if (!SCHEDULED_TIME_PATTERN.test(startTime) || !isValidTime(startTime)) {
    fieldErrors.schedule = "Choose a scheduled time.";
    return {
      id: id || null,
      kind: "exact",
      preset: null,
      startTime: "09:00",
      endTime: null,
      sortOrder: index,
    };
  }

  return {
    id: id || null,
    kind: "exact",
    preset: null,
    startTime: normalizeTime(startTime),
    endTime: null,
    sortOrder: index,
  };
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

function isTimeRangePreset(value: string): value is TimeRangePreset {
  return value in TIME_RANGE_PRESETS;
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
