import { describe, expect, it, vi } from "vitest";

import type {
  BehaviorDataStore,
} from "../packages/core/src/behavior-store";
import {
  createBehavior, setBehaviorActive, updateBehavior,
} from "../packages/core/src/services/behavior.service";

import { recordedAt, stored, values } from "./helpers/behavior-graph-fixture";

function store(behavior = stored) {
  const adapter = {
    getBehaviorById: vi.fn().mockResolvedValue(behavior),
    createBehaviorWithAtomicScheduleGraph: vi.fn().mockResolvedValue(behavior),
    updateBehaviorWithAtomicScheduleGraph: vi.fn().mockResolvedValue(behavior),
  } satisfies BehaviorDataStore;
  return adapter;
}

describe("shared Behavior orchestration", () => {
  it("commits a complete graph and both baselines before reading the created Behavior", async () => {
    const adapter = store();
    const result = await createBehavior(adapter, { values, userId: "owner", timezone: "America/New_York", recordedAt });
    expect(result).toBe(stored);
    expect(adapter.createBehaviorWithAtomicScheduleGraph).toHaveBeenCalledWith(expect.objectContaining({
      behavior: expect.objectContaining({ user_id: "owner", title: "Read", active: true, archived_at: null }),
      definitionEventPlan: expect.objectContaining({ previousTitle: null, nextTitle: "Read", recordedAt }),
      configurationEventPlan: expect.objectContaining({ eventKind: "baseline", reasonCode: "behavior_created" }),
      schedules: [{
        id: "schedule", recurrence_rule: { frequency: "daily", interval: 1 }, sort_order: 0,
        slots: [{ id: "slot", kind: "exact", preset: null, start_time: "09:00", end_time: null, sort_order: 0 }],
      }],
    }));
    expect(adapter.getBehaviorById).toHaveBeenCalledWith("behavior");
    expect(adapter.createBehaviorWithAtomicScheduleGraph.mock.invocationCallOrder[0])
      .toBeLessThan(adapter.getBehaviorById.mock.invocationCallOrder[0]!);
  });

  it("preserves raw predecessor text and browser revision for a normalized no-op", async () => {
    const adapter = store({ ...stored, title: " Read ", description: " A chapter " });
    await updateBehavior(adapter, { behaviorId: "behavior", expectedUpdatedAt: "older-browser-revision", values, recordedAt });
    expect(adapter.updateBehaviorWithAtomicScheduleGraph).toHaveBeenCalledWith(expect.objectContaining({
      expectedUpdatedAt: "older-browser-revision",
      expectedDefinition: { title: " Read ", description: " A chapter " },
      expectedNormalizedDefinition: { title: "Read", description: "A chapter" },
      definitionEventPlan: null, configurationEventPlan: null,
      behavior: expect.objectContaining({ title: " Read ", description: " A chapter ", timezone: "America/New_York" }),
    }));
  });

  it("plans clearing a description and schedule changes without losing graph preconditions", async () => {
    const adapter = store();
    await updateBehavior(adapter, {
      behaviorId: "behavior", expectedUpdatedAt: stored.updated_at, recordedAt,
      values: { ...values, description: null, schedules: [{ ...values.schedules[0]!, timeEntries: [{ ...values.schedules[0]!.timeEntries[0]!, startTime: "10:00" }] }] },
    });
    const commit = adapter.updateBehaviorWithAtomicScheduleGraph.mock.calls[0]![0];
    expect(commit.behavior.description).toBeNull();
    expect(commit.definitionEventPlan).toMatchObject({ nextDescription: null, changedFields: ["description"] });
    expect(commit.configurationEventPlan).toMatchObject({ changedFields: ["schedule_graph"], reasonCode: "behavior_edited" });
    expect(commit.expectedScheduleGraph[0].slots[0].start_time).toBe("09:00");
    expect(commit.schedules[0].slots[0].start_time).toBe("10:00");
  });

  it("archives and restores with the stored revision and no definition event", async () => {
    const adapter = store();
    await setBehaviorActive(adapter, { behaviorId: "behavior", active: false, recordedAt });
    expect(adapter.updateBehaviorWithAtomicScheduleGraph).toHaveBeenCalledWith(expect.objectContaining({
      expectedUpdatedAt: stored.updated_at, definitionEventPlan: null,
      behavior: expect.objectContaining({ active: false, archived_at: recordedAt }),
      configurationEventPlan: expect.objectContaining({ changedFields: ["active"], reasonCode: "behavior_archived" }),
    }));
    const archived = { ...stored, active: false, archived_at: "2026-08-20T00:00:00Z" };
    adapter.getBehaviorById.mockResolvedValue(archived);
    await setBehaviorActive(adapter, { behaviorId: "behavior", active: false, recordedAt });
    expect(adapter.updateBehaviorWithAtomicScheduleGraph.mock.lastCall![0]).toMatchObject({
      behavior: { archived_at: archived.archived_at }, configurationEventPlan: null,
    });
    await setBehaviorActive(adapter, { behaviorId: "behavior", active: true, recordedAt });
    expect(adapter.updateBehaviorWithAtomicScheduleGraph.mock.lastCall![0]).toMatchObject({
      behavior: { active: true, archived_at: null },
      configurationEventPlan: { reasonCode: "behavior_restored" },
    });
  });

  it("propagates atomic conflicts and rejects missing rows without follow-up writes", async () => {
    const adapter = store();
    adapter.updateBehaviorWithAtomicScheduleGraph.mockRejectedValueOnce(new Error("Behavior schedule graph changed after it was read."));
    await expect(updateBehavior(adapter, { behaviorId: "behavior", expectedUpdatedAt: stored.updated_at, values, recordedAt }))
      .rejects.toThrow("Behavior schedule graph changed after it was read.");
    expect(adapter.updateBehaviorWithAtomicScheduleGraph).toHaveBeenCalledOnce();
    adapter.getBehaviorById.mockResolvedValue(null);
    await expect(setBehaviorActive(adapter, { behaviorId: "missing", active: false, recordedAt })).rejects.toThrow("Behavior not found.");
    expect(adapter.updateBehaviorWithAtomicScheduleGraph).toHaveBeenCalledOnce();
  });
});
