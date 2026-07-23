import type { BehaviorLogRestorePreview } from "@/lib/types/behaviorlog-restore";

export type BehaviorLogRestoreRunView = {
  id: string;
  mode: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  failureMessage: string | null;
};

export type BehaviorLogRestoreApplyResult = {
  importRun: BehaviorLogRestoreRunView;
  appliedCounts: Record<string, number>;
};

export type BehaviorLogRestoreActionState = {
  status: "idle" | "previewed" | "applied" | "error";
  message: string | null;
  upload: {
    fileName: string;
    fileSize: number;
  } | null;
  archiveFingerprint: string | null;
  preview: BehaviorLogRestorePreview | null;
  previewRun: BehaviorLogRestoreRunView | null;
  applyResult: BehaviorLogRestoreApplyResult | null;
};

export type BehaviorLogRestoreFormAction = (
  previousState: BehaviorLogRestoreActionState,
  formData: FormData,
) => Promise<BehaviorLogRestoreActionState>;

export type BehaviorLogRestorePageData = {
  recentRuns: BehaviorLogRestoreRunView[];
};

export const BEHAVIORLOG_RESTORE_INITIAL_STATE: BehaviorLogRestoreActionState = {
  status: "idle",
  message: null,
  upload: null,
  archiveFingerprint: null,
  preview: null,
  previewRun: null,
  applyResult: null,
};
