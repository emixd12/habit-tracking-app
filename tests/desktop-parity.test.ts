import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

type Platform = {
  applicability: string;
  status: string;
  implementation?: string[];
  evidence?: string[];
  follow_up?: string;
  reason?: string;
};
type Registry = {
  interactions: Array<{ id: string; platforms: Record<string, Platform> }>;
};

const directory = mkdtempSync(join(tmpdir(), "cadence-desktop-parity-"));
const registryText = readFileSync("interaction-registry.json", "utf8");
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function check(mutate?: (registry: Registry) => void, release = false) {
  const registry = JSON.parse(registryText) as Registry;
  mutate?.(registry);
  const file = join(directory, "registry.json");
  writeFileSync(file, JSON.stringify(registry));
  const result = spawnSync(
    process.execPath,
    ["scripts/check-interactions.mjs", "--registry", file, ...(release ? ["--desktop-release"] : [])],
    { encoding: "utf8" },
  );
  return { status: result.status, output: result.stdout + result.stderr };
}

function desktop(registry: Registry): Platform {
  return registry.interactions.find((entry) => entry.id === "INT-TIMELINE-005")!.platforms.desktop;
}

describe("desktop interaction parity gate", () => {
  it("accepts an explicit planned fixture and blocks desktop release", () => {
    const planned = (registry: Registry) => {
      const platform = desktop(registry);
      platform.status = "planned";
      platform.follow_up = "docs/TICKETS.md#ticket-111-desktop-tracking-parity";
      delete platform.implementation;
      delete platform.evidence;
    };
    const baseline = check(planned);
    expect(baseline.output).toContain("interactions:check passed");
    expect(baseline.status).toBe(0);
    const release = check(planned, true);
    expect(release.status).toBe(1);
    expect(release.output).toContain("INT-TIMELINE-005 desktop is incomplete for desktop release (planned)");
  });

  it("rejects missing platforms and unresolved follow-up ticket references", () => {
    const missing = check((registry) => {
      delete registry.interactions[0].platforms.mobile;
      desktop(registry).follow_up = "docs/TICKETS.md#ticket-999-no-such-ticket";
    });
    expect(missing.status).toBe(1);
    expect(missing.output).toContain("needs a platform record");
    expect(missing.output).toContain("reference does not resolve");
  });

  it("rejects claimed implementation without real desktop code and evidence", () => {
    const missing = check((registry) => {
      Object.assign(desktop(registry), {
        status: "implemented",
        implementation: ["apps/desktop/src/does-not-exist.tsx"],
        evidence: ["tests/does-not-exist.test.ts"],
      });
    });
    expect(missing.status).toBe(1);
    expect(missing.output).toContain("reference does not exist: apps/desktop/src/does-not-exist.tsx");
    expect(missing.output).toContain("reference does not exist: tests/does-not-exist.test.ts");

    const webOnly = check((registry) => {
      Object.assign(desktop(registry), {
        status: "implemented",
        implementation: ["components/timeline/StatusButtons.tsx"],
        evidence: ["scripts/check-interactions.mjs"],
      });
    }, true);
    expect(webOnly.status).toBe(1);
    expect(webOnly.output).toContain("needs a desktop implementation reference");
    expect(webOnly.output).toContain("structural checks alone do not prove desktop parity");

    const benchOnly = check((registry) => {
      for (const interaction of registry.interactions) {
        if (interaction.platforms.desktop.applicability !== "applicable") continue;
        Object.assign(interaction.platforms.desktop, {
          status: "implemented",
          implementation: ["apps/desktop/src/main.tsx"],
          evidence: ["tests/desktop-native-spike.test.ts"],
        });
      }
    }, true);
    expect(benchOnly.status).toBe(1);
    expect(benchOnly.output).toContain("needs a cataloged desktop source linked to this interaction");
  });
});
