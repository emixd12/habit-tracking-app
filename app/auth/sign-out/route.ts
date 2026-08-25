import { NextResponse, type NextRequest } from "next/server";

import { deactivateCurrentUserPushSubscriptionByEndpoint } from "@/lib/db/pushSubscriptions.repo";
import { createClient } from "@/lib/supabase/server";

const MAX_PUSH_ENDPOINT_LENGTH = 2048;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const pushEndpoint = await readPushEndpoint(request);

    if (pushEndpoint) {
      await deactivateCurrentUserPushSubscriptionByEndpoint(
        supabase,
        pushEndpoint,
      );
    }

    const { error } = await supabase.auth.signOut({ scope: "local" });

    if (error) {
      return signOutFailure();
    }

    return NextResponse.redirect(
      new URL("/login?signedout=1", request.url),
      303,
    );
  } catch {
    return signOutFailure();
  }
}

async function readPushEndpoint(request: NextRequest): Promise<string | null> {
  try {
    const formData = await request.formData();
    const value = formData.get("pushEndpoint");

    if (typeof value !== "string") {
      return null;
    }

    const endpoint = value.trim();

    if (!endpoint || endpoint.length > MAX_PUSH_ENDPOINT_LENGTH) {
      return null;
    }

    return new URL(endpoint).protocol === "https:" ? endpoint : null;
  } catch {
    return null;
  }
}

export function GET() {
  return new NextResponse("Method Not Allowed", {
    status: 405,
    headers: {
      Allow: "POST",
    },
  });
}

export const HEAD = GET;
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
export const OPTIONS = GET;

function signOutFailure() {
  return new NextResponse("Cadence could not sign you out. Try again.", {
    status: 500,
  });
}
