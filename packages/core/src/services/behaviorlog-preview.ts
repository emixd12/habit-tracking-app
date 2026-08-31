import type { BehaviorLogImportMergePreviewResult } from "../types/behaviorlog-import";
export type BehaviorLogImportCapabilities = { canApplyCreateOnly: boolean; createOnlyReason: string | null; canApplyMerge: boolean; mergeReason: string | null };

export function resolveBehaviorLogImportCapabilities(
  preview: BehaviorLogImportMergePreviewResult,
): BehaviorLogImportCapabilities {
  if (!preview.valid || preview.errors.length > 0) {
    return {
      canApplyCreateOnly: false,
      createOnlyReason: "Fix validation errors before applying.",
      canApplyMerge: false,
      mergeReason: "Fix validation errors before applying.",
    };
  }

  if (preview.mergePreview.conflictCount > 0) {
    return {
      canApplyCreateOnly: false,
      createOnlyReason: "Resolve merge conflicts before using create-only import.",
      canApplyMerge: false,
      mergeReason: "Resolve merge conflicts before applying a merge plan.",
    };
  }

  const createOnlyHasWork =
    preview.summary.createCount > 0 ||
    preview.summary.interventionStoredCount > 0;
  const mergeActionCount = Object.values(preview.mergePreview.actionCounts).reduce(
    (total, count) => total + count,
    0,
  );

  return {
    canApplyCreateOnly: createOnlyHasWork,
    createOnlyReason: createOnlyHasWork
      ? null
      : "No new create-only records are available.",
    canApplyMerge: mergeActionCount > 0,
    mergeReason:
      mergeActionCount > 0 ? null : "No supported merge actions are available.",
  };
}

export function previewRequiresSensitiveNoteConfirmation(
  preview: BehaviorLogImportMergePreviewResult,
): boolean {
  return preview.plan.notes.some(
    (note) =>
      note.action !== "skip" &&
      note.noteRole !== "ai_generated" &&
      (note.sensitivity === "high" || note.sensitivity === "restricted"),
  );
}
