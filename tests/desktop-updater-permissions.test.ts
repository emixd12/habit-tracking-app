import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("authorizes the separate native updater operations used by the adapter", () => {
  const capability = JSON.parse(readFileSync(new URL("../apps/desktop/src-tauri/capabilities/main.json", import.meta.url), "utf8"));
  expect(capability.permissions).toEqual(expect.arrayContaining([
    "updater:allow-check", "updater:allow-download", "updater:allow-install", "core:resources:allow-close",
  ]));
  expect(capability.permissions).not.toContain("updater:allow-download-and-install");
});
