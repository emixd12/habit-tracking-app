import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearUserReadCache,
  createUserReadCacheKey,
  invalidateUserReadCache,
  listUserReadCacheKeys,
  readUserReadThroughCache,
} from "../lib/cache/user-read-cache";

describe("user read-through cache", () => {
  beforeEach(() => {
    clearUserReadCache();
  });

  it("scopes cache keys by user id and bucket", () => {
    expect(
      createUserReadCacheKey({
        userId: "user-one",
        bucket: "behavior_list",
      }),
    ).toBe("user-read:user-one:behavior_list:default");
    expect(
      createUserReadCacheKey({
        userId: "user-two",
        bucket: "behavior_list",
        variant: ["8"],
      }),
    ).toBe("user-read:user-two:behavior_list:8");
  });

  it("reuses a cached value for the same user key", async () => {
    const load = vi.fn().mockResolvedValue([{ id: "behavior-1" }]);

    await expect(
      readUserReadThroughCache({
        userId: "user-one",
        bucket: "behavior_list",
        load,
      }),
    ).resolves.toEqual([{ id: "behavior-1" }]);
    await expect(
      readUserReadThroughCache({
        userId: "user-one",
        bucket: "behavior_list",
        load,
      }),
    ).resolves.toEqual([{ id: "behavior-1" }]);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not share values across users", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce([{ id: "user-one-behavior" }])
      .mockResolvedValueOnce([{ id: "user-two-behavior" }]);

    await readUserReadThroughCache({
      userId: "user-one",
      bucket: "behavior_list",
      load,
    });
    await readUserReadThroughCache({
      userId: "user-two",
      bucket: "behavior_list",
      load,
    });

    expect(load).toHaveBeenCalledTimes(2);
    expect(listUserReadCacheKeys()).toEqual([
      "user-read:user-one:behavior_list:default",
      "user-read:user-two:behavior_list:default",
    ]);
  });

  it("invalidates one user's selected buckets", async () => {
    const load = vi.fn().mockResolvedValue([]);

    await readUserReadThroughCache({
      userId: "user-one",
      bucket: "behavior_list",
      load,
    });
    await readUserReadThroughCache({
      userId: "user-one",
      bucket: "profile_timezone",
      load,
    });
    await readUserReadThroughCache({
      userId: "user-two",
      bucket: "behavior_list",
      load,
    });

    invalidateUserReadCache("user-one", ["behavior_list"]);

    expect(listUserReadCacheKeys()).toEqual([
      "user-read:user-one:profile_timezone:default",
      "user-read:user-two:behavior_list:default",
    ]);
  });
});
