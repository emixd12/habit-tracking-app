import { invoke, isTauri } from "@tauri-apps/api/core";
import { validateForegroundLocation, type ForegroundLocation } from "@/lib/ui/foreground-location";

export async function readMacForegroundLocation(requestPermission = false): Promise<ForegroundLocation> {
  if (!isTauri()) return { state: "unavailable", reason: "bridge" };
  if (document.hidden) return { state: "unavailable", reason: "hidden" };
  try {
    const value = await invoke<unknown>("foreground_location", { requestPermission });
    return document.hidden ? { state: "unavailable", reason: "hidden" } : validateForegroundLocation(value, Date.now());
  } catch { return { state: "unavailable", reason: "bridge" }; }
}
