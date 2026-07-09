"use client";

import { useActionState } from "react";

import { submitBehaviorLogImportAction } from "@/app/(app)/export/actions";
import type {
  BehaviorLogImportConflict,
  BehaviorLogImportIssue,
  BehaviorLogImportInterventionPreviewPlan,
  BehaviorLogImportMergeAction,
  BehaviorLogImportMergePreviewResult,
  BehaviorLogImportMergeRecordAction,
  BehaviorLogImportRecordType,
} from "@/lib/types/behaviorlog-import";
import type {
  BehaviorLogImportActionState,
  BehaviorLogImportApplyMode,
  BehaviorLogImportCapabilities,
  BehaviorLogImportRunView,
} from "@/lib/types/behaviorlog-import-ui";
import { BEHAVIORLOG_IMPORT_INITIAL_STATE } from "@/lib/types/behaviorlog-import-ui";

type BehaviorLogImportPanelProps = Readonly<{
  recentRuns: BehaviorLogImportRunView[];
}>;

const ACTION_LABELS: Record<BehaviorLogImportMergeAction, string> = {
  create_new: "Create new",
  map_to_existing: "Map to existing",
  skip_existing: "Skip existing",
  conflict_requires_decision: "Needs decision",
};

const RECORD_TYPE_LABELS: Record<BehaviorLogImportRecordType, string> = {
  behavior: "Behavior",
  schedule: "Schedule",
  occurrence: "Occurrence",
  status_event: "Status event",
  note: "Note",
  intervention: "Intervention",
};

export function BehaviorLogImportPanel({
  recentRuns,
}: BehaviorLogImportPanelProps) {
  const [state, formAction, isPending] = useActionState(
    submitBehaviorLogImportAction,
    BEHAVIORLOG_IMPORT_INITIAL_STATE,
  );
  const preview = state.preview;
  const runs = mergeRecentRuns(recentRuns, state);

  return (
    <section
      id="behaviorlog-import"
      className="scroll-mt-20 border-b border-line bg-background py-5 sm:py-6"
      aria-labelledby="behaviorlog-import-title"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3
            id="behaviorlog-import-title"
            className="text-xl font-bold leading-tight"
          >
            BehaviorLog import
          </h3>
          <p className="mt-2 text-sm font-bold text-muted-readable">
            Preview a bundle, review safety details, and apply supported
            create or merge actions.
          </p>
        </div>
        {state.upload ? (
          <p className="break-all text-sm font-bold text-muted-readable">
            {state.upload.fileName} · {formatBytes(state.upload.fileSize)}
          </p>
        ) : null}
      </div>

      <form action={formAction} className="mt-5 grid gap-4">
        <input type="hidden" name="intent" value="preview" />
        <label className="grid gap-2">
          <span className="text-sm font-bold text-muted-readable">
            Upload .behaviorlog.zip
          </span>
          <input
            type="file"
            name="behaviorlog_file"
            accept=".behaviorlog.zip,application/zip"
            className="min-h-11 w-full bg-background px-0 py-2 text-sm text-foreground file:mr-4 file:border-0 file:bg-transparent file:px-0 file:py-1 file:text-sm file:font-bold file:text-foreground file:underline file:decoration-1 file:underline-offset-4"
          />
        </label>
        <div>
          <button
            type="submit"
            disabled={isPending}
            className="product-action product-action-primary min-h-11 py-2 text-sm font-bold"
          >
            Preview import
          </button>
        </div>
      </form>

      {state.message ? <ImportMessage state={state} /> : null}

      {state.applyResult ? (
        <ApplyResult result={state.applyResult} />
      ) : null}

      {preview ? (
        <BehaviorLogImportPreviewDetails
          preview={preview}
          capabilities={state.capabilities}
        />
      ) : null}

      {preview && state.bundlePayload && state.capabilities ? (
        <ApplyControls
          formAction={formAction}
          state={state}
          capabilities={state.capabilities}
          isPending={isPending}
        />
      ) : null}

      <ImportRunHistory runs={runs} />
    </section>
  );
}

export function BehaviorLogImportPreviewDetails({
  preview,
  capabilities,
}: Readonly<{
  preview: BehaviorLogImportMergePreviewResult;
  capabilities: BehaviorLogImportCapabilities | null;
}>) {
  const noteSensitivityWarnings = preview.warnings.filter((issue) =>
    isNoteSensitivityWarning(issue),
  );
  const otherWarnings = preview.warnings.filter(
    (issue) => !isNoteSensitivityWarning(issue),
  );
  const mergeActions = flattenMergeActions(preview);
  const noteSummary = summarizeNoteHandling(preview);

  return (
    <div className="mt-6 grid gap-6">
      <section aria-labelledby="behaviorlog-preview-summary-title">
        <div className="border-b border-line pb-3">
          <h3
            id="behaviorlog-preview-summary-title"
            className="text-xl font-bold leading-tight"
          >
            Dry-run summary
          </h3>
        </div>
        <dl className="mt-4 grid gap-0 border border-line sm:grid-cols-2 lg:grid-cols-5">
          <SummaryStat label="Behaviors" value={preview.summary.behaviorCount} />
          <SummaryStat label="Schedules" value={preview.summary.scheduleCount} />
          <SummaryStat label="Occurrences" value={preview.summary.occurrenceCount} />
          <SummaryStat
            label="Status events"
            value={preview.summary.statusEventCount}
          />
          <SummaryStat label="Notes" value={preview.summary.noteCount} />
          <SummaryStat
            label="Interventions"
            value={preview.summary.interventionCount}
          />
          <SummaryStat
            label="Imported note records"
            value={noteSummary.importedNoteRecordCount}
          />
          <SummaryStat
            label="Imported interventions"
            value={preview.summary.interventionStoredCount}
          />
          <SummaryStat
            label="Inline note fills"
            value={noteSummary.inlineOccurrenceFillCount}
          />
          <SummaryStat
            label="Unsupported fields"
            value={preview.summary.unsupportedFieldCount}
          />
          <SummaryStat
            label="Sensitive note warnings"
            value={noteSensitivityWarnings.length}
          />
          <SummaryStat label="Create" value={preview.summary.createCount} />
          <SummaryStat label="Skip" value={preview.summary.skipCount} />
          <SummaryStat label="Warnings" value={preview.summary.warningCount} />
          <SummaryStat label="Errors" value={preview.summary.errorCount} />
        </dl>
      </section>

      <section aria-labelledby="behaviorlog-privacy-title">
        <div className="border-b border-line pb-3">
          <h3
            id="behaviorlog-privacy-title"
            className="text-xl font-bold leading-tight"
          >
            Privacy
          </h3>
        </div>
        <dl className="mt-4 grid gap-0 border border-line sm:grid-cols-2 lg:grid-cols-4">
          <SummaryStat
            label="Profiles"
            value={preview.mergePreview.privacy.profiles.join(", ") || "core"}
          />
          <SummaryStat
            label="Redaction"
            value={preview.mergePreview.privacy.redactionLevel ?? "Not stated"}
          />
          <SummaryStat
            label="Subject IDs"
            value={preview.mergePreview.privacy.subjectIdStrategy ?? "Not stated"}
          />
          <SummaryStat
            label="AI content"
            value={formatBoolean(preview.mergePreview.privacy.containsAiGeneratedContent)}
          />
        </dl>
      </section>

      <section aria-labelledby="behaviorlog-interventions-title">
        <div className="border-b border-line pb-3">
          <h3
            id="behaviorlog-interventions-title"
            className="text-xl font-bold leading-tight"
          >
            Intervention preview
          </h3>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <CountList
            title="Channels"
            counts={preview.summary.interventionCounts.byChannel}
          />
          <CountList
            title="Delivery status"
            counts={preview.summary.interventionCounts.byDeliveryStatus}
          />
        </div>
        <dl className="mt-4 grid gap-0 border border-line sm:grid-cols-2 lg:grid-cols-4">
          <SummaryStat
            label="Passive history rows"
            value={preview.summary.interventionStoredCount}
          />
          <SummaryStat
            label="Dropped sensitive fields"
            value={preview.summary.interventionSensitiveFieldDropCount}
          />
          <SummaryStat
            label="Redacted fields"
            value={preview.summary.interventionRedactedFieldCount}
          />
          <SummaryStat label="Reminder writes" value={0} />
        </dl>
        <InterventionStorageList interventions={preview.plan.interventions} />
      </section>

      <IssueList title="Errors" issues={preview.errors} tone="error" />
      <IssueList
        title="Note sensitivity warnings"
        issues={noteSensitivityWarnings}
        tone="warning"
      />
      <IssueList title="Warnings" issues={otherWarnings} tone="warning" />
      <ConflictList conflicts={preview.conflicts} />

      <section aria-labelledby="behaviorlog-merge-actions-title">
        <div className="border-b border-line pb-3">
          <h3
            id="behaviorlog-merge-actions-title"
            className="text-xl font-bold leading-tight"
          >
            Merge actions
          </h3>
        </div>
        <dl className="mt-4 grid gap-0 border border-line sm:grid-cols-2 lg:grid-cols-4">
          <SummaryStat
            label="Create new"
            value={preview.mergePreview.actionCounts.create_new}
          />
          <SummaryStat
            label="Map to existing"
            value={preview.mergePreview.actionCounts.map_to_existing}
          />
          <SummaryStat
            label="Skip existing"
            value={preview.mergePreview.actionCounts.skip_existing}
          />
          <SummaryStat
            label="Needs decision"
            value={preview.mergePreview.actionCounts.conflict_requires_decision}
          />
        </dl>

        {capabilities ? (
          <div className="mt-4 grid gap-2 text-sm font-bold text-muted-readable">
            <p>
              Create-only:{" "}
              {capabilities.canApplyCreateOnly
                ? "Available"
                : capabilities.createOnlyReason}
            </p>
            <p>
              Merge:{" "}
              {capabilities.canApplyMerge ? "Available" : capabilities.mergeReason}
            </p>
          </div>
        ) : null}

        <div className="mt-4 max-h-[28rem] overflow-auto border border-line">
          {mergeActions.length > 0 ? (
            <ul className="divide-y divide-line">
              {mergeActions.map((action) => (
                <li key={`${action.recordType}:${action.externalId}`} className="p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-bold text-foreground">
                        {RECORD_TYPE_LABELS[action.recordType]} ·{" "}
                        {action.externalId}
                      </p>
                      <p className="mt-1 text-sm font-bold text-muted-readable">
                        {ACTION_LABELS[action.action]}
                      </p>
                      {action.recordType === "note" ? (
                        <p className="mt-2 text-sm text-muted-readable">
                          {formatNoteHandling(action)}
                        </p>
                      ) : null}
                      {action.recordType === "intervention" ? (
                        <p className="mt-2 text-sm text-muted-readable">
                          {formatInterventionHandling(action)}
                        </p>
                      ) : null}
                    </div>
                    {action.localId ? (
                      <p className="break-all text-sm font-bold text-muted-readable">
                        {action.localId}
                      </p>
                    ) : null}
                  </div>
                  {action.reasons.length > 0 ? (
                    <ul className="mt-3 grid gap-1 text-sm text-muted-readable">
                      {action.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm font-bold text-muted-readable">
              No merge actions.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function ApplyControls({
  formAction,
  state,
  capabilities,
  isPending,
}: Readonly<{
  formAction: (formData: FormData) => void;
  state: BehaviorLogImportActionState;
  capabilities: BehaviorLogImportCapabilities;
  isPending: boolean;
}>) {
  return (
    <section className="mt-6 grid gap-4 border-t border-line pt-5">
      <h3 className="text-xl font-bold leading-tight">Apply</h3>
      <div className="grid gap-4 lg:grid-cols-2">
      <BehaviorLogImportApplyForm
          title="Create-only"
          mode="create_missing_only"
          buttonLabel="Apply create-only import"
          disabled={!capabilities.canApplyCreateOnly || isPending}
          disabledReason={capabilities.createOnlyReason}
          requiresSensitiveNoteConfirmation={previewRequiresSensitiveNoteConfirmation(
            state.preview,
          )}
          formAction={formAction}
          state={state}
        />
      <BehaviorLogImportApplyForm
          title="Approved merge"
          mode="merge_by_user_approved_plan"
          buttonLabel="Apply approved merge"
          disabled={!capabilities.canApplyMerge || isPending}
          disabledReason={capabilities.mergeReason}
          requiresSensitiveNoteConfirmation={previewRequiresSensitiveNoteConfirmation(
            state.preview,
          )}
          formAction={formAction}
          state={state}
        />
      </div>
    </section>
  );
}

export function BehaviorLogImportApplyForm({
  title,
  mode,
  buttonLabel,
  disabled,
  disabledReason,
  requiresSensitiveNoteConfirmation,
  formAction,
  state,
}: Readonly<{
  title: string;
  mode: BehaviorLogImportApplyMode;
  buttonLabel: string;
  disabled: boolean;
  disabledReason: string | null;
  requiresSensitiveNoteConfirmation: boolean;
  formAction: (formData: FormData) => void;
  state: BehaviorLogImportActionState;
}>) {
  return (
    <form action={formAction} className="grid gap-4 border-t border-line pt-4">
      <input type="hidden" name="intent" value="apply" />
      <input type="hidden" name="import_mode" value={mode} />
      <input type="hidden" name="bundle_payload" value={state.bundlePayload ?? ""} />
      <input
        type="hidden"
        name="import_preview_run_id"
        value={state.previewRun?.id ?? ""}
      />
      <input
        type="hidden"
        name="preview_fingerprint"
        value={state.preview?.previewFingerprint ?? ""}
      />
      <input
        type="hidden"
        name="local_data_fingerprint"
        value={state.preview?.localDataFingerprint ?? ""}
      />
      <input
        type="hidden"
        name="bundle_fingerprint"
        value={state.preview?.bundleFingerprint ?? ""}
      />
      <input
        type="hidden"
        name="upload_file_name"
        value={state.upload?.fileName ?? ""}
      />
      <input
        type="hidden"
        name="upload_file_size"
        value={state.upload?.fileSize ?? 0}
      />
      <div>
        <h4 className="text-lg font-bold leading-tight">{title}</h4>
        {disabledReason ? (
          <p className="mt-2 text-sm font-bold text-muted-readable">
            {disabledReason}
          </p>
        ) : null}
      </div>
      <label className="flex items-start gap-3 text-sm font-bold">
        <input
          type="checkbox"
          name="confirm_apply"
          value="yes"
          required
          disabled={disabled}
          className="mt-1 h-5 w-5 accent-foreground"
        />
        <span>I reviewed this exact preview.</span>
      </label>
      {requiresSensitiveNoteConfirmation ? (
        <label className="flex items-start gap-3 text-sm font-bold">
          <input
            type="checkbox"
            name="confirm_sensitive_notes"
            value="yes"
            required
            disabled={disabled}
            className="mt-1 h-5 w-5 accent-foreground"
          />
          <span>I reviewed high or restricted note sensitivity warnings.</span>
        </label>
      ) : null}
      <button
        type="submit"
        disabled={disabled}
        className="product-action product-action-primary min-h-11 w-fit py-2 text-sm font-bold"
      >
        {buttonLabel}
      </button>
    </form>
  );
}

function ImportMessage({
  state,
}: Readonly<{
  state: BehaviorLogImportActionState;
}>) {
  const isError = state.status === "error";

  return (
    <div
      className={`mt-5 border-t border-line pt-4 text-sm font-bold ${
        isError ? "text-accent" : "text-foreground"
      }`}
      role={isError ? "alert" : "status"}
    >
      <p>{state.message}</p>
    </div>
  );
}

function ApplyResult({
  result,
}: Readonly<{
  result: NonNullable<BehaviorLogImportActionState["applyResult"]>;
}>) {
  return (
    <section className="mt-5 border-t border-line pt-4">
      <h3 className="text-lg font-bold leading-tight">Applied</h3>
      <dl className="mt-4 grid gap-0 border border-line bg-background sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStat label="Behaviors" value={result.created.behaviors} />
        <SummaryStat label="Schedules" value={result.created.schedules} />
        <SummaryStat label="Occurrences" value={result.created.occurrences} />
        <SummaryStat label="Status events" value={result.created.statusEvents} />
        <SummaryStat label="Imported notes" value={result.created.notes} />
        <SummaryStat
          label="Imported interventions"
          value={result.created.interventions}
        />
      </dl>
      {result.mapped ? (
        <p className="mt-3 text-sm font-bold text-muted-readable">
          Mapped {result.mapped.behaviors + result.mapped.schedules + result.mapped.occurrences + result.mapped.statusEvents + result.mapped.notes + result.mapped.interventions} record(s).
        </p>
      ) : null}
    </section>
  );
}

function ImportRunHistory({
  runs,
}: Readonly<{
  runs: BehaviorLogImportRunView[];
}>) {
  return (
    <section className="mt-6" aria-labelledby="import-runs-title">
      <h3 id="import-runs-title" className="text-xl font-bold leading-tight">
        Recent imports
      </h3>
      {runs.length > 0 ? (
        <ul className="mt-4 grid gap-3">
          {runs.map((run) => (
            <li key={run.id} className="grid gap-2 py-1 sm:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <p className="break-all text-sm font-bold text-foreground">
                  {formatImportMode(run.import_mode)} · {run.status}
                </p>
                <p className="mt-1 text-sm font-bold text-muted-readable">
                  Started {formatDateTime(run.started_at)}
                </p>
                {run.failure_message ? (
                  <p className="mt-2 text-sm text-accent">{run.failure_message}</p>
                ) : null}
              </div>
              <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[auto_minmax(0,1fr)] sm:text-right">
                <dt className="text-sm font-bold text-foreground">Finished</dt>
                <dd className="break-all text-sm font-bold text-muted-readable">
                  {run.completed_at
                    ? formatDateTime(run.completed_at)
                    : "Still open"}
                </dd>
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 border-t border-line pt-4 text-sm font-bold text-muted-readable">
          No import runs yet.
        </p>
      )}
    </section>
  );
}

function SummaryStat({
  label,
  value,
}: Readonly<{
  label: string;
  value: string | number;
}>) {
  return (
    <div className="border-b border-line p-4 sm:border-r sm:last:border-r-0 lg:[&:nth-child(5n)]:border-r-0">
      <dt className="text-sm font-bold text-muted-readable">{label}</dt>
      <dd className="mt-2 break-words text-xl font-bold leading-tight">{value}</dd>
    </div>
  );
}

function CountList({
  title,
  counts,
}: Readonly<{
  title: string;
  counts: Array<{ value: string; count: number }>;
}>) {
  return (
    <div className="border border-line">
      <h4 className="border-b border-line p-3 text-sm font-bold text-muted-readable">
        {title}
      </h4>
      {counts.length > 0 ? (
        <dl className="divide-y divide-line">
          {counts.map((count) => (
            <div
              key={count.value}
              className="flex items-center justify-between gap-3 p-3 text-sm"
            >
              <dt className="font-bold text-foreground">{count.value}</dt>
              <dd className="font-bold text-muted-readable">{count.count}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="p-3 text-sm font-bold text-muted-readable">None</p>
      )}
    </div>
  );
}

function InterventionStorageList({
  interventions,
}: Readonly<{
  interventions: BehaviorLogImportInterventionPreviewPlan[];
}>) {
  if (interventions.length === 0) {
    return (
      <p className="mt-4 border-t border-line pt-4 text-sm font-bold text-muted-readable">
        No intervention history rows.
      </p>
    );
  }

  return (
    <div className="mt-4 max-h-[20rem] overflow-auto border border-line">
      <ul className="divide-y divide-line">
        {interventions.map((intervention) => (
          <li key={intervention.externalId} className="grid gap-2 p-4 text-sm">
            <p className="break-words font-bold text-foreground">
              {intervention.externalId}
            </p>
            <p className="break-words text-muted-readable">
              Stores {formatFieldList(intervention.storageDecision.storedFields)}.
            </p>
            {intervention.storageDecision.droppedSensitiveFields.length > 0 ? (
              <p className="break-words text-muted-readable">
                Drops{" "}
                {formatFieldList(
                  intervention.storageDecision.droppedSensitiveFields,
                )}
                .
              </p>
            ) : null}
            {intervention.storageDecision.redactedFields.length > 0 ? (
              <p className="break-words text-muted-readable">
                Redacts{" "}
                {formatFieldList(intervention.storageDecision.redactedFields)}.
              </p>
            ) : null}
            <p className="text-muted-readable">
              No reminder deliveries, provider calls, or message bodies.
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IssueList({
  title,
  issues,
  tone,
}: Readonly<{
  title: string;
  issues: BehaviorLogImportIssue[];
  tone: "error" | "warning";
}>) {
  return (
    <section aria-labelledby={`${title.toLowerCase().replaceAll(" ", "-")}-title`}>
      <div className="border-b border-line pb-3">
        <h3
          id={`${title.toLowerCase().replaceAll(" ", "-")}-title`}
          className="text-xl font-bold leading-tight"
        >
          {title}
        </h3>
      </div>
      {issues.length > 0 ? (
        <ul className="mt-4 divide-y divide-line border border-line">
          {issues.map((issue) => (
            <li key={issueKey(issue)} className="p-4">
              <p
                className={`text-sm font-bold ${
                  tone === "error" ? "text-accent" : "text-foreground"
                }`}
              >
                {issue.message}
              </p>
              <p className="mt-1 break-words text-sm font-bold text-muted-readable">
                {issue.code}
                {issue.file ? ` · ${issue.file}` : null}
                {issue.row ? ` · row ${issue.row}` : null}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 border-t border-line pt-4 text-sm font-bold text-muted-readable">
          None
        </p>
      )}
    </section>
  );
}

function ConflictList({
  conflicts,
}: Readonly<{
  conflicts: BehaviorLogImportConflict[];
}>) {
  return (
    <section aria-labelledby="behaviorlog-conflicts-title">
      <div className="border-b border-line pb-3">
        <h3
          id="behaviorlog-conflicts-title"
          className="text-xl font-bold leading-tight"
        >
          Conflicts
        </h3>
      </div>
      {conflicts.length > 0 ? (
        <ul className="mt-4 divide-y divide-line border border-line">
          {conflicts.map((conflict) => (
            <li
              key={`${conflict.code}:${conflict.importedRecordType}:${conflict.importedId}`}
              className="p-4"
            >
              <p className="text-sm font-bold text-foreground">
                {conflict.message}
              </p>
              <p className="mt-1 break-words text-sm font-bold text-muted-readable">
                {conflict.code} · {RECORD_TYPE_LABELS[conflict.importedRecordType]} ·{" "}
                {conflict.importedId}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 border-t border-line pt-4 text-sm font-bold text-muted-readable">
          None
        </p>
      )}
    </section>
  );
}

function flattenMergeActions(
  preview: BehaviorLogImportMergePreviewResult,
): BehaviorLogImportMergeRecordAction[] {
  return [
    ...preview.mergePreview.actions.behaviors,
    ...preview.mergePreview.actions.schedules,
    ...preview.mergePreview.actions.occurrences,
    ...preview.mergePreview.actions.statusEvents,
    ...preview.mergePreview.actions.notes,
    ...preview.mergePreview.actions.interventions,
  ];
}

function summarizeNoteHandling(
  preview: BehaviorLogImportMergePreviewResult,
): {
  importedNoteRecordCount: number;
  inlineOccurrenceFillCount: number;
} {
  return preview.mergePreview.actions.notes.reduce(
    (summary, action) => {
      const storageDecision = readMetadataString(
        action,
        "noteStorageDecision",
      );
      const noteDecision = readMetadataString(action, "noteDecision");

      if (
        storageDecision === "create_imported_note_record" ||
        storageDecision === "existing_imported_note_record"
      ) {
        summary.importedNoteRecordCount += 1;
      }

      if (
        noteDecision === "fill_empty_occurrence_note" ||
        noteDecision === "fill_created_occurrence_note"
      ) {
        summary.inlineOccurrenceFillCount += 1;
      }

      return summary;
    },
    {
      importedNoteRecordCount: 0,
      inlineOccurrenceFillCount: 0,
    },
  );
}

function formatNoteHandling(action: BehaviorLogImportMergeRecordAction): string {
  const storageDecision = readMetadataString(action, "noteStorageDecision");
  const noteDecision = readMetadataString(action, "noteDecision");

  if (
    noteDecision === "fill_empty_occurrence_note" ||
    noteDecision === "fill_created_occurrence_note"
  ) {
    return "Stores an imported note record and may fill the occurrence Note field.";
  }

  if (storageDecision === "create_imported_note_record") {
    return "Stores a passive imported note record.";
  }

  if (storageDecision === "existing_imported_note_record") {
    return "Maps to an existing imported note record.";
  }

  if (storageDecision === "skip_imported_note_record") {
    return "Does not import a note record.";
  }

  return "Review note handling before apply.";
}

function formatInterventionHandling(
  action: BehaviorLogImportMergeRecordAction,
): string {
  const interventionDecision = readMetadataString(
    action,
    "interventionDecision",
  );

  if (interventionDecision === "store_passive_history") {
    return "Stores passive imported intervention history only.";
  }

  if (action.action === "map_to_existing") {
    return "Maps to existing imported intervention history.";
  }

  return "No operational reminder write.";
}

function formatFieldList(fields: string[]): string {
  if (fields.length === 0) {
    return "none";
  }

  return fields.join(", ");
}

function previewRequiresSensitiveNoteConfirmation(
  preview: BehaviorLogImportMergePreviewResult | null,
): boolean {
  return (
    preview?.plan.notes.some(
      (note) =>
        note.action !== "skip" &&
        note.noteRole !== "ai_generated" &&
        (note.sensitivity === "high" || note.sensitivity === "restricted"),
    ) ?? false
  );
}

function isNoteSensitivityWarning(issue: BehaviorLogImportIssue): boolean {
  return (
    issue.code === "high_sensitivity_note_present" ||
    issue.code === "restricted_note_present"
  );
}

function readMetadataString(
  action: BehaviorLogImportMergeRecordAction,
  key: string,
): string | null {
  const value = action.metadata?.[key];

  return typeof value === "string" ? value : null;
}

function mergeRecentRuns(
  runs: BehaviorLogImportRunView[],
  state: BehaviorLogImportActionState,
): BehaviorLogImportRunView[] {
  const current = state.applyResult?.importRun ?? state.previewRun;
  const merged = current ? [current, ...runs] : runs;
  const seen = new Set<string>();

  return merged.filter((run) => {
    if (seen.has(run.id)) {
      return false;
    }

    seen.add(run.id);
    return true;
  });
}

function issueKey(issue: BehaviorLogImportIssue): string {
  return [
    issue.code,
    issue.file,
    issue.row,
    issue.path,
    issue.message,
  ]
    .filter(Boolean)
    .join(":");
}

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatBoolean(value: boolean | null): string {
  if (value === true) {
    return "Yes";
  }

  if (value === false) {
    return "No";
  }

  return "Not stated";
}

function formatImportMode(mode: string): string {
  switch (mode) {
    case "preview_only":
      return "Preview";
    case "create_missing_only":
      return "Create-only";
    case "merge_preview":
      return "Merge preview";
    case "merge_by_user_approved_plan":
      return "Approved merge";
    default:
      return mode;
  }
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
