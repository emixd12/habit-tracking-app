import type { Temporal } from "@js-temporal/polyfill";
import { currentNoteShortcuts, noteShortcutRevision, resolveNoteShortcutCommand, validateNoteShortcutState } from "../resolvers/note-suggestion.resolver";
import type { NoteShortcut, NoteShortcutCommand, NoteShortcutStore, NoteShortcutView } from "../types/note-shortcut";

export async function getNoteShortcutView(store: NoteShortcutStore, behaviorId: string | null, now: Temporal.Instant): Promise<NoteShortcutView> {
  try {
    const context = await store.readContext(behaviorId);
    if (behaviorId && (!context.behavior || context.behavior.user_id !== store.userId || context.behavior.id !== behaviorId)) throw new Error("Behavior not found.");
    for (const state of [context.state, context.globalState]) {
      if (!state) continue;
      validateNoteShortcutState(state);
      if (state.user_id !== store.userId) throw new Error("Shortcut state belongs to another owner.");
    }
    if (context.state && context.state.behavior_id !== behaviorId) throw new Error("Shortcut state belongs to another Behavior.");
    if (context.globalState && context.globalState.id !== "global") throw new Error("Invalid global shortcut state.");
    return { state: context.state, globalEnabled: context.globalState?.enabled ?? false, available: !behaviorId || context.behavior?.active === true, entries: currentNoteShortcuts({ context, userId: store.userId, now }) };
  } catch {
    return { state: null, globalEnabled: false, available: false, entries: [], unavailable: true };
  }
}

export async function manageNoteShortcuts(store: NoteShortcutStore, input: { behaviorId: string | null; command: NoteShortcutCommand; expectedRevision: string; now: Temporal.Instant }) {
  const expected = await store.readContext(input.behaviorId);
  if (input.expectedRevision !== noteShortcutRevision(expected.state)) throw new Error("This shortcut changed elsewhere. Refresh and try again.");
  const next = resolveNoteShortcutCommand({ ...input, context: expected, userId: store.userId });
  return store.commit({ expected, next, requireEnabled: ["analyze", "accept", "edit"].includes(input.command.operation) });
}

export async function listAcceptedNoteShortcuts(store: NoteShortcutStore): Promise<Record<string, NoteShortcut[]>> {
  try {
    const states = await store.readStates();
    for (const state of states) {
      validateNoteShortcutState(state);
      if (state.user_id !== store.userId) throw new Error("Shortcut state belongs to another owner.");
    }
    if (!states.find((state) => state.id === "global")?.enabled) return {};
    return Object.fromEntries(states.filter((state) => state.behavior_id && state.enabled).map((state) => [state.behavior_id!, state.entries.filter((entry) => entry.status === "accepted")]));
  } catch {
    return {};
  }
}
