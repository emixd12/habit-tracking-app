import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const registryPath = "interaction-registry.json";
const schemaPath = "interaction-registry.schema.json";
const journeyPath = "docs/UX_JOURNEY_INVENTORY.md";
const userGuideDirectory = "docs/user-guide";
const internalQaInteractionIds = new Set(["INT-AUTH-002", "INT-SHELL-007"]);
const failures = [];
let assertions = 0;

function assert(condition, message) {
  assertions += 1;
  if (!condition) failures.push(message);
}

function absolute(relativePath) {
  return path.join(root, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(absolute(relativePath));
}

function read(relativePath) {
  return fs.readFileSync(absolute(relativePath), "utf8");
}

function readJson(relativePath) {
  try {
    return JSON.parse(read(relativePath));
  } catch (error) {
    failures.push(
      `${relativePath} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyStringArray(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(isNonEmptyString) &&
    new Set(value).size === value.length
  );
}

function splitReference(reference) {
  const separatorIndex = reference.indexOf("#");
  if (separatorIndex === -1) {
    return { file: reference, symbol: "" };
  }

  return {
    file: reference.slice(0, separatorIndex),
    symbol: reference.slice(separatorIndex + 1),
  };
}

function githubHeadingSlug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-");
}

function markdownHeadingAnchors(relativePath) {
  const anchors = new Set();
  const slugCounts = new Map();

  for (const match of read(relativePath).matchAll(/^#{1,6}[ \t]+(.+)$/gm)) {
    const heading = match[1].replace(/[ \t]+#+[ \t]*$/, "").trim();
    const baseSlug = githubHeadingSlug(heading);
    const duplicateCount = slugCounts.get(baseSlug) ?? 0;
    slugCounts.set(baseSlug, duplicateCount + 1);
    anchors.add(duplicateCount === 0 ? baseSlug : `${baseSlug}-${duplicateCount}`);
  }

  return anchors;
}

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(absolute(directory), {
    withFileTypes: true,
  })) {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(relativePath));
      continue;
    }

    files.push(relativePath);
  }
  return files;
}

function interactiveSourceFiles() {
  const roots = ["app", "components", "apps/marketing/src", "public"];

  return roots
    .flatMap(walk)
    .filter((file) => /\.(?:tsx|astro|js)$/.test(file))
    .filter((file) => interactionMarkerCount(read(file)) > 0)
    .sort();
}

function interactionMarkerCount(content) {
  return (
    content.match(
      /<(?:Link|a|button|form|input|select|textarea|summary)\b|\bon(?:Click|Submit|Change|KeyDown|MouseDown|PointerDown|TouchStart|TouchMove|TouchEnd|Toggle)=|\bself\.addEventListener\(\s*["']notificationclick["']/g,
    ) ?? []
  ).length;
}

assert(exists(registryPath), `Missing ${registryPath}.`);
assert(exists(schemaPath), `Missing ${schemaPath}.`);
assert(exists(journeyPath), `Missing ${journeyPath}.`);

const registry = exists(registryPath) ? readJson(registryPath) : null;
const schema = exists(schemaPath) ? readJson(schemaPath) : null;

if (!registry || !schema) {
  console.error(`interactions:check failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

assert(
  registry.$schema === "./interaction-registry.schema.json",
  `${registryPath} must reference ./interaction-registry.schema.json.`,
);
assert(
  registry.schema_version === "1.1.0",
  `${registryPath} schema_version must be 1.1.0.`,
);
assert(
  registry.registry_id === "cadence.user-interactions",
  `${registryPath} registry_id must be cadence.user-interactions.`,
);
assert(registry.product === "Cadence", `${registryPath} product must be Cadence.`);
assert(
  /^\d{4}-\d{2}-\d{2}$/.test(registry.updated ?? ""),
  `${registryPath} updated must use YYYY-MM-DD.`,
);
assert(
  isNonEmptyString(registry.scope?.unit),
  `${registryPath} scope.unit must define the catalog granularity.`,
);
assert(
  isNonEmptyStringArray(registry.scope?.includes),
  `${registryPath} scope.includes must be a unique non-empty string array.`,
);
assert(
  isNonEmptyStringArray(registry.scope?.excludes),
  `${registryPath} scope.excludes must be a unique non-empty string array.`,
);
assert(Array.isArray(registry.surfaces), `${registryPath} surfaces must be an array.`);
assert(
  Array.isArray(registry.source_inventory),
  `${registryPath} source_inventory must be an array.`,
);
assert(
  Array.isArray(registry.interactions),
  `${registryPath} interactions must be an array.`,
);

const surfaces = Array.isArray(registry.surfaces) ? registry.surfaces : [];
const sourceInventory = Array.isArray(registry.source_inventory)
  ? registry.source_inventory
  : [];
const interactions = Array.isArray(registry.interactions)
  ? registry.interactions
  : [];
const surfaceIds = new Set();
const interactionIds = new Set();
const sourcePaths = new Set();
const allowedSurfaceKinds = new Set([
  "public",
  "authenticated",
  "conditional_development",
]);
const allowedStatuses = new Set(["implemented", "planned", "deferred"]);
const allowedTriggerKinds = new Set([
  "activate",
  "change",
  "input",
  "submit",
  "upload",
  "keyboard",
  "gesture",
]);
const allowedRisks = new Set(["low", "moderate", "high", "destructive"]);
const allowedConfirmations = new Set([
  "none",
  "browser_prompt",
  "acknowledgement",
  "typed",
  "acknowledgement_and_typed",
]);
const allowedCoverageLevels = new Set(["direct", "indirect", "manual", "none"]);

for (const surface of surfaces) {
  assert(
    /^[a-z][a-z0-9_]*$/.test(surface.id ?? ""),
    `Surface id ${String(surface.id)} is invalid.`,
  );
  assert(!surfaceIds.has(surface.id), `Duplicate surface id: ${surface.id}.`);
  surfaceIds.add(surface.id);
  assert(isNonEmptyString(surface.label), `Surface ${surface.id} needs a label.`);
  assert(
    allowedSurfaceKinds.has(surface.kind),
    `Surface ${surface.id} has invalid kind ${String(surface.kind)}.`,
  );
  assert(
    isNonEmptyStringArray(surface.routes),
    `Surface ${surface.id} needs unique routes.`,
  );
}

for (const interaction of interactions) {
  const label = interaction.id ?? "<missing id>";
  assert(
    /^INT-[A-Z]+-\d{3}$/.test(label),
    `Interaction id ${String(label)} must match INT-<DOMAIN>-NNN.`,
  );
  assert(!interactionIds.has(label), `Duplicate interaction id: ${label}.`);
  interactionIds.add(label);
  assert(isNonEmptyString(interaction.name), `${label} needs a name.`);
  assert(
    allowedStatuses.has(interaction.status),
    `${label} has invalid status ${String(interaction.status)}.`,
  );
  assert(isNonEmptyStringArray(interaction.surfaces), `${label} needs surfaces.`);
  for (const surfaceId of interaction.surfaces ?? []) {
    assert(surfaceIds.has(surfaceId), `${label} references unknown surface ${surfaceId}.`);
  }
  assert(isNonEmptyStringArray(interaction.routes), `${label} needs routes.`);
  assert(
    Array.isArray(interaction.journeys) && interaction.journeys.length > 0,
    `${label} journeys must be a non-empty array.`,
  );
  for (const journey of interaction.journeys ?? []) {
    assert(/^J\d{2}$/.test(journey), `${label} has invalid journey id ${journey}.`);
  }
  assert(isNonEmptyString(interaction.intent), `${label} needs an intent.`);
  assert(
    Array.isArray(interaction.triggers) && interaction.triggers.length > 0,
    `${label} needs at least one trigger.`,
  );
  for (const trigger of interaction.triggers ?? []) {
    assert(
      allowedTriggerKinds.has(trigger.kind),
      `${label} has invalid trigger kind ${String(trigger.kind)}.`,
    );
    assert(isNonEmptyString(trigger.control), `${label} has a trigger without a control.`);
  }
  if (interaction.variants !== undefined) {
    assert(
      Array.isArray(interaction.variants) && interaction.variants.length > 0,
      `${label} variants must be a non-empty array when present.`,
    );
    const variantIds = new Set();
    for (const variant of interaction.variants ?? []) {
      assert(
        /^[a-z][a-z0-9_]*$/.test(variant.id ?? ""),
        `${label} has invalid variant id ${String(variant.id)}.`,
      );
      assert(!variantIds.has(variant.id), `${label} repeats variant ${variant.id}.`);
      variantIds.add(variant.id);
      assert(isNonEmptyString(variant.label), `${label} variant ${variant.id} needs a label.`);
      assert(isNonEmptyString(variant.result), `${label} variant ${variant.id} needs a result.`);
    }
  }
  assert(isNonEmptyString(interaction.availability), `${label} needs availability.`);
  assert(isNonEmptyString(interaction.success_result), `${label} needs a success result.`);
  assert(
    typeof interaction.failure_result === "string",
    `${label} failure_result must be a string.`,
  );
  assert(isNonEmptyStringArray(interaction.effects), `${label} needs effects.`);
  assert(allowedRisks.has(interaction.risk), `${label} has invalid risk ${interaction.risk}.`);
  assert(
    allowedConfirmations.has(interaction.confirmation),
    `${label} has invalid confirmation ${String(interaction.confirmation)}.`,
  );
  if (interaction.risk === "destructive") {
    assert(
      interaction.confirmation !== "none",
      `${label} is destructive and must declare a confirmation gate.`,
    );
  }
  assert(
    isNonEmptyStringArray(interaction.implementation),
    `${label} needs implementation references.`,
  );
  for (const reference of interaction.implementation ?? []) {
    const { file, symbol } = splitReference(reference);
    assert(exists(file), `${label} implementation file does not exist: ${file}.`);
    if (symbol && exists(file)) {
      assert(
        read(file).includes(symbol),
        `${label} implementation symbol ${symbol} is missing from ${file}.`,
      );
    }
  }
  const guidance = interaction.user_guidance;
  assert(
    guidance && typeof guidance === "object" && !Array.isArray(guidance),
    `${label} needs user_guidance.`,
  );
  if (guidance && typeof guidance === "object" && !Array.isArray(guidance)) {
    const expectedAudience = internalQaInteractionIds.has(label) ? "internal_qa" : "user";
    assert(
      guidance.audience === expectedAudience,
      `${label} user_guidance.audience must be ${expectedAudience}.`,
    );
    assert(
      isNonEmptyStringArray(guidance.references),
      `${label} user_guidance.references must be a unique non-empty string array.`,
    );

    for (const reference of Array.isArray(guidance.references)
      ? guidance.references
      : []) {
      if (!isNonEmptyString(reference)) continue;
      const { file, symbol: anchor } = splitReference(reference);
      assert(
        /^docs\/user-guide\/[^/#]+\.md$/.test(file) && !file.includes(".."),
        `${label} user guidance must use a docs/user-guide/*.md#anchor reference: ${reference}.`,
      );
      assert(isNonEmptyString(anchor), `${label} user guidance needs an anchor: ${reference}.`);
      assert(exists(file), `${label} user guidance file does not exist: ${file}.`);
      if (expectedAudience === "internal_qa") {
        assert(
          file === `${userGuideDirectory}/internal-qa.md`,
          `${label} internal QA guidance must stay in ${userGuideDirectory}/internal-qa.md.`,
        );
      } else {
        assert(
          file !== `${userGuideDirectory}/internal-qa.md`,
          `${label} user guidance must not point to the internal QA appendix.`,
        );
      }
      if (exists(file) && isNonEmptyString(anchor)) {
        assert(
          markdownHeadingAnchors(file).has(anchor),
          `${label} user guidance anchor does not resolve: ${reference}.`,
        );
      }
    }
  }
  const coverage = interaction.test_coverage;
  assert(coverage && typeof coverage === "object", `${label} needs test_coverage.`);
  if (coverage && typeof coverage === "object") {
    assert(
      allowedCoverageLevels.has(coverage.level),
      `${label} has invalid test coverage level ${String(coverage.level)}.`,
    );
    assert(Array.isArray(coverage.references), `${label} test references must be an array.`);
    assert(typeof coverage.notes === "string", `${label} test coverage notes must be a string.`);
    if (coverage.level === "direct" || coverage.level === "indirect") {
      assert(
        coverage.references.length > 0,
        `${label} ${coverage.level} test coverage needs at least one reference.`,
      );
    }
    for (const reference of coverage.references ?? []) {
      const { file, symbol } = splitReference(reference);
      assert(exists(file), `${label} test reference does not exist: ${file}.`);
      if (symbol && exists(file)) {
        assert(
          read(file).includes(symbol),
          `${label} test symbol ${symbol} is missing from ${file}.`,
        );
      }
    }
  }
}

for (const source of sourceInventory) {
  assert(isNonEmptyString(source.path), "Every source_inventory entry needs a path.");
  assert(!sourcePaths.has(source.path), `Duplicate source_inventory path: ${source.path}.`);
  sourcePaths.add(source.path);
  assert(exists(source.path), `Interactive source does not exist: ${source.path}.`);
  assert(
    Number.isInteger(source.interaction_marker_count) &&
      source.interaction_marker_count > 0,
    `${source.path} interaction_marker_count must be a positive integer.`,
  );
  if (exists(source.path)) {
    const actualMarkerCount = interactionMarkerCount(read(source.path));
    assert(
      source.interaction_marker_count === actualMarkerCount,
      `${source.path} interaction marker count changed: registry=${String(
        source.interaction_marker_count,
      )}, source=${actualMarkerCount}. Review its interaction ids and update the registry count.`,
    );
  }
  assert(
    source.classification === "cataloged" || source.classification === "excluded",
    `${source.path} has invalid classification ${String(source.classification)}.`,
  );
  assert(Array.isArray(source.interaction_ids), `${source.path} interaction_ids must be an array.`);
  if (source.classification === "cataloged") {
    assert(
      source.interaction_ids.length > 0,
      `${source.path} is cataloged but has no interaction ids.`,
    );
  } else {
    assert(
      source.interaction_ids.length === 0,
      `${source.path} is excluded and must not list interaction ids.`,
    );
    assert(isNonEmptyString(source.reason), `${source.path} exclusion needs a reason.`);
  }
  for (const interactionId of source.interaction_ids ?? []) {
    assert(
      interactionIds.has(interactionId),
      `${source.path} references unknown interaction ${interactionId}.`,
    );
  }
}

const inventoriedInteractionIds = new Set(
  sourceInventory.flatMap((source) => source.interaction_ids ?? []),
);
for (const interactionId of interactionIds) {
  assert(
    inventoriedInteractionIds.has(interactionId),
    `${interactionId} is not linked from source_inventory.`,
  );
}

const scannedSources = interactiveSourceFiles();
for (const scannedSource of scannedSources) {
  assert(
    sourcePaths.has(scannedSource),
    `Interactive source is missing from source_inventory: ${scannedSource}.`,
  );
}
for (const sourcePath of sourcePaths) {
  assert(
    scannedSources.includes(sourcePath),
    `source_inventory path no longer contains a recognized interaction marker: ${sourcePath}.`,
  );
}

const journeyIds = [...read(journeyPath).matchAll(/^### (J\d{2})\b/gm)].map(
  (match) => match[1],
);
const knownJourneyIds = new Set(journeyIds);
const coveredJourneyIds = new Set(interactions.flatMap((interaction) => interaction.journeys));
for (const interaction of interactions) {
  for (const journey of interaction.journeys) {
    assert(
      knownJourneyIds.has(journey),
      `${interaction.id} references journey ${journey}, which is missing from ${journeyPath}.`,
    );
  }
}
for (const journeyId of journeyIds) {
  assert(
    coveredJourneyIds.has(journeyId),
    `${journeyId} has no interaction in ${registryPath}.`,
  );
}

report();

function report() {
  if (failures.length > 0) {
    console.error(`interactions:check failed with ${failures.length} issue(s):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(
    `interactions:check passed (${assertions} invariants, ${interactions.length} interactions, ${sourceInventory.length} interaction sources).`,
  );
  process.exit(0);
}
