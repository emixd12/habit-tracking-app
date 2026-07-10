import { describe, expect, it, vi } from "vitest";

import {
  createBehaviorDefinitionEvent,
  createBehaviorWithDefinitionEvent,
  listBehaviorDefinitionEvents,
  updateBehaviorWithDefinitionEvent,
} from "../lib/db/behaviorDefinitionEvents.repo";
import type { AppSupabaseClient } from "../lib/db/behaviors.repo";
import type { BehaviorDefinitionEvent } from "../lib/types/database";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BEHAVIOR_ID = "22222222-2222-4222-8222-222222222222";

describe("behavior definition events repository", () => {
  it("persists behavior create and its pure initial-event plan through one RPC", async () => {
    const behavior = storedBehaviorRow();
    const rpc = vi.fn().mockResolvedValue({ data: behavior, error: null });
    const supabase = { rpc } as unknown as AppSupabaseClient;

    const result = await createBehaviorWithDefinitionEvent(supabase, {
      behavior: {
        user_id: USER_ID,
        category_id: null,
        title: "Brush teeth",
        description: null,
        recurrence_rule: { frequency: "daily", interval: 1 },
        scheduled_time: "07:30",
        timezone: "America/New_York",
        browser_reminder_enabled: true,
        email_reminder_enabled: false,
        reminder_offset_minutes: 0,
        active: true,
        archived_at: null,
      },
      definitionEventPlan: initialPlan(),
    });

    expect(result).toEqual(behavior);
    expect(rpc).toHaveBeenCalledWith(
      "create_behavior_with_definition_event",
      expect.objectContaining({
        behavior_payload: expect.objectContaining({
          title: "Brush teeth",
          timezone: "America/New_York",
        }),
        definition_event_plan: expect.objectContaining({
          changed_fields: ["title"],
          recorded_at: "2026-07-09T18:30:00Z",
        }),
      }),
    );
  });

  it("persists behavior update and its pure change-event plan through one RPC", async () => {
    const behavior = storedBehaviorRow({ title: "Brush and floss" });
    const rpc = vi.fn().mockResolvedValue({ data: behavior, error: null });
    const supabase = { rpc } as unknown as AppSupabaseClient;

    const result = await updateBehaviorWithDefinitionEvent(supabase, {
      behaviorId: BEHAVIOR_ID,
      behavior: {
        category_id: null,
        title: "Brush and floss",
        description: null,
        recurrence_rule: { frequency: "daily", interval: 1 },
        scheduled_time: "07:30",
        browser_reminder_enabled: true,
        email_reminder_enabled: false,
        reminder_offset_minutes: 0,
        active: true,
        archived_at: null,
      },
      expectedDefinition: {
        title: "Brush teeth",
        description: null,
      },
      expectedNormalizedDefinition: {
        title: "Brush teeth",
        description: null,
      },
      definitionEventPlan: {
        ...initialPlan(),
        previousTitle: "Brush teeth",
        nextTitle: "Brush and floss",
      },
    });

    expect(result).toEqual(behavior);
    expect(rpc).toHaveBeenCalledWith(
      "update_behavior_with_definition_event",
      expect.objectContaining({
        target_behavior_id: BEHAVIOR_ID,
        behavior_payload: expect.objectContaining({
          title: "Brush and floss",
        }),
        expected_definition: {
          stored_title: "Brush teeth",
          stored_description: null,
          normalized_title: "Brush teeth",
          normalized_description: null,
        },
        definition_event_plan: expect.objectContaining({
          previous_title: "Brush teeth",
          next_title: "Brush and floss",
        }),
      }),
    );
  });

  it("surfaces an atomic RPC failure to prevent follow-on service writes", async () => {
    const rpcError = new Error("Definition event constraint failed.");
    const rpc = vi.fn().mockResolvedValue({ data: null, error: rpcError });
    const supabase = { rpc } as unknown as AppSupabaseClient;

    await expect(
      updateBehaviorWithDefinitionEvent(supabase, {
        behaviorId: BEHAVIOR_ID,
        behavior: {
          title: "Brush and floss",
        },
        expectedDefinition: {
          title: "Brush teeth",
          description: null,
        },
        expectedNormalizedDefinition: {
          title: "Brush teeth",
          description: null,
        },
        definitionEventPlan: {
          ...initialPlan(),
          previousTitle: "Brush teeth",
          nextTitle: "Brush and floss",
        },
      }),
    ).rejects.toBe(rpcError);
  });

  it("sends imported created_at explicitly with an atomic baseline", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: storedBehaviorRow(),
      error: null,
    });
    const supabase = { rpc } as unknown as AppSupabaseClient;

    await createBehaviorWithDefinitionEvent(supabase, {
      behavior: {
        user_id: USER_ID,
        title: "Brush teeth",
        description: null,
        recurrence_rule: { frequency: "daily", interval: 1 },
        scheduled_time: "07:30",
        timezone: "America/New_York",
        browser_reminder_enabled: true,
        email_reminder_enabled: false,
        reminder_offset_minutes: 0,
        active: true,
        archived_at: null,
        created_at: "2026-05-01T12:00:00Z",
      },
      definitionEventPlan: {
        ...initialPlan(),
        recordedAt: "2026-05-01T12:00:00Z",
        source: "import",
      },
    });

    expect(rpc).toHaveBeenCalledWith(
      "create_behavior_with_definition_event",
      expect.objectContaining({
        behavior_payload: expect.objectContaining({
          created_at: "2026-05-01T12:00:00Z",
        }),
        definition_event_plan: expect.objectContaining({
          recorded_at: "2026-05-01T12:00:00Z",
          source: "import",
        }),
      }),
    );
  });

  it("inserts an append-only definition event", async () => {
    const event = storedEvent();
    const single = vi.fn().mockResolvedValue({ data: event, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as unknown as AppSupabaseClient;

    const result = await createBehaviorDefinitionEvent(supabase, {
      user_id: USER_ID,
      behavior_id: BEHAVIOR_ID,
      previous_title: null,
      next_title: "Brush teeth",
      previous_description: null,
      next_description: null,
      changed_fields: ["title"],
      recorded_at: "2026-07-09T18:30:00Z",
      source: "manual",
      reason: null,
    });

    expect(result).toEqual(event);
    expect(from).toHaveBeenCalledWith("behavior_definition_events");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        behavior_id: BEHAVIOR_ID,
        changed_fields: ["title"],
      }),
    );
  });

  it("lists only the authenticated user's history in stable event order", async () => {
    const events = [storedEvent()];
    const builder: {
      select: ReturnType<typeof vi.fn>;
      eq: ReturnType<typeof vi.fn>;
      order: ReturnType<typeof vi.fn>;
    } = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    };
    builder.select.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.order
      .mockReturnValueOnce(builder)
      .mockResolvedValueOnce({ data: events, error: null });
    const from = vi.fn().mockReturnValue(builder);
    const supabase = { from } as unknown as AppSupabaseClient;

    const result = await listBehaviorDefinitionEvents(supabase, USER_ID);

    expect(result).toEqual(events);
    expect(builder.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(builder.order).toHaveBeenNthCalledWith(1, "recorded_at", {
      ascending: true,
    });
    expect(builder.order).toHaveBeenNthCalledWith(2, "id", {
      ascending: true,
    });
  });
});

function storedEvent(): BehaviorDefinitionEvent {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    user_id: USER_ID,
    behavior_id: BEHAVIOR_ID,
    previous_title: null,
    next_title: "Brush teeth",
    previous_description: null,
    next_description: null,
    changed_fields: ["title"],
    recorded_at: "2026-07-09T18:30:00Z",
    source: "manual",
    reason: null,
    created_at: "2026-07-09T18:30:00Z",
    updated_at: "2026-07-09T18:30:00Z",
  };
}

function initialPlan() {
  return {
    previousTitle: null,
    nextTitle: "Brush teeth",
    previousDescription: null,
    nextDescription: null,
    changedFields: ["title"] as ("title" | "description")[],
    recordedAt: "2026-07-09T18:30:00Z",
    source: "manual" as const,
    reason: null,
  };
}

function storedBehaviorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BEHAVIOR_ID,
    user_id: USER_ID,
    category_id: null,
    title: "Brush teeth",
    description: null,
    recurrence_rule: { frequency: "daily", interval: 1 },
    scheduled_time: "07:30",
    timezone: "America/New_York",
    browser_reminder_enabled: true,
    email_reminder_enabled: false,
    reminder_offset_minutes: 0,
    active: true,
    archived_at: null,
    created_at: "2026-07-09T18:30:00Z",
    updated_at: "2026-07-09T18:30:00Z",
    ...overrides,
  };
}
