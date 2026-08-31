import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

type RegistryTrigger = Readonly<{
  kind: string;
  control: string;
}>;

type RegistryVariant = Readonly<{
  id: string;
  label: string;
  result: string;
}>;

type RegistryInteraction = Readonly<{
  id: string;
  triggers: readonly RegistryTrigger[];
  variants?: readonly RegistryVariant[];
  implementation: readonly string[];
}>;

type RegistrySource = Readonly<{
  path: string;
  interaction_ids: readonly string[];
}>;

type InteractionRegistry = Readonly<{
  source_inventory: readonly RegistrySource[];
  interactions: readonly RegistryInteraction[];
}>;

const REGISTRY = JSON.parse(
  readFileSync("interaction-registry.json", "utf8"),
) as InteractionRegistry;

function getInteraction(id: string): RegistryInteraction {
  const interaction = REGISTRY.interactions.find((entry) => entry.id === id);

  expect(interaction, `Missing registry interaction ${id}`).toBeDefined();
  return interaction!;
}

function triggerControls(id: string): string[] {
  return getInteraction(id).triggers.map((trigger) => trigger.control);
}

function variantLabels(id: string): string[] {
  return (getInteraction(id).variants ?? []).map((variant) => variant.label);
}

describe("interaction registry visible-control labels", () => {
  it("uses the exact onboarding and navigation control names", () => {
    expect(triggerControls("INT-ONBOARD-001")).toEqual([
      "Dismiss setup",
      "Skip setup",
      "Show setup guide",
    ]);
    expect(triggerControls("INT-SHELL-004")).toEqual([
      "Collapse navigation",
      "Expand navigation",
    ]);
    expect(variantLabels("INT-SHELL-004")).toEqual([
      "Collapse navigation",
      "Expand navigation",
    ]);
  });

  it("uses the exact Behavior and import action labels", () => {
    expect(triggerControls("INT-BEHAVIOR-021")).toEqual(["Cancel"]);
    expect(triggerControls("INT-EXPORT-013")).toEqual([
      "Apply create-only import",
      "Apply approved merge",
    ]);
    expect(variantLabels("INT-EXPORT-013")).toEqual([
      "Apply create-only import",
      "Apply approved merge",
    ]);
  });

  it("represents each Settings legal link as its own visible control", () => {
    const expectedLabels = ["Privacy", "Terms", "Trust"];

    expect(triggerControls("INT-SETTINGS-005")).toEqual(expectedLabels);
    expect(variantLabels("INT-SETTINGS-005")).toEqual(expectedLabels);
  });

  it("uses the exact marketing entry labels", () => {
    expect(triggerControls("INT-MKT-004")).toEqual(["Log in"]);
    expect(triggerControls("INT-MKT-006")).toEqual(["Begin a record"]);
  });
});

describe("interaction registry source ownership", () => {
  it("maps the footer llms link to INT-MKT-010 in both directions", () => {
    const sourcePath = "apps/marketing/src/layouts/BaseLayout.astro";
    const source = REGISTRY.source_inventory.find(
      (entry) => entry.path === sourcePath,
    );

    expect(source).toBeDefined();
    expect(source?.interaction_ids).toContain("INT-MKT-010");
    expect(getInteraction("INT-MKT-010").implementation).toContain(sourcePath);
    expect(readFileSync(sourcePath, "utf8")).toContain(
      '<a class="inline-link" href="/llms.txt">llms.txt</a>',
    );
  });
});
