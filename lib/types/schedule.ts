export type ScheduleKind = "exact" | "range";

export type TimeRangePreset = "morning" | "afternoon" | "evening" | "night";

export type TimeRangePresetDefinition = {
  preset: TimeRangePreset;
  label: string;
  rangeLabel: string;
  startTime: string;
  endTime: string;
};

export type ScheduleSlotInput = {
  id?: string | null;
  kind: ScheduleKind;
  preset: TimeRangePreset | null;
  startTime: string;
  endTime: string | null;
  sortOrder: number;
};

export type ScheduleSlotView = Required<Pick<ScheduleSlotInput, "kind" | "startTime" | "sortOrder">> & {
  id: string;
  preset: TimeRangePreset | null;
  endTime: string | null;
  label: string;
};

export type OccurrenceScheduleSnapshot = {
  scheduleSlotId: string | null;
  scheduleKind: ScheduleKind;
  schedulePreset: TimeRangePreset | null;
  scheduleStartTime: string;
  scheduleEndTime: string | null;
};

export const TIME_RANGE_PRESETS: Record<
  TimeRangePreset,
  TimeRangePresetDefinition
> = {
  morning: {
    preset: "morning",
    label: "Morning",
    rangeLabel: "6:00 AM-Noon",
    startTime: "06:00",
    endTime: "12:00",
  },
  afternoon: {
    preset: "afternoon",
    label: "Afternoon",
    rangeLabel: "Noon-6:00 PM",
    startTime: "12:00",
    endTime: "18:00",
  },
  evening: {
    preset: "evening",
    label: "Evening",
    rangeLabel: "6:00 PM-Midnight",
    startTime: "18:00",
    endTime: "00:00",
  },
  night: {
    preset: "night",
    label: "Night",
    rangeLabel: "Midnight-6:00 AM",
    startTime: "00:00",
    endTime: "06:00",
  },
};

export const TIME_RANGE_PRESET_LIST: TimeRangePresetDefinition[] = [
  TIME_RANGE_PRESETS.morning,
  TIME_RANGE_PRESETS.afternoon,
  TIME_RANGE_PRESETS.evening,
  TIME_RANGE_PRESETS.night,
];
