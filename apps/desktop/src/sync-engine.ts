import type { AccountSyncPlan, AccountSyncSnapshot } from "@cadence/core/resolvers/account-sync.resolver";

export type SyncStatus =
  | { state: "offline" }
  | { state: "syncing" }
  | { state: "current"; completedAt: string }
  | { state: "failed"; message: string }
  | { state: "revoked" }
  | { state: "conflict"; count: number };

export type AccountSyncOperations = Readonly<{
  readInputs: () => Promise<{ baseline: AccountSyncSnapshot; local: AccountSyncSnapshot; hosted: AccountSyncSnapshot; outboxHighWater: number }>;
  plan: (input: { baseline: AccountSyncSnapshot; local: AccountSyncSnapshot; hosted: AccountSyncSnapshot }) => AccountSyncPlan;
  applyHosted: (plan: AccountSyncPlan) => Promise<{ fingerprint: string }>;
  applyLocal: (plan: AccountSyncPlan) => Promise<void>;
  complete: (input: { plan: AccountSyncPlan; fingerprint: string; outboxHighWater: number; completedAt: string }) => Promise<void>;
  now: () => string;
}>;

export async function runAccountSync(operations: AccountSyncOperations): Promise<SyncStatus> {
  try {
    const inputs = await operations.readInputs();
    const plan = operations.plan(inputs);
    if (plan.conflicts.length) return { state: "conflict", count: plan.conflicts.length };
    if (!plan.idempotencyKey || !plan.fingerprints.merged) throw new Error("The synchronization plan has no stable commit identity.");
    const hosted = await operations.applyHosted(plan);
    await operations.applyLocal(plan);
    const completedAt = operations.now();
    await operations.complete({ plan, fingerprint: hosted.fingerprint, outboxHighWater: inputs.outboxHighWater, completedAt });
    return { state: "current", completedAt };
  } catch (error) {
    return syncFailureStatus(error);
  }
}

export function syncFailureStatus(error: unknown): SyncStatus {
  if (error instanceof TypeError && /fetch|network|offline/i.test(error.message)) return { state: "offline" };
  const record = error && typeof error === "object" ? error as Record<string, unknown> : null;
  const status = record?.status, code = record?.code, message = error instanceof Error ? error.message : typeof record?.message === "string" ? record.message : "Synchronization failed.";
  if (status === 401 || status === 403 || code === "401" || code === "403" || /jwt expired|invalid jwt|jwt cryptographic operation failed|refresh token|unauthorized|forbidden/i.test(message)) return { state: "revoked" };
  return { state: "failed", message };
}

export function shouldRetryAccountSync(status: SyncStatus, attempts: number) {
  return (status.state === "offline" || status.state === "failed") && attempts < 5;
}
