import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  HOSTED_HARD_CEILINGS,
  HostedPreflightError,
  parseHostedPreflightArgs,
  readHostedPreflightManifest,
  runHostedPreflight,
  validateHostedPreflightManifest,
  // @ts-expect-error The hosted preflight helper is a plain Node ESM module.
} from "../scripts/load-test-hosted-preflight.mjs";

const NOW = new Date("2026-07-31T12:00:00.000Z");
const COMMIT = "1234567890abcdef1234567890abcdef12345678";
const temporaryDirectories: string[] = [];

type JsonRecord = Record<string, unknown>;

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "cadence-hosted-preflight-"));
  temporaryDirectories.push(directory);
  return directory;
}

function validManifest(): JsonRecord {
  return {
    schema_version: "1.0.0",
    target: {
      classification: "hosted_staging",
      application_url: "https://staging.cadence.invalid",
      production_application_url: "https://app.cadence.invalid",
      deployment_id: "dpl_Staging123",
      deployment_environment: "staging",
      vercel_project_id: "prj_Staging123",
      vercel_region: "iad1",
      vercel_runtime: "nodejs24.x",
      fluid_compute: true,
      supabase_project_ref: "abcdefghijklmnopqrst",
      production_supabase_project_ref: "zyxwvutsrqponmlkjihg",
      supabase_region: "us-east-1",
      supabase_compute_tier: "small",
      isolation_posture: "dedicated_synthetic_only",
      deployment_protection: "source_ip_allowlist",
      unrelated_traffic_blocked: true,
    },
    approvals: {
      policy_reviewed_at: "2026-07-30T12:00:00.000Z",
      owner_authorization_reference: "owner-auth-20260731",
      vercel_plan: "enterprise",
      vercel_approval_reference: "vercel-approval-12345",
      vercel_approved_at: "2026-07-31T11:00:00.000Z",
      approved_start_at: "2026-07-31T13:00:00.000Z",
      approved_end_at: "2026-07-31T14:00:00.000Z",
      supabase_plan: "pro",
      supabase_coordination_status: "not_required_under_current_guidance",
      supabase_coordination_reference: null,
    },
    traffic: {
      stage: "public_read_baseline",
      prior_stage_evidence_reference: null,
      human_checkpoint_reference: "checkpoint-20260731-01",
      maximum_users: 20,
      maximum_requests_per_second: 10,
      maximum_runtime_seconds: 120,
      maximum_requests: 1_000,
      cost_ceiling_usd: 25,
      source_geography: "us-east",
      source_ips: ["192.0.2.10"],
      distributed: false,
      worker_count: 1,
      automatic_stage_advance: false,
    },
    data: {
      synthetic_only: true,
      production_data_copied: false,
      real_user_access: false,
      real_email_recipients: false,
      active_push_subscriptions: false,
      google_oauth_load: false,
      destructive_workloads: false,
      provider_mode: "isolated_stub",
      provider_stub_url: "https://provider-stub.cadence.invalid",
      production_provider_url: "https://provider.cadence.invalid",
      fixture_cohorts: {
        empty: 4,
        typical_daily: 4,
        review_heavy: 4,
        export_heavy: 4,
        heavy_schedule: 4,
      },
    },
    monitoring: {
      locust_artifacts: true,
      cadence_performance_timing: true,
      vercel_request_status: true,
      vercel_duration: true,
      vercel_invocations: true,
      vercel_memory_cpu: true,
      vercel_cost: true,
      supabase_cpu: true,
      supabase_memory: true,
      supabase_disk_io: true,
      supabase_connections: true,
      supabase_postgrest_auth: true,
      supabase_slow_queries: true,
      retention_end_at: "2026-08-02T14:00:00.000Z",
    },
    verification: {
      git_commit: COMMIT,
      deployment_git_commit: COMMIT,
      dirty_worktree: false,
      repository_verification_passed: true,
      local_protocol_smoke_passed: true,
      local_integrity_passed: true,
      hosted_rls_smoke_passed: true,
      hosted_migration_comparison_passed: true,
      supabase_advisors_reviewed: true,
      unauthenticated_smoke_passed: true,
      authenticated_one_user_smoke_passed: true,
      exact_cleanup_dry_run_passed: true,
      monitoring_collection_tested: true,
    },
  };
}

function section(manifest: JsonRecord, key: string): JsonRecord {
  return manifest[key] as JsonRecord;
}

function validate(manifest: JsonRecord): unknown {
  return validateHostedPreflightManifest(manifest, { now: NOW });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("hosted load preflight manifest", () => {
  it("returns only a sanitized, single-stage authorization summary", () => {
    const result = validate(validManifest()) as JsonRecord;

    expect(result).toEqual({
      schema_version: "1.0.0",
      status: "ready_for_single_stage_human_checkpoint",
      target_classification: "hosted_staging",
      authorized_stage: "public_read_baseline",
      deployment_environment: "staging",
      fluid_compute: true,
      supabase_plan: "pro",
      supabase_coordination_required: false,
      approved_start_at: "2026-07-31T13:00:00.000Z",
      approved_end_at: "2026-07-31T14:00:00.000Z",
      maximum_users: 20,
      maximum_requests_per_second: 10,
      maximum_runtime_seconds: 120,
      maximum_requests: 1_000,
      cost_ceiling_usd: 25,
      distributed: false,
      worker_count: 1,
      source_ip_count: 1,
      fixture_identity_count: 20,
      automatic_stage_advance: false,
      synthetic_only: true,
      real_provider_traffic: false,
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("staging.cadence.invalid");
    expect(serialized).not.toContain("abcdefghijklmnopqrst");
    expect(serialized).not.toContain("vercel-approval-12345");
  });

  it("requires Vercel Enterprise and a provider approval reference", () => {
    const nonEnterprise = validManifest();
    section(nonEnterprise, "approvals").vercel_plan = "pro";
    expect(() => validate(nonEnterprise)).toThrow(/enterprise/);

    const missingApproval = validManifest();
    section(missingApproval, "approvals").vercel_approval_reference = null;
    expect(() => validate(missingApproval)).toThrow(/approval reference/);
  });

  it("requires isolated staging application and Supabase targets", () => {
    const sameApplication = validManifest();
    section(sameApplication, "target").application_url =
      section(sameApplication, "target").production_application_url;
    expect(() => validate(sameApplication)).toThrow(/isolated from production/);

    const sameDatabase = validManifest();
    section(sameDatabase, "target").supabase_project_ref =
      section(sameDatabase, "target").production_supabase_project_ref;
    expect(() => validate(sameDatabase)).toThrow(/isolated from production/);
  });

  it("enforces Supabase coordination according to the declared plan", () => {
    const teamWithoutApproval = validManifest();
    section(teamWithoutApproval, "approvals").supabase_plan = "team";
    expect(() => validate(teamWithoutApproval)).toThrow(/support coordination/);

    const teamApproved = validManifest();
    const approvals = section(teamApproved, "approvals");
    approvals.supabase_plan = "team";
    approvals.supabase_coordination_status = "approved";
    approvals.supabase_coordination_reference = "supabase-case-12345";
    expect(validate(teamApproved)).toMatchObject({
      supabase_coordination_required: true,
    });

    const proWithReference = validManifest();
    section(proWithReference, "approvals").supabase_coordination_reference =
      "supabase-case-12345";
    expect(() => validate(proWithReference)).toThrow(/null reference/);
  });

  it.each([
    ["target", "unrelated_traffic_blocked", false],
    ["data", "synthetic_only", false],
    ["data", "production_data_copied", true],
    ["data", "real_user_access", true],
    ["data", "real_email_recipients", true],
    ["data", "active_push_subscriptions", true],
    ["data", "google_oauth_load", true],
    ["data", "destructive_workloads", true],
  ])("rejects unsafe %s.%s posture", (sectionName, key, value) => {
    const manifest = validManifest();
    section(manifest, sectionName)[key] = value;
    expect(() => validate(manifest)).toThrow(HostedPreflightError);
  });

  it("requires an isolated provider stub", () => {
    const manifest = validManifest();
    section(manifest, "data").provider_stub_url =
      section(manifest, "data").production_provider_url;
    expect(() => validate(manifest)).toThrow(/provider stub URL.*isolated/);
  });

  it("enforces literal, unique, bounded source IP addresses", () => {
    const invalid = validManifest();
    section(invalid, "traffic").source_ips = ["load-generator.invalid"];
    expect(() => validate(invalid)).toThrow(/literal IPv4 or IPv6/);

    const duplicate = validManifest();
    section(duplicate, "traffic").source_ips = ["192.0.2.10", "192.0.2.10"];
    expect(() => validate(duplicate)).toThrow(/unique/);

    const excessive = validManifest();
    section(excessive, "traffic").source_ips = Array.from(
      { length: HOSTED_HARD_CEILINGS.maximum_source_ips + 1 },
      () => "192.0.2.10",
    );
    expect(() => validate(excessive)).toThrow(/1-999/);
  });

  it("enforces hard ceilings, the request envelope, and manual stage advance", () => {
    const excessiveUsers = validManifest();
    section(excessiveUsers, "traffic").maximum_users =
      HOSTED_HARD_CEILINGS.maximum_users + 1;
    expect(() => validate(excessiveUsers)).toThrow(/Maximum hosted users/);

    const impossibleEnvelope = validManifest();
    section(impossibleEnvelope, "traffic").maximum_requests = 1_201;
    expect(() => validate(impossibleEnvelope)).toThrow(/RPS envelope/);

    const automaticAdvance = validManifest();
    section(automaticAdvance, "traffic").automatic_stage_advance = true;
    expect(() => validate(automaticAdvance)).toThrow(/must be false/);
  });

  it("requires prior-stage evidence after the first canonical stage", () => {
    const missingPriorEvidence = validManifest();
    const traffic = section(missingPriorEvidence, "traffic");
    traffic.stage = "authenticated_read_baseline";
    traffic.prior_stage_evidence_reference = null;
    expect(() => validate(missingPriorEvidence)).toThrow(/Prior-stage evidence/);

    const unexpectedPriorEvidence = validManifest();
    section(unexpectedPriorEvidence, "traffic").prior_stage_evidence_reference =
      "prior-stage-12345";
    expect(() => validate(unexpectedPriorEvidence)).toThrow(/must not claim/);
  });

  it("rejects stale policy review, expired windows, short windows, and short retention", () => {
    const stalePolicy = validManifest();
    section(stalePolicy, "approvals").policy_reviewed_at =
      "2026-06-01T12:00:00.000Z";
    expect(() => validate(stalePolicy)).toThrow(/30 days/);

    const expired = validManifest();
    section(expired, "approvals").approved_start_at =
      "2026-07-31T10:00:00.000Z";
    section(expired, "approvals").approved_end_at =
      "2026-07-31T11:59:59.000Z";
    expect(() => validate(expired)).toThrow(/expired/);

    const shortWindow = validManifest();
    section(shortWindow, "approvals").approved_end_at =
      "2026-07-31T13:01:00.000Z";
    expect(() => validate(shortWindow)).toThrow(/runtime exceeds/);

    const shortRetention = validManifest();
    section(shortRetention, "monitoring").retention_end_at =
      "2026-08-01T13:59:59.000Z";
    expect(() => validate(shortRetention)).toThrow(/24 hours/);
  });

  it("requires monitoring and exact-source verification", () => {
    const missingMetric = validManifest();
    section(missingMetric, "monitoring").vercel_cost = false;
    expect(() => validate(missingMetric)).toThrow(/vercel_cost/);

    const commitMismatch = validManifest();
    section(commitMismatch, "verification").deployment_git_commit =
      "abcdef1234567890abcdef1234567890abcdef12";
    expect(() => validate(commitMismatch)).toThrow(/match exactly/);

    const dirty = validManifest();
    section(dirty, "verification").dirty_worktree = true;
    expect(() => validate(dirty)).toThrow(/must be false/);

    const failedRls = validManifest();
    section(failedRls, "verification").hosted_rls_smoke_passed = false;
    expect(() => validate(failedRls)).toThrow(/hosted_rls_smoke_passed/);
  });

  it("rejects secret-bearing fields and identity-looking values", () => {
    const secretKey = validManifest();
    section(secretKey, "target").api_token = "placeholder";
    expect(() => validate(secretKey)).toThrow(/secret-bearing field/);

    const identityValue = validManifest();
    section(identityValue, "traffic").human_checkpoint_reference =
      "operator@example.invalid";
    expect(() => validate(identityValue)).toThrow(/identity material/);
  });

  it("parses exactly one manifest argument", () => {
    expect(parseHostedPreflightArgs(["--manifest", "/tmp/manifest.json"]))
      .toEqual({ manifestPath: "/tmp/manifest.json" });
    expect(() => parseHostedPreflightArgs([])).toThrow(/requires --manifest/);
    expect(() => parseHostedPreflightArgs(["--unknown"])).toThrow(/Unknown/);
    expect(() =>
      parseHostedPreflightArgs([
        "--manifest",
        "/tmp/one.json",
        "--manifest",
        "/tmp/two.json",
      ]),
    ).toThrow(/requires one/);
  });

  it("reads owner-only manifests outside the repository", () => {
    const directory = createTemporaryDirectory();
    const file = path.join(directory, "manifest.json");
    writeFileSync(file, JSON.stringify(validManifest()));
    chmodSync(file, 0o600);

    expect(readHostedPreflightManifest(file)).toEqual(validManifest());
    expect(
      runHostedPreflight(["--manifest", file], { now: NOW }),
    ).toMatchObject({
      status: "ready_for_single_stage_human_checkpoint",
      authorized_stage: "public_read_baseline",
    });
  });

  it("accepts only the ignored private directory for repository-local manifests", () => {
    const repository = createTemporaryDirectory();
    const privateDirectory = path.join(repository, "load-tests", ".hosted");
    mkdirSync(privateDirectory, { recursive: true });
    const privateFile = path.join(privateDirectory, "manifest.json");
    writeFileSync(privateFile, JSON.stringify(validManifest()));
    chmodSync(privateFile, 0o600);
    expect(
      readHostedPreflightManifest(privateFile, { repositoryRoot: repository }),
    ).toEqual(validManifest());

    const exposedFile = path.join(repository, "manifest.json");
    writeFileSync(exposedFile, JSON.stringify(validManifest()));
    chmodSync(exposedFile, 0o600);
    expect(() =>
      readHostedPreflightManifest(exposedFile, { repositoryRoot: repository }),
    ).toThrow(/load-tests\/.hosted/);
  });

  it("rejects broad permissions, symlinks, and invalid JSON", () => {
    const directory = createTemporaryDirectory();
    const broad = path.join(directory, "broad.json");
    writeFileSync(broad, JSON.stringify(validManifest()));
    chmodSync(broad, 0o644);
    expect(() => readHostedPreflightManifest(broad)).toThrow(/owner-only/);

    const target = path.join(directory, "target.json");
    writeFileSync(target, JSON.stringify(validManifest()));
    chmodSync(target, 0o600);
    const link = path.join(directory, "link.json");
    symlinkSync(target, link);
    expect(() => readHostedPreflightManifest(link)).toThrow(/non-symlink/);

    const invalid = path.join(directory, "invalid.json");
    writeFileSync(invalid, "not json");
    chmodSync(invalid, 0o600);
    expect(() => readHostedPreflightManifest(invalid)).toThrow(/valid JSON/);

    expect(() =>
      readHostedPreflightManifest(path.join(directory, "missing.json")),
    ).toThrow(/accessible regular file/);
  });
});
