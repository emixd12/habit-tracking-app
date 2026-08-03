import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const DEFAULT_REGISTRY_PATH = "interaction-registry.json";
const DEFAULT_MANIFEST_PATH = "load-tests/scenarios/interaction-map.json";
const CLASSIFICATIONS = new Set([
  "loadable_http",
  "browser_only",
  "external_provider",
  "destructive_serial_only",
  "not_load_bearing",
]);
const HTTP_METHODS = new Set(["GET", "POST"]);
const EXPECTED_RESULTS = new Set([
  "public_document",
  "protected_document",
  "structured_export",
  "server_action_success",
]);
const ENVIRONMENTS = new Set([
  "local",
  "hosted_staging",
  "hosted_production",
]);
const ENTRY_KEYS = new Set([
  "id",
  "classification",
  "reason",
  "requests",
]);
const REQUEST_KEYS = new Set([
  "name",
  "route",
  "method",
  "expected_result",
  "environments",
  "data_preconditions",
  "cleanup_owner",
  "profiles",
]);
const FORBIDDEN_REGISTRY_PROSE_KEYS = new Set([
  "name",
  "intent",
  "risk",
  "effects",
  "success_result",
  "failure_result",
  "availability",
  "user_guidance",
]);

export function validateLoadTestManifest({
  registry,
  manifest,
  registryPath = DEFAULT_REGISTRY_PATH,
  manifestPath = DEFAULT_MANIFEST_PATH,
}) {
  const failures = [];
  let assertions = 0;

  function assert(condition, message) {
    assertions += 1;
    if (!condition) failures.push(message);
  }

  assert(
    manifest?.schema_version === "1.0.0",
    `${manifestPath} schema_version must be 1.0.0.`,
  );
  assert(
    manifest?.registry_id === registry?.registry_id,
    `${manifestPath} registry_id must match ${registryPath}.`,
  );
  assert(
    manifest?.registry_schema_version === registry?.schema_version,
    `${manifestPath} registry_schema_version must match ${registryPath}.`,
  );
  assert(
    Array.isArray(manifest?.entries),
    `${manifestPath} entries must be an array.`,
  );
  assert(
    Array.isArray(registry?.interactions),
    `${registryPath} interactions must be an array.`,
  );

  const registryInteractions = Array.isArray(registry?.interactions)
    ? registry.interactions
    : [];
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  const registryById = new Map(
    registryInteractions.map((interaction) => [interaction.id, interaction]),
  );
  const seenIds = new Set();
  const requestNames = new Set();

  for (const entry of entries) {
    const id = entry?.id ?? "<missing id>";
    assert(
      typeof entry?.id === "string" && entry.id.length > 0,
      `${manifestPath} has an entry without an id.`,
    );
    assert(!seenIds.has(id), `${manifestPath} has duplicate id ${id}.`);
    seenIds.add(id);
    assert(registryById.has(id), `${manifestPath} has unknown id ${id}.`);
    assert(
      CLASSIFICATIONS.has(entry?.classification),
      `${id} has invalid load classification ${String(entry?.classification)}.`,
    );

    for (const key of Object.keys(entry ?? {})) {
      assert(
        ENTRY_KEYS.has(key) && !FORBIDDEN_REGISTRY_PROSE_KEYS.has(key),
        `${id} has unsupported or registry-owned field ${key}.`,
      );
    }

    const registryInteraction = registryById.get(id);
    const isDestructive =
      registryInteraction?.risk === "destructive" ||
      registryInteraction?.effects?.includes("destructive_data_change") ||
      registryInteraction?.effects?.includes("database_delete");

    if (isDestructive) {
      assert(
        entry?.classification === "destructive_serial_only",
        `${id} is destructive and must be destructive_serial_only.`,
      );
    }

    if (entry?.classification === "loadable_http") {
      assert(
        !isDestructive,
        `${id} is destructive and cannot be loadable_http.`,
      );
      assert(
        !Object.hasOwn(entry, "reason"),
        `${id} is loadable_http and must describe requests instead of a reason.`,
      );
      assert(
        Array.isArray(entry?.requests) && entry.requests.length > 0,
        `${id} is loadable_http and needs at least one request.`,
      );

      for (const request of entry?.requests ?? []) {
        for (const key of Object.keys(request ?? {})) {
          assert(
            REQUEST_KEYS.has(key),
            `${id} request has unsupported field ${key}.`,
          );
        }

        assert(
          typeof request?.name === "string" &&
            request.name.startsWith(`${id} ${request?.method ?? ""} `),
          `${id} request names must start with the interaction id and method.`,
        );
        assert(
          !requestNames.has(request?.name),
          `${manifestPath} has duplicate request name ${String(request?.name)}.`,
        );
        requestNames.add(request?.name);
        assert(
          typeof request?.route === "string" &&
            request.route.startsWith("/") &&
            !/[\r\n]/.test(request.route),
          `${id} request route must be a repository-relative HTTP path.`,
        );
        assert(
          HTTP_METHODS.has(request?.method),
          `${id} request method must be GET or POST.`,
        );
        assert(
          EXPECTED_RESULTS.has(request?.expected_result),
          `${id} request has invalid expected_result ${String(
            request?.expected_result,
          )}.`,
        );
        assert(
          isUniqueStringArray(request?.environments) &&
            request.environments.every((value) => ENVIRONMENTS.has(value)),
          `${id} request environments must be unique known safety levels.`,
        );
        assert(
          isUniqueStringArray(request?.data_preconditions),
          `${id} request needs explicit data_preconditions.`,
        );
        assert(
          typeof request?.cleanup_owner === "string" &&
            request.cleanup_owner.trim().length > 0,
          `${id} request needs cleanup_owner.`,
        );
        assert(
          isUniqueStringArray(request?.profiles),
          `${id} request needs one or more named profiles.`,
        );
        assert(
          !request?.profiles?.includes("ordinary_mixed") || !isDestructive,
          `${id} destructive requests cannot enter ordinary_mixed.`,
        );
      }
    } else {
      assert(
        typeof entry?.reason === "string" && entry.reason.trim().length > 0,
        `${id} non-loadable entries need a reason.`,
      );
      assert(
        !Object.hasOwn(entry, "requests"),
        `${id} non-loadable entries cannot define requests.`,
      );

      if (registryInteraction) {
        const registryProse = [
          registryInteraction.name,
          registryInteraction.intent,
          registryInteraction.success_result,
          registryInteraction.failure_result,
          registryInteraction.availability,
        ].filter((value) => typeof value === "string");
        assert(
          !registryProse.includes(entry.reason),
          `${id} reason duplicates canonical registry prose.`,
        );
      }
    }
  }

  for (const interaction of registryInteractions) {
    assert(
      seenIds.has(interaction.id),
      `${manifestPath} is missing ${interaction.id}.`,
    );
  }
  assert(
    entries.length === registryInteractions.length,
    `${manifestPath} must contain exactly one entry per live interaction.`,
  );

  return {
    assertions,
    interactionCount: registryInteractions.length,
    loadableCount: entries.filter(
      (entry) => entry.classification === "loadable_http",
    ).length,
    failures,
  };
}

function isUniqueStringArray(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) => typeof item === "string" && item.trim().length > 0,
    ) &&
    new Set(value).size === value.length
  );
}

function readJson(relativeOrAbsolutePath) {
  const absolutePath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(root, relativeOrAbsolutePath);
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

function parseArgs(argv) {
  const options = {
    registryPath: DEFAULT_REGISTRY_PATH,
    manifestPath: DEFAULT_MANIFEST_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--registry" && argv[index + 1]) {
      options.registryPath = argv[index + 1];
      index += 1;
    } else if (value === "--manifest" && argv[index + 1]) {
      options.manifestPath = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${value}`);
    }
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = validateLoadTestManifest({
    registry: readJson(options.registryPath),
    manifest: readJson(options.manifestPath),
    registryPath: options.registryPath,
    manifestPath: options.manifestPath,
  });

  if (result.failures.length > 0) {
    console.error(
      `load interaction check failed with ${result.failures.length} issue(s):`,
    );
    for (const failure of result.failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(
    `load interaction check passed (${result.assertions} invariants, ${result.interactionCount} interactions, ${result.loadableCount} loadable).`,
  );
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(
      `load interaction check failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  }
}
