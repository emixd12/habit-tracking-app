import { createClient } from "@/lib/supabase/server";
import { finishCalendarConnection } from "@/lib/services/google-calendar.service";
export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const { data } = await (await createClient()).auth.getUser();
    const target = await finishCalendarConnection({ state: url.searchParams.get("state") ?? "", code: url.searchParams.get("code"), denied: url.searchParams.has("error"), cookieUser: data.user, requestOrigin: url.origin });
    return new Response(null, { status: 302, headers: { Location: target, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return new Response("Calendar connection could not complete. Return to Settings and try again.", { status: 400, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Type": "text/plain" } });
  }
}
