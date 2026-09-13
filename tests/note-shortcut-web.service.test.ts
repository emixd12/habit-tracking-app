import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireCurrentUserId } from "@/lib/auth/current-user";
import { createNoteShortcutStore } from "@/lib/db/noteShortcuts.repo";
import {
  getNoteShortcutViewForCurrentUser,
  listAcceptedNoteShortcutsForCurrentUser,
  manageNoteShortcutsForCurrentUser,
} from "@/lib/services/note-shortcut.service";
import { createClient } from "@/lib/supabase/server";
import {
  getNoteShortcutView,
  listAcceptedNoteShortcuts,
  manageNoteShortcuts,
} from "@cadence/core/services/note-shortcut.service";

vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUserId: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db/noteShortcuts.repo", () => ({ createNoteShortcutStore: vi.fn() }));
vi.mock("@cadence/core/services/note-shortcut.service", () => ({
  getNoteShortcutView: vi.fn(),
  manageNoteShortcuts: vi.fn(),
  listAcceptedNoteShortcuts: vi.fn(),
}));

const STORE = { userId: "user-1" } as never;
const REVISION = "a".repeat(64);

describe("Note shortcut web service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCurrentUserId).mockResolvedValue("user-1");
    vi.mocked(createClient).mockResolvedValue({} as never);
    vi.mocked(createNoteShortcutStore).mockReturnValue(STORE);
  });

  it("passes the rendered string revision to shared management", async () => {
    const state = { id: "state" } as never;
    vi.mocked(manageNoteShortcuts).mockResolvedValue(state);
    const command = { operation: "analyze" } as const;

    await expect(manageNoteShortcutsForCurrentUser(
      "behavior-1",
      command,
      REVISION,
    )).resolves.toBe(state);

    expect(manageNoteShortcuts).toHaveBeenCalledWith(STORE, expect.objectContaining({
      behaviorId: "behavior-1",
      command,
      expectedRevision: REVISION,
    }));
  });

  it("rejects malformed revision tokens before opening the store", async () => {
    await expect(manageNoteShortcutsForCurrentUser(
      null,
      { operation: "enable", enabled: true },
      "0",
    )).rejects.toThrow("changed elsewhere");
    expect(requireCurrentUserId).not.toHaveBeenCalled();
  });

  it("delegates view and accepted-shortcut reads to shared services", async () => {
    const view = { entries: [] } as never;
    vi.mocked(getNoteShortcutView).mockResolvedValue(view);
    vi.mocked(listAcceptedNoteShortcuts).mockResolvedValue({});

    await expect(getNoteShortcutViewForCurrentUser(null)).resolves.toBe(view);
    await expect(listAcceptedNoteShortcutsForCurrentUser()).resolves.toEqual({});

    expect(getNoteShortcutView).toHaveBeenCalledWith(
      STORE,
      null,
      expect.anything(),
    );
    expect(listAcceptedNoteShortcuts).toHaveBeenCalledWith(STORE);
  });
});
