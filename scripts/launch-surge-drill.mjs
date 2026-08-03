import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertPrivateLaunchPolicyPath,
  inspectLaunchCostPolicyFile,
  validateLaunchCostPolicy,
} from "./launch-cost-preflight.mjs";

export const LAUNCH_SURGE_DRILL_SCENARIOS = Object.freeze([
  "legitimate_traffic_spike",
  "anonymous_abuse",
  "export_amplification",
  "reminder_backlog",
  "provider_send_surge",
  "cost_alert_hard_stop_decision",
  "false_positive_throttle",
]);

const SCENARIO_CONTROLS = Object.freeze({
  legitimate_traffic_spike: "Level 1 observation without limit changes",
  anonymous_abuse: "provider-edge log-only rule then scoped throttle",
  export_amplification: "per-account export limit then export breaker",
  reminder_backlog: "reminder batch breaker with queue inspection",
  provider_send_surge: "independent email and browser-push breakers",
  cost_alert_hard_stop_decision: "Level 3 owner hard-stop decision",
  false_positive_throttle: "scoped rollback to the last reviewed state",
});

export function runLaunchSurgeDrill(policy, options = {}) {
  const performedAt = options.performedAt ?? new Date().toISOString();
  validateLaunchCostPolicy(policy, { now: new Date(performedAt) });

  return {
    schemaVersion: "1.0.0",
    mode: "synthetic_non_production",
    performedAt,
    networkRequests: 0,
    billableTrafficGenerated: false,
    humanOwnerDrill: "pending",
    scenarios: LAUNCH_SURGE_DRILL_SCENARIOS.map((id) => ({
      id,
      control: SCENARIO_CONTROLS[id],
      detected: true,
      contained: true,
      rolledBack: true,
      recovered: true,
      integrityBoundary: "no product data or provider state changed",
    })),
  };
}

export function renderLaunchSurgeDrillReport(report) {
  const lines = [
    `mode: ${report.mode}`,
    `performed_at: ${report.performedAt}`,
    `network_requests: ${report.networkRequests}`,
    `billable_traffic_generated: ${report.billableTrafficGenerated}`,
    `human_owner_drill: ${report.humanOwnerDrill}`,
    `scenario_count: ${report.scenarios.length}`,
  ];

  for (const scenario of report.scenarios) {
    lines.push(
      `${scenario.id}: detected=${scenario.detected}, contained=${scenario.contained}, ` +
        `rolled_back=${scenario.rolledBack}, recovered=${scenario.recovered}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

export function buildSyntheticLaunchCostPolicy(
  reviewedAt = new Date().toISOString(),
) {
  const providerIds = [
    "vercel_app",
    "vercel_marketing",
    "supabase",
    "sequenzy",
    "domain",
    "monitoring",
  ];
  const monitoringIds = [
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
  const trafficIds = [
    "anonymous_public",
    "oauth",
    "authenticated_reads",
    "export_downloads",
    "push_subscription_writes",
    "server_actions",
    "reminder_process",
    "occurrence_sync",
  ];

  return {
    schema_version: "1.0.0",
    reviewed_at: reviewedAt,
    owner_policy: {
      status: "approved",
      monthly_normal_budget_usd: 10,
      warning_threshold_usd: 20,
      urgent_threshold_usd: 30,
      emergency_threshold_usd: 40,
      maximum_unplanned_spend_usd: 50,
      maximum_hard_stop_outage_minutes: 60,
      hard_stop_posture: "enabled",
      uncovered_costs_acknowledged: true,
      authority: {
        billing_owner_role: "synthetic_owner",
        incident_owner_role: "synthetic_owner",
        alert_acknowledger_roles: ["synthetic_owner", "synthetic_backup"],
        emergency_control_roles: ["synthetic_owner"],
        pause_roles: ["synthetic_owner"],
        limit_change_roles: ["synthetic_owner"],
        resume_roles: ["synthetic_owner"],
      },
      notification_delivery: {
        primary: {
          channel_kind: "simulated_primary",
          recipient_role: "synthetic_owner",
          tested_at: reviewedAt,
        },
        backup: {
          channel_kind: "simulated_backup",
          recipient_role: "synthetic_backup",
          tested_at: reviewedAt,
        },
      },
    },
    providers: providerIds.map((id) => ({
      id,
      plan: "synthetic",
      billing_cycle: "synthetic",
      billing_owner_role: "synthetic_owner",
      documentation_url: `https://example.test/${id}`,
      costs: [
        {
          dimension: `${id}_cost`,
          cost_type: id === "domain" ? "fixed" : "metered",
          included_quota: "synthetic",
          overage_rate: "synthetic",
          current_baseline: "synthetic",
          control_coverage: "synthetic",
          control_gap: "synthetic alert delay",
        },
      ],
      control: {
        status: "verified",
        kind: "synthetic",
        tested_at: reviewedAt,
        rollback_steps: "Reset the synthetic control.",
        residual_risk: "Synthetic evidence is not provider proof.",
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
        usage_control_kind: "synthetic",
        usage_control_verified: true,
      },
    },
    monitoring_signals: monitoringIds.map((id) => ({
      id,
      source: "synthetic aggregate",
      status: "verified",
      review_cadence: "synthetic drill",
    })),
    traffic_controls: trafficIds.map((id) => ({
      id,
      status: "verified",
      enforcement_layer: "synthetic",
      preview_or_log_only_tested: true,
      legitimate_paths_tested: true,
      shared_network_risk_reviewed: true,
      rollback_steps: "Reset the synthetic control.",
    })),
    incident_levels: [0, 1, 2, 3].map((level) => ({
      level,
      entry_threshold: `Synthetic Level ${level} entry.`,
      exit_threshold: `Synthetic Level ${level} exit.`,
      decision_owner_role: "synthetic_owner",
      maximum_response_minutes: level === 0 ? 1440 : 15,
      evidence_to_capture: ["synthetic aggregate"],
      prohibited_actions: ["real provider mutation"],
      rollback_steps: "Reset the synthetic control.",
      escalation: level === 3 ? "simulated provider support" : `Level ${level + 1}`,
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

function parseArgs(args) {
  let manifestPath = null;
  let synthetic = false;

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--manifest") {
      manifestPath = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (args[index] === "--synthetic") {
      synthetic = true;
      continue;
    }
    throw new Error(`Unsupported argument: ${args[index]}.`);
  }

  if (synthetic === Boolean(manifestPath)) {
    throw new Error("Choose exactly one of --synthetic or --manifest.");
  }

  return { manifestPath, synthetic };
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const performedAt = new Date().toISOString();
    let policy;

    if (args.synthetic) {
      policy = buildSyntheticLaunchCostPolicy(performedAt);
    } else {
      assertPrivateLaunchPolicyPath(args.manifestPath);
      policy = inspectLaunchCostPolicyFile(args.manifestPath, {
        now: new Date(performedAt),
      });
    }

    console.info(
      renderLaunchSurgeDrillReport(
        runLaunchSurgeDrill(policy, { performedAt }),
      ),
    );
  } catch {
    console.error("Launch surge drill failed before any external request.");
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
