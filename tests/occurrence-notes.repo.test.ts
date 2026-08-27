import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateOccurrenceNoteIfExpected } from "@/lib/db/occurrences.repo";

const maybeSingle = vi.fn();
const select = vi.fn(() => ({ maybeSingle }));
const is = vi.fn(() => ({ select }));
const eq = vi.fn();
const update = vi.fn();
const from = vi.fn(() => ({ update }));
const supabase = { from } as never;

describe("updateOccurrenceNoteIfExpected", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingle.mockResolvedValue({ data: null, error: null });
    eq.mockReturnValue({ eq, is, select });
    update.mockReturnValue({ eq });
  });

  it.each([
    { expectedNote: null, method: is, value: null },
    { expectedNote: "Prior note", method: eq, value: "Prior note" },
  ])("guards the write with the exact prior note", async ({
    expectedNote,
    method,
    value,
  }) => {
    await updateOccurrenceNoteIfExpected(supabase, {
      userId: "user-1",
      occurrenceId: "occurrence-1",
      expectedNote,
      note: "New note",
    });

    expect(update).toHaveBeenCalledWith({ note: "New note" });
    expect(method).toHaveBeenCalledWith("note", value);
  });
});
