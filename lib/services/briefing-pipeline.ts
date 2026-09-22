import { DAILY_BRIEF_POLICY_VERSION } from "@cadence/core/types/daily-brief";
import { createHash } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { parseBriefingConfig, DEFAULT_BRIEFING_CONFIG, scopeBriefingContext, projectBriefingContext } from "@cadence/core/services/briefing-config";
import { selectBriefingReferences } from "@cadence/core/services/briefing-references";
import { BRIEFING_PLAN_VERSION } from "@cadence/core/types/briefing-plan";
import { planBriefing } from "@cadence/core/resolvers/briefing-plan.resolver";
import type { AdvisorDayContextV1 } from "@cadence/core/types/advisor-day-context";

export const BRIEFING_PIPELINE_VERSION = "2.2";
// Promotion is a reviewed repository change. Browser drafts never reach this selector.
export function activeBriefingConfig() { return parseBriefingConfig(DEFAULT_BRIEFING_CONFIG); }

export function briefingConfigurationRevision(value: unknown = activeBriefingConfig()) {
  const config = parseBriefingConfig(value);
  return createHash("sha256").update(JSON.stringify({ config, references: selectBriefingReferences(config.referenceIds), pipeline: BRIEFING_PIPELINE_VERSION, policy: DAILY_BRIEF_POLICY_VERSION, planner: BRIEFING_PLAN_VERSION })).digest("hex");
}

export function prepareBriefing(context: AdvisorDayContextV1, value: unknown, now: string) {
  const config = parseBriefingConfig(value);
  const plannerContext = scopeBriefingContext(context, config);
  const { facts, contextControls } = projectBriefingContext(context, config);
  const references = selectBriefingReferences(config.referenceIds);
  const configurationRevision = briefingConfigurationRevision(config);
  const atMinute = (minute: number) => {
    const date = Temporal.PlainDate.from(facts.localDate);
    const target = minute === 1440 ? date.add({ days: 1 }) : date;
    const local = target.toPlainDateTime({ hour: Math.floor(minute % 1440 / 60), minute: minute % 60 });
    const zoned = local.toZonedDateTime(facts.timezone);
    // A skipped local time cannot expand the configured window into a different hour.
    return zoned.toPlainDateTime().equals(local) ? zoned.toInstant() : null;
  };
  const windows = config.planner.permittedWindows.flatMap(({ startMinute, endMinute }) => {
    const start = atMinute(startMinute), end = atMinute(endMinute);
    if (!start || !end || Temporal.Instant.compare(start, end) >= 0) return [];
    return [{ kind: "timed" as const, startAt: start.toString(), endAt: end.toString(), duration: { kind: "known" as const, seconds: start.until(end).total("seconds") } }];
  });
  // A narrowed Behavior view omits fixed commitments and cannot establish availability.
  const plan = planBriefing({ context: plannerContext, now, configurationRevision,
    permittedWindows: windows,
    fixedCommitmentsComplete: plannerContext.cadence.occurrences.length === context.cadence.occurrences.length,
    alternatives: config.alternatives, allowedSuggestionTypes: config.allowedSuggestionTypes,
    movableOccurrences: plannerContext.cadence.occurrences.filter((item) => item.status === "unresolved" && config.planner.movableBehaviorRefs.includes(item.behaviorRef)).map((item) => ({
      occurrenceRef: item.ref,
      permittedWindows: windows,
    })), policy: config.planner });
  return { config, configurationRevision, facts, contextControls, references, plan, pipelineVersion: BRIEFING_PIPELINE_VERSION, recipe: config.recipe, policyVersion: DAILY_BRIEF_POLICY_VERSION };
}
