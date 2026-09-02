import { describe, expect, it, vi } from "vitest";
import { runAccountSync, syncFailureStatus, type AccountSyncOperations } from "../apps/desktop/src/sync-engine";
import type { AccountSyncPlan, AccountSyncSnapshot } from "@cadence/core/resolvers/account-sync.resolver";

const snapshot: AccountSyncSnapshot = { fingerprint: "a".repeat(64), entities: [] };
const plan: AccountSyncPlan = { localWrites: [], hostedWrites: [], conflicts: [], mergedEntities: [], fingerprints: { baseline: "a".repeat(64), local: "a".repeat(64), hosted: "a".repeat(64), merged: "a".repeat(64) }, idempotencyKey: "b".repeat(64) };
function operations(overrides: Partial<AccountSyncOperations> = {}): AccountSyncOperations {
  return {
    readInputs: vi.fn().mockResolvedValue({ baseline: snapshot, local: snapshot, hosted: snapshot, outboxHighWater: 4 }),
    plan: vi.fn(() => plan), applyHosted: vi.fn().mockResolvedValue({ fingerprint: "b".repeat(64) }),
    applyLocal: vi.fn().mockResolvedValue(undefined), complete: vi.fn().mockResolvedValue(undefined),
    now: () => "2026-09-01T12:00:00Z", ...overrides,
  };
}

describe("runAccountSync", () => {
  it("advances the baseline and captured outbox only after both commits", async () => {
    const order: string[] = [];
    const ops = operations({
      applyHosted: vi.fn(async () => { order.push("hosted"); return { fingerprint: "b".repeat(64) }; }),
      applyLocal: vi.fn(async () => { order.push("local"); }),
      complete: vi.fn(async ({ outboxHighWater }) => { expect(outboxHighWater).toBe(4); order.push("complete"); }),
    });
    await expect(runAccountSync(ops)).resolves.toEqual({ state: "current", completedAt: "2026-09-01T12:00:00Z" });
    expect(order).toEqual(["hosted", "local", "complete"]);
  });

  it("never applies a partial plan when conflicts exist", async () => {
    const ops = operations({ plan: () => ({ ...plan, conflicts: [{ kind: "behavior", id: "one", reason: "concurrent_update", baseline: {}, local: {}, hosted: {} }] }) });
    await expect(runAccountSync(ops)).resolves.toEqual({ state: "conflict", count: 1 });
    expect(ops.applyHosted).not.toHaveBeenCalled(); expect(ops.applyLocal).not.toHaveBeenCalled(); expect(ops.complete).not.toHaveBeenCalled();
  });

  it("leaves acknowledgement pending after either commit boundary fails", async () => {
    for (const failed of ["hosted", "local"] as const) {
      const ops = operations(failed === "hosted" ? { applyHosted: vi.fn().mockRejectedValue(new Error("hosted failed")) } : { applyLocal: vi.fn().mockRejectedValue(new Error("local failed")) });
      expect((await runAccountSync(ops)).state).toBe("failed"); expect(ops.complete).not.toHaveBeenCalled();
    }
  });

  it("reports network unavailability as offline", async () => {
    const ops = operations({ readInputs: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) });
    await expect(runAccountSync(ops)).resolves.toEqual({ state: "offline" });
  });

  it("rejects a conflict-free plan without a stable commit identity", async () => {
    const ops = operations({ plan: () => ({ ...plan, idempotencyKey: null }) });
    await expect(runAccountSync(ops)).resolves.toMatchObject({ state: "failed", message: "The synchronization plan has no stable commit identity." });
    expect(ops.applyHosted).not.toHaveBeenCalled();
  });

  it("stops safely for structured revoked-session failures", () => {
    expect(syncFailureStatus({ status: 401, message: "JWT expired" })).toEqual({ state: "revoked" });
    expect(syncFailureStatus(new Error("JWT cryptographic operation failed"))).toEqual({ state: "revoked" });
    expect(syncFailureStatus(new Error("session plan validation failed"))).toEqual({ state: "failed", message: "session plan validation failed" });
  });
});
