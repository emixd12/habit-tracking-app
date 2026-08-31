import type { BehaviorGraphRecord } from "../behavior-store";
import { planBehaviorConfigurationChangeEvent } from "../resolvers/behavior-configuration.resolver";
import { toBehaviorConfigurationSnapshot, toStoredBehaviorScheduleGraph } from "./behavior.service";

export class TimezoneSettingsUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimezoneSettingsUserError";
  }
}

export function normalizeTimezoneInput(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TimezoneSettingsUserError("Enter an IANA timezone.");
  }
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value.trim() }).resolvedOptions().timeZone;
  } catch {
    throw new TimezoneSettingsUserError("Enter a valid IANA timezone.");
  }
}

export function planProfileTimezoneChange(
  behaviors: BehaviorGraphRecord[], timezone: string, recordedAt: string,
) {
  return behaviors.filter((behavior) => behavior.active).map((behavior) => {
    const previous = toBehaviorConfigurationSnapshot(behavior, toStoredBehaviorScheduleGraph(behavior));
    return {
      behaviorId: behavior.id,
      expectedUpdatedAt: behavior.updated_at,
      configurationEventPlan: planBehaviorConfigurationChangeEvent({
        previousConfiguration: previous,
        nextConfiguration: { ...previous, timezone },
        recordedAt, effectiveAt: recordedAt, source: "manual", reasonCode: "timezone_changed",
      }),
    };
  });
}
