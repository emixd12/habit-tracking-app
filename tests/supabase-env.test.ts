import { afterEach, describe, expect, it, vi } from "vitest";

import { readSupabaseRuntimeConfig } from "../lib/supabase/env";

describe("readSupabaseRuntimeConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the static Next public Supabase env variables", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", " http://127.0.0.1:55321 ");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", " publishable-key ");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    expect(readSupabaseRuntimeConfig()).toEqual({
      url: "http://127.0.0.1:55321",
      publishableKey: "publishable-key",
    });
  });

  it("falls back to the legacy anon key name", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    expect(readSupabaseRuntimeConfig()).toEqual({
      url: "http://127.0.0.1:55321",
      publishableKey: "anon-key",
    });
  });
});
