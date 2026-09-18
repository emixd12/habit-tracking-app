"use client";
import { Temporal } from "@js-temporal/polyfill";
import { DayProgressTimeline } from "@/components/timeline/DayProgressTimeline";
import { resolveTimeline } from "@cadence/core/resolvers/timeline.resolver";
import { useState } from "react";
import { GoogleCalendarPanel } from "@/components/settings/GoogleCalendarPanel";
import { ExternalEventDetails, ExternalEventPreview } from "@/components/timeline/ExternalEventDetails";
import type { GoogleCalendarCoordinator } from "@/lib/ui/google-calendar";
import type { CalendarConnectionView } from "@/lib/types/google-calendar";
import { validateExternalEventSnapshot } from "@cadence/core/services/external-event-validation";
import fixture from "@/tests/fixtures/external-event-snapshot.valid.json";
const snapshot = validateExternalEventSnapshot(fixture);
const connection: CalendarConnectionView = { accountId: snapshot.accountId, status: "connected", generation: 1, selectionRevision: 0,
  preferences: { selectedCalendarIds: [...snapshot.requestedRange.selectedCalendarIds], hiddenCalendarIds: [], visible: true, showAllDay: true } };
const coordinator: GoogleCalendarCoordinator = {
  getConnection: async () => connection,
  beginConnect: async () => undefined,
  listCalendars: async () => snapshot.requestedRange.selectedCalendarIds.map((id) => ({ id, name: "Synthetic calendar", timezone: snapshot.requestedRange.timezone, accessRole: "reader", primary: true, selected: true })),
  savePreferences: async (preferences) => ({ ...connection, preferences }),
  refreshEvents: async () => snapshot,
  disconnect: async () => ({ view: { ...connection, status: "disconnected" }, revocationFailed: false }),
};
export function CalendarSettingsBench() {
  return <GoogleCalendarPanel coordinator={coordinator} refreshRange={snapshot.requestedRange} />;
}
export function CalendarDetailsBench({ preview = false }: { preview?: boolean }) {
  const [open, setOpen] = useState(false);
  const event = snapshot.events[0];
  if (!event) return null;
  return <><button type="button" onClick={() => setOpen(true)}>Open synthetic Calendar {preview ? "preview" : "details"}</button>
    {preview && open ? <ExternalEventPreview id="bench-calendar-preview" events={[event]} timezone={snapshot.requestedRange.timezone} onDismiss={() => setOpen(false)} onOpen={() => setOpen(false)} /> : null}
    {!preview ? <ExternalEventDetails event={open ? event : null} timezone={snapshot.requestedRange.timezone} onClose={() => setOpen(false)} onDismissAllDay={() => setOpen(false)} /> : null}</>;
}

const timeline = resolveTimeline({ timezone: snapshot.requestedRange.timezone, now: Temporal.Instant.from(snapshot.fetchedAt), futureDays: 7,
  occurrences: ["05:45:00", "13:00:00", "22:00:00"].map((time, index) => ({
    id: `calendar-bench-${index}`, behaviorId: "calendar-bench-behavior", title: index ? "Drink water" : "Review notes",
    description: "Synthetic occurrence for shared Timeline verification.", categoryName: "Routine", scheduleSummary: "Daily",
    scheduledFor: `2026-11-01T${time}Z`, scheduledTimeLabel: index ? (index === 1 ? "8:00 AM" : "5:00 PM") : "1:45 AM",
    localDate: "2026-11-01", status: "unresolved", statusMarkedAt: null, note: "", canStartTimeTracking: true,
    timeTracking: { recordedSeconds: 0, runningStartedAt: null },
  })),
});
const idleAction = async () => ({ status: "idle" as const, message: "Synthetic preview only." });
export function CalendarTimelineBench() {
  return <DayProgressTimeline timeline={timeline} context={{ events: snapshot.events, freshness: snapshot.freshness, now: snapshot.fetchedAt }}
    statusAction={idleAction} noteAction={idleAction} startTimeTrackingAction={idleAction} stopTimeTrackingAction={idleAction} resetTimeTrackingAction={idleAction} />;
}
