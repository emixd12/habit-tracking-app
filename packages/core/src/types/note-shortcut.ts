export type NoteShortcutEvidence = { occurrence_id: string; note_hash: string };
export type NoteShortcut = {
  key: string;
  text: string | null;
  status: "proposed" | "accepted" | "dismissed";
  source: "repeated_text" | "model";
  evidence: NoteShortcutEvidence[];
  created_at: string;
  expires_at: string | null;
};
export type NoteShortcutState = {
  id: string;
  user_id: string;
  behavior_id: string | null;
  enabled: boolean;
  entries: NoteShortcut[];
  excluded_occurrence_ids: string[];
  revision: number;
  updated_at: string;
};
export type NoteSource = {
  id: string;
  user_id: string;
  behavior_id: string;
  note: string | null;
  local_date: string;
  scheduled_for: string;
};
export type NoteShortcutContext = {
  state: NoteShortcutState | null;
  globalState: NoteShortcutState | null;
  behavior: { id: string; user_id: string; active: boolean; timezone: string } | null;
  notes: NoteSource[];
  importedOccurrenceIds: string[];
};
export type NoteShortcutStore = {
  userId: string;
  readStates(): Promise<NoteShortcutState[]>;
  readContext(behaviorId: string | null): Promise<NoteShortcutContext>;
  commit(input: { expected: NoteShortcutContext; next: NoteShortcutState; requireEnabled: boolean }): Promise<NoteShortcutState>;
};
export type NoteShortcutCommand =
  | { operation: "enable"; enabled: boolean }
  | { operation: "analyze" }
  | { operation: "accept" | "edit"; key: string; text: string }
  | { operation: "dismiss" | "remove"; key: string };
export type NoteShortcutView = {
  state: NoteShortcutState | null;
  globalEnabled: boolean;
  available: boolean;
  entries: NoteShortcut[];
  unavailable?: boolean;
};
