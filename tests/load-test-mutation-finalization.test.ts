import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

type FinalizationModule = {
  inspectMutationStageArtifacts: (options: {
    reportDirectory: string;
    declaredStages: Array<{ name: string }>;
    stageResults: Array<{
      stage: string;
      artifacts: Record<string, string>;
    }>;
  }) => {
    artifactInspection: {
      status: "passed" | "failed";
      completed_stage_count: number;
      expected_stage_artifact_count: number;
      retained_stage_artifact_count: number;
      orphan_stage_artifact_count: number;
    };
    failures: string[];
  };
  stopMutationChildrenForSignal: (options: {
    lifecycleController: AbortController;
    locust: ChildStub | null;
    app: ChildStub | null;
    children: Set<ChildStub>;
  }) => void;
  writeAggregateJson: (
    filePath: string,
    value: unknown,
    replacements?: Array<{ value: string; label: string }>,
  ) => void;
};

type ChildStub = {
  exitCode: number | null;
  kill: (signal: string) => void;
};

const temporaryDirectories: string[] = [];
let finalization: FinalizationModule;

beforeAll(async () => {
  // @ts-expect-error The mutation suite is a plain Node ESM module.
  finalization = await import("../scripts/load-test-mutation-suite.mjs");
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("mutation-suite finalization", () => {
  it("atomically replaces owner-only aggregate JSON", () => {
    const directory = createTemporaryDirectory();
    const outputPath = path.join(directory, "summary.json");

    finalization.writeAggregateJson(outputPath, {
      status: "first",
    });
    finalization.writeAggregateJson(outputPath, {
      status: "passed",
    });

    expect(JSON.parse(readFileSync(outputPath, "utf8"))).toEqual({
      status: "passed",
    });
    expect(statSync(outputPath).mode & 0o777).toBe(0o600);
    expect(
      readdirSync(directory).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
  });

  it("accepts only exact six-artifact inventories with matching digests", () => {
    const fixture = createArtifactFixture();

    expect(
      finalization.inspectMutationStageArtifacts(fixture),
    ).toEqual({
      artifactInspection: {
        status: "passed",
        completed_stage_count: 1,
        expected_stage_artifact_count: 6,
        retained_stage_artifact_count: 6,
        orphan_stage_artifact_count: 0,
      },
      failures: [],
    });

    writeFileSync(
      path.join(fixture.reportDirectory, "ramp-10_stats.csv"),
      "tampered\n",
    );
    expect(
      finalization.inspectMutationStageArtifacts(fixture),
    ).toMatchObject({
      artifactInspection: { status: "failed" },
      failures: [
        expect.stringMatching(/recorded SHA-256 digest/i),
      ],
    });
  });

  it("rejects orphan stage-prefixed files before a pass sentinel", () => {
    const fixture = createArtifactFixture();
    writeFileSync(
      path.join(fixture.reportDirectory, "ramp-10_partial.csv"),
      "partial\n",
    );

    expect(
      finalization.inspectMutationStageArtifacts(fixture),
    ).toMatchObject({
      artifactInspection: {
        status: "failed",
        expected_stage_artifact_count: 6,
        retained_stage_artifact_count: 7,
        orphan_stage_artifact_count: 1,
      },
      failures: [
        expect.stringMatching(/retained stage-artifact count/i),
        expect.stringMatching(/orphan stage-prefixed artifacts/i),
      ],
    });
  });

  it("rejects Locust-shaped artifacts with an undeclared stage prefix", () => {
    const fixture = createArtifactFixture();
    writeFileSync(
      path.join(fixture.reportDirectory, "rogue_stats.csv"),
      "partial\n",
    );

    expect(
      finalization.inspectMutationStageArtifacts(fixture),
    ).toMatchObject({
      artifactInspection: {
        status: "failed",
        retained_stage_artifact_count: 7,
        orphan_stage_artifact_count: 1,
      },
      failures: [
        expect.stringMatching(/retained stage-artifact count/i),
        expect.stringMatching(/orphan stage-prefixed artifacts/i),
      ],
    });
  });

  it("keeps the app alive while stopping load and auxiliary children", () => {
    const signals = new Map<ChildStub, string[]>();
    const child = (exitCode: number | null = null): ChildStub => {
      const received: string[] = [];
      const value = {
        exitCode,
        kill(signal: string) {
          received.push(signal);
        },
      };
      signals.set(value, received);
      return value;
    };
    const app = child();
    const locust = child();
    const auxiliary = child();
    const exited = child(0);
    const controller = new AbortController();

    finalization.stopMutationChildrenForSignal({
      lifecycleController: controller,
      locust,
      app,
      children: new Set([app, locust, auxiliary, exited]),
    });

    expect(controller.signal.aborted).toBe(true);
    expect(signals.get(locust)).toEqual(["SIGINT"]);
    expect(signals.get(app)).toEqual([]);
    expect(signals.get(auxiliary)).toEqual(["SIGTERM"]);
    expect(signals.get(exited)).toEqual([]);
  });
});

function createTemporaryDirectory() {
  const directory = mkdtempSync(
    path.join(tmpdir(), "cadence-mutation-finalization-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function createArtifactFixture() {
  const reportDirectory = createTemporaryDirectory();
  const stage = "ramp-10";
  const names = [
    `${stage}.html`,
    `${stage}_exceptions.csv`,
    `${stage}_failures.csv`,
    `${stage}_semantic-verifications.json`,
    `${stage}_stats.csv`,
    `${stage}_stats_history.csv`,
  ];
  const artifacts: Record<string, string> = {};
  for (const name of names) {
    const filePath = path.join(reportDirectory, name);
    writeFileSync(filePath, `${name}\n`);
    artifacts[name] = createHash("sha256")
      .update(readFileSync(filePath))
      .digest("hex");
  }
  return {
    reportDirectory,
    declaredStages: [{ name: stage }],
    stageResults: [{ stage, artifacts }],
  };
}
