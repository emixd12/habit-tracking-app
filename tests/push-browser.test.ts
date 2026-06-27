import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getBrowserPushSupport,
  readBrowserPushSubscriptionStatus,
  requestNotificationPermission,
  urlBase64ToUint8Array,
} from "../lib/push/browser";

const originalNotification = globalThis.Notification;
const originalNavigator = globalThis.navigator;
const originalWindow = globalThis.window;

describe("browser push helpers", () => {
  afterEach(() => {
    if (originalNotification === undefined) {
      Reflect.deleteProperty(globalThis, "Notification");
    } else {
      Object.defineProperty(globalThis, "Notification", {
        configurable: true,
        value: originalNotification,
      });
    }

    if (originalNavigator === undefined) {
      Reflect.deleteProperty(globalThis, "navigator");
    } else {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: originalNavigator,
      });
    }

    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
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

  it("reads a saved browser push subscription without creating a new one", async () => {
    const getSubscription = vi.fn().mockResolvedValue({
      endpoint: "https://push.example.com/subscription",
    });
    const getRegistration = vi.fn().mockResolvedValue({
      pushManager: {
        getSubscription,
      },
    });

    mockSupportedBrowser({
      permission: "granted",
      getRegistration,
    });

    await expect(
      readBrowserPushSubscriptionStatus("public-key"),
    ).resolves.toBe("saved");
    expect(getRegistration).toHaveBeenCalledTimes(1);
    expect(getSubscription).toHaveBeenCalledTimes(1);
  });

  it("treats granted permission without a current subscription as missing", async () => {
    const getSubscription = vi.fn().mockResolvedValue(null);
    const getRegistration = vi.fn().mockResolvedValue({
      pushManager: {
        getSubscription,
      },
    });

    mockSupportedBrowser({
      permission: "granted",
      getRegistration,
    });

    await expect(
      readBrowserPushSubscriptionStatus("public-key"),
    ).resolves.toBe("missing");
  });
});

function mockSupportedBrowser(input: {
  permission: NotificationPermission;
  getRegistration: () => Promise<unknown>;
}) {
  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    value: {
      permission: input.permission,
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      Notification: {},
      PushManager: function PushManager() {},
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      serviceWorker: {
        getRegistration: input.getRegistration,
      },
    },
  });
}
