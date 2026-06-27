import { describe, expect, it } from "vitest";

import { resolveFirstRunOnboardingModel } from "@/lib/services/onboarding-model";
import type {
  FirstRunOnboardingClientSnapshot,
  FirstRunOnboardingState,
} from "@/lib/types/onboarding";

const BASE_STATE = {
  hasAnyBehavior: false,
  hasImportRuns: false,
  timezone: "America/New_York",
  vapidPublicKey: "public-key",
} satisfies FirstRunOnboardingState;

const BASE_CLIENT = {
  dismissed: false,
  notificationPermission: "default",
  notificationSupported: true,
  notificationSubscriptionStatus: "missing",
  browserTimezone: "America/New_York",
} satisfies FirstRunOnboardingClientSnapshot;

describe("resolveFirstRunOnboardingModel", () => {
  it("shows setup while required first-run items remain incomplete", () => {
    const model = resolveFirstRunOnboardingModel(BASE_STATE, BASE_CLIENT);

    expect(model.shouldRender).toBe(true);
    expect(model.requiredComplete).toBe(false);
    expect(model.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "behavior",
          complete: false,
          statusLabel: "Start here",
          href: "/behaviors#create-behavior",
        }),
        expect.objectContaining({
          key: "notifications",
          complete: false,
          statusLabel: "Not enabled",
          href: "/settings#notifications",
        }),
        expect.objectContaining({
          key: "timezone",
          complete: true,
          statusLabel: "Confirmed",
          href: "/settings#timezone",
        }),
        expect.objectContaining({
          key: "import",
          complete: false,
          optional: true,
          statusLabel: "Optional",
          href: "/export#behaviorlog-import",
        }),
      ]),
    );
  });

  it("hides setup after required items are complete even when import is unused", () => {
    const model = resolveFirstRunOnboardingModel(
      {
        ...BASE_STATE,
        hasAnyBehavior: true,
      },
      {
        ...BASE_CLIENT,
        notificationPermission: "granted",
        notificationSubscriptionStatus: "saved",
      },
    );

    expect(model.requiredComplete).toBe(true);
    expect(model.shouldRender).toBe(false);
  });

  it("keeps setup visible on a new device without a saved subscription", () => {
    const model = resolveFirstRunOnboardingModel(
      {
        ...BASE_STATE,
        hasAnyBehavior: true,
      },
      {
        ...BASE_CLIENT,
        notificationPermission: "granted",
        notificationSubscriptionStatus: "missing",
      },
    );
    const notifications = model.items.find(
      (item) => item.key === "notifications",
    );

    expect(notifications).toMatchObject({
      complete: false,
      statusLabel: "Not enabled",
    });
    expect(model.requiredComplete).toBe(false);
    expect(model.shouldRender).toBe(true);
  });

  it("treats unavailable browser push as non-blocking", () => {
    const model = resolveFirstRunOnboardingModel(BASE_STATE, {
      ...BASE_CLIENT,
      notificationPermission: "unavailable",
      notificationSupported: false,
    });
    const notifications = model.items.find(
      (item) => item.key === "notifications",
    );

    expect(notifications).toMatchObject({
      complete: true,
      statusLabel: "Unavailable",
    });
  });

  it("treats blocked browser permission as a completed onboarding decision", () => {
    const model = resolveFirstRunOnboardingModel(
      {
        ...BASE_STATE,
        hasAnyBehavior: true,
      },
      {
        ...BASE_CLIENT,
        notificationPermission: "denied",
      },
    );
    const notifications = model.items.find(
      (item) => item.key === "notifications",
    );

    expect(notifications).toMatchObject({
      complete: true,
      statusLabel: "Blocked",
    });
    expect(model.requiredComplete).toBe(true);
    expect(model.shouldRender).toBe(false);
  });

  it("asks for timezone review when browser and saved timezones differ", () => {
    const model = resolveFirstRunOnboardingModel(BASE_STATE, {
      ...BASE_CLIENT,
      browserTimezone: "America/Los_Angeles",
    });
    const timezone = model.items.find((item) => item.key === "timezone");

    expect(timezone).toMatchObject({
      complete: false,
      statusLabel: "Review",
    });
  });

  it("respects local dismissal", () => {
    const model = resolveFirstRunOnboardingModel(BASE_STATE, {
      ...BASE_CLIENT,
      dismissed: true,
    });

    expect(model.shouldRender).toBe(false);
  });
});
