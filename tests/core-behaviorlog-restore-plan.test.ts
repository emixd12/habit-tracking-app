import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deriveBehaviorLogRestoreLocalId } from "../packages/core/src/services/behaviorlog-restore-plan";

describe("portable production restore planner", () => {
  it("preserves deterministic restore identities across runtimes", () => {
    const input = { externalId: "external-🦷", label: "behavior", recordType: "behavior" as const, userId: "11111111-1111-4111-8111-111111111111", bundleFingerprint: "a".repeat(64) };
    const action = { recordType: "behavior" as const, action: "create" as const, destructive: false, externalId: input.externalId, localId: null, reasons: [] };
    const actual = deriveBehaviorLogRestoreLocalId(action, input);
    expect(actual).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(actual).toBe(deriveBehaviorLogRestoreLocalId(action, input));
    expect(actual).not.toBe(deriveBehaviorLogRestoreLocalId(action, { ...input, userId: "22222222-2222-4222-8222-222222222222" }));
    // Independent byte digest fixture covers the prior Node implementation.
    const bytes = createHash("sha256").update(["behaviorlog_restore", input.userId, input.bundleFingerprint, input.recordType, input.externalId].join("\0")).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 15) | 0x50;
    bytes[8] = (bytes[8] & 63) | 0x80;
    const hex = bytes.toString("hex");
    expect(actual).toBe(`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`);
  });
});
