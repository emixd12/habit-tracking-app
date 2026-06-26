import {
  getProfileTimezone,
  listBehaviorCategories,
  listUserBehaviors,
  type AppSupabaseClient,
  type BehaviorWithCategory,
} from "@/lib/db/behaviors.repo";
import { listBehaviorLogImportRuns } from "@/lib/db/behaviorLogImports.repo";
import {
  getProfileSettings,
  type ProfileSettings,
} from "@/lib/db/profiles.repo";
import {
  invalidateUserReadCache,
  readUserReadThroughCache,
  type UserReadCacheBucket,
} from "@/lib/cache/user-read-cache";
import type {
  BehaviorLogImportRun,
  Category,
} from "@/lib/types/database";

const STABLE_READ_TTL_MS = 60_000;
const IMPORT_RUN_TTL_MS = 30_000;

export function readCachedProfileTimezone(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<string | null> {
  return readUserReadThroughCache({
    userId,
    bucket: "profile_timezone",
    ttlMs: STABLE_READ_TTL_MS,
    load: () => getProfileTimezone(supabase, userId),
  });
}

export function readCachedProfileSettings(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<ProfileSettings | null> {
  return readUserReadThroughCache({
    userId,
    bucket: "profile_settings",
    ttlMs: STABLE_READ_TTL_MS,
    load: () => getProfileSettings(supabase, userId),
  });
}

export function readCachedUserBehaviors(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<BehaviorWithCategory[]> {
  return readUserReadThroughCache({
    userId,
    bucket: "behavior_list",
    ttlMs: STABLE_READ_TTL_MS,
    load: () => listUserBehaviors(supabase, userId),
  });
}

export function readCachedBehaviorCategories(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<Category[]> {
  return readUserReadThroughCache({
    userId,
    bucket: "category_list",
    ttlMs: STABLE_READ_TTL_MS,
    load: () => listBehaviorCategories(supabase, userId),
  });
}

export function readCachedBehaviorLogImportRuns(
  supabase: AppSupabaseClient,
  userId: string,
  limit: number,
): Promise<BehaviorLogImportRun[]> {
  return readUserReadThroughCache({
    userId,
    bucket: "behaviorlog_import_runs",
    variant: [String(limit)],
    ttlMs: IMPORT_RUN_TTL_MS,
    load: () => listBehaviorLogImportRuns(supabase, userId, limit),
  });
}

export function invalidateStableUserData(
  userId: string,
  buckets?: readonly UserReadCacheBucket[],
): void {
  invalidateUserReadCache(userId, buckets);
}

export function invalidateBehaviorData(userId: string): void {
  invalidateStableUserData(userId, [
    "behavior_list",
    "category_list",
    "profile_timezone",
  ]);
}

export function invalidateProfileData(userId: string): void {
  invalidateStableUserData(userId, ["profile_settings", "profile_timezone"]);
}

export function invalidateImportRunData(userId: string): void {
  invalidateStableUserData(userId, ["behaviorlog_import_runs"]);
}
