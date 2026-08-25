import { NextResponse, type NextRequest } from "next/server";

import { buildLoginPath, MISSING_CONFIG_ERROR } from "@/lib/auth/redirects";
import {
  createTestLoginCredentials,
  releaseTestLoginCreation,
  reserveTestLoginCreation,
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

  if (!reserveTestLoginCreation()) {
    return NextResponse.redirect(
      new URL(
        buildLoginPath(gate.nextPath, "test_login_quota_reached"),
        request.url,
      ),
    );
  }

  const credentials = createTestLoginCredentials();
  let admin: ReturnType<typeof createServiceRoleClient>;

  try {
    admin = createServiceRoleClient();
  } catch {
    releaseTestLoginCreation();
    return NextResponse.redirect(
      new URL(buildLoginPath(gate.nextPath, "test_login_failed"), request.url),
    );
  }

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
    releaseTestLoginCreation();
    return NextResponse.redirect(
      new URL(buildLoginPath(gate.nextPath, "test_login_failed"), request.url),
    );
  }

  let signInError: unknown;

  try {
    const supabase = await createClient();
    const result = await supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });
    signInError = result.error;
  } catch (error) {
    signInError = error;
  }

  if (signInError) {
    try {
      const { error: deleteError } = await admin.auth.admin.deleteUser(
        createdUser.user.id,
      );
      if (!deleteError) {
        releaseTestLoginCreation();
      }
    } catch {
      // Retain the quota reservation because the temporary user may remain.
    }
    return NextResponse.redirect(
      new URL(buildLoginPath(gate.nextPath, "test_login_failed"), request.url),
    );
  }

  return NextResponse.redirect(new URL(gate.nextPath, request.url));
}
