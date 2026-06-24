import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const fallbackSkillDir = "/Users/emi/.codex/skills/design-system-bench";
const skillDir = process.env.DESIGN_SYSTEM_BENCH_SKILL_DIR || fallbackSkillDir;
const verifier = path.join(skillDir, "scripts", "verify_traceability.py");

if (!existsSync(verifier)) {
  console.error(
    `Design-system verifier not found at ${verifier}. Set DESIGN_SYSTEM_BENCH_SKILL_DIR to the design-system-bench skill directory.`,
  );
  process.exit(1);
}

const result = spawnSync(
  "python3",
  [
    verifier,
    "--root",
    ".",
    "--manifest",
    "design-system.manifest.json",
    "--usage",
    "design-system.usage.json",
    "--bench",
    "app/design-system/page.tsx",
    "--config",
    "design-system.config.json",
  ],
  {
    stdio: "inherit",
  },
);

const verifierStatus = result.status ?? 1;

if (verifierStatus !== 0) {
  process.exit(verifierStatus);
}

const surfaceCatalogStatus = validateSurfaceCatalog();

process.exit(surfaceCatalogStatus);

function validateSurfaceCatalog() {
  const catalogPath = "design-system.surfaces.json";
  const manifestPath = "design-system.manifest.json";

  if (!existsSync(catalogPath)) {
    console.error(`Surface catalog not found at ${catalogPath}.`);
    return 1;
  }

  const catalog = readJson(catalogPath);
  const manifest = readJson(manifestPath);
  const errors = [];

  if (catalog.schemaVersion !== 1) {
    errors.push("design-system.surfaces.json schemaVersion must be 1.");
  }

  if (!Array.isArray(catalog.surfaces) || catalog.surfaces.length === 0) {
    errors.push("design-system.surfaces.json must contain surfaces.");
  }

  if (
    !Array.isArray(catalog.componentFamilies) ||
    catalog.componentFamilies.length === 0
  ) {
    errors.push("design-system.surfaces.json must contain componentFamilies.");
  }

  const surfaceIds = new Set();

  for (const surface of catalog.surfaces ?? []) {
    if (!surface?.id) {
      errors.push("Every surface must have an id.");
      continue;
    }

    if (surfaceIds.has(surface.id)) {
      errors.push(`Duplicate surface id: ${surface.id}`);
    }

    surfaceIds.add(surface.id);
  }

  const componentIds = new Set(
    (manifest.components ?? []).map((component) => component.id),
  );
  const familyIds = new Set();

  for (const family of catalog.componentFamilies ?? []) {
    if (!family?.id) {
      errors.push("Every component family must have an id.");
      continue;
    }

    if (familyIds.has(family.id)) {
      errors.push(`Duplicate component family id: ${family.id}`);
    }

    familyIds.add(family.id);

    if (!Array.isArray(family.surfaceImplementations)) {
      errors.push(`${family.id} must contain surfaceImplementations.`);
      continue;
    }

    const mappedSurfaces = new Set();

    for (const implementation of family.surfaceImplementations) {
      if (!surfaceIds.has(implementation.surfaceId)) {
        errors.push(
          `${family.id} references unknown surface ${implementation.surfaceId}.`,
        );
      }

      if (mappedSurfaces.has(implementation.surfaceId)) {
        errors.push(
          `${family.id} maps ${implementation.surfaceId} more than once.`,
        );
      }

      mappedSurfaces.add(implementation.surfaceId);

      for (const source of implementation.sources ?? []) {
        if (isPlannedSource(source)) {
          continue;
        }

        if (!existsSync(source)) {
          errors.push(`${family.id} references missing source ${source}.`);
        }
      }

      for (const componentId of implementation.implementationIds ?? []) {
        if (!componentIds.has(componentId)) {
          errors.push(
            `${family.id} references unknown manifest component ${componentId}.`,
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error("Surface catalog validation failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    return 1;
  }

  console.log(
    `Surface catalog OK: ${surfaceIds.size} surfaces, ${familyIds.size} canonical families.`,
  );
  return 0;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function isPlannedSource(source) {
  return source.startsWith("apps/desktop") || source.startsWith("apps/mobile");
}
