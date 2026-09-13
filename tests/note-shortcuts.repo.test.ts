import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  commitNoteShortcutState,
  createNoteShortcutStore,
  readNoteShortcutContext,
  readNoteShortcutStates,
} from "@/lib/db/noteShortcuts.repo";
import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import type { NoteShortcutState } from "@cadence/core/types/note-shortcut";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BEHAVIOR_ID = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-09-07T12:00:00Z";

const behaviorState: NoteShortcutState = {
  id: BEHAVIOR_ID,
  user_id: USER_ID,
  behavior_id: BEHAVIOR_ID,
  enabled: true,
  entries: [],
  excluded_occurrence_ids: [],
  revision: 1,
  updated_at: NOW,
};

describe("Note shortcut web repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads and validates the owner-scoped transactional context", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        state: behaviorState,
        globalState: null,
        behavior: {
          id: BEHAVIOR_ID,
          user_id: USER_ID,
          active: true,
          timezone: "America/New_York",
        },
        notes: [{
          id: "33333333-3333-4333-8333-333333333333",
          user_id: USER_ID,
          behavior_id: BEHAVIOR_ID,
          note: "Wore aligners overnight",
          local_date: "2026-09-07",
          scheduled_for: NOW,
        }],
        importedOccurrenceIds: [],
      },
      error: null,
    });
    const client = { rpc } as unknown as AppSupabaseClient;

    const context = await readNoteShortcutContext(client, USER_ID, BEHAVIOR_ID);

    expect(context.state).toEqual(behaviorState);
    expect(context.notes).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith("read_note_shortcut_context", {
      target_behavior_id: BEHAVIOR_ID,
    });
  });

  it("commits the full expected context through one RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: behaviorState, error: null });
    const client = { rpc } as unknown as AppSupabaseClient;
    const expected = {
      state: null,
      globalState: null,
      behavior: null,
      notes: [],
      importedOccurrenceIds: [],
    };

    await expect(commitNoteShortcutState(client, USER_ID, {
      expected,
      next: behaviorState,
      requireEnabled: false,
    })).resolves.toEqual(behaviorState);

    expect(rpc).toHaveBeenCalledWith("commit_note_shortcut_state", {
      expected_context: expected,
      next_state: behaviorState,
      require_enabled: false,
    });
  });

  it("reads every state page in stable ID order", async () => {
    const range = vi.fn().mockResolvedValue({ data: [behaviorState], error: null });
    const order = vi.fn(() => ({ range }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const client = { from } as unknown as AppSupabaseClient;

    await expect(readNoteShortcutStates(client, USER_ID)).resolves.toEqual([
      behaviorState,
    ]);
    expect(order).toHaveBeenCalledWith("id", { ascending: true });
  });

  it("creates a store scoped to the supplied owner", () => {
    const store = createNoteShortcutStore({} as AppSupabaseClient, USER_ID);
    expect(store.userId).toBe(USER_ID);
  });
});
