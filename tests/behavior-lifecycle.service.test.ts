import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  processDueBehaviorArchives,
  reconcileMyDueBehaviorArchives,
} from "@/lib/services/behavior-lifecycle.service";
import {
  archiveDueBehaviors,
  archiveMyDueBehaviors,
} from "@/lib/db/behaviorLifecycle.repo";
import { invalidateBehaviorData } from "@/lib/cache/stable-user-data.cache";

vi.mock("@/lib/db/behaviorLifecycle.repo", () => ({
  archiveDueBehaviors: vi.fn(),
  archiveMyDueBehaviors: vi.fn(),
}));
vi.mock("@/lib/cache/stable-user-data.cache", () => ({
  invalidateBehaviorData: vi.fn(),
}));

const SUPABASE = { kind: "supabase" } as never;

describe("Behavior end-date lifecycle service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invalidates the authenticated owner's Behavior cache after archival", async () => {
    vi.mocked(archiveMyDueBehaviors).mockResolvedValue([{
      behavior_id: "behavior-1",
      user_id: "user-1",
    }]);

    await expect(reconcileMyDueBehaviorArchives(SUPABASE, "user-1"))
      .resolves.toHaveLength(1);

    expect(archiveMyDueBehaviors).toHaveBeenCalledWith(SUPABASE, 100);
    expect(invalidateBehaviorData).toHaveBeenCalledWith("user-1");
  });

  it("deduplicates cache invalidation for a service-role batch", async () => {
    vi.mocked(archiveDueBehaviors).mockResolvedValue([
      { behavior_id: "behavior-1", user_id: "user-1" },
      { behavior_id: "behavior-2", user_id: "user-1" },
      { behavior_id: "behavior-3", user_id: "user-2" },
    ]);
    const now = Temporal.Instant.from("2026-09-18T15:00:00Z");

    await processDueBehaviorArchives({ supabase: SUPABASE, now, limit: 12 });

    expect(archiveDueBehaviors).toHaveBeenCalledWith(SUPABASE, {
      processedAt: "2026-09-18T15:00:00Z",
      batchLimit: 12,
    });
    expect(vi.mocked(invalidateBehaviorData).mock.calls).toEqual([
      ["user-1"],
      ["user-2"],
    ]);
  });
});
