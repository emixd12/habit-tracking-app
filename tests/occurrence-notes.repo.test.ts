import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateOccurrenceNoteIfExpected } from "@/lib/db/occurrences.repo";

const maybeSingle = vi.fn();
const select = vi.fn(() => ({ maybeSingle }));
const is = vi.fn(() => ({ select }));
const eq = vi.fn();
const update = vi.fn();
const from = vi.fn(() => ({ update }));
const rpc = vi.fn(() => ({ maybeSingle }));
const supabase = { from, rpc } as never;

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

  it("uses the atomic shortcut Note RPC when a shortcut filled the draft", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "occurrence-1" }, error: null });

    await updateOccurrenceNoteIfExpected(supabase, {
      userId: "user-1",
      occurrenceId: "occurrence-1",
      expectedNote: null,
      note: "Wore aligners overnight",
      usedShortcut: true,
    });

    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("update_occurrence_note_with_shortcut", {
      target_occurrence_id: "occurrence-1",
      expected_note: null,
      next_note: "Wore aligners overnight",
      used_shortcut: true,
    });
  });
});
