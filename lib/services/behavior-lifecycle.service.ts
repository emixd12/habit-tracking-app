import { Temporal } from "@js-temporal/polyfill";

import {
  archiveDueBehaviors,
  archiveMyDueBehaviors,
  type ArchivedBehaviorOwner,
} from "@/lib/db/behaviorLifecycle.repo";
import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import { invalidateBehaviorData } from "@/lib/cache/stable-user-data.cache";
import { measurePerformanceSpan } from "@/lib/services/performance-timing";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const DEFAULT_ARCHIVE_BATCH_LIMIT = 100;

export async function reconcileMyDueBehaviorArchives(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<ArchivedBehaviorOwner[]> {
  const archived = await measurePerformanceSpan(
    {
      span: "service.reconcile_my_due_behavior_archives",
      counts: (rows) => ({ archived: rows.length }),
    },
    () => archiveMyDueBehaviors(supabase, DEFAULT_ARCHIVE_BATCH_LIMIT),
  );

  if (archived.length > 0) invalidateBehaviorData(userId);
  return archived;
}

export async function processDueBehaviorArchives(options: {
  now?: Temporal.Instant;
  limit?: number;
  supabase?: AppSupabaseClient;
} = {}): Promise<ArchivedBehaviorOwner[]> {
  const supabase = options.supabase ?? createServiceRoleClient();
  const now = options.now ?? Temporal.Now.instant();
  const batchLimit = normalizeArchiveBatchLimit(options.limit);
  const archived = await measurePerformanceSpan(
    {
      span: "service.process_due_behavior_archives",
      counts: (rows) => ({ archived: rows.length }),
    },
    () => archiveDueBehaviors(supabase, {
      processedAt: now.toString(),
      batchLimit,
    }),
  );

  for (const userId of new Set(archived.map((row) => row.user_id))) {
    invalidateBehaviorData(userId);
  }

  return archived;
}

function normalizeArchiveBatchLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isInteger(limit) || limit < 1) {
    return DEFAULT_ARCHIVE_BATCH_LIMIT;
  }
  return Math.min(limit, DEFAULT_ARCHIVE_BATCH_LIMIT);
}
