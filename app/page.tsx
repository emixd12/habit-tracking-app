import { redirect } from "next/navigation";
import {
  buildLoginPath,
  LOGIN_ROUTE,
  MISSING_CONFIG_ERROR,
} from "@/lib/auth/redirects";
import { getCurrentUser } from "@/lib/auth/current-user";
import { DEFAULT_APP_ROUTE } from "@/lib/navigation";
import { readSupabaseRuntimeConfig } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!readSupabaseRuntimeConfig()) {
    redirect(buildLoginPath(DEFAULT_APP_ROUTE, MISSING_CONFIG_ERROR));
  }

  const { user } = await getCurrentUser();

  redirect(user ? DEFAULT_APP_ROUTE : LOGIN_ROUTE);
}
