import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import type { ImportedNote, NewImportedNote } from "@/lib/types/database";

export async function createImportedNote(
  supabase: AppSupabaseClient,
  note: NewImportedNote,
): Promise<ImportedNote> {
  const { data, error } = await supabase
    .from("imported_notes")
    .insert(note)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getImportedNoteByImportIdentity(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    importRunId: string;
    externalId: string;
  },
): Promise<ImportedNote | null> {
  const { data, error } = await supabase
    .from("imported_notes")
    .select("*")
    .eq("user_id", input.userId)
    .eq("import_run_id", input.importRunId)
    .eq("external_id", input.externalId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function listImportedNotes(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<ImportedNote[]> {
  const { data, error } = await supabase
    .from("imported_notes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}
