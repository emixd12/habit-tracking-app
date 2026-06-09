import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
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

process.exit(result.status ?? 1);
