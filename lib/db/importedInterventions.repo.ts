import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import { readAllPostgrestRows } from "@/lib/db/paginated-read";
import type {
  ImportedIntervention,
  NewImportedIntervention,
} from "@/lib/types/database";

export async function createImportedIntervention(
  supabase: AppSupabaseClient,
  intervention: NewImportedIntervention,
): Promise<ImportedIntervention> {
  const { data, error } = await supabase
    .from("imported_interventions")
    .insert(intervention)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getImportedInterventionByImportIdentity(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    importRunId: string;
    externalId: string;
  },
): Promise<ImportedIntervention | null> {
  const { data, error } = await supabase
    .from("imported_interventions")
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

export async function listImportedInterventions(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<ImportedIntervention[]> {
  return readAllPostgrestRows<ImportedIntervention>({
    label: "Imported interventions",
    getRowKey: (intervention) => intervention.id,
    createQuery: () =>
      supabase
        .from("imported_interventions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
  });
}

export async function listImportedInterventionsByIds(
  supabase: AppSupabaseClient,
  input: {
    userId: string;
    ids: string[];
  },
): Promise<ImportedIntervention[]> {
  if (input.ids.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("imported_interventions")
    .select("*")
    .eq("user_id", input.userId)
    .in("id", input.ids)
    .order("scheduled_send_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}
