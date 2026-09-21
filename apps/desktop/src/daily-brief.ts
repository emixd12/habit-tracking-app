import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DailyBriefResponse,
  DailyBriefSettings,
} from "@cadence/core/types/daily-brief";
import type { DailyBriefClient } from "@/lib/ui/daily-brief";
import { DailyBriefRequestError } from "@/lib/ui/daily-brief";
import { readDesktopCalendarBrokerOrigin } from "./calendar/google-calendar";

export function createDesktopDailyBriefClient(
  client: SupabaseClient,
  origin = readDesktopCalendarBrokerOrigin(),
): DailyBriefClient | null {
  return origin ? new DesktopDailyBriefClient(origin, async () => (await client.auth.getSession()).data.session?.access_token ?? null) : null;
}

class DesktopDailyBriefClient implements DailyBriefClient {
  constructor(
    private readonly origin: string,
    private readonly accessToken: () => Promise<string | null>,
  ) {}

  preferences(signal?: AbortSignal) {
    return this.request<DailyBriefSettings>("/api/advisor/preferences", {}, signal);
  }

  updatePreferences(input: Readonly<{ enabled: boolean; includeCalendar: boolean }>, signal?: AbortSignal) {
    return this.request<DailyBriefSettings>("/api/advisor/preferences", { method: "PUT", body: JSON.stringify(input) }, signal);
  }

  requestBrief(input: Readonly<{ installationId: string; retry: boolean }>, signal?: AbortSignal) {
    return this.request<DailyBriefResponse>("/api/advisor/brief", { method: "POST", body: JSON.stringify(input) }, signal);
  }

  private async request<T>(path: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
    const token = await this.accessToken();
    if (!token) throw new DailyBriefRequestError("unauthenticated");
    let response: Response;
    try {
      response = await fetch(`${this.origin}${path}`, {
        ...init,
        cache: "no-store",
        redirect: "error",
        signal: signal ?? AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
      });
    } catch {
      throw new DailyBriefRequestError("brief_unavailable");
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const details = body && typeof body === "object" ? body as { error?: unknown; retryAfterSeconds?: unknown } : {};
      throw new DailyBriefRequestError(
        typeof details.error === "string" ? details.error : "brief_unavailable",
        typeof details.retryAfterSeconds === "number" ? details.retryAfterSeconds : undefined,
      );
    }
    return body as T;
  }
}
