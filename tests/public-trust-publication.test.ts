import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error Operational JavaScript module intentionally has no declarations.
import { stagePublicTrustSite } from "../scripts/publish-public-trust-evidence.mjs";
// @ts-expect-error Operational JavaScript module intentionally has no declarations.
import { downloadPublicTrustHistory } from "../scripts/download-public-trust-history.mjs";
// @ts-expect-error Operational JavaScript module intentionally has no declarations.
import { buildSnapshot } from "../scripts/collect-public-trust-evidence.mjs";

async function validSubject(failed = false) {
  const input = JSON.parse(await readFile("tests/fixtures/public-trust-collector/input.json", "utf8"));
  input.details_filename = `${input.snapshot_id}.details.json`;
  input.facts = Object.fromEntries([
    "source_to_deployment_provenance", "production_dependency_vulnerabilities", "code_scanning", "secret_scanning", "public_artifact_integrity", "application_live_route_comparison", "marketing_live_route_comparison", "hosted_migration_boundary", "cross_account_rls_isolation",
  ].map((id, index) => [id, { status: failed && index === 0 ? "failed" : "passed", scope: "A bounded deterministic fixture check.", tool: { name: "fixture", version: "1" }, summary: failed && index === 0 ? "The deterministic fixture check failed." : "The deterministic fixture check passed." }]));
  return { input, snapshot: buildSnapshot(input) };
}

describe("public Trust publication", () => {
  it("creates an empty history directory for the first Pages publication", async () => {
    const output = path.join(await mkdtemp(path.join(os.tmpdir(), "cadence-trust-")), "history");
    const fetcher = async () => new Response("missing", { status: 404 });
    await expect(downloadPublicTrustHistory({ origin: "https://pages.example/project", outputDirectory: output, fetcher })).rejects.toThrow(/not authorized/);
    expect(await downloadPublicTrustHistory({ origin: "https://pages.example/project", outputDirectory: output, fetcher, allowEmpty: true })).toBe(0);
    await expect(stat(output)).resolves.toMatchObject({});
  });

  it("does not replace latest after schema or sanitization failure", async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), "cadence-trust-"));
    await mkdir(path.join(output, "trust"));
    await writeFile(path.join(output, "trust/latest.json"), "previous\n");
    await expect(stagePublicTrustSite({ snapshot: { secret: "canary" }, details: {}, outputDirectory: output })).rejects.toThrow();
    await expect(readFile(path.join(output, "trust/latest.json"), "utf8")).resolves.toBe("previous\n");
  });

  it("rejects a synthetic secret canary before writing latest", async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), "cadence-trust-"));
    const { input, snapshot } = await validSubject();
    await expect(stagePublicTrustSite({ snapshot, details: { schema: "cadence.public-trust-details", source_commit: input.source_commit, application_deployment_id: input.application_deployment.id, marketing_deployment_id: input.marketing_deployment.id, authorization: "synthetic-canary" }, outputDirectory: output })).rejects.toThrow(/prohibited/);
    await expect(readFile(path.join(output, "trust/latest.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects private-host detail canaries before writing latest", async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), "cadence-trust-"));
    const { input, snapshot } = await validSubject();
    const details = { schema: "cadence.public-trust-details", source_commit: input.source_commit, application_deployment_id: input.application_deployment.id, marketing_deployment_id: input.marketing_deployment.id, final_url: "https://10.0.0.1/private" };
    await expect(stagePublicTrustSite({ snapshot, details, outputDirectory: output })).rejects.toThrow(/private/);
    await expect(readFile(path.join(output, "trust/latest.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("stages a valid Failed snapshot for publication before the workflow gate fails", async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), "cadence-trust-"));
    const { input, snapshot } = await validSubject(true);
    const details = { schema: "cadence.public-trust-details", source_commit: input.source_commit, application_deployment_id: input.application_deployment.id, marketing_deployment_id: input.marketing_deployment.id };
    await stagePublicTrustSite({ snapshot, details, outputDirectory: output });
    const latest = JSON.parse(await readFile(path.join(output, "trust/latest.json"), "utf8"));
    expect(latest.checks[0].status).toBe("failed");
  });
});
