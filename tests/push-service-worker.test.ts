import { readFileSync } from "node:fs";
import vm from "node:vm";

import { describe, expect, it, vi } from "vitest";

type ServiceWorkerEventHandler = (event: NotificationClickTestEvent) => void;

type NotificationClickTestEvent = {
  notification: {
    close: () => void;
    data?: {
      url?: string;
    };
  };
  waitUntil: (promise: Promise<unknown>) => void;
};

describe("push service worker", () => {
  it("navigates an existing Cadence tab to the notification target before focusing it", async () => {
    const listeners = new Map<string, ServiceWorkerEventHandler>();
    const focused = vi.fn();
    const navigatedFocus = vi.fn();
    const navigate = vi.fn().mockResolvedValue({
      focus: navigatedFocus,
    });
    const matchAll = vi.fn().mockResolvedValue([
      {
        url: "https://cadence.example/settings",
        navigate,
        focus: focused,
      },
    ]);
    const openWindow = vi.fn();
    const selfMock = {
      addEventListener: (
        eventName: string,
        handler: ServiceWorkerEventHandler,
      ) => {
        listeners.set(eventName, handler);
      },
      clients: {
        matchAll,
        openWindow,
      },
      location: {
        origin: "https://cadence.example",
      },
      registration: {
        showNotification: vi.fn(),
      },
    };
    const source = readFileSync("public/push-service-worker.js", "utf8");

    vm.runInNewContext(source, {
      self: selfMock,
      URL,
    });

    const waitUntil = vi.fn();
    const close = vi.fn();
    const clickHandler = listeners.get("notificationclick");

    expect(clickHandler).toBeDefined();

    clickHandler?.({
      notification: {
        close,
        data: {
          url: "/timeline?from=notification",
        },
      },
      waitUntil,
    });

    const [pendingWork] = waitUntil.mock.calls[0] ?? [];
    expect(pendingWork).toBeInstanceOf(Promise);
    await pendingWork;

    expect(close).toHaveBeenCalledTimes(1);
    expect(matchAll).toHaveBeenCalledWith({
      type: "window",
      includeUncontrolled: true,
    });
    expect(navigate).toHaveBeenCalledWith(
      "https://cadence.example/timeline?from=notification",
    );
    expect(navigatedFocus).toHaveBeenCalledTimes(1);
    expect(focused).not.toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
  });
});
