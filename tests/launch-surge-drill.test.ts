import { describe, expect, it } from "vitest";

import {
  buildSyntheticLaunchCostPolicy,
  LAUNCH_SURGE_DRILL_SCENARIOS,
  renderLaunchSurgeDrillReport,
  runLaunchSurgeDrill,
} from "../scripts/launch-surge-drill.mjs";

describe("launch surge drill", () => {
  it("simulates every incident class without network or provider traffic", () => {
    const performedAt = "2026-08-01T12:00:00Z";
    const report = runLaunchSurgeDrill(
      buildSyntheticLaunchCostPolicy(performedAt),
      { performedAt },
    );

    expect(report.mode).toBe("synthetic_non_production");
    expect(report.networkRequests).toBe(0);
    expect(report.scenarios.map((scenario) => scenario.id)).toEqual(
      LAUNCH_SURGE_DRILL_SCENARIOS,
    );
    expect(report.scenarios).toHaveLength(7);
    expect(
      report.scenarios.every(
        (scenario) =>
          scenario.detected &&
          scenario.contained &&
          scenario.rolledBack &&
          scenario.recovered,
      ),
    ).toBe(true);
  });

  it("renders only sanitized aggregate evidence and labels human proof pending", () => {
    const performedAt = "2026-08-01T12:00:00Z";
    const rendered = renderLaunchSurgeDrillReport(
      runLaunchSurgeDrill(buildSyntheticLaunchCostPolicy(performedAt), {
        performedAt,
      }),
    );

    expect(rendered).toContain("synthetic_non_production");
    expect(rendered).toContain("human_owner_drill: pending");
    expect(rendered).not.toMatch(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
    expect(rendered).not.toContain("token");
  });
});
