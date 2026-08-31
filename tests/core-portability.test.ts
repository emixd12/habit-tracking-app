import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";

function checkFixture(source: string, config: Record<string, unknown> = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "cadence-core-boundary-"));
  try {
    mkdirSync(path.join(directory, "src"));
    writeFileSync(path.join(directory, "src/index.ts"), source);
    writeFileSync(path.join(directory, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "ES2024", lib: ["ES2024"], types: [], strict: true,
        module: "ESNext", moduleResolution: "Bundler", noEmit: true, ...config,
      },
      include: ["src/**/*.ts"],
    }));
    const result = spawnSync(process.execPath, [
      "scripts/check-core-portability.mjs", "--core-root", directory,
    ], { encoding: "utf8" });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("core boundary accepts portable code but rejects runtime and ambient dependency escapes", () => {
  expect(checkFixture("export const normalize = (value: string) => value.trim();").status).toBe(0);
  for (const source of [
    'import { createHash } from "node:crypto"; export { createHash };',
    'export * from "../../../lib/db/behaviors.repo";',
    'export type Row = import("@supabase/supabase-js").User;',
    'export const load = () => import("@tauri-apps/api/core");',
    'export const load = (name: string) => import(name);',
    'export const env = (globalThis as any).process.env;',
  ]) {
    const result = checkFixture(source);
    expect(result.status, source).toBe(1);
    expect(result.output).toMatch(/core import|dynamic import|globalThis/i);
  }
  const browser = checkFixture('export const value = document.title;');
  expect(browser.status).toBe(1);
  expect(browser.output).toMatch(/document/);
  const weakened = checkFixture('export const value = document.title;', { lib: ["ES2024", "DOM"] });
  expect(weakened.status).toBe(1);
  expect(weakened.output).toMatch(/DOM/);
  const ambient = checkFixture('/// <reference lib="dom" />\nexport type Payload = FormData;');
  expect(ambient.status).toBe(1);
  expect(ambient.output).toMatch(/ambient/);
  const clock = checkFixture('export const now = Date.now();');
  expect(clock.status).toBe(1);
  expect(clock.output).toMatch(/injected instant/);
}, 20_000);
