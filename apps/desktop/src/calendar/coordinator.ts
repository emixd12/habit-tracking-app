import type { ExternalEventSnapshotV1 } from "@cadence/core/types/external-event";
import { validateExternalEventSnapshot } from "@cadence/core/services/external-event-validation";
import { assertSnapshotMatches, type CalendarCacheRequest, DesktopCalendarCache } from "./cache";
import type { DesktopCalendarBroker } from "./google-calendar";

export type CalendarRefreshTrigger = "open" | "resume" | "visible" | "manual";
export type CalendarSnapshotResult = Readonly<{
  snapshot: ExternalEventSnapshotV1 | null;
  source: "network" | "cache" | "none";
  stale: boolean;
  refreshError: string | null;
}>;

type CalendarCacheOperations = Pick<DesktopCalendarCache, "read" | "begin" | "replace" | "clear">;

const REFRESH_INTERVAL_MS = 15 * 60_000;

export class DesktopCalendarCoordinator {
  private readonly running = new Map<string, Promise<CalendarSnapshotResult>>();
  private epoch = 0;
  constructor(private readonly broker: Pick<DesktopCalendarBroker, "events">, private readonly cache: CalendarCacheOperations = new DesktopCalendarCache()) {}

  async read(request: CalendarCacheRequest, now = Date.now()): Promise<CalendarSnapshotResult> {
    const snapshot = await this.cache.read(request);
    return snapshot ? { snapshot, source: "cache", stale: isStale(snapshot, now), refreshError: null }
      : { snapshot: null, source: "none", stale: true, refreshError: null };
  }

  refresh(request: CalendarCacheRequest, trigger: CalendarRefreshTrigger, now = Date.now()): Promise<CalendarSnapshotResult> {
    const key = JSON.stringify(request);
    const existing = this.running.get(key);
    if (existing) return existing;
    const refresh = this.runRefresh(request, trigger, now).finally(() => this.running.delete(key));
    this.running.set(key, refresh);
    return refresh;
  }

  clear(): Promise<void> { this.epoch += 1; return this.cache.clear(); }

  private async runRefresh(request: CalendarCacheRequest, trigger: CalendarRefreshTrigger, now: number): Promise<CalendarSnapshotResult> {
    const epoch = this.epoch;
    const cached = await this.cache.read(request);
    if (epoch !== this.epoch) return cleared();
    if (!shouldRefresh(cached, trigger, now)) return { snapshot: cached, source: cached ? "cache" : "none", stale: false, refreshError: null };
    const requestId = crypto.randomUUID();
    try {
      await this.cache.begin(request, requestId);
      const snapshot = validateExternalEventSnapshot(await this.broker.events(request));
      if (epoch !== this.epoch) return cleared();
      assertSnapshotMatches(snapshot, request);
      if (snapshot.completeness !== "complete") {
        return { snapshot: cached ?? snapshot, source: cached ? "cache" : "network", stale: true, refreshError: "incomplete_pagination" };
      }
      await this.cache.replace(request, requestId, snapshot);
      if (epoch !== this.epoch) return cleared();
      return { snapshot, source: "network", stale: false, refreshError: null };
    } catch (error) {
      if (epoch !== this.epoch) return cleared();
      return { snapshot: cached, source: cached ? "cache" : "none", stale: true, refreshError: errorCode(error) };
    }
  }
}

function cleared(): CalendarSnapshotResult {
  return { snapshot: null, source: "none", stale: true, refreshError: "cleared" };
}

export function shouldRefresh(snapshot: ExternalEventSnapshotV1 | null, trigger: CalendarRefreshTrigger, now: number): boolean {
  if (trigger === "manual" || !snapshot) return true;
  if (snapshot.freshness.state !== "current") return true;
  const fetched = Date.parse(snapshot.fetchedAt);
  return !Number.isFinite(fetched) || now - fetched >= REFRESH_INTERVAL_MS || now < fetched;
}

function isStale(snapshot: ExternalEventSnapshotV1, now: number): boolean {
  return snapshot.freshness.state !== "current" || shouldRefresh(snapshot, "visible", now);
}

function errorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code
    : error instanceof Error ? error.message : "provider_unavailable";
}
