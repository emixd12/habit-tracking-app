import type { BriefingReference } from "../services/briefing-references";
import type { BriefingPlanOption } from "./briefing-plan";

/** Daily Brief interprets practical constraints; it does not recap the ledger. */
export const DAILY_BRIEF_POLICY_VERSION = "2.2" as const;

export type DailyBriefing = Readonly<{
  text: string;
  localDate: string;
  timezone: string;
  generatedAt: string;
  expiresAt: string;
  coverage: "complete" | "partial";
  warnings: readonly string[];
  suggestions?: readonly Readonly<{ text: string; occurrenceRefs: readonly string[]; referenceIds: readonly string[]; optionId: string | null; option?: BriefingPlanOption }>[];
  references?: readonly BriefingReference[];
  versions?: Readonly<{ configuration: string; references: string; planner: string; pipeline: string; recipe?: string; policy?: string }>;
}>;

export type DailyBriefSettings = Readonly<{
  accountRef: string;
  available: boolean;
  enabled: boolean;
  includeCalendar: boolean;
  revision: number;
  configurationRevision?: string;
  localDate: string;
  timezone: string;
}>;

export type DailyBriefResponse =
  | Readonly<{ state: "ready"; briefing: DailyBriefing }>
  | Readonly<{ state: "pending"; retryAfterSeconds?: number }>
  | Readonly<{ state: "already_attempted" }>;
