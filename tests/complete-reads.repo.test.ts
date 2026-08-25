import { describe, expect, it, vi } from "vitest";

import { listBehaviorLogImportRecordMappings } from "@/lib/db/behaviorLogImports.repo";
import { listUserBehaviors } from "@/lib/db/behaviors.repo";
import { listImportedInterventions } from "@/lib/db/importedInterventions.repo";
import { listImportedNotes } from "@/lib/db/notes.repo";
import { listUserOccurrences } from "@/lib/db/occurrences.repo";
import { listOccurrenceStatusEventsByOccurrenceIds } from "@/lib/db/occurrenceStatusEvents.repo";

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("complete export and restore repository reads", () => {
  it.each([
    ["occurrences", listUserOccurrences, occurrenceRow],
    ["imported notes", listImportedNotes, importedNoteRow],
    ["import mappings", listBehaviorLogImportRecordMappings, mappingRow],
    ["imported interventions", listImportedInterventions, interventionRow],
  ] as const)("reads every %s row across PostgREST pages", async (_label, read, makeRow) => {
    const rows = Array.from({ length: 1_001 }, (_, index) => makeRow(index));
    const { supabase, ranges } = pagedSupabase([
      rows.slice(0, 1_000),
      rows.slice(1_000),
    ]);

    const result = await read(supabase as never, USER_ID);

    expect(result).toHaveLength(1_001);
    expect(result[0]?.id).toBe("row-0000");
    expect(result.at(-1)?.id).toBe("row-1000");
    expect(ranges).toEqual([
      [0, 999],
      [1_000, 1_999],
    ]);
  });

  it("reads and assembles every Behavior schedule row across PostgREST pages", async () => {
    const behaviors = Array.from({ length: 1_001 }, (_, index) =>
      behaviorRow(index),
    );
    const schedules = Array.from({ length: 1_001 }, (_, index) =>
      scheduleRow(index),
    );
    const slots = Array.from({ length: 1_001 }, (_, index) => slotRow(index));
    const { supabase, ranges } = tablePagedSupabase({
      behaviors,
      behavior_schedules: schedules,
      behavior_schedule_slots: slots,
    });

    const result = await listUserBehaviors(supabase as never, USER_ID);

    expect(result).toHaveLength(1_001);
    expect(result.at(-1)?.schedules).toEqual([
      expect.objectContaining({ id: "schedule-1000" }),
    ]);
    expect(result.at(-1)?.schedule_slots).toEqual([
      expect.objectContaining({ id: "slot-1000" }),
    ]);
    expect(ranges).toEqual(
      expect.arrayContaining([
        ["behaviors", 0, 999],
        ["behaviors", 1_000, 1_999],
        ["behavior_schedules", 0, 999],
        ["behavior_schedules", 1_000, 1_999],
        ["behavior_schedule_slots", 0, 999],
        ["behavior_schedule_slots", 1_000, 1_999],
      ]),
    );
  });

  it("pages complete status-event results for an occurrence-ID filter", async () => {
    const events = Array.from({ length: 1_001 }, (_, index) =>
      statusEventRow(index),
    );
    const { supabase, ranges, builders } = pagedSupabase([
      events.slice(0, 1_000),
      events.slice(1_000),
    ]);
    const occurrenceIds = [id("occurrence", 0)];

    const result = await listOccurrenceStatusEventsByOccurrenceIds(
      supabase as never,
      USER_ID,
      occurrenceIds,
    );

    expect(result).toHaveLength(1_001);
    expect(ranges).toEqual([
      [0, 999],
      [1_000, 1_999],
    ]);
    expect(builders[0]?.in).toHaveBeenCalledWith(
      "occurrence_id",
      occurrenceIds,
    );
  });

  it("bounds large status-event occurrence-ID filters before merging results", async () => {
    const occurrenceIds = Array.from({ length: 501 }, (_, index) =>
      id("occurrence", index),
    );
    const { supabase, builders } = pagedSupabase([
      [statusEventRow(0)],
      [statusEventRow(500)],
    ]);

    const result = await listOccurrenceStatusEventsByOccurrenceIds(
      supabase as never,
      USER_ID,
      occurrenceIds,
    );

    expect(result).toHaveLength(2);
    expect(builders[0]?.in).toHaveBeenCalledWith(
      "occurrence_id",
      occurrenceIds.slice(0, 500),
    );
    expect(builders[1]?.in).toHaveBeenCalledWith(
      "occurrence_id",
      occurrenceIds.slice(500),
    );
  });
});

function pagedSupabase(pages: unknown[][]) {
  const ranges: Array<[number, number]> = [];
  const builders: ReturnType<typeof queryBuilder>[] = [];
  let pageIndex = 0;
  const from = vi.fn(() => {
    const builder = queryBuilder(async (start, end) => {
      ranges.push([start, end]);
      return { data: pages[pageIndex++] ?? [], error: null };
    });
    builders.push(builder);
    return builder;
  });

  return { supabase: { from }, ranges, builders };
}

function tablePagedSupabase(tables: Record<string, unknown[]>) {
  const ranges: Array<[string, number, number]> = [];
  const from = vi.fn((table: string) =>
    queryBuilder(async (start, end) => {
      ranges.push([table, start, end]);
      return { data: (tables[table] ?? []).slice(start, end + 1), error: null };
    }),
  );

  return { supabase: { from }, ranges };
}

function queryBuilder(
  resolveRange: (start: number, end: number) => Promise<{
    data: unknown[];
    error: null;
  }>,
) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    range: vi.fn(resolveRange),
  };

  for (const method of ["select", "eq", "in", "order"] as const) {
    builder[method].mockReturnValue(builder);
  }

  return builder;
}

function behaviorRow(index: number) {
  return {
    id: rowId(index),
    active: true,
    scheduled_time: "08:00:00",
    title: rowId(index),
    category: null,
  };
}

function scheduleRow(index: number) {
  return {
    id: id("schedule", index),
    behavior_id: rowId(index),
    sort_order: 0,
  };
}

function slotRow(index: number) {
  return {
    id: id("slot", index),
    behavior_id: rowId(index),
    behavior_schedule_id: id("schedule", index),
    sort_order: 0,
    start_time: "08:00:00",
  };
}

function occurrenceRow(index: number) {
  return {
    id: rowId(index),
    local_date: "2026-08-25",
    scheduled_for: `2026-08-25T${String(index % 24).padStart(2, "0")}:00:00Z`,
  };
}

function importedNoteRow(index: number) {
  return { id: rowId(index), created_at: "2026-08-25T00:00:00Z" };
}

function mappingRow(index: number) {
  return {
    id: rowId(index),
    record_type: "occurrence",
    external_id: rowId(index),
  };
}

function interventionRow(index: number) {
  return { id: rowId(index), created_at: "2026-08-25T00:00:00Z" };
}

function statusEventRow(index: number) {
  return {
    id: rowId(index),
    occurrence_id: id("occurrence", index),
    recorded_at: "2026-08-25T00:00:00Z",
  };
}

function rowId(index: number): string {
  return id("row", index);
}

function id(prefix: string, index: number): string {
  return `${prefix}-${String(index).padStart(4, "0")}`;
}
