import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  inspectLaunchCostPolicyFile,
  LaunchCostPreflightError,
  summarizeLaunchCostPolicy,
  validateLaunchCostPolicy,
} from "../scripts/launch-cost-preflight.mjs";

const NOW = new Date("2026-08-01T12:00:00Z");

describe("launch cost preflight", () => {
  it("accepts a complete sanitized owner-approved policy", () => {
    const policy = validPolicy();

    expect(validateLaunchCostPolicy(policy, { now: NOW })).toBe(policy);
    expect(summarizeLaunchCostPolicy(policy)).toEqual({
      providerCount: 6,
      monitoringSignalCount: 9,
      trafficControlCount: 8,
      hardStopPosture: "enabled",
      warningThresholdUsd: 40,
      urgentThresholdUsd: 70,
      emergencyThresholdUsd: 90,
    });
  });

  it("rejects unordered or excessive risk thresholds", () => {
    const policy = validPolicy();
    policy.owner_policy.urgent_threshold_usd = 35;

    expect(() => validateLaunchCostPolicy(policy, { now: NOW })).toThrow(
      "warning, urgent, and emergency thresholds",
    );
  });

  it("rejects a missing provider cost dimension or control gap", () => {
    const policy = validPolicy();
    policy.providers[0].costs = [];

    expect(() => validateLaunchCostPolicy(policy, { now: NOW })).toThrow(
      "at least one fixed or metered cost",
    );

    const secondPolicy = validPolicy();
    secondPolicy.providers[1].costs[0].control_gap = "";
    expect(() => validateLaunchCostPolicy(secondPolicy, { now: NOW })).toThrow(
      "control_gap",
    );
  });

  it("rejects missing human delivery and uncovered-cost acknowledgements", () => {
    const policy = validPolicy();
    const backup = policy.owner_policy.notification_delivery.backup as {
      tested_at: string | null;
    };
    backup.tested_at = null;

    expect(() => validateLaunchCostPolicy(policy, { now: NOW })).toThrow(
      "backup notification",
    );

    const secondPolicy = validPolicy();
    secondPolicy.owner_policy.uncovered_costs_acknowledged = false;
    expect(() => validateLaunchCostPolicy(secondPolicy, { now: NOW })).toThrow(
      "uncovered costs",
    );
  });

  it("rejects unsafe files and private recipient data", () => {
    const directory = mkdtempSync(join(tmpdir(), "cadence-launch-policy-"));
    const manifestPath = join(directory, "policy.json");
    writeFileSync(manifestPath, JSON.stringify(validPolicy()), { mode: 0o600 });

    expect(inspectLaunchCostPolicyFile(manifestPath, { now: NOW })).toMatchObject(
      {
        schema_version: "1.0.0",
      },
    );

    chmodSync(manifestPath, 0o644);
    expect(() => inspectLaunchCostPolicyFile(manifestPath, { now: NOW })).toThrow(
      "owner-only permissions",
    );

    const unsafePolicy = validPolicy() as Record<string, unknown>;
    unsafePolicy.billing_email = "owner@example.com";
    writeFileSync(manifestPath, JSON.stringify(unsafePolicy), { mode: 0o600 });
    expect(() => inspectLaunchCostPolicyFile(manifestPath, { now: NOW })).toThrow(
      LaunchCostPreflightError,
    );
  });
});

export function validPolicy() {
  return {
    schema_version: "1.0.0",
    reviewed_at: "2026-08-01T10:00:00Z",
    owner_policy: {
      status: "approved",
      monthly_normal_budget_usd: 30,
      warning_threshold_usd: 40,
      urgent_threshold_usd: 70,
      emergency_threshold_usd: 90,
      maximum_unplanned_spend_usd: 100,
      maximum_hard_stop_outage_minutes: 120,
      hard_stop_posture: "enabled",
      uncovered_costs_acknowledged: true,
      authority: {
        billing_owner_role: "owner",
        incident_owner_role: "owner",
        alert_acknowledger_roles: ["owner", "backup"],
        emergency_control_roles: ["owner"],
        pause_roles: ["owner"],
        limit_change_roles: ["owner"],
        resume_roles: ["owner"],
      },
      notification_delivery: {
        primary: {
          channel_kind: "email",
          recipient_role: "owner",
          tested_at: "2026-07-31T14:00:00Z",
        },
        backup: {
          channel_kind: "sms",
          recipient_role: "backup",
          tested_at: "2026-07-31T14:05:00Z",
        },
      },
    },
    providers: requiredProviderIds().map((id) => ({
      id,
      plan: "verified-plan",
      billing_cycle: "monthly",
      billing_owner_role: "owner",
      documentation_url: `https://docs.example.test/${id}`,
      costs: [
        {
          dimension: `${id}_primary_cost`,
          cost_type: id === "domain" ? "fixed" : "metered",
          included_quota: "verified in current plan",
          overage_rate: "verified in current plan",
          current_baseline: "reviewed current billing cycle",
          control_coverage: "provider control or manual review",
          control_gap: "alerts may lag already-incurred usage",
        },
      ],
      control: {
        status: "verified",
        kind: "provider_alert_or_manual_review",
        tested_at: "2026-07-31T15:00:00Z",
        rollback_steps: "Restore the prior reviewed provider setting.",
        residual_risk: "Already-incurred and uncovered charges remain possible.",
      },
    })),
    provider_postures: {
      vercel: {
        spend_notifications_enabled: true,
        notification_tested: true,
        hard_limit_posture: "enabled",
        hard_limit_verified: true,
        firewall_log_only_verified: true,
        oauth_and_cron_bypasses_tested: true,
      },
      supabase: {
        spend_cap_posture: "enabled",
        spend_cap_verified: true,
        covered_items_recorded: true,
        uncovered_items_recorded: true,
      },
      sequenzy: {
        usage_control_kind: "manual_review",
        usage_control_verified: true,
      },
    },
    monitoring_signals: requiredMonitoringSignalIds().map((id) => ({
      id,
      source: "provider dashboard or privacy-safe runtime aggregate",
      status: "verified",
      review_cadence: "daily and during incidents",
    })),
    traffic_controls: requiredTrafficControlIds().map((id) => ({
      id,
      status: "verified",
      enforcement_layer: id === "anonymous_public" ? "provider_edge" : "application",
      preview_or_log_only_tested: true,
      legitimate_paths_tested: true,
      shared_network_risk_reviewed: true,
      rollback_steps: "Return the scoped control to its prior reviewed state.",
    })),
    incident_levels: [0, 1, 2, 3].map((level) => ({
      level,
      entry_threshold: `Declared level ${level} entry signal.`,
      exit_threshold: `Declared level ${level} exit signal.`,
      decision_owner_role: "owner",
      maximum_response_minutes: level === 0 ? 1440 : 15,
      evidence_to_capture: ["sanitized aggregate usage", "control state"],
      prohibited_actions: ["automatic plan upgrades", "unscoped data access"],
      rollback_steps: "Restore the last reviewed scoped control.",
      escalation: level === 3 ? "provider support" : `level ${level + 1}`,
    })),
    resumption_checks: [
      "cost acceleration stopped",
      "traffic and latency stable",
      "integrity and RLS pass",
      "queues understood",
      "owner recorded go decision",
    ],
  };
}

function requiredProviderIds() {
  return [
    "vercel_app",
    "vercel_marketing",
    "supabase",
    "sequenzy",
    "domain",
    "monitoring",
  ];
}

function requiredMonitoringSignalIds() {
  return [
    "requests",
    "errors",
    "latency",
    "function_execution",
    "database",
    "auth",
    "egress",
    "reminder_backlog",
    "provider_sends",
  ];
}

function requiredTrafficControlIds() {
  return [
    "anonymous_public",
    "oauth",
    "authenticated_reads",
    "export_downloads",
    "push_subscription_writes",
    "server_actions",
    "reminder_process",
    "occurrence_sync",
  ];
}
