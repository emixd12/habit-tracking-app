import { describe, expect, it, vi } from "vitest";
import { applyHostedAccountSync, normalizeAccountSyncBaseline, planAccountSync, portabilityEntities, readAccountSyncInputs, readHostedAccountSyncEnvelope } from "../apps/desktop/src/account/account-sync";
import { accountSyncFingerprint, resolveAccountSync } from "@cadence/core/resolvers/account-sync.resolver";
import { emptyPortabilitySnapshot } from "./helpers/portability-fixture";
import { canonicalJson } from "../apps/desktop/src/account/canonical-json";
import type { SupabaseClient } from "@supabase/supabase-js";

const digest = accountSyncFingerprint({ entities: [{ kind: "profile", id: "profile", value: { timezone: "America/New_York" } }] });
const context = { hostedUserId: "hosted", baselineFingerprint: digest, baselineJson: JSON.stringify({ entities: [{ kind: "profile", id: "profile", value: { timezone: "America/New_York" } }] }), outboxHighWater: 7, tombstones: [] };
const hosted = { schemaVersion: 1, userId: "hosted", fingerprint: digest, entities: [{ kind: "profile", id: "profile", value: { timezone: "America/New_York" } }] };

describe("desktop account sync adapter", () => {
  it("canonicalizes nested Unicode keys in PostgreSQL C order", () => {
    expect(canonicalJson({ nested: { "𐀀": 2, "": 1 } })).toBe('{"nested":{"":1,"𐀀":2}}');
  });
  it("flattens every synchronized portability collection and excludes native state", () => {
    const source = { ...emptyPortabilitySnapshot(), reminderDeliveries: [{ id: "delivery", user_id: "local" }], nativeReminders: [{ id: "native" }] };
    const entities = portabilityEntities(source);
    expect(entities.map(({ kind }) => kind)).toContain("reminder_delivery");
    expect(entities.some(({ id }) => id === "native")).toBe(false);
  });

  it("reads the saved baseline, local snapshot, hosted RPC envelope, and outbox high-water", async () => {
    const inputs = await readAccountSyncInputs("local", {} as never, { readContext: vi.fn(async () => context), readLocal: vi.fn(async () => emptyPortabilitySnapshot()), readHosted: vi.fn(async () => hosted) });
    expect(inputs).toMatchObject({ accountLinkId: "hosted", baselineFingerprint: digest, hostedFingerprint: digest, outboxHighWater: 7 });
    expect(inputs.local.entities).toHaveLength(1);
  });

  it("uses one atomic hosted snapshot RPC and verifies its fingerprint", async () => {
    const abortSignal = vi.fn(async () => ({ data: hosted, error: null }));
    const rpc = vi.fn(() => ({ abortSignal }));
    const client = { rpc } as unknown as SupabaseClient;
    await expect(readHostedAccountSyncEnvelope(client)).resolves.toEqual(hosted);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("read_account_sync_snapshot");
    expect(abortSignal).toHaveBeenCalledOnce();

    const invalid = { ...hosted, fingerprint: "0".repeat(64) };
    const invalidClient = { rpc: vi.fn(() => ({ abortSignal: vi.fn(async () => ({ data: invalid, error: null })) })) } as unknown as SupabaseClient;
    await expect(readHostedAccountSyncEnvelope(invalidClient)).rejects.toThrow("fingerprint is invalid");
  });

  it("converts the legacy first-link portability baseline and produces a real planner result", async () => {
    const legacy = { ...context, baselineJson: JSON.stringify(emptyPortabilitySnapshot()) };
    const result = await planAccountSync("local", {} as never, { readContext: vi.fn(async () => legacy), readLocal: vi.fn(async () => emptyPortabilitySnapshot()), readHosted: vi.fn(async () => hosted) });
    expect(result.plan.conflicts).toEqual([]);
    expect(result.plan.idempotencyKey).toHaveLength(64);
  });

  it("normalizes a first-link portability snapshot before fingerprinting it", () => {
    const normalized = normalizeAccountSyncBaseline(emptyPortabilitySnapshot());
    expect(normalized).toEqual({ entities: [{ kind: "profile", id: "profile", value: { timezone: "America/New_York" } }] });
    expect(accountSyncFingerprint(normalized)).toBe(digest);
  });

  it("rejects another account and malformed saved state before planning", async () => {
    await expect(readAccountSyncInputs("local", {} as never, { readContext: vi.fn(async () => context), readLocal: vi.fn(async () => emptyPortabilitySnapshot()), readHosted: vi.fn(async () => ({ ...hosted, userId: "other" })) })).rejects.toThrow("another account");
    await expect(readAccountSyncInputs("local", {} as never, { readContext: vi.fn(async () => ({ ...context, baselineJson: "{}" })), readLocal: vi.fn(async () => emptyPortabilitySnapshot()), readHosted: vi.fn(async () => hosted) })).rejects.toThrow("baseline is invalid");
  });

  it("fails closed when the complete snapshot read exceeds 30 seconds", async () => {
    vi.useFakeTimers();
    const pending = readAccountSyncInputs("local", {} as never, { readContext: vi.fn(async () => context), readLocal: vi.fn(() => new Promise<ReturnType<typeof emptyPortabilitySnapshot>>(() => undefined)), readHosted: vi.fn(async () => hosted) });
    const rejected = expect(pending).rejects.toThrow("exceeded 30 seconds");
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    vi.useRealTimers();
  });

  it("applies one deterministic typed hosted-write payload", async () => {
    const baseline = { entities: [{ kind: "profile", id: "profile", value: { timezone: "UTC" } }] } as const;
    const local = { entities: [{ kind: "profile", id: "profile", value: { timezone: "America/New_York" } }] } as const;
    const hostedSnapshot = { entities: [...baseline.entities] };
    const syncPlan = resolveAccountSync({ accountLinkId: "hosted", baseline, local, hosted: hostedSnapshot });
    const mergedFingerprint = accountSyncFingerprint({ entities: syncPlan.mergedEntities });
    const payloads: unknown[] = [];
    const client = { rpc: vi.fn(async (_name: string, args: Record<string, unknown>) => {
      payloads.push(args.sync_payload);
      return { data: { status: "applied", fingerprint: mergedFingerprint, snapshot: { schemaVersion: 1, userId: "hosted", fingerprint: mergedFingerprint, entities: syncPlan.mergedEntities } }, error: null };
    }) } as never;
    const inputs = { accountLinkId: "hosted", baseline, local, hosted: hostedSnapshot, baselineFingerprint: accountSyncFingerprint(baseline), hostedFingerprint: accountSyncFingerprint(hostedSnapshot), outboxHighWater: 2 };
    await applyHostedAccountSync(client, inputs, syncPlan, "2026-09-01T12:00:00Z");
    await applyHostedAccountSync(client, inputs, syncPlan, "2026-09-01T12:00:00Z");
    expect(payloads[0]).toEqual(payloads[1]);
    expect(payloads[0]).toMatchObject({ idempotencyKey: syncPlan.idempotencyKey, plan: { writes: [{ kind: "profile", operation: "upsert" }], mergedFingerprint, conflicts: [] } });
  });
});
