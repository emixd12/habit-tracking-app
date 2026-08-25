import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseRuntimeConfig } from "@/lib/supabase/env";

export async function createClient() {
  const { url, publishableKey } = getSupabaseRuntimeConfig();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies; proxy.ts writes refreshed auth cookies.
        }
      },
    },
  });
}

export async function clearSupabaseAuthCookies(): Promise<void> {
  const cookieStore = await cookies();

  for (const cookie of cookieStore.getAll()) {
    if (!isSupabaseAuthCookie(cookie.name)) {
      continue;
    }

    cookieStore.set(cookie.name, "", {
      maxAge: 0,
      path: "/",
    });
  }
}

function isSupabaseAuthCookie(name: string): boolean {
  return name.startsWith("sb-") && name.includes("auth-token");
}
