// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { TravelSettingsPanel } from "@/components/settings/TravelSettingsPanel";
import type { TravelSettings } from "@cadence/core/types/travel";
import { ExternalEventDetails } from "@/components/timeline/ExternalEventDetails";
import { validateExternalEventSnapshot } from "@cadence/core/services/external-event-validation";
import snapshotFixture from "./fixtures/external-event-snapshot.valid.json";

it("separates routing consent and foreground permission and saves without a base", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const settings: TravelSettings = { enabled: false, baseLocationText: null, mode: "walking", navigationPreference: "google_maps", routingConsentAt: null, onboardingCompletedAt: null, updatedAt: "2026-09-21T12:00:00Z" };
  const save = vi.fn(async () => settings);
  const readLocation = vi.fn(async () => ({ state: "denied" as const }));
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<TravelSettingsPanel client={{ load: async () => settings, save }} readLocation={readLocation} />));
    const buttons = () => [...container.querySelectorAll("button")];
    const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    const saveButton = buttons().find((button) => button.textContent === "Save travel settings")!;
    expect(readLocation).not.toHaveBeenCalled();
    await act(() => checkboxes[0]!.click());
    expect(saveButton.disabled).toBe(true);
    await act(() => checkboxes[1]!.click());
    expect(saveButton.disabled).toBe(false);
    await act(async () => saveButton.click());
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, baseLocationText: null, acceptRoutingDisclosure: true }));
    await act(async () => buttons().find((button) => button.textContent === "Check device location permission")!.click());
    expect(readLocation).toHaveBeenCalledWith(true);
    expect(container.textContent).toContain("known event-to-event routes");
    expect(container.textContent).toContain("not sent to the Daily Brief model");
  } finally { await act(() => root.unmount()); container.remove(); }
});

it("keeps journey corrections transient and builds a source-location search link", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  const event = { ...validateExternalEventSnapshot(snapshotFixture).events[0]!, location: "User source address", revision: { availability: "available" as const, providerEtag: "revision-1", providerUpdatedAt: null } };
  const corrected = vi.fn(); const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() => root.render(<ExternalEventDetails event={event} timezone="UTC" onClose={() => {}} onDismissAllDay={() => {}} onTravelCorrection={corrected} />));
    const link = [...container.querySelectorAll("a")].find((element) => element.textContent === "Search in Google Maps")!;
    expect(new URL(link.href).searchParams.get("query")).toBe("User source address");
    const attendance = container.querySelector<HTMLSelectElement>('select[name="travel_attendance"]')!;
    attendance.value = "remote";
    await act(() => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(corrected).toHaveBeenCalledWith({ eventId: event.id, revision: "revision-1", attendance: "remote", locationText: "User source address" });
  } finally { await act(() => root.unmount()); container.remove(); }
});
