import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import { readAllPostgrestRows } from "@/lib/db/paginated-read";
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
    externalId: string;
    targetType: string;
    targetExternalId: string;
  },
): Promise<ImportedNote | null> {
  const { data, error } = await supabase
    .from("imported_notes")
    .select("*")
    .eq("user_id", input.userId)
    .eq("external_id", input.externalId)
    .eq("target_type", input.targetType)
    .eq("target_external_id", input.targetExternalId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
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
  return readAllPostgrestRows<ImportedNote>({
    label: "Imported notes",
    getRowKey: (note) => note.id,
    createQuery: () =>
      supabase
        .from("imported_notes")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
  });
}
