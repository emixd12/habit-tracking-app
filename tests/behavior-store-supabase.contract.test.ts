import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createBehaviorStore } from "../lib/db/behavior-store";
import { listUserBehaviors, type AppSupabaseClient } from "../lib/db/behaviors.repo";
import { listBehaviorDefinitionEvents } from "../lib/db/behaviorDefinitionEvents.repo";
import { listBehaviorConfigurationEvents } from "../lib/db/behaviorConfigurationEvents.repo";
import { updateBehavior } from "@cadence/core/services/behavior.service";
import type { Database } from "../lib/db/database.types";
import { CONTRACT_NOW, CONTRACT_VALUES, exerciseBehaviorStoreContract, snapshotHash,
  type BehaviorStoreSnapshot } from "./helpers/behavior-store-contract";
import { exercisePortabilitySqlContract } from "./helpers/portability-sql-contract";
import { exerciseRestoreSqlContract } from "./helpers/restore-sql-contract";
import { exerciseBehaviorLog03SqlContract } from "./helpers/behaviorlog-03-sql-contract";

const authenticatedRuntime = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("../lib/supabase/server", () => ({ createClient: async () => authenticatedRuntime.client }));

// Only post-commit cache invalidation and graph repair are outside this contract.
// Every import preview, accepted-plan ledger, and atomic SQL mutation stays real.
vi.mock("../lib/cache/stable-user-data.cache", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/cache/stable-user-data.cache")>(),
  invalidateBehaviorData: vi.fn(), invalidateImportRunData: vi.fn(),
}));
vi.mock("../lib/services/occurrence-reminder-repair.service", () => ({ repairUserOccurrenceReminderGraphBestEffort: vi.fn(async () => undefined) }));

describe.skipIf(process.env.CADENCE_SUPABASE_CONTRACT !== "1")("BehaviorDataStore against local authenticated Supabase", () => {
  it("runs the shared transaction contract and rejects cross-account reads and writes", async () => {
    // The existing reader captures CLI output internally. No .env or hosted URL is accepted.
    trace("loading local config reader");
    const modulePath = "../scripts/supabase-rls-smoke.mjs";
    const { readLocalSmokeConfig } = await import(modulePath);
    trace("reading local CLI config");
    const config = readLocalSmokeConfig() as { url: string; publishableKey: string; serviceRoleKey: string };
    const url = new URL(config.url);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "55321") {
      throw new Error("Behavior store contract requires Cadence's isolated local API on port 55321.");
    }
    const options = {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const endpoint = new URL(requestUrl).pathname;
        const started = performance.now();
        if (endpoint.includes("restore")) trace(`request ${endpoint} (${typeof init?.body === "string" ? Buffer.byteLength(init.body) : 0} bytes)`);
        try { return await fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }); }
        catch (error) {
          const failure = error instanceof Error ? error.name : "UnknownError";
          throw new Error(`Local contract request failed or timed out: ${endpoint} (${failure}, ${Math.round(performance.now() - started)}ms)`);
        }
      } },
    };
    const admin = createClient<Database>(config.url, config.serviceRoleKey, options);
    const users: { id: string; client: AppSupabaseClient | null }[] = [];
    try {
      for (const slot of ["a", "b", "restore", "lineage"]) {
        const token = randomUUID();
        const email = `cadence-store-contract-${token}-${slot}@example.invalid`;
        const password = `CadenceContract-${randomUUID()}-aA1!`;
        trace("creating temporary account");
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        if (error || !data.user) throw new Error("Could not create a temporary local contract account.");
        const account: (typeof users)[number] = { id: data.user.id, client: null };
        users.push(account);
        const client = createClient<Database>(config.url, config.publishableKey, options);
        trace("signing in ordinary account");
        const signedIn = await client.auth.signInWithPassword({ email, password });
        if (signedIn.error || !signedIn.data.session) throw new Error("Could not sign in a temporary local contract account.");
        account.client = client;
      }
      const owner = users[0];
      const stranger = users[1];
      const client = owner.client!;
      const readSnapshot = () => readOwnerSnapshot(client, owner.id);
      trace("exercising shared behavior contract");
      const result = await exerciseBehaviorStoreContract({
        userId: owner.id,
        timezone: "America/New_York",
        storeAt: () => createBehaviorStore(client, owner.id),
        readSnapshot,
      });
      trace("checking cross-account isolation");
      const before = snapshotHash(await readSnapshot());
      const foreignStore = createBehaviorStore(stranger.client!, stranger.id);
      expect(await foreignStore.getBehaviorById(result.behaviorId)).toBeNull();
      await expect(updateBehavior(foreignStore, {
        behaviorId: result.behaviorId, expectedUpdatedAt: CONTRACT_NOW.toString(),
        values: CONTRACT_VALUES, recordedAt: CONTRACT_NOW.toString(),
      })).rejects.toThrow("not found");
      for (const table of ["behaviors", "behavior_definition_events", "behavior_configuration_events"] as const) {
        const read = await stranger.client!.from(table).select("id").eq("user_id", owner.id);
        expect(read.error === null).toBe(true);
        expect(read.data?.length).toBe(0);
      }
      const foreignUpdate = await stranger.client!.from("behaviors")
        .update({ title: "Cross-account overwrite" }).eq("id", result.behaviorId).select("id");
      // Production deliberately denies all direct Behavior updates; graph RPCs own writes.
      expect(foreignUpdate.error?.code).toBe("42501");
      expect(foreignUpdate.data).toBeNull();
      const foreignInsert = await stranger.client!.from("behaviors").insert({
        user_id: owner.id, title: "Cross-account insert", recurrence_rule: { frequency: "daily", interval: 1 },
        scheduled_time: "09:00", timezone: "America/New_York",
      }).select("id");
      expect(foreignInsert.error?.code).toBe("42501");
      expect(snapshotHash(await readSnapshot())).toBe(before);
      trace("comparing rich import projection with production SQL");
      await exercisePortabilitySqlContract(stranger.client!, stranger.id);
      trace("comparing self-export Keep restore with production SQL");
      authenticatedRuntime.client = users[2].client;
      await exerciseRestoreSqlContract(users[2].client!, users[2].id);
      trace("verifying 0.3 preserved lineage and passive observations");
      authenticatedRuntime.client = users[3].client;
      await exerciseBehaviorLog03SqlContract(users[3].client!, users[3].id);
    } finally {
      trace("cleaning temporary accounts");
      let cleanupFailures = 0;
      for (const user of users) {
        if (user.client) {
          const signedOut = await user.client.auth.signOut();
          if (signedOut.error) cleanupFailures += 1;
        }
        const deleted = await admin.auth.admin.deleteUser(user.id);
        if (deleted.error) cleanupFailures += 1;
      }
      if (cleanupFailures) throw new Error(`Local contract cleanup failed for ${cleanupFailures} operation(s).`);
    }
  }, 60_000);
});

async function readOwnerSnapshot(client: AppSupabaseClient, userId: string): Promise<BehaviorStoreSnapshot> {
  const [graphs, definitions, configurations, sync] = await Promise.all([
    listUserBehaviors(client, userId),
    listBehaviorDefinitionEvents(client, userId),
    listBehaviorConfigurationEvents(client, userId),
    client.from("occurrence_sync_state").select("stale,state_version").eq("user_id", userId).maybeSingle(),
  ]);
  if (sync.error) throw new Error("Could not read the local occurrence synchronization state.");
  return { graphs, definitions, configurations, syncState: sync.data };
}

function trace(phase: string) {
  if (process.env.CADENCE_CONTRACT_TRACE === "1") console.info(`Local contract: ${phase}`);
}
