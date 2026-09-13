import { Temporal } from "@js-temporal/polyfill";
import {
  getNoteShortcutView,
  listAcceptedNoteShortcuts,
  manageNoteShortcuts,
} from "@cadence/core/services/note-shortcut.service";
import type {
  NoteShortcut,
  NoteShortcutCommand,
  NoteShortcutState,
  NoteShortcutView,
} from "@cadence/core/types/note-shortcut";

import { requireCurrentUserId } from "@/lib/auth/current-user";
import { createNoteShortcutStore } from "@/lib/db/noteShortcuts.repo";
import { createClient } from "@/lib/supabase/server";

export async function getNoteShortcutViewForCurrentUser(
  behaviorId: string | null,
): Promise<NoteShortcutView> {
  const store = await currentUserStore();
  return getNoteShortcutView(store, behaviorId, Temporal.Now.instant());
}

export async function manageNoteShortcutsForCurrentUser(
  behaviorId: string | null,
  command: NoteShortcutCommand,
  expectedRevision: string,
): Promise<NoteShortcutState> {
  if (!/^[a-f0-9]{64}$/.test(expectedRevision)) {
    throw new Error("This shortcut changed elsewhere. Refresh and try again.");
  }
  const store = await currentUserStore();
  return manageNoteShortcuts(store, {
    behaviorId,
    command,
    expectedRevision,
    now: Temporal.Now.instant(),
  });
}

export async function listAcceptedNoteShortcutsForCurrentUser(): Promise<
  Record<string, NoteShortcut[]>
> {
  const store = await currentUserStore();
  return listAcceptedNoteShortcuts(store);
}

async function currentUserStore() {
  const userId = await requireCurrentUserId(
    "Sign in again before managing Note shortcuts.",
  );
  const supabase = await createClient();
  return createNoteShortcutStore(supabase, userId);
}
