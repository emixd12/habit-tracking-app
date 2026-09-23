// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { readBrowserForegroundLocation, validateForegroundLocation } from "@/lib/ui/foreground-location";

afterEach(() => { vi.restoreAllMocks(); });

function mockGeolocation(error: { code: number }) {
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "granted" }) } });
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
    getCurrentPosition: (_ok: unknown, fail: (value: { code: number }) => void) => fail(error),
  } });
}

it("reports insecure_context outside a secure context", async () => {
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: vi.fn() } });
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
  await expect(readBrowserForegroundLocation(true)).resolves.toEqual({ state: "unavailable", reason: "insecure_context" });
});

it("reports timeout and position error reasons", async () => {
  mockGeolocation({ code: 3 });
  await expect(readBrowserForegroundLocation(true)).resolves.toEqual({ state: "unavailable", reason: "timeout" });
  mockGeolocation({ code: 2 });
  await expect(readBrowserForegroundLocation(true)).resolves.toEqual({ state: "unavailable", reason: "position_error_2" });
});

it("keeps native reasons on unavailable and denied only", () => {
  expect(validateForegroundLocation({ state: "unavailable", reason: "services_off" }, 0)).toEqual({ state: "unavailable", reason: "services_off" });
  expect(validateForegroundLocation({ state: "prompt", reason: "x" }, 0)).toEqual({ state: "prompt" });
});
