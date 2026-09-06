import { Temporal } from "@js-temporal/polyfill";
import { requireCurrentUserId } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { listBehaviorCategories, listUserBehaviors } from "@/lib/db/behaviors.repo";
import { commitCategoryChange } from "@/lib/db/categories.repo";
import { invalidateBehaviorData } from "@/lib/cache/stable-user-data.cache";
import { verifyCategoryDeletionReview, planCategoryChange, planCategoryRemoval } from "@cadence/core/services/category.service";

export async function getCategorySettings() {
  const userId = await requireCurrentUserId("Sign in before opening category settings.");
  const supabase = await createClient();
  const [categories, behaviors] = await Promise.all([listBehaviorCategories(supabase, userId), listUserBehaviors(supabase, userId)]);
  return { categories, assignments: behaviors.map((behavior) => ({ id: behavior.id, categoryId: behavior.category_id, active: behavior.active, updatedAt: behavior.updated_at })) };
}

export async function changeCurrentUserCategory(form: { get(name: string): unknown }) {
  const userId = await requireCurrentUserId("Sign in before changing categories.");
  const supabase = await createClient();
  const categories = await listBehaviorCategories(supabase, userId);
  const now = Temporal.Now.instant().toString();
  const plan = planCategoryChange(categories, form, crypto.randomUUID(), now);
  const behaviors = plan.deletedId ? await listUserBehaviors(supabase, userId) : [];
  verifyCategoryDeletionReview(form, behaviors.map((behavior) => ({ id: behavior.id, categoryId: behavior.category_id, active: behavior.active, updatedAt: behavior.updated_at })), plan.deletedId);
  const changes = planCategoryRemoval(behaviors, plan.deletedId, now);
  await commitCategoryChange(supabase, categories, plan.categories, changes);
  invalidateBehaviorData(userId);
}
