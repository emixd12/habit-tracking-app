import { describe, expect, it } from "vitest";
import {
  APP_NAV_ITEMS,
  DEFAULT_APP_ROUTE,
  isProtectedAppRoute,
} from "../lib/navigation";

describe("app navigation", () => {
  it("uses the documented primary screens", () => {
    expect(APP_NAV_ITEMS.map((item) => item.label)).toEqual([
      "Timeline",
      "Behaviors",
      "Analytics",
      "Export",
      "Settings",
    ]);
  });

  it("keeps Timeline as the default app route", () => {
    expect(DEFAULT_APP_ROUTE).toBe("/timeline");
  });

  it("does not introduce a dashboard route", () => {
    expect(APP_NAV_ITEMS.map((item) => item.href)).not.toContain("/dashboard");
  });

  it("treats documented app routes as protected", () => {
    expect(isProtectedAppRoute("/timeline")).toBe(true);
    expect(isProtectedAppRoute("/timeline/day")).toBe(true);
    expect(isProtectedAppRoute("/login")).toBe(false);
    expect(isProtectedAppRoute("/auth/callback")).toBe(false);
  });
});
