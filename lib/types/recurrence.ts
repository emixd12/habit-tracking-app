export const DEFAULT_TIMEZONE = "America/New_York";

export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export type RecurrenceRule =
  | {
      frequency: "daily";
      interval: number;
    }
  | {
      frequency: "interval_days";
      intervalDays: number;
    }
  | {
      frequency: "weekly";
      interval: number;
      daysOfWeek: Weekday[];
    }
  | {
      frequency: "monthly";
      interval: number;
      dayOfMonth: number;
    };

