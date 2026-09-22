import { beforeEach, expect, it, vi } from "vitest";
import { accountSyncFingerprint, type AccountSyncEntity } from "@cadence/core/resolvers/account-sync.resolver";
import type { PortabilitySnapshot } from "@cadence/core/types/portability-rows";
import { DEFAULT_CATEGORY_NAMES } from "@cadence/core/types/database";
import { portabilityEntities, type HostedEnvelope } from "../apps/desktop/src/account/account-sync";
import { finishFirstAccountLink, finishReviewedFirstAccountLink } from "../apps/desktop/src/account/first-link";

const mocks = vi.hoisted(() => ({ command: vi.fn(), begin: vi.fn(), exported: vi.fn() }));
vi.mock("../apps/desktop/src/local-store", () => ({ localCommand: mocks.command }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.begin }));
vi.mock("../apps/desktop/src/local-export.service", () => ({ getLocalExportPageData: mocks.exported }));

const at = "2026-09-22T00:00:00Z";
const profile = { id: "local", timezone: "America/New_York", email: "", display_name: null, created_at: at, updated_at: at };
const local: PortabilitySnapshot = {
  profile, revision: 0, categories: DEFAULT_CATEGORY_NAMES.map((name, sort_order) => ({ id: `local-${sort_order}`, user_id: "local", name, description: null, sort_order, created_at: at, updated_at: at })),
  travelSettings: { enabled: false, baseLocationText: "Private base", mode: "walking", navigationPreference: "apple_maps", routingConsentAt: at, onboardingCompletedAt: at, updatedAt: at },
  graphs: [], definitionEvents: [], configurationEvents: [], occurrences: [], statusEvents: [], timeSessions: [], importRuns: [], mappings: [], importedNotes: [], importedInterventions: [],
};

function fixture(base: string | null = null) {
  const hostedAt = "2026-09-21T00:00:00Z";
  let entities = portabilityEntities({ ...local, travelSettings: { ...local.travelSettings!, baseLocationText: base, mode: null, navigationPreference: null, routingConsentAt: null, onboardingCompletedAt: null, updatedAt: hostedAt },
    categories: local.categories.map((row, index) => ({ ...row, id: `hosted-${index}`, created_at: hostedAt, updated_at: hostedAt })) });
  const envelope = (): HostedEnvelope => ({ schemaVersion: 1, userId: "owner", entities, fingerprint: accountSyncFingerprint({ entities }) });
  const rpc = vi.fn((name: string, args?: { sync_payload: { plan: { writes: { kind: AccountSyncEntity["kind"]; id: string; operation: string; value: AccountSyncEntity["value"] }[] } } }) => {
    if (name === "read_account_sync_snapshot") return { abortSignal: () => Promise.resolve({ data: envelope(), error: null }) };
    if (name !== "apply_account_sync_plan" || !args) throw new Error("Unexpected hosted RPC.");
    for (const write of args.sync_payload.plan.writes) {
      entities = entities.filter((row) => row.kind !== write.kind || row.id !== write.id);
      if (write.operation === "upsert") entities.push({ kind: write.kind, id: write.id, value: write.value });
    }
    return Promise.resolve({ data: { status: "applied", fingerprint: envelope().fingerprint, snapshot: envelope() }, error: null });
  });
  return { client: { rpc } as never, envelope, rpc };
}

beforeEach(() => {
  vi.resetAllMocks();
  let pending: unknown;
  mocks.begin.mockImplementation(async (_name, value) => pending ??= value);
  mocks.command.mockImplementation(async (name) => name === "readImportSnapshot" ? local : undefined);
  mocks.exported.mockRejectedValue(new Error("Private account import must not use the location-free export."));
});

it("imports travel-only settings atomically and retries a hosted-success/local-failure without export", async () => {
  const hosted = fixture();
  let failed = false;
  mocks.command.mockImplementation(async (name) => {
    if (name === "readImportSnapshot") return local;
    if (name === "applyFirstLinkAccountSync" && !failed) { failed = true; throw new Error("Local commit interrupted"); }
  });
  const input = { client: hosted.client, profile, hostedUserId: "owner", choice: "import" as const, attemptId: "attempt" };
  await expect(finishFirstAccountLink(input)).rejects.toThrow("Local commit interrupted");
  expect(hosted.envelope().entities.find(({ kind }) => kind === "profile")?.value).toMatchObject({ base_location_text: "Private base", travel_mode: "walking" });
  await expect(finishFirstAccountLink(input)).resolves.toMatchObject({ status: "complete" });
  expect(mocks.exported).not.toHaveBeenCalled();
  expect(hosted.envelope().entities.filter(({ kind }) => kind === "category")).toHaveLength(DEFAULT_CATEGORY_NAMES.length);
  expect(mocks.command.mock.calls.filter(([name]) => name === "applyFirstLinkAccountSync").at(-1)?.[1]).toMatchObject({ writes: expect.arrayContaining([
    expect.objectContaining({ kind: "category", operation: "delete", id: "local-0" }),
    expect.objectContaining({ kind: "category", operation: "upsert", id: "hosted-0" }),
  ]) });
});

it("uses the existing conflict review for different saved bases", async () => {
  const hosted = fixture("Account base");
  const review = await finishFirstAccountLink({ client: hosted.client, profile, hostedUserId: "owner", choice: "import" });
  expect(review.status).toBe("conflict");
  if (review.status !== "conflict" || !review.inputs || !review.attempt || !review.conflicts) throw new Error("Expected complete review inputs");
  expect(hosted.rpc.mock.calls.some(([name]) => name === "apply_account_sync_plan")).toBe(false);
  await expect(finishReviewedFirstAccountLink({ client: hosted.client, profileId: profile.id,
    reviewed: { inputs: review.inputs, attempt: review.attempt, conflicts: review.conflicts }, decisions: [{ kind: "profile", id: "profile", choice: "local" }] })).resolves.toMatchObject({ status: "complete" });
  expect(hosted.envelope().entities.find(({ kind }) => kind === "profile")?.value).toMatchObject({ base_location_text: "Private base" });
});
