"use client";

export type ForegroundLocation =
  | Readonly<{ state: "available"; latitude: number; longitude: number; accuracyMeters: number; sampledAt: number }>
  | Readonly<{ state: "prompt" | "denied" | "revoked" | "stale" | "inaccurate" | "unavailable" }>;

export function validateForegroundLocation(value: unknown, now: number): ForegroundLocation {
  if (!value || typeof value !== "object") return { state: "unavailable" };
  const row = value as Record<string, unknown>;
  if (row.state !== "available") return { state: row.state === "denied" || row.state === "prompt" || row.state === "revoked" ? row.state : "unavailable" };
  const { latitude, longitude, accuracyMeters, sampledAt } = row;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
    typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
    typeof sampledAt !== "number" || !Number.isFinite(sampledAt) || sampledAt > now ||
    typeof accuracyMeters !== "number" || !Number.isFinite(accuracyMeters) || accuracyMeters < 0) return { state: "unavailable" };
  if (now - sampledAt > 60_000) return { state: "stale" };
  if (accuracyMeters > 100) return { state: "inaccurate" };
  return { state: "available", latitude, longitude, accuracyMeters, sampledAt };
}

/** A new OS prompt is allowed only by the setup button. Samples are never retained here. */
export async function readBrowserForegroundLocation(requestPermission = false): Promise<ForegroundLocation> {
  if (typeof navigator === "undefined" || !navigator.geolocation || document.hidden || !document.hasFocus() || !window.isSecureContext) return { state: "unavailable" };
  let permission: PermissionStatus | null = null;
  try { permission = await navigator.permissions?.query({ name: "geolocation" }) ?? null; } catch { /* Some browsers omit Permissions API support. */ }
  if (permission?.state === "denied") return { state: "denied" };
  if (!requestPermission && permission?.state !== "granted") return { state: "prompt" };
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition((position) => {
      if (document.hidden || !document.hasFocus() || permission?.state === "denied") { resolve({ state: "revoked" }); return; }
      resolve(validateForegroundLocation({ state: "available", latitude: position.coords.latitude,
        longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy, sampledAt: position.timestamp }, Date.now()));
    }, (error) => resolve({ state: error.code === 1 ? "denied" : "unavailable" }),
    { enableHighAccuracy: false, maximumAge: 0, timeout: 12_000 });
  });
}
