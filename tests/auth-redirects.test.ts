import { describe, expect, it } from "vitest";
import {
  buildLoginPath,
  MISSING_CONFIG_ERROR,
  normalizeRedirectPath,
} from "../lib/auth/redirects";

describe("auth redirects", () => {
  it("keeps safe local redirect paths", () => {
    expect(normalizeRedirectPath("/timeline?day=today")).toBe(
      "/timeline?day=today",
    );
  });

  it("rejects external redirect targets", () => {
    expect(normalizeRedirectPath("https://example.com")).toBe("/timeline");
    expect(normalizeRedirectPath("//example.com")).toBe("/timeline");
  });

  it("builds login paths with a sanitized next path and optional error", () => {
    expect(buildLoginPath("/behaviors", MISSING_CONFIG_ERROR)).toBe(
      "/login?next=%2Fbehaviors&error=missing_supabase_config",
    );
  });
});
