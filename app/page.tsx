import { redirect } from "next/navigation";
import {
  buildLoginPath,
  LOGIN_ROUTE,
  MISSING_CONFIG_ERROR,
} from "@/lib/auth/redirects";
import { DEFAULT_APP_ROUTE } from "@/lib/navigation";
import { readSupabaseRuntimeConfig } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!readSupabaseRuntimeConfig()) {
    redirect(buildLoginPath(DEFAULT_APP_ROUTE, MISSING_CONFIG_ERROR));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? DEFAULT_APP_ROUTE : LOGIN_ROUTE);
}
