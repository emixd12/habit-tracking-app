import { NextResponse, type NextRequest } from "next/server";

import { buildLoginPath, MISSING_CONFIG_ERROR } from "@/lib/auth/redirects";
import {
  createTestLoginCredentials,
  resolveTestLoginGate,
} from "@/lib/auth/test-login";
import {
  readSupabaseRuntimeConfig,
  readSupabaseServiceRoleConfig,
} from "@/lib/supabase/env";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const gate = resolveTestLoginGate(requestUrl);

  if (!gate.allowed) {
    return NextResponse.redirect(
      new URL(buildLoginPath(gate.nextPath, "test_login_unavailable"), request.url),
    );
  }

  if (!readSupabaseRuntimeConfig()) {
    return NextResponse.redirect(
      new URL(buildLoginPath(gate.nextPath, MISSING_CONFIG_ERROR), request.url),
    );
  }

  if (!readSupabaseServiceRoleConfig()) {
    return NextResponse.redirect(
      new URL(buildLoginPath(gate.nextPath, "test_login_unavailable"), request.url),
    );
  }

  const credentials = createTestLoginCredentials();
  const admin = createServiceRoleClient();
  const { data: createdUser, error: createError } =
    await admin.auth.admin.createUser({
      email: credentials.email,
      password: credentials.password,
      email_confirm: true,
      user_metadata: {
        name: "Cadence Test Login",
      },
    });

  if (createError || !createdUser.user) {
    return NextResponse.redirect(
      new URL(buildLoginPath(gate.nextPath, "test_login_failed"), request.url),
    );
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });

  if (signInError) {
    await admin.auth.admin.deleteUser(createdUser.user.id);
    return NextResponse.redirect(
      new URL(buildLoginPath(gate.nextPath, "test_login_failed"), request.url),
    );
  }

  return NextResponse.redirect(new URL(gate.nextPath, request.url));
}
