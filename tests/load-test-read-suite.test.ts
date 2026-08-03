import { Temporal } from "@js-temporal/polyfill";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";

type Stage = {
  name: string;
  profile: string;
  users: number;
  spawnRate: number;
  durationSeconds: number;
  cohortFilter: string | null;
};

type SuiteModule = {
  LOCUST_REQUEST_FAILURE_EXIT_CODE: number;
  REQUIRED_READ_REQUEST_NAMES: readonly string[];
  assertAnchorDate: (
    anchorLocalDate: string,
    now?: Temporal.Instant,
  ) => void;
  buildReadSuitePlan: (suite: string) => {
    accountCount: number;
    heavyCount: number;
    stages: Stage[];
  };
  createLoadRunId: (now?: Date) => string;
  evaluateTimedRouteCoverage: (
    stageResults: Array<Record<string, unknown>>,
  ) => {
    passed: boolean;
    failures: string[];
  };
  removeUnsafeArtifacts: (
    filePaths: string[],
    secretNeedles: string[],
  ) => void;
  readZipTextForLoadAssertion: (buffer: Buffer) => string;
  runReadSuite: (options: {
    suite?: string;
    runId?: string;
  }) => Promise<unknown>;
};

let suiteModule: SuiteModule;

beforeAll(async () => {
  // @ts-expect-error The supervised load command is a plain Node ESM module.
  suiteModule = await import("../scripts/load-test-read-suite.mjs");
});

describe("Ticket 064 supervised read suite", () => {
  it("leaves noncritical request failures to the declared ratio gate", () => {
    expect(suiteModule.LOCUST_REQUEST_FAILURE_EXIT_CODE).toBe(0);
  });

  it("declares the full required sequence and reserves heavy identities", () => {
    const plan = suiteModule.buildReadSuitePlan("full");

    expect(plan).toMatchObject({
      accountCount: 105,
      heavyCount: 5,
    });
    expect(plan.stages.map((stage) => stage.name)).toEqual([
      "smoke-1",
      "warm-1",
      "baseline-5",
      "baseline-10",
      "ramp-10",
      "ramp-25",
      "ramp-50",
      "ramp-100",
      "recovery-10",
      "heavy-5",
    ]);
    expect(
      plan.stages
        .filter((stage) => stage.name !== "heavy-5")
        .every((stage) => stage.cohortFilter === null),
    ).toBe(true);
    expect(plan.stages.at(-1)).toMatchObject({
      users: 5,
      cohortFilter: "heavy_schedule",
    });
  });

  it("keeps smoke and steady baselines at the ticketed durations", () => {
    const plan = suiteModule.buildReadSuitePlan("full");
    const byName = Object.fromEntries(
      plan.stages.map((stage) => [stage.name, stage]),
    );

    expect(byName["smoke-1"]).toMatchObject({
      users: 1,
      spawnRate: 1,
      durationSeconds: 180,
    });
    expect(byName["warm-1"]).toMatchObject({
      users: 1,
      spawnRate: 1,
      durationSeconds: 120,
    });
    expect(byName["baseline-5"]).toMatchObject({
      users: 5,
      durationSeconds: 600,
    });
    expect(byName["baseline-10"]).toMatchObject({
      users: 10,
      durationSeconds: 600,
    });
    expect(byName["ramp-100"]).toMatchObject({
      users: 100,
      spawnRate: 10,
      durationSeconds: 240,
    });
    expect(byName["recovery-10"]).toMatchObject({
      users: 10,
      durationSeconds: 300,
    });
  });

  it("creates exact run IDs and rejects an anchor-date rollover", () => {
    expect(
      suiteModule.createLoadRunId(new Date("2026-07-29T12:34:56.000Z")),
    ).toMatch(/^20260729t123456z-[a-f0-9]{12}$/);

    const now = Temporal.Instant.from("2026-07-29T16:00:00Z");
    expect(() =>
      suiteModule.assertAnchorDate("2026-07-29", now),
    ).not.toThrow();
    expect(() =>
      suiteModule.assertAnchorDate("2026-07-28", now),
    ).toThrow(/crossed the fixture anchor/);
  });

  it("rejects undeclared suite names", () => {
    expect(() => suiteModule.buildReadSuitePlan("unbounded")).toThrow(
      /smoke, baseline, ramp, or full/,
    );
  });

  it("requires every normalized read workload name to run in timed traffic", () => {
    expect(
      suiteModule.evaluateTimedRouteCoverage([]),
    ).toMatchObject({ passed: false });

    expect(
      suiteModule.evaluateTimedRouteCoverage([
        {
          metrics: {
            requests_by_name:
              suiteModule.REQUIRED_READ_REQUEST_NAMES.map((name) => ({
                name,
                requests: 1,
              })),
          },
        },
      ]),
    ).toMatchObject({ passed: true, failures: [] });
  });

  it("rejects a path-like run ID before lifecycle or report work", async () => {
    await expect(
      suiteModule.runReadSuite({
        suite: "smoke",
        runId: "../../outside",
      }),
    ).rejects.toThrow(/CADENCE_LOAD_RUN_ID/);
  });

  it("removes every unsafe retained artifact before reporting failure", () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "cadence-load-report-test-"),
    );
    const safePath = path.join(directory, "safe.csv");
    const unsafeOne = path.join(directory, "unsafe-one.csv");
    const unsafeTwo = path.join(directory, "unsafe-two.html");
    writeFileSync(safePath, "aggregate-only");
    writeFileSync(unsafeOne, "private-cookie-value");
    writeFileSync(unsafeTwo, "also private-cookie-value");

    try {
      expect(() =>
        suiteModule.removeUnsafeArtifacts(
          [unsafeOne, safePath, unsafeTwo],
          ["private-cookie-value"],
        ),
      ).toThrow(/retained private/);
      expect(existsSync(safePath)).toBe(true);
      expect(existsSync(unsafeOne)).toBe(false);
      expect(existsSync(unsafeTwo)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("reads owner markers from deflated BehaviorLog ZIP entries", () => {
    const content = Buffer.from(
      '{"notes":"cadence-owner-read-assertion"}',
      "utf8",
    );
    const compressed = deflateRawSync(content);
    const name = Buffer.from("behaviorlog.json", "utf8");
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(name.length, 26);

    expect(
      suiteModule.readZipTextForLoadAssertion(
        Buffer.concat([header, name, compressed]),
      ),
    ).toContain("cadence-owner-read-assertion");
  });
});
