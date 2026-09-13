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
      download: (onEvent) => update.download((event) => {
        if (event.event === "Started") onEvent({ event: "started", contentLength: event.data.contentLength });
        else if (event.event === "Progress") onEvent({ event: "progress", chunkLength: event.data.chunkLength });
        else onEvent({ event: "finished" });
      }, { timeout: 300_000 }),
      install: () => update.install(),
      close: () => update.close(),
    } : null;
  },
  restart: () => invoke("restart_after_update"),
});
