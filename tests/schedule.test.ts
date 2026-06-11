import { describe, expect, it } from "vitest";

import {
  formatCompactOccurrenceScheduleLabel,
  formatOccurrenceScheduleLabel,
} from "../lib/services/schedule";

describe("schedule formatting", () => {
  it("keeps full range labels available for exports and reminders", () => {
    expect(
      formatOccurrenceScheduleLabel({
        scheduleKind: "range",
        schedulePreset: "evening",
        scheduleStartTime: "18:00",
        scheduleEndTime: "00:00",
      }),
    ).toBe("Evening (6:00 PM-Midnight)");
  });

  it("uses compact range labels for Timeline rows", () => {
    expect(
      formatCompactOccurrenceScheduleLabel({
        scheduleKind: "range",
        schedulePreset: "evening",
        scheduleStartTime: "18:00",
        scheduleEndTime: "00:00",
      }),
    ).toBe("Evening");
  });

  it("keeps exact times unchanged in compact Timeline labels", () => {
    expect(
      formatCompactOccurrenceScheduleLabel({
        scheduleKind: "exact",
        schedulePreset: null,
        scheduleStartTime: "09:00",
        scheduleEndTime: null,
      }),
    ).toBe("9:00 AM");
  });
});
