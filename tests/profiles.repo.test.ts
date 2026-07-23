import { describe, expect, it, vi } from "vitest";

import { listProfileOccurrenceSyncTargets } from "@/lib/db/profiles.repo";

describe("profile occurrence sync target selection", () => {
  it("preserves ledger priority while mapping each target to its authoritative profile timezone", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        { user_id: "user-stale" },
        { user_id: "user-old" },
      ],
      error: null,
    });
    const userIdOrder = vi.fn().mockReturnValue({ limit });
    const updatedAtOrder = vi.fn().mockReturnValue({ order: userIdOrder });
    const horizonOrder = vi.fn().mockReturnValue({ order: updatedAtOrder });
    const staleOrder = vi.fn().mockReturnValue({ order: horizonOrder });
    const syncTargetSelect = vi.fn().mockReturnValue({ order: staleOrder });
    const profileIds = vi.fn().mockResolvedValue({
      data: [
        { id: "user-old", timezone: "Europe/Paris" },
        { id: "user-stale", timezone: "America/Los_Angeles" },
      ],
      error: null,
    });
    const profileSelect = vi.fn().mockReturnValue({ in: profileIds });
    const from = vi.fn((table: string) => {
      if (table === "occurrence_sync_state") {
        return { select: syncTargetSelect };
      }

      if (table === "profiles") {
        return { select: profileSelect };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    await expect(
      listProfileOccurrenceSyncTargets({ from } as never, { limit: 25 }),
    ).resolves.toEqual([
      { id: "user-stale", timezone: "America/Los_Angeles" },
      { id: "user-old", timezone: "Europe/Paris" },
    ]);

    expect(from).toHaveBeenNthCalledWith(1, "occurrence_sync_state");
    expect(syncTargetSelect).toHaveBeenCalledWith("user_id");
    expect(staleOrder).toHaveBeenCalledWith("stale", { ascending: false });
    expect(horizonOrder).toHaveBeenCalledWith("synced_through_local_date", {
      ascending: true,
      nullsFirst: true,
    });
    expect(updatedAtOrder).toHaveBeenCalledWith("updated_at", {
      ascending: true,
    });
    expect(userIdOrder).toHaveBeenCalledWith("user_id", { ascending: true });
    expect(limit).toHaveBeenCalledWith(25);
    expect(from).toHaveBeenNthCalledWith(2, "profiles");
    expect(profileSelect).toHaveBeenCalledWith("id, timezone");
    expect(profileIds).toHaveBeenCalledWith("id", ["user-stale", "user-old"]);
  });

  it("skips a ledger target that has no authoritative profile", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [{ user_id: "missing-profile" }, { user_id: "known-user" }],
      error: null,
    });
    const userIdOrder = vi.fn().mockReturnValue({ limit });
    const updatedAtOrder = vi.fn().mockReturnValue({ order: userIdOrder });
    const horizonOrder = vi.fn().mockReturnValue({ order: updatedAtOrder });
    const staleOrder = vi.fn().mockReturnValue({ order: horizonOrder });
    const syncTargetSelect = vi.fn().mockReturnValue({ order: staleOrder });
    const profileIds = vi.fn().mockResolvedValue({
      data: [{ id: "known-user", timezone: "America/Chicago" }],
      error: null,
    });
    const profileSelect = vi.fn().mockReturnValue({ in: profileIds });
    const from = vi.fn((table: string) =>
      table === "occurrence_sync_state"
        ? { select: syncTargetSelect }
        : { select: profileSelect },
    );

    await expect(
      listProfileOccurrenceSyncTargets({ from } as never, { limit: 10 }),
    ).resolves.toEqual([
      { id: "known-user", timezone: "America/Chicago" },
    ]);
  });
});
