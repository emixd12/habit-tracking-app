import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getBrowserPushSupport,
  requestNotificationPermission,
  urlBase64ToUint8Array,
} from "../lib/push/browser";

const originalNotification = globalThis.Notification;

describe("browser push helpers", () => {
  afterEach(() => {
    if (originalNotification === undefined) {
      Reflect.deleteProperty(globalThis, "Notification");
      return;
    }

    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: originalNotification,
    });
  });

  it("detects missing public VAPID configuration before browser support checks", () => {
    expect(getBrowserPushSupport(" ")).toEqual({
      supported: false,
      reason: "missing_public_key",
    });
  });

  it("reports notification support as unavailable outside the browser", () => {
    expect(getBrowserPushSupport("public-key")).toEqual({
      supported: false,
      reason: "notifications_unavailable",
    });
  });

  it("converts base64url VAPID keys into bytes", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID"))).toEqual([1, 2, 3]);
    expect(Array.from(urlBase64ToUint8Array("_w"))).toEqual([255]);
  });

  it("returns the browser permission result from the request prompt", async () => {
    const requestPermission = vi.fn().mockResolvedValue("default");

    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: {
        requestPermission,
      },
    });

    await expect(requestNotificationPermission()).resolves.toBe("default");
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });
});
