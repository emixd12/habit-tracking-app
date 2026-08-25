import { describe, expect, it, vi } from "vitest";

import {
  createBehaviorDefinitionEvent,
  createBehaviorWithAtomicScheduleGraph,
  createBehaviorWithDefinitionEvent,
  listBehaviorDefinitionEvents,
  updateBehaviorWithAtomicScheduleGraph,
  updateBehaviorWithDefinitionEvent,
} from "../lib/db/behaviorDefinitionEvents.repo";
import type { AppSupabaseClient } from "../lib/db/behaviors.repo";
import type { BehaviorDefinitionEvent } from "../lib/types/database";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BEHAVIOR_ID = "22222222-2222-4222-8222-222222222222";

describe("behavior definition events repository", () => {
  it("persists manual create, definition history, schedules, and stale state through one RPC", async () => {
    const behavior = storedBehaviorRow();
    const rpc = vi.fn().mockResolvedValue({ data: behavior, error: null });
    const supabase = { rpc } as unknown as AppSupabaseClient;

    await expect(
      createBehaviorWithAtomicScheduleGraph(supabase, {
        behavior: {
          user_id: USER_ID,
          title: "Brush teeth",
          description: null,
          recurrence_rule: { frequency: "weekly", interval: 1, daysOfWeek: ["friday"] },
          scheduled_time: "11:30",
          timezone: "America/New_York",
          browser_reminder_enabled: true,
          email_reminder_enabled: false,
          reminder_offset_minutes: 0,
          active: true,
          archived_at: null,
        },
        definitionEventPlan: initialPlan(),
        configurationEventPlan: initialConfigurationPlan(),
        schedules: [weeklyFridaySchedule()],
      }),
    ).resolves.toEqual(behavior);

    expect(rpc).toHaveBeenCalledWith(
      "create_behavior_with_schedule_graph",
      expect.objectContaining({
        schedule_graph: [
          expect.objectContaining({
            time_entries: [
              expect.objectContaining({ start_time: "11:30" }),
            ],
          }),
        ],
      }),
    );
  });

  it("binds an atomic manual update to exact definition, schedule, and row-version state", async () => {
    const behavior = storedBehaviorRow({ title: "Brush and floss" });
    const rpc = vi.fn().mockResolvedValue({ data: behavior, error: null });
    const supabase = { rpc } as unknown as AppSupabaseClient;
    const expectedScheduleGraph = [weeklyFridaySchedule()];

    await updateBehaviorWithAtomicScheduleGraph(supabase, {
      behaviorId: BEHAVIOR_ID,
      behavior: {
        title: "Brush and floss",
        description: null,
        recurrence_rule: { frequency: "weekly", interval: 1, daysOfWeek: ["friday"] },
        scheduled_time: "11:30",
        browser_reminder_enabled: true,
        email_reminder_enabled: false,
        reminder_offset_minutes: 0,
        active: true,
        archived_at: null,
      },
      expectedDefinition: { title: "Brush teeth", description: null },
      expectedNormalizedDefinition: {
        title: "Brush teeth",
        description: null,
      },
      expectedScheduleGraph,
      expectedUpdatedAt: "2026-07-09T18:30:00Z",
      definitionEventPlan: {
        ...initialPlan(),
        previousTitle: "Brush teeth",
        nextTitle: "Brush and floss",
      },
      configurationEventPlan: null,
      schedules: expectedScheduleGraph,
    });

    expect(rpc).toHaveBeenCalledWith(
      "update_behavior_with_schedule_graph",
      expect.objectContaining({
        target_behavior_id: BEHAVIOR_ID,
        expected_updated_at: "2026-07-09T18:30:00Z",
        expected_schedule_graph: expect.any(Array),
        schedule_graph: expect.any(Array),
      }),
    );
  });

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
    const highWaterBuilder = chainBuilder();
    const pageBuilder = chainBuilder();
    highWaterBuilder.limit.mockResolvedValue({
      data: [{ id: events[0].id, recorded_at: events[0].recorded_at }],
      error: null,
    });
    pageBuilder.limit.mockResolvedValue({ data: events, error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(highWaterBuilder)
      .mockReturnValueOnce(pageBuilder);
    const supabase = { from } as unknown as AppSupabaseClient;

    const result = await listBehaviorDefinitionEvents(supabase, USER_ID);

    expect(result).toEqual(events);
    expect(pageBuilder.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(pageBuilder.order).toHaveBeenNthCalledWith(1, "recorded_at", {
      ascending: true,
    });
    expect(pageBuilder.order).toHaveBeenNthCalledWith(2, "id", {
      ascending: true,
    });
  });

  it("reads every definition event past the Data API cap with one fixed high-water", async () => {
    const events = Array.from({ length: 1_001 }, (_, index) =>
      storedEvent({ id: definitionEventId(index) }),
    );
    const highWaterBuilder = pagedQueryBuilder({
      data: [
        {
          id: events.at(-1)?.id,
          recorded_at: events.at(-1)?.recorded_at,
        },
      ],
      error: null,
    });
    const firstPageBuilder = pagedQueryBuilder({
      data: events.slice(0, 1_000),
      error: null,
    });
    const finalPageBuilder = pagedQueryBuilder({
      data: events.slice(1_000),
      error: null,
    });
    const from = vi
      .fn()
      .mockReturnValueOnce(highWaterBuilder)
      .mockReturnValueOnce(firstPageBuilder)
      .mockReturnValueOnce(finalPageBuilder);

    const result = await listBehaviorDefinitionEvents(
      { from } as unknown as AppSupabaseClient,
      USER_ID,
    );

    expect(result).toHaveLength(1_001);
    expect(result.at(-1)?.id).toBe(definitionEventId(1_000));
    expect(finalPageBuilder.or).toHaveBeenCalledWith(
      `recorded_at.gt.2026-07-09T18:30:00Z,and(recorded_at.eq.2026-07-09T18:30:00Z,id.gt.${definitionEventId(999)})`,
    );
  });

  it("fails loudly when a later page is empty before the captured high-water", async () => {
    const firstPage = Array.from({ length: 1_000 }, (_, index) =>
      storedEvent({ id: definitionEventId(index) }),
    );
    const highWaterBuilder = pagedQueryBuilder({
      data: [
        {
          id: definitionEventId(1_000),
          recorded_at: "2026-07-09T18:30:00Z",
        },
      ],
      error: null,
    });
    const firstPageBuilder = pagedQueryBuilder({
      data: firstPage,
      error: null,
    });
    const emptyPageBuilder = pagedQueryBuilder({ data: [], error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(highWaterBuilder)
      .mockReturnValueOnce(firstPageBuilder)
      .mockReturnValueOnce(emptyPageBuilder);

    await expect(
      listBehaviorDefinitionEvents(
        { from } as unknown as AppSupabaseClient,
        USER_ID,
      ),
    ).rejects.toThrow(
      "Behavior definition history pagination ended before the captured high-water event.",
    );
  });
});

function chainBuilder() {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    lte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    or: vi.fn(),
  };

  for (const method of ["select", "eq", "lte", "order", "or"] as const) {
    builder[method].mockReturnValue(builder);
  }

  return builder;
}

function pagedQueryBuilder(response: {
  data: unknown[];
  error: Error | null;
}) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    lte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    or: vi.fn(),
    then: (
      onFulfilled: (value: typeof response) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(response).then(onFulfilled, onRejected),
  };

  for (const method of [
    "select",
    "eq",
    "lte",
    "order",
    "limit",
    "or",
  ] as const) {
    builder[method].mockReturnValue(builder);
  }

  return builder;
}

function weeklyFridaySchedule() {
  return {
    id: null,
    recurrence_rule: {
      frequency: "weekly",
      interval: 1,
      daysOfWeek: ["friday"],
    },
    sort_order: 0,
    slots: [
      {
        id: null,
        kind: "exact",
        preset: null,
        start_time: "11:30",
        end_time: null,
        sort_order: 0,
      },
    ],
  };
}

function storedEvent(
  overrides: Partial<BehaviorDefinitionEvent> = {},
): BehaviorDefinitionEvent {
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
    ...overrides,
  };
}

function definitionEventId(index: number): string {
  return `event-${String(index).padStart(4, "0")}`;
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

function initialConfigurationPlan() {
  return {
    eventKind: "baseline" as const,
    previousConfiguration: null,
    nextConfiguration: {
      categoryId: null,
      scheduleGraph: [
        {
          recurrenceRule: {
            frequency: "weekly",
            interval: 1,
            daysOfWeek: ["friday"],
          },
          sortOrder: 0,
          timeEntries: [
            {
              kind: "exact",
              preset: null,
              startTime: "11:30:00",
              endTime: null,
              sortOrder: 0,
            },
          ],
        },
      ],
      browserReminderEnabled: true,
      emailReminderEnabled: false,
      reminderOffsetMinutes: 0,
      active: true,
      timezone: "America/New_York",
    },
    changedFields: [
      "category_id",
      "schedule_graph",
      "browser_reminder_enabled",
      "email_reminder_enabled",
      "reminder_offset_minutes",
      "active",
      "timezone",
    ] as (
      | "category_id"
      | "schedule_graph"
      | "browser_reminder_enabled"
      | "email_reminder_enabled"
      | "reminder_offset_minutes"
      | "active"
      | "timezone"
    )[],
    recordedAt: "2026-07-09T18:30:00Z",
    effectiveAt: "2026-07-09T18:30:00Z",
    effectiveLocalDate: "2026-07-09",
    timezone: "America/New_York",
    source: "manual" as const,
    reasonCode: "behavior_created",
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
