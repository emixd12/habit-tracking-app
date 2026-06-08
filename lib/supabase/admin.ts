import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import type { Database } from "@/lib/db/database.types";
import { getSupabaseServiceRoleConfig } from "@/lib/supabase/env";

export function createServiceRoleClient(): AppSupabaseClient {
  const { url, serviceRoleKey } = getSupabaseServiceRoleConfig();

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
