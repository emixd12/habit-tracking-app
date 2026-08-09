import { renderToStaticMarkup } from "react-dom/server";

import { afterEach, describe, expect, it, vi } from "vitest";

import LoginPage from "../app/(auth)/login/page";

describe("login interaction controls", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders Google sign-in and the public account-information links", async () => {
    stubConfiguredSupabase();

    const html = renderToStaticMarkup(
      await LoginPage({
        searchParams: Promise.resolve({ next: "/settings" }),
      }),
    );

    expect(html).toContain("Continue with Google");
    expect(html).toContain('href="/auth/google?next=%2Fsettings"');
    expect(html).toContain('width="1em"');
    expect(html).toContain('height="1em"');
    expect(html).toContain('stroke-width="1.5"');
    expect(html).not.toContain("Google sign-in only.");
    expect(html).not.toContain("Cadence never sees or stores a password.");
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/trust"');
    expect(html).toContain("How Cadence works →");
  });

  it("renders the temporary-user interaction only when its local QA gate is enabled", async () => {
    stubConfiguredSupabase();
    vi.stubEnv("CADENCE_ENABLE_TEST_LOGIN", "1");

    const html = renderToStaticMarkup(
      await LoginPage({
        searchParams: Promise.resolve({ next: "/timeline" }),
      }),
    );

    expect(html).toContain("Continue as temporary test user");
    expect(html).toContain('href="/auth/test-login?next=%2Ftimeline"');
  });
});

function stubConfiguredSupabase() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
}
