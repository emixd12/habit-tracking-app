import {
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { spawnSyncMock } = vi.hoisted(() => ({
  spawnSyncMock: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawnSync: spawnSyncMock,
  };
});

type ResourceSample = {
  elapsed_milliseconds: number;
  host_load_1m: number;
  host_load_per_logical_cpu: number;
  available_memory_bytes: number;
  app_rss_bytes: number | null;
  locust_rss_bytes: number | null;
};

type LocalRuntimeModule = {
  sanitizeLocustStageArtifacts: (options: {
    prefix: string;
    replacements: Array<{ value: string; label: string }>;
    secretNeedles: string[];
  }) => string[];
  startLocalResourceMonitor: (options: {
    appPid: number;
    locustPid: number;
    locustRssRequiredDurationMilliseconds?: number;
    ceilings: {
      max_host_load_per_logical_cpu: number;
      min_available_memory_bytes: number;
      max_app_rss_bytes: number;
      max_locust_rss_bytes: number;
    };
    onBreach?: () => void;
  }) => {
    stop: () => {
      samples: number;
      resource_samples: ResourceSample[];
      max_host_load_1m: number;
      max_host_load_per_logical_cpu: number;
      min_available_memory_bytes: number | null;
      max_app_rss_bytes: number;
      max_locust_rss_bytes: number;
      first_app_rss_bytes: number | null;
      final_app_rss_bytes: number | null;
      first_locust_rss_bytes: number | null;
      final_locust_rss_bytes: number | null;
      breaches: string[];
    };
  };
};

const temporaryDirectories: string[] = [];
const permissiveCeilings = {
  max_host_load_per_logical_cpu: Number.POSITIVE_INFINITY,
  min_available_memory_bytes: 0,
  max_app_rss_bytes: Number.POSITIVE_INFINITY,
  max_locust_rss_bytes: Number.POSITIVE_INFINITY,
};
let runtimeModule: LocalRuntimeModule;

beforeAll(async () => {
  // @ts-expect-error The load-test runtime is a plain Node ESM module.
  runtimeModule = await import("../scripts/load-test-local-runtime.mjs");
});

afterEach(() => {
  vi.useRealTimers();
  spawnSyncMock.mockReset();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("local process RSS monitoring", () => {
  it("retains positive samples and preserves final Locust RSS after expected exit", () => {
    configureProcessRssSamples({
      101: ["128", "192"],
      202: ["256", { status: 1, stdout: "" }],
    });
    const onBreach = vi.fn();

    const evidence = runtimeModule
      .startLocalResourceMonitor({
        appPid: 101,
        locustPid: 202,
        locustRssRequiredDurationMilliseconds: 0,
        ceilings: permissiveCeilings,
        onBreach,
      })
      .stop();

    expect(evidence).toMatchObject({
      samples: 2,
      max_app_rss_bytes: 192 * 1024,
      max_locust_rss_bytes: 256 * 1024,
      first_app_rss_bytes: 128 * 1024,
      final_app_rss_bytes: 192 * 1024,
      first_locust_rss_bytes: 256 * 1024,
      final_locust_rss_bytes: 256 * 1024,
      breaches: [],
    });
    expect(evidence.resource_samples).toHaveLength(evidence.samples);
    expect(evidence.resource_samples.map((sample) => sample.app_rss_bytes)).toEqual(
      [128 * 1024, 192 * 1024],
    );
    expect(
      evidence.resource_samples.map((sample) => sample.locust_rss_bytes),
    ).toEqual([256 * 1024, null]);
    for (const sample of evidence.resource_samples) {
      expect(Object.keys(sample).sort()).toEqual(
        [
          "app_rss_bytes",
          "available_memory_bytes",
          "elapsed_milliseconds",
          "host_load_1m",
          "host_load_per_logical_cpu",
          "locust_rss_bytes",
        ].sort(),
      );
      expect(sample.elapsed_milliseconds).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(sample.host_load_1m)).toBe(true);
      expect(Number.isFinite(sample.host_load_per_logical_cpu)).toBe(true);
      expect(Number.isFinite(sample.available_memory_bytes)).toBe(true);
    }
    expectMonotonicElapsedMilliseconds(evidence.resource_samples);
    expect(Object.keys(evidence).sort()).toEqual(
      [
        "breaches",
        "final_app_rss_bytes",
        "final_locust_rss_bytes",
        "first_app_rss_bytes",
        "first_locust_rss_bytes",
        "max_app_rss_bytes",
        "max_host_load_1m",
        "max_host_load_per_logical_cpu",
        "max_locust_rss_bytes",
        "min_available_memory_bytes",
        "resource_samples",
        "samples",
      ].sort(),
    );
    expect(onBreach).not.toHaveBeenCalled();
  });

  it("fails closed when Locust disappears before the declared duration between polls", () => {
    configureProcessRssSamples({
      101: ["128", "192"],
      202: ["256", { status: 1, stdout: "" }],
    });
    const onBreach = vi.fn();

    const evidence = runtimeModule
      .startLocalResourceMonitor({
        appPid: 101,
        locustPid: 202,
        locustRssRequiredDurationMilliseconds: 5_000,
        ceilings: permissiveCeilings,
        onBreach,
      })
      .stop();

    expect(evidence).toMatchObject({
      samples: 2,
      max_locust_rss_bytes: 256 * 1024,
      first_locust_rss_bytes: 256 * 1024,
      final_locust_rss_bytes: 256 * 1024,
      breaches: ["Locust RSS measurement"],
    });
    expect(onBreach).toHaveBeenCalled();
  });

  it("fails closed on a periodic Locust RSS failure without overwriting its last positive sample", () => {
    vi.useFakeTimers();
    configureProcessRssSamples({
      101: ["128", "192", "224"],
      202: [
        "256",
        { status: 1, stdout: "" },
        { status: 1, stdout: "" },
      ],
    });
    const onBreach = vi.fn();

    const monitor = runtimeModule.startLocalResourceMonitor({
      appPid: 101,
      locustPid: 202,
      locustRssRequiredDurationMilliseconds: 5_001,
      ceilings: permissiveCeilings,
      onBreach,
    });
    vi.advanceTimersByTime(5_000);
    const evidence = monitor.stop();

    expect(evidence).toMatchObject({
      samples: 3,
      max_locust_rss_bytes: 256 * 1024,
      first_locust_rss_bytes: 256 * 1024,
      final_locust_rss_bytes: 256 * 1024,
      breaches: ["Locust RSS measurement"],
    });
    expect(evidence.resource_samples).toHaveLength(evidence.samples);
    expect(evidence.resource_samples).toMatchObject([
      {
        app_rss_bytes: 128 * 1024,
        locust_rss_bytes: 256 * 1024,
      },
      {
        app_rss_bytes: 192 * 1024,
        locust_rss_bytes: null,
      },
      {
        app_rss_bytes: 224 * 1024,
        locust_rss_bytes: null,
      },
    ]);
    expectMonotonicElapsedMilliseconds(evidence.resource_samples);
    expect(onBreach).toHaveBeenCalled();
  });

  it("allows Locust to disappear at the declared duration while retaining its last positive sample", () => {
    vi.useFakeTimers();
    configureProcessRssSamples({
      101: ["128", "192", "224"],
      202: [
        "256",
        { status: 1, stdout: "" },
        { status: 1, stdout: "" },
      ],
    });
    const onBreach = vi.fn();

    const monitor = runtimeModule.startLocalResourceMonitor({
      appPid: 101,
      locustPid: 202,
      locustRssRequiredDurationMilliseconds: 5_000,
      ceilings: permissiveCeilings,
      onBreach,
    });
    vi.advanceTimersByTime(5_000);
    const evidence = monitor.stop();

    expect(evidence).toMatchObject({
      samples: 3,
      max_locust_rss_bytes: 256 * 1024,
      first_locust_rss_bytes: 256 * 1024,
      final_locust_rss_bytes: 256 * 1024,
      breaches: [],
    });
    expect(evidence.resource_samples).toHaveLength(evidence.samples);
    expectMonotonicElapsedMilliseconds(evidence.resource_samples);
    expect(onBreach).not.toHaveBeenCalled();
  });

  it("takes one final stop sample and stops periodic sampling", () => {
    vi.useFakeTimers();
    configureProcessRssSamples({
      101: ["128", "192", "224"],
      202: ["256", "288", "320"],
    });

    const monitor = runtimeModule.startLocalResourceMonitor({
      appPid: 101,
      locustPid: 202,
      ceilings: permissiveCeilings,
    });
    vi.advanceTimersByTime(5_000);
    const evidence = monitor.stop();
    const processReadsAfterStop = processRssReadCount();

    vi.advanceTimersByTime(15_000);

    expect(evidence.samples).toBe(3);
    expect(evidence.resource_samples).toHaveLength(3);
    expect(
      evidence.resource_samples.map((sample) => sample.app_rss_bytes),
    ).toEqual([128 * 1024, 192 * 1024, 224 * 1024]);
    expect(
      evidence.resource_samples.map((sample) => sample.locust_rss_bytes),
    ).toEqual([256 * 1024, 288 * 1024, 320 * 1024]);
    expectMonotonicElapsedMilliseconds(evidence.resource_samples);
    expect(processRssReadCount()).toBe(processReadsAfterStop);
  });

  it.each([
    ["failed ps command", { status: 1, stdout: "" }],
    ["unparseable ps output", { status: 0, stdout: "unknown" }],
    ["zero RSS", { status: 0, stdout: "0" }],
    ["negative RSS", { status: 0, stdout: "-1" }],
  ])("fails closed for %s instead of recording zero", (_, failure) => {
    configureProcessRssSamples({
      101: [failure, failure],
      202: ["256", "256"],
    });
    const onBreach = vi.fn();

    const evidence = runtimeModule
      .startLocalResourceMonitor({
        appPid: 101,
        locustPid: 202,
        ceilings: permissiveCeilings,
        onBreach,
      })
      .stop();

    expect(evidence).toMatchObject({
      max_app_rss_bytes: 0,
      first_app_rss_bytes: null,
      final_app_rss_bytes: null,
      breaches: ["app RSS measurement"],
    });
    expect(
      evidence.resource_samples.map((sample) => sample.app_rss_bytes),
    ).toEqual([null, null]);
    expect(onBreach).toHaveBeenCalled();
  });

  it("fails closed for an invalid process ID without invoking ps", () => {
    configureProcessRssSamples({
      202: ["256", "256"],
    });
    const onBreach = vi.fn();

    const evidence = runtimeModule
      .startLocalResourceMonitor({
        appPid: 0,
        locustPid: 202,
        ceilings: permissiveCeilings,
        onBreach,
      })
      .stop();

    expect(evidence).toMatchObject({
      first_app_rss_bytes: null,
      final_app_rss_bytes: null,
      breaches: ["app RSS measurement"],
    });
    expect(
      evidence.resource_samples.map((sample) => sample.app_rss_bytes),
    ).toEqual([null, null]);
    expect(
      spawnSyncMock.mock.calls.filter(
        ([command]) => command === "ps",
      ),
    ).toHaveLength(2);
    expect(onBreach).toHaveBeenCalled();
  });
});

function expectMonotonicElapsedMilliseconds(samples: ResourceSample[]) {
  for (let index = 1; index < samples.length; index += 1) {
    expect(samples[index].elapsed_milliseconds).toBeGreaterThanOrEqual(
      samples[index - 1].elapsed_milliseconds,
    );
  }
}

function processRssReadCount() {
  return spawnSyncMock.mock.calls.filter(
    ([command]) => command === "ps",
  ).length;
}

describe("mutation-stage artifact inventory", () => {
  it("retains exactly six sanitized owner-only artifacts", () => {
    const fixture = createStageArtifacts();

    const artifacts = runtimeModule.sanitizeLocustStageArtifacts({
      prefix: fixture.prefix,
      replacements: [],
      secretNeedles: [],
    });

    expect(
      artifacts.map((artifact) => path.basename(artifact)).sort(),
    ).toEqual(
      fixture.expectedNames,
    );
    for (const artifact of artifacts) {
      expect(statSync(artifact).mode & 0o777).toBe(0o600);
    }
  });

  it("rejects a missing or extra prefix-matching artifact", () => {
    const missing = createStageArtifacts({
      omittedName: "ramp-10.html",
    });
    expect(() =>
      runtimeModule.sanitizeLocustStageArtifacts({
        prefix: missing.prefix,
        replacements: [],
        secretNeedles: [],
      }),
    ).toThrow(/exact mutation-stage artifact inventory/i);

    const extra = createStageArtifacts();
    writeFileSync(`${extra.prefix}_partial.csv`, "partial\n");
    expect(() =>
      runtimeModule.sanitizeLocustStageArtifacts({
        prefix: extra.prefix,
        replacements: [],
        secretNeedles: [],
      }),
    ).toThrow(/exact mutation-stage artifact inventory/i);
  });
});

type ProcessSample =
  | string
  | { status: number | null; stdout: string };

function configureProcessRssSamples(
  samplesByPid: Record<number, ProcessSample[]>,
) {
  const queues = new Map(
    Object.entries(samplesByPid).map(([pid, samples]) => [
      Number(pid),
      [...samples],
    ]),
  );
  spawnSyncMock.mockImplementation(
    (command: string, args: string[]) => {
      if (command === "vm_stat") {
        return { status: 1, stdout: "", stderr: "" };
      }
      if (command !== "ps") {
        throw new Error(`Unexpected command: ${command}`);
      }
      const pid = Number(args.at(-1));
      const sample = queues.get(pid)?.shift();
      if (sample === undefined) {
        throw new Error(`Missing RSS sample for PID ${pid}.`);
      }
      return typeof sample === "string"
        ? { status: 0, stdout: sample, stderr: "" }
        : { ...sample, stderr: "" };
    },
  );
}

function createStageArtifacts({
  omittedName,
}: {
  omittedName?: string;
} = {}) {
  const directory = mkdtempSync(
    path.join(tmpdir(), "cadence-mutation-artifacts-"),
  );
  temporaryDirectories.push(directory);
  const prefix = path.join(directory, "ramp-10");
  const expectedNames = [
    "ramp-10.html",
    "ramp-10_exceptions.csv",
    "ramp-10_failures.csv",
    "ramp-10_semantic-verifications.json",
    "ramp-10_stats.csv",
    "ramp-10_stats_history.csv",
  ];
  for (const name of expectedNames) {
    if (name === omittedName) continue;
    writeFileSync(path.join(directory, name), "safe\n", {
      mode: 0o644,
    });
  }
  return { expectedNames, prefix };
}
