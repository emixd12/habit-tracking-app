import { describe, expect, it } from "vitest";

import {
  buildMonitoringErrorEvent,
  buildMonitoringEvent,
  sanitizeMonitoringContext,
} from "@/lib/monitoring/privacy-safe-events";

describe("privacy-safe monitoring events", () => {
  it("keeps operational context and removes sensitive payload fields", () => {
    const context = sanitizeMonitoringContext({
      route: "/api/reminders/process",
      method: "POST",
      checked: 3,
      sent: 2,
      behavior_title: "Brush teeth",
      note: "Private note body",
      endpoint: "https://push.example/subscription",
      email: "person@example.com",
      payload: '{"body":"private"}',
    });

    expect(context).toEqual({
      route: "/api/reminders/process",
      method: "POST",
      checked: 3,
      sent: 2,
    });
  });

  it("redacts email-shaped values even when the key is generic", () => {
    expect(
      sanitizeMonitoringContext({
        route: "/settings",
        value: "person@example.com",
      }),
    ).toEqual({
      route: "/settings",
      value: "[redacted]",
    });
  });

  it("bounds long context strings", () => {
    const event = buildMonitoringEvent({
      name: "long_value",
      context: {
        route: `/api/${"x".repeat(200)}`,
      },
    });

    expect(String(event.context.route)).toHaveLength(120);
    expect(String(event.context.route).endsWith("...")).toBe(true);
  });

  it("reports error type without the error message", () => {
    const event = buildMonitoringErrorEvent({
      name: "route_failed",
      error: new TypeError("Brush teeth failed for person@example.com"),
      context: {
        route: "/timeline",
      },
    });
    const serialized = JSON.stringify(event);

    expect(event).toMatchObject({
      source: "cadence",
      name: "route_failed",
      severity: "error",
      context: {
        route: "/timeline",
        error_name: "TypeError",
      },
    });
    expect(serialized).not.toContain("Brush teeth");
    expect(serialized).not.toContain("person@example.com");
  });
});
