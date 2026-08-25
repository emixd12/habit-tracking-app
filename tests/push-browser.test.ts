import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getBrowserPushSupport,
  readCurrentBrowserPushEndpoint,
  readBrowserPushSubscriptionStatus,
  registerBrowserPushSubscription,
  requestNotificationPermission,
  urlBase64ToUint8Array,
} from "../lib/push/browser";

const originalNotification = globalThis.Notification;
const originalNavigator = globalThis.navigator;
const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;

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

    if (originalFetch === undefined) {
      Reflect.deleteProperty(globalThis, "fetch");
    } else {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: originalFetch,
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
    const unsubscribe = vi.fn();
    const getSubscription = vi.fn().mockResolvedValue({
      endpoint: "https://push.example.com/subscription",
      unsubscribe,
      toJSON: () => ({
        endpoint: "https://push.example.com/subscription",
        keys: {
          p256dh: "public-key",
          auth: "auth-key",
        },
      }),
    });
    const getRegistration = vi.fn().mockResolvedValue({
      pushManager: {
        getSubscription,
      },
    });
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ok: true,
        saved: true,
      }),
    });

    mockSupportedBrowser({
      permission: "granted",
      getRegistration,
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetch,
    });

    await expect(
      readBrowserPushSubscriptionStatus("public-key"),
    ).resolves.toBe("saved");
    expect(getRegistration).toHaveBeenCalledTimes(1);
    expect(getSubscription).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/push/subscribe",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          endpoint: "https://push.example.com/subscription",
          keys: {
            p256dh: "public-key",
            auth: "auth-key",
          },
        }),
      }),
    );
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it("reads an existing pre-change subscription endpoint for sign-out", async () => {
    const getRegistration = vi.fn().mockResolvedValue({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue({
          endpoint: "https://push.example.com/pre-change-device",
        }),
      },
    });

    mockSupportedBrowser({ permission: "granted", getRegistration });

    await expect(readCurrentBrowserPushEndpoint()).resolves.toBe(
      "https://push.example.com/pre-change-device",
    );
  });

  it("revokes a browser subscription that belongs to a different account", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const getSubscription = vi.fn().mockResolvedValue({
      endpoint: "https://push.example.com/prior-account",
      unsubscribe,
      toJSON: () => ({
        endpoint: "https://push.example.com/prior-account",
        keys: {
          p256dh: "prior-public-key",
          auth: "prior-auth-key",
        },
      }),
    });
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ok: true,
        saved: false,
      }),
    });

    mockSupportedBrowser({
      permission: "granted",
      getRegistration: vi.fn().mockResolvedValue({
        pushManager: {
          getSubscription,
        },
      }),
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetch,
    });

    await expect(
      readBrowserPushSubscriptionStatus("public-key"),
    ).resolves.toBe("missing");
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not report enabled when persisted ownership cannot be verified", async () => {
    const unsubscribe = vi.fn();
    const getSubscription = vi.fn().mockResolvedValue({
      endpoint: "https://push.example.com/subscription",
      unsubscribe,
      toJSON: () => ({
        endpoint: "https://push.example.com/subscription",
        keys: {
          p256dh: "public-key",
          auth: "auth-key",
        },
      }),
    });
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
    });

    mockSupportedBrowser({
      permission: "granted",
      getRegistration: vi.fn().mockResolvedValue({
        pushManager: {
          getSubscription,
        },
      }),
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetch,
    });

    await expect(
      readBrowserPushSubscriptionStatus("public-key"),
    ).resolves.toBe("missing");
    expect(unsubscribe).not.toHaveBeenCalled();
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

  it("waits for an active service worker before creating a subscription", async () => {
    const inactiveGetSubscription = vi.fn();
    const register = vi.fn().mockResolvedValue({
      pushManager: {
        getSubscription: inactiveGetSubscription,
      },
    });
    const getSubscription = vi.fn().mockResolvedValue(null);
    const subscribe = vi.fn().mockResolvedValue({
      toJSON: () => ({
        endpoint: "https://push.example.com/subscription",
        keys: {
          p256dh: "public-key",
          auth: "auth-key",
        },
      }),
    });
    const fetch = vi.fn().mockResolvedValue({ ok: true });

    mockSupportedBrowser({
      permission: "granted",
      getRegistration: vi.fn(),
      register,
      ready: Promise.resolve({
        pushManager: {
          getSubscription,
          subscribe,
        },
      }),
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetch,
    });

    await registerBrowserPushSubscription("AQID");

    expect(register).toHaveBeenCalledWith("/push-service-worker.js");
    expect(inactiveGetSubscription).not.toHaveBeenCalled();
    expect(getSubscription).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: expect.any(Uint8Array),
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/push/subscribe",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("replaces stale browser state before saving for the current account", async () => {
    const unsubscribeStale = vi.fn().mockResolvedValue(true);
    const existingSubscription = {
      endpoint: "https://push.example.com/prior-account",
      unsubscribe: unsubscribeStale,
      toJSON: () => ({
        endpoint: "https://push.example.com/prior-account",
        keys: {
          p256dh: "prior-public-key",
          auth: "prior-auth-key",
        },
      }),
    };
    const unsubscribeFresh = vi.fn();
    const freshSubscription = {
      endpoint: "https://push.example.com/current-account",
      unsubscribe: unsubscribeFresh,
      toJSON: () => ({
        endpoint: "https://push.example.com/current-account",
        keys: {
          p256dh: "current-public-key",
          auth: "current-auth-key",
        },
      }),
    };
    const getSubscription = vi.fn().mockResolvedValue(existingSubscription);
    const subscribe = vi.fn().mockResolvedValue(freshSubscription);
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return {
          ok: true,
          json: vi.fn().mockResolvedValue({ ok: true, saved: false }),
        };
      }

      return { ok: true };
    });

    mockSupportedBrowser({
      permission: "granted",
      getRegistration: vi.fn(),
      register: vi.fn().mockResolvedValue({}),
      ready: Promise.resolve({
        pushManager: {
          getSubscription,
          subscribe,
        },
      }),
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetch,
    });

    await registerBrowserPushSubscription("AQID");

    expect(unsubscribeStale).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/push/subscribe",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(freshSubscription.toJSON()),
      }),
    );
    expect(unsubscribeFresh).not.toHaveBeenCalled();
  });

  it("stops safely when the previous account subscription cannot be removed", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(false);
    const subscribe = vi.fn();
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true, saved: false }),
    });

    mockSupportedBrowser({
      permission: "granted",
      getRegistration: vi.fn(),
      register: vi.fn().mockResolvedValue({}),
      ready: Promise.resolve({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue({
            endpoint: "https://push.example.com/prior-account",
            unsubscribe,
            toJSON: () => ({
              endpoint: "https://push.example.com/prior-account",
              keys: {
                p256dh: "prior-public-key",
                auth: "prior-auth-key",
              },
            }),
          }),
          subscribe,
        },
      }),
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetch,
    });

    await expect(registerBrowserPushSubscription("AQID")).rejects.toThrow(
      "Browser notification setup could not replace the previous account subscription.",
    );
    expect(subscribe).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("removes a fresh subscription when a reissued endpoint collides with the prior active owner", async () => {
    const unsubscribeStale = vi.fn().mockResolvedValue(true);
    const unsubscribeFresh = vi.fn().mockResolvedValue(true);
    const endpoint = "https://push.example.com/reissued-endpoint";
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return {
          ok: true,
          json: vi.fn().mockResolvedValue({ ok: true, saved: false }),
        };
      }

      return {
        ok: false,
        status: 500,
      };
    });

    mockSupportedBrowser({
      permission: "granted",
      getRegistration: vi.fn(),
      register: vi.fn().mockResolvedValue({}),
      ready: Promise.resolve({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue({
            endpoint,
            unsubscribe: unsubscribeStale,
            toJSON: () => ({
              endpoint,
              keys: {
                p256dh: "prior-public-key",
                auth: "prior-auth-key",
              },
            }),
          }),
          subscribe: vi.fn().mockResolvedValue({
            endpoint,
            unsubscribe: unsubscribeFresh,
            toJSON: () => ({
              endpoint,
              keys: {
                p256dh: "fresh-public-key",
                auth: "fresh-auth-key",
              },
            }),
          }),
        },
      }),
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetch,
    });

    await expect(registerBrowserPushSubscription("AQID")).rejects.toThrow(
      "Browser notification setup could not be saved.",
    );
    expect(unsubscribeStale).toHaveBeenCalledTimes(1);
    expect(unsubscribeFresh).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("lets a second account reuse an endpoint after sign-out deactivates the prior row", async () => {
    const endpoint = "https://push.example.com/reissued-endpoint";
    const unsubscribePrior = vi.fn().mockResolvedValue(true);
    const unsubscribeCurrent = vi.fn();
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return {
          ok: true,
          json: vi.fn().mockResolvedValue({ ok: true, saved: false }),
        };
      }

      return { ok: true };
    });

    mockSupportedBrowser({
      permission: "granted",
      getRegistration: vi.fn(),
      register: vi.fn().mockResolvedValue({}),
      ready: Promise.resolve({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue({
            endpoint,
            unsubscribe: unsubscribePrior,
            toJSON: () => ({
              endpoint,
              keys: { p256dh: "prior-public-key", auth: "prior-auth-key" },
            }),
          }),
          subscribe: vi.fn().mockResolvedValue({
            endpoint,
            unsubscribe: unsubscribeCurrent,
            toJSON: () => ({
              endpoint,
              keys: { p256dh: "current-public-key", auth: "current-auth-key" },
            }),
          }),
        },
      }),
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetch,
    });

    await expect(registerBrowserPushSubscription("AQID")).resolves.toBeUndefined();
    expect(unsubscribePrior).toHaveBeenCalledOnce();
    expect(unsubscribeCurrent).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/push/subscribe",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("removes a newly created browser subscription when persistence fails", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const subscribe = vi.fn().mockResolvedValue({
      endpoint: "https://push.example.com/subscription",
      unsubscribe,
      toJSON: () => ({
        endpoint: "https://push.example.com/subscription",
        keys: {
          p256dh: "public-key",
          auth: "auth-key",
        },
      }),
    });
    const fetch = vi.fn().mockResolvedValue({ ok: false });

    mockSupportedBrowser({
      permission: "granted",
      getRegistration: vi.fn(),
      register: vi.fn().mockResolvedValue({}),
      ready: Promise.resolve({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue(null),
          subscribe,
        },
      }),
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetch,
    });

    await expect(registerBrowserPushSubscription("AQID")).rejects.toThrow(
      "Browser notification setup could not be saved.",
    );
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

function mockSupportedBrowser(input: {
  permission: NotificationPermission;
  getRegistration: () => Promise<unknown>;
  register?: (url: string) => Promise<unknown>;
  ready?: Promise<unknown>;
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
        register: input.register,
        ready: input.ready,
      },
    },
  });
}
