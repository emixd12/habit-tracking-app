export const LAUNCH_SURGE_DRILL_SCENARIOS: readonly string[];

export interface LaunchSurgeDrillScenario {
  id: string;
  control: string;
  detected: boolean;
  contained: boolean;
  rolledBack: boolean;
  recovered: boolean;
  integrityBoundary: string;
}

export interface LaunchSurgeDrillReport {
  schemaVersion: string;
  mode: string;
  performedAt: string;
  networkRequests: number;
  billableTrafficGenerated: boolean;
  humanOwnerDrill: string;
  scenarios: LaunchSurgeDrillScenario[];
}

export function runLaunchSurgeDrill(
  policy: unknown,
  options?: { performedAt?: string },
): LaunchSurgeDrillReport;

export function renderLaunchSurgeDrillReport(
  report: LaunchSurgeDrillReport,
): string;

export function buildSyntheticLaunchCostPolicy(
  reviewedAt?: string,
): Record<string, unknown>;
