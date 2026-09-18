import { invoke } from "@tauri-apps/api/core";
import { validateExternalEventSnapshot } from "@cadence/core/services/external-event-validation";
import type { ExternalEventSnapshotV1 } from "@cadence/core/types/external-event";

export type CalendarCacheRequest = Readonly<{
  accountId: string;
  connectionGeneration: number;
  selectionRevision: number;
  startLocalDate: string;
  endLocalDate: string;
  timezone: string;
  selectedCalendarIds: string[];
  hiddenCalendarIds: string[];
  visible: boolean;
  showAllDay: boolean;
}>;

export type CurrentCalendarCacheQuery = Readonly<Pick<CalendarCacheRequest,
  "accountId" | "startLocalDate" | "endLocalDate" | "timezone">>;

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export class DesktopCalendarCache {
  constructor(private readonly call: Invoke = invoke) {}

  async read(request: CalendarCacheRequest): Promise<ExternalEventSnapshotV1 | null> {
    const json = await this.call<string | null>("calendar_cache_read", { request });
    if (!json) return null;
    try {
      const snapshot = validateExternalEventSnapshot(JSON.parse(json));
      assertSnapshotMatches(snapshot, request);
      return snapshot;
    } catch (error) {
      await this.clear();
      throw error;
    }
  }

  async readCurrent(query: CurrentCalendarCacheQuery): Promise<{ request: CalendarCacheRequest; snapshot: ExternalEventSnapshotV1 } | null> {
    const stored = await this.call<{ request: CalendarCacheRequest; snapshotJson: string } | null>("calendar_cache_read_current", query);
    if (!stored) return null;
    try {
      const snapshot = validateExternalEventSnapshot(JSON.parse(stored.snapshotJson));
      assertSnapshotMatches(snapshot, stored.request);
      return { request: stored.request, snapshot };
    } catch (error) {
      await this.clear();
      throw error;
    }
  }

  begin(request: CalendarCacheRequest, requestId: string): Promise<void> {
    return this.call("calendar_cache_begin", { request, requestId });
  }

  async replace(request: CalendarCacheRequest, requestId: string, value: unknown): Promise<ExternalEventSnapshotV1> {
    const snapshot = validateExternalEventSnapshot(value);
    assertSnapshotMatches(snapshot, request);
    if (snapshot.completeness !== "complete") throw new Error("An incomplete Calendar refresh cannot replace the cache.");
    await this.call("calendar_cache_replace", { request, requestId, snapshotJson: JSON.stringify(snapshot) });
    return snapshot;
  }

  clear(): Promise<void> { return this.call("calendar_cache_clear"); }
}

export function assertSnapshotMatches(snapshot: ExternalEventSnapshotV1, request: CalendarCacheRequest): void {
  const range = snapshot.requestedRange;
  if (snapshot.accountId !== request.accountId
    || snapshot.connectionGeneration !== request.connectionGeneration
    || range.startLocalDate !== request.startLocalDate
    || range.endLocalDate !== request.endLocalDate
    || range.timezone !== request.timezone
    || range.selectedCalendarIds.length !== request.selectedCalendarIds.length
    || range.selectedCalendarIds.some((id, index) => id !== request.selectedCalendarIds[index])) {
    throw new Error("The Calendar snapshot does not match the requested account, selection, or range.");
  }
}
