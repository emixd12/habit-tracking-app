export type TimezoneActionState = {
  status: "idle" | "success" | "error";
  message: string;
  timezone: string | null;
  activeBehaviorCount: number;
};

export const TIMEZONE_ACTION_INITIAL_STATE: TimezoneActionState = {
  status: "idle",
  message: "",
  timezone: null,
  activeBehaviorCount: 0,
};
