import type {
  BehaviorLogImportMergePreviewResult,
  BehaviorLogImportMode,
} from "@/lib/types/behaviorlog-import";
import type { BehaviorLogImportRun } from "@/lib/types/database";

export type BehaviorLogImportApplyMode =
  | "create_missing_only"
  | "merge_by_user_approved_plan";

export type BehaviorLogImportRunView = Pick<
  BehaviorLogImportRun,
  | "id"
  | "import_mode"
  | "status"
  | "started_at"
  | "completed_at"
  | "failure_message"
>;

export type BehaviorLogImportUpload = {
  fileName: string;
  fileSize: number;
};

export type BehaviorLogImportCapabilities = {
  canApplyCreateOnly: boolean;
  createOnlyReason: string | null;
  canApplyMerge: boolean;
  mergeReason: string | null;
};

export type BehaviorLogImportApplyResultView = {
  mode: BehaviorLogImportApplyMode;
  importRun: BehaviorLogImportRunView;
  created: {
    behaviors: number;
    schedules: number;
    occurrences: number;
    statusEvents: number;
    notes: number;
    interventions: number;
    mappings: number;
  };
  mapped?: {
    behaviors: number;
    schedules: number;
    occurrences: number;
    statusEvents: number;
    notes: number;
    interventions: number;
  };
  skipped: {
    behaviors: number;
    schedules: number;
    occurrences: number;
    statusEvents: number;
    notes?: number;
    interventions?: number;
  };
};

export type BehaviorLogImportActionState = {
  status: "idle" | "previewed" | "applied" | "error";
  message: string | null;
  upload: BehaviorLogImportUpload | null;
  bundlePayload: string | null;
  preview: BehaviorLogImportMergePreviewResult | null;
  previewRun: BehaviorLogImportRunView | null;
  capabilities: BehaviorLogImportCapabilities | null;
  applyResult: BehaviorLogImportApplyResultView | null;
};

export type BehaviorLogImportFormAction = (
  previousState: BehaviorLogImportActionState,
  formData: FormData,
) => Promise<BehaviorLogImportActionState>;

export type BehaviorLogImportPageData = {
  recentRuns: BehaviorLogImportRunView[];
};

export const BEHAVIORLOG_IMPORT_INITIAL_STATE: BehaviorLogImportActionState = {
  status: "idle",
  message: null,
  upload: null,
  bundlePayload: null,
  preview: null,
  previewRun: null,
  capabilities: null,
  applyResult: null,
};

export function isBehaviorLogApplyMode(
  value: FormDataEntryValue | null,
): value is BehaviorLogImportApplyMode {
  return (
    value === "create_missing_only" ||
    value === "merge_by_user_approved_plan"
  );
}

export function toImportRunView(
  run: Pick<
    BehaviorLogImportRun,
    | "id"
    | "import_mode"
    | "status"
    | "started_at"
    | "completed_at"
    | "failure_message"
  >,
): BehaviorLogImportRunView {
  return {
    id: run.id,
    import_mode: run.import_mode as BehaviorLogImportMode,
    status: run.status,
    started_at: run.started_at,
    completed_at: run.completed_at,
    failure_message: run.failure_message,
  };
}
