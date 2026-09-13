import type { NoteShortcutStore } from "@cadence/core/types/note-shortcut";
import { localCommand, localMutation } from "./local-store";

export function createLocalNoteShortcutStore(profileId: string): NoteShortcutStore {
  return {
    userId: profileId,
    readStates: () => localCommand("readNoteShortcutStates", { profileId }),
    readContext: (behaviorId) => localCommand("readNoteShortcutContext", { profileId, behaviorId }),
    commit: ({ expected, next, requireEnabled }) => localCommand("commitNoteShortcutState", {
      ...localMutation(profileId, next.updated_at), expected, next, requireEnabled,
    }),
  };
}
