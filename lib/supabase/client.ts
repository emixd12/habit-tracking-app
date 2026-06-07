import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseRuntimeConfig } from "@/lib/supabase/env";

export function createClient() {
  const { url, publishableKey } = getSupabaseRuntimeConfig();

  return createBrowserClient(url, publishableKey);
}
