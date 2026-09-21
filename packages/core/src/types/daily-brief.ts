export type DailyBriefing = Readonly<{
  text: string;
  localDate: string;
  timezone: string;
  generatedAt: string;
  expiresAt: string;
  coverage: "complete" | "partial";
  warnings: readonly string[];
}>;

export type DailyBriefSettings = Readonly<{
  accountRef: string;
  available: boolean;
  enabled: boolean;
  includeCalendar: boolean;
  revision: number;
  localDate: string;
  timezone: string;
}>;

export type DailyBriefResponse =
  | Readonly<{ state: "ready"; briefing: DailyBriefing }>
  | Readonly<{ state: "pending" | "already_attempted" }>;
