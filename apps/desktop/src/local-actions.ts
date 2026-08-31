import { parseOccurrenceId, parseOccurrenceNote, parseOccurrenceStatus } from "@cadence/core/services/occurrence.service";
import type { OccurrenceFormAction, TimeTrackingFormAction } from "../../../lib/types/timeline";
import { markLocalOccurrence, saveLocalOccurrenceNote, trackLocalOccurrence } from "./local-occurrence.service";
import { Temporal } from "@js-temporal/polyfill";
import { createBehavior, updateBehavior, setBehaviorActive } from "@cadence/core/services/behavior.service";
import { toBehaviorView } from "@cadence/core/services/behavior-views";
import { behaviorErrorToActionState, parseBehaviorFormData } from "../../../lib/services/behavior-form";
import type { BehaviorFormAction } from "../../../lib/types/behavior";
import type { Profile } from "../../../lib/types/database";
import { createLocalBehaviorStore, withNativeReminderSummary } from "./local-behavior.service";
import { localCommand } from "./local-store";

export function createLocalOccurrenceActions(profileId: string, refresh: () => void) {
  const statusAction: OccurrenceFormAction = async (_previous, form) => {
    try {
      const nextStatus = parseOccurrenceStatus(form.get("status"));
      await markLocalOccurrence(profileId, {
        occurrenceId: parseOccurrenceId(form.get("occurrence_id")),
        expectedStatus: parseOccurrenceStatus(form.get("expected_status"), true), nextStatus,
      });
      // StatusButtons refreshes after completion feedback, preserving the chime.
      return { status: "success", message: "Occurrence updated.", nextStatus };
    } catch (error) { return { status: "error", message: localErrorMessage(error) }; }
  };
  const noteAction: OccurrenceFormAction = async (_previous, form) => {
    try {
      await saveLocalOccurrenceNote(profileId, {
        occurrenceId: parseOccurrenceId(form.get("occurrence_id")),
        expectedNote: parseOccurrenceNote(form.get("expected_note"), true),
        note: parseOccurrenceNote(form.get("note")),
      });
      return { status: "success", message: "Note saved." };
    } catch (error) { return { status: "error", message: localErrorMessage(error) }; }
  };
  const timing = (operation: "start" | "stop" | "reset"): TimeTrackingFormAction => async (_previous, form) => {
    const id = form.get("client_action_id");
    const request = typeof id === "string" && /^[a-z0-9-]{1,80}$/i.test(id) ? { requestId: id } : {};
    try {
      const result = await trackLocalOccurrence(profileId, parseOccurrenceId(form.get("occurrence_id")), operation);
      refresh();
      return { status: "success", message: operation === "reset" ? "Tracked time reset." : `Time tracking ${operation === "start" ? "started" : "stopped"}.`,
        tracking: { recordedSeconds: result.tracking.recordedSeconds, runningStartedAt: result.tracking.runningSession?.startedAt ?? null }, ...request };
    } catch (error) { return { status: "error", message: localErrorMessage(error), ...request }; }
  };
  return { statusAction, noteAction, startTimeTrackingAction: timing("start"),
    stopTimeTrackingAction: timing("stop"), resetTimeTrackingAction: timing("reset") };
}

export function localErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to save the local change. Try again.";
}

export function createLocalBehaviorActions(profile: Profile, refresh: () => void) {
  const createAction: BehaviorFormAction = async (_previous, form) => {
    try {
      const now = Temporal.Now.instant();
      const categories = await localCommand("readCategories", { profileId: profile.id });
      const values = parseBehaviorFormData(form, { mode: "create", categories });
      const behavior = await createBehavior(createLocalBehaviorStore(profile.id, now), {
        userId: profile.id, timezone: profile.timezone, values, recordedAt: now.toString(),
      });
      refresh();
      return { status: "success", message: "Behavior created.", behavior: withNativeReminderSummary(toBehaviorView(behavior)) };
    } catch (error) { return behaviorErrorToActionState(error); }
  };
  const updateAction: BehaviorFormAction = async (_previous, form) => {
    try {
      const now = Temporal.Now.instant();
      const categories = await localCommand("readCategories", { profileId: profile.id });
      const values = parseBehaviorFormData(form, { mode: "update", categories });
      const expected = form.get("expected_updated_at");
      if (typeof expected !== "string" || !expected) throw new Error("Reload this behavior before saving changes.");
      await updateBehavior(createLocalBehaviorStore(profile.id, now), {
        behaviorId: values.behaviorId, expectedUpdatedAt: expected, values, recordedAt: now.toString(),
      });
      refresh();
      return { status: "success", message: "Behavior saved." };
    } catch (error) { return behaviorErrorToActionState(error); }
  };
  const lifecycle = (active: boolean): BehaviorFormAction => async (_previous, form) => {
    try {
      const now = Temporal.Now.instant();
      const behaviorId = form.get("behavior_id");
      if (typeof behaviorId !== "string" || !behaviorId) throw new Error("Choose an existing behavior.");
      await setBehaviorActive(createLocalBehaviorStore(profile.id, now), { behaviorId, active, recordedAt: now.toString() });
      refresh();
      return { status: "success", message: active ? "Behavior restored." : "Behavior archived." };
    } catch (error) { return behaviorErrorToActionState(error); }
  };
  return { createAction, updateAction, archiveAction: lifecycle(false), restoreAction: lifecycle(true) };
}
