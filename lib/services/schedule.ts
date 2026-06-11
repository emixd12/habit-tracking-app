import {
  TIME_RANGE_PRESETS,
  type OccurrenceScheduleSnapshot,
  type ScheduleSlotInput,
  type ScheduleSlotView,
  type TimeRangePreset,
} from "@/lib/types/schedule";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

export function normalizeTime(value: string): string {
  return value.slice(0, 5);
}

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function formatClockTimeLabel(value: string): string {
  const normalized = normalizeTime(value);
  const [hourValue, minuteValue] = normalized.split(":");
  const hour = Number(hourValue);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;

  return `${hour12}:${minuteValue} ${period}`;
}

export function formatScheduleSlotLabel(
  slot: Pick<ScheduleSlotInput, "kind" | "preset" | "startTime" | "endTime">,
): string {
  if (slot.kind === "range" && slot.preset) {
    const preset = TIME_RANGE_PRESETS[slot.preset];

    return `${preset.label} (${preset.rangeLabel})`;
  }

  return formatClockTimeLabel(slot.startTime);
}

export function formatScheduleSlotsSummary(
  slots: Array<Pick<ScheduleSlotView, "label" | "sortOrder" | "startTime">>,
): string {
  return [...slots]
    .sort(compareScheduleSlots)
    .map((slot) => slot.label)
    .join(", ");
}

export function timeRangePresetToSlot(input: {
  preset: TimeRangePreset;
  sortOrder: number;
  id?: string | null;
}): ScheduleSlotInput {
  const preset = TIME_RANGE_PRESETS[input.preset];

  return {
    id: input.id ?? null,
    kind: "range",
    preset: preset.preset,
    startTime: preset.startTime,
    endTime: preset.endTime,
    sortOrder: input.sortOrder,
  };
}

export function toScheduleSlotView(input: {
  id: string;
  kind: ScheduleSlotInput["kind"];
  preset: TimeRangePreset | null;
  startTime: string;
  endTime: string | null;
  sortOrder: number;
}): ScheduleSlotView {
  const slot = {
    id: input.id,
    kind: input.kind,
    preset: input.preset,
    startTime: normalizeTime(input.startTime),
    endTime: input.endTime ? normalizeTime(input.endTime) : null,
    sortOrder: input.sortOrder,
  };

  return {
    ...slot,
    label: formatScheduleSlotLabel(slot),
  };
}

export function formatOccurrenceScheduleLabel(
  snapshot: Pick<
    OccurrenceScheduleSnapshot,
    "scheduleKind" | "schedulePreset" | "scheduleStartTime" | "scheduleEndTime"
  >,
): string {
  return formatScheduleSlotLabel({
    kind: snapshot.scheduleKind,
    preset: snapshot.schedulePreset,
    startTime: snapshot.scheduleStartTime,
    endTime: snapshot.scheduleEndTime,
  });
}

export function formatCompactOccurrenceScheduleLabel(
  snapshot: Pick<
    OccurrenceScheduleSnapshot,
    "scheduleKind" | "schedulePreset" | "scheduleStartTime" | "scheduleEndTime"
  >,
): string {
  if (snapshot.scheduleKind === "range" && snapshot.schedulePreset) {
    return TIME_RANGE_PRESETS[snapshot.schedulePreset].label;
  }

  return formatClockTimeLabel(snapshot.scheduleStartTime);
}

export function compareScheduleSlots(
  left: Pick<ScheduleSlotView, "sortOrder" | "startTime" | "label">,
  right: Pick<ScheduleSlotView, "sortOrder" | "startTime" | "label">,
): number {
  const sortComparison = left.sortOrder - right.sortOrder;

  if (sortComparison !== 0) {
    return sortComparison;
  }

  const timeComparison = left.startTime.localeCompare(right.startTime);

  if (timeComparison !== 0) {
    return timeComparison;
  }

  return left.label.localeCompare(right.label);
}
