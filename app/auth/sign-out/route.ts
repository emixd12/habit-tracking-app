import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
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
