import type { AppSupabaseClient } from "./behaviors.repo";
import type { Json } from "./database.types";
import { toBehaviorConfigurationEventPlanPayload } from "@cadence/core/services/configuration-payload";
import type { ManagedCategory, planCategoryRemoval } from "@cadence/core/services/category.service";

export async function commitCategoryChange(supabase: AppSupabaseClient, expected: readonly ManagedCategory[],
  categories: readonly ManagedCategory[], changes: ReturnType<typeof planCategoryRemoval>) {
  const { error } = await supabase.rpc("manage_categories", {
    expected_categories: expected as unknown as Json,
    next_categories: categories as unknown as Json,
    behavior_changes: changes.map((change) => ({ behavior_id: change.behaviorId,
      expected_updated_at: change.expectedUpdatedAt,
      configuration_event_plan: toBehaviorConfigurationEventPlanPayload(change.configurationEventPlan) })) as Json,
  });
  if (error) throw new Error(error.code === "23505" ? "A category with this name already exists." : error.message);
}
