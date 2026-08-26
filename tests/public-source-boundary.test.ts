import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

type BoundaryModule = {
  SERVER_ONLY_ENV_NAMES: string[];
  scanAllRefPatchHistory: (projectRoot?: string) => Record<string, number>;
  scanClientSourceEnvironmentBoundary: () => Array<{
    surface: string;
    variable: string;
  }>;
  scanTextForProjectSecrets: (text: string) => Record<string, number>;
  scanBrowserArtifacts: (input: {
    roots: Record<string, string>;
    serverCanaries: string[];
    publicCanaries: Array<{ value: string; allowedRoot: string }>;
  }) => {
    serverViolations: string[];
    publicViolations: Array<{ allowedRoot: string; foundRoot: string }>;
    missingPublicCanaries: string[];
  };
};

async function loadBoundary(): Promise<BoundaryModule> {
  // @ts-expect-error The boundary command is a plain Node ESM script.
  return import("../scripts/check-public-source-boundary.mjs");
}

describe("public source boundary", () => {
  it("detects project-specific server credential shapes without returning values", async () => {
    const boundary = await loadBoundary();
    const supabaseValue = ["credential", "shaped", "private", "value", "A1"].join("-");
    const processValue = ["another", "private", "route", "value", "B2"].join("-");
    const oauthValue = ["credential", "shaped", "oauth", "value", "C3"].join("-");
    const googleValue = `GOCSPX-${"abcdefghijklmnopqrstuvwx"}`;
    const supabaseName = ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");
    const processName = ["REMINDER", "PROCESS", "SECRET"].join("_");
    const oauthName = [
      "SUPABASE",
      "AUTH",
      "EXTERNAL",
      "GOOGLE",
      "SECRET",
    ].join("_");
    const findings = boundary.scanTextForProjectSecrets(
      [
        `${supabaseName}=${supabaseValue}`,
        `${processName}=${processValue}`,
        `${oauthName}=${oauthValue}`,
        googleValue,
      ].join("\n"),
    );

    expect(findings).toEqual({ google: 2, process: 1, supabase: 1 });
    expect(JSON.stringify(findings)).not.toContain("credential-shaped");
  });

  it("ignores documented names and explicit synthetic placeholders", async () => {
    const boundary = await loadBoundary();
    const supabaseName = ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");
    const cronName = ["CRON", "SECRET"].join("_");

    expect(
      boundary.scanTextForProjectSecrets(
        `${supabaseName}=\n${cronName}=test-process-secret\nprocess.env.VAPID_PRIVATE_KEY`,
      ),
    ).toEqual({});
  });

  it("requires full history and detects a credential removed from the final worktree", async () => {
    const boundary = await loadBoundary();
    const root = mkdtempSync(join(tmpdir(), "cadence-history-boundary-"));
    const completeRepository = join(root, "complete");
    const shallowRepository = join(root, "shallow");
    const processName = ["REMINDER", "PROCESS", "SECRET"].join("_");
    const removedValue = ["Intermediate", "History", "Private", "Value", "A1!"].join(
      "-",
    );

    try {
      mkdirSync(completeRepository);
      git(completeRepository, "init", "--initial-branch=main");
      git(completeRepository, "config", "user.name", "Cadence test");
      git(completeRepository, "config", "user.email", "cadence@example.invalid");
      writeFileSync(
        join(completeRepository, "fixture.txt"),
        `${processName}=${removedValue}\n`,
      );
      git(completeRepository, "add", "fixture.txt");
      git(completeRepository, "commit", "-m", "add intermediate fixture");
      writeFileSync(join(completeRepository, "fixture.txt"), "safe final worktree\n");
      git(completeRepository, "add", "fixture.txt");
      git(completeRepository, "commit", "-m", "remove intermediate fixture");

      expect(
        boundary.scanAllRefPatchHistory(completeRepository).process,
      ).toBeGreaterThan(0);

      git(
        root,
        "clone",
        "--depth=1",
        pathToFileURL(completeRepository).href,
        shallowRepository,
      );
      expect(() => boundary.scanAllRefPatchHistory(shallowRepository)).toThrow(
        "complete Git history",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps the account-deletion canary out of client and marketing source", async () => {
    const boundary = await loadBoundary();
    const variable = "CADENCE_ACCOUNT_DELETION_FAILURE_CANARY_USER_ID";

    expect(boundary.SERVER_ONLY_ENV_NAMES).toContain(variable);
    expect(boundary.scanClientSourceEnvironmentBoundary()).not.toContainEqual(
      expect.objectContaining({ variable }),
    );
  });

  it("rejects server canaries and cross-surface public canaries in browser artifacts", async () => {
    const boundary = await loadBoundary();
    const root = mkdtempSync(join(tmpdir(), "cadence-source-boundary-"));
    const nextRoot = join(root, "next");
    const marketingRoot = join(root, "marketing");
    mkdirSync(nextRoot);
    mkdirSync(marketingRoot);
    writeFileSync(
      join(nextRoot, "app.js"),
      "next-public-canary server-private-canary",
    );
    writeFileSync(join(marketingRoot, "index.html"), "next-public-canary");

    const result = boundary.scanBrowserArtifacts({
      roots: { next: nextRoot, marketing: marketingRoot },
      serverCanaries: ["server-private-canary"],
      publicCanaries: [
        { value: "next-public-canary", allowedRoot: "next" },
      ],
    });

    expect(result.serverViolations).toEqual(["next"]);
    expect(result.publicViolations).toEqual([
      { allowedRoot: "next", foundRoot: "marketing" },
    ]);
    expect(result.missingPublicCanaries).toEqual([]);
  });

  it("rejects a declared public canary that the build did not inject", async () => {
    const boundary = await loadBoundary();
    const root = mkdtempSync(join(tmpdir(), "cadence-source-boundary-"));
    const nextRoot = join(root, "next");
    const marketingRoot = join(root, "marketing");
    mkdirSync(nextRoot);
    mkdirSync(marketingRoot);
    writeFileSync(join(nextRoot, "app.js"), "unrelated public content");
    writeFileSync(join(marketingRoot, "index.html"), "marketing content");

    const result = boundary.scanBrowserArtifacts({
      roots: { next: nextRoot, marketing: marketingRoot },
      serverCanaries: [],
      publicCanaries: [
        { value: "missing-next-public-canary", allowedRoot: "next" },
      ],
    });

    expect(result.missingPublicCanaries).toEqual(["next"]);
  });
});

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}
