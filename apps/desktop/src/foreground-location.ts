import { invoke, isTauri } from "@tauri-apps/api/core";
import { validateForegroundLocation, type ForegroundLocation } from "@/lib/ui/foreground-location";

export async function readMacForegroundLocation(requestPermission = false): Promise<ForegroundLocation> {
  if (!isTauri() || document.hidden) return { state: "unavailable" };
  try {
    const value = await invoke<unknown>("foreground_location", { requestPermission });
    return document.hidden ? { state: "unavailable" } : validateForegroundLocation(value, Date.now());
  } catch { return { state: "unavailable" }; }
}
