import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { createDesktopUpdater } from "./desktop-updater";

export const desktopUpdater = createDesktopUpdater({
  configuration: () => invoke("read_update_configuration"),
  async check() {
    const update = await check({ timeout: 30_000 });
    return update ? {
      version: update.version,
      body: update.body,
      downloadAndInstall: () => update.downloadAndInstall(undefined, { timeout: 300_000 }),
      close: () => update.close(),
    } : null;
  },
  restart: () => invoke("restart_after_update"),
});
