export const REQUIRED_PROVIDER_IDS: readonly string[];
export const REQUIRED_MONITORING_SIGNAL_IDS: readonly string[];
export const REQUIRED_TRAFFIC_CONTROL_IDS: readonly string[];

export class LaunchCostPreflightError extends Error {}

export interface LaunchCostPolicySummary {
  providerCount: number;
  monitoringSignalCount: number;
  trafficControlCount: number;
  hardStopPosture: string;
  warningThresholdUsd: number;
  urgentThresholdUsd: number;
  emergencyThresholdUsd: number;
}

export function inspectLaunchCostPolicyFile(
  policyPath: string,
  options?: { now?: Date },
): Record<string, unknown>;

export function validateLaunchCostPolicy<T>(
  policy: T,
  options?: { now?: Date },
): T;

export function summarizeLaunchCostPolicy(
  policy: Record<string, unknown>,
): LaunchCostPolicySummary;

export function parseLaunchCostPreflightArgs(args: string[]): {
  manifestPath: string;
};

export function assertPrivateLaunchPolicyPath(
  policyPath: string,
  cwd?: string,
): void;
