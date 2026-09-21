import type {
  DailyBriefResponse,
  DailyBriefSettings,
} from "@cadence/core/types/daily-brief";
import type { TimelineView } from "@cadence/core/types/timeline";

export function timelineBriefKey(timeline: TimelineView): string {
  return JSON.stringify([
    timeline.timezone, timeline.todayLocalDate, timeline.durationEstimates,
    [...timeline.daySections, ...timeline.needsDecision.daySections].map((section) =>
      section.occurrences.map((occurrence) => [occurrence.id, occurrence.title,
        occurrence.scheduledFor, occurrence.status, occurrence.statusMarkedAt, occurrence.timeTracking])),
  ]);
}

export type DailyBriefClient = Readonly<{
  preferences: (signal?: AbortSignal) => Promise<DailyBriefSettings>;
  updatePreferences: (
    input: Readonly<{ enabled: boolean; includeCalendar: boolean }>,
    signal?: AbortSignal,
  ) => Promise<DailyBriefSettings>;
  requestBrief: (
    input: Readonly<{ installationId: string; retry: boolean }>,
    signal?: AbortSignal,
  ) => Promise<DailyBriefResponse>;
}>;

export class DailyBriefRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(code);
    this.name = "DailyBriefRequestError";
  }
}

export function createWebDailyBriefClient(fetcher: typeof fetch = fetch): DailyBriefClient {
  return {
    preferences: (signal) => request<DailyBriefSettings>(fetcher, "/api/advisor/preferences", {}, signal),
    updatePreferences: (input, signal) => request<DailyBriefSettings>(fetcher, "/api/advisor/preferences", {
      method: "PUT",
      body: JSON.stringify(input),
    }, signal),
    requestBrief: (input, signal) => request<DailyBriefResponse>(fetcher, "/api/advisor/brief", {
      method: "POST",
      body: JSON.stringify(input),
    }, signal),
  };
}

export async function dailyBriefInstallationId(storage: Storage = window.localStorage): Promise<string> {
  if ("locks" in navigator) {
    return navigator.locks.request("cadence.daily-brief.installation.v1", { mode: "exclusive" }, () => installationId(storage));
  }
  return installationId(storage);
}

function installationId(storage: Storage): string {
  const key = "cadence.daily-brief.installation.v1";
  const current = storage.getItem(key);
  if (current) return current;
  const installationId = crypto.randomUUID();
  storage.setItem(key, installationId);
  return installationId;
}

type DailyBriefPresentation = Readonly<{ attempted: boolean; dismissed: boolean }>;

export function readDailyBriefPresentation(
  accountRef: string,
  localDate: string,
  storage: Storage = window.localStorage,
): DailyBriefPresentation {
  try {
    pruneDailyBriefPresentation(storage, accountRef, localDate);
    const value = JSON.parse(storage.getItem(presentationKey(accountRef, localDate)) ?? "{}") as Partial<DailyBriefPresentation>;
    return { attempted: value.attempted === true, dismissed: value.dismissed === true };
  } catch {
    return { attempted: false, dismissed: false };
  }
}

export function markDailyBriefPresentation(
  accountRef: string,
  localDate: string,
  value: DailyBriefPresentation,
  storage: Storage = window.localStorage,
) {
  pruneDailyBriefPresentation(storage, accountRef, localDate);
  storage.setItem(presentationKey(accountRef, localDate), JSON.stringify(value));
}

function presentationKey(accountRef: string, localDate: string) {
  return `cadence.daily-brief.presentation.v1:${accountRef}:${localDate}`;
}

function pruneDailyBriefPresentation(storage: Storage, accountRef: string, localDate: string) {
  const prefix = "cadence.daily-brief.presentation.v1:";
  const current = presentationKey(accountRef, localDate);
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix) && key !== current) storage.removeItem(key);
  }
}

async function request<T>(
  fetcher: typeof fetch,
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(path, {
      ...init,
      cache: "no-store",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      signal,
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
