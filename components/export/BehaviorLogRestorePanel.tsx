"use client";

import { useActionState, useRef, useState } from "react";

import { submitBehaviorLogRestoreAction } from "@/app/(app)/export/actions";
import type {
  BehaviorLogRestoreAction,
  BehaviorLogRestoreActionKind,
  BehaviorLogRestorePreview,
  BehaviorLogRestoreRecordType,
} from "@/lib/types/behaviorlog-restore";
import type {
  BehaviorLogRestoreActionState,
  BehaviorLogRestoreFormAction,
  BehaviorLogRestoreRunView,
} from "@/lib/types/behaviorlog-restore-ui";
import { BEHAVIORLOG_RESTORE_INITIAL_STATE } from "@/lib/types/behaviorlog-restore-ui";
import {
  getBehaviorLogBundleSizeError,
  readBehaviorLogBundleAsBase64,
} from "@/lib/types/behaviorlog-bundle-ui";

type BehaviorLogRestorePanelProps = Readonly<{
  recentRuns: BehaviorLogRestoreRunView[];
  action?: BehaviorLogRestoreFormAction;
  initialState?: BehaviorLogRestoreActionState;
}>;

const ACTION_LABELS: Record<BehaviorLogRestoreActionKind, string> = {
  create: "Create",
  replace: "Replace",
  archive: "Archive",
  delete: "Delete",
  keep: "Keep",
  skip: "Skip",
};

const RECORD_LABELS: Record<BehaviorLogRestoreRecordType, string> = {
  behavior: "Behavior",
  schedule: "Schedule",
  occurrence: "Occurrence",
  status_event: "Status event",
  behavior_definition_event: "Behavior definition event",
  time_session: "Time session",
  intervention_rule: "Intervention rule",
  inline_occurrence_note: "Inline note",
  note: "Imported note",
  intervention: "Imported intervention",
};

export function BehaviorLogRestorePanel({
  recentRuns,
  action = submitBehaviorLogRestoreAction,
  initialState = BEHAVIORLOG_RESTORE_INITIAL_STATE,
}: BehaviorLogRestorePanelProps) {
  const [state, formAction, isPending] = useActionState(
    action,
    initialState,
  );
  const preview = state.preview;
  const runs = mergeRecentRuns(recentRuns, state);
  const bundleReadVersionRef = useRef(0);
  const [bundlePayload, setBundlePayload] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [isPreparingBundle, setIsPreparingBundle] = useState(false);

  async function handleBundleFileChange(file: File | null) {
    const readVersion = bundleReadVersionRef.current + 1;
    bundleReadVersionRef.current = readVersion;
    setBundlePayload(null);
    setClientError(null);

    if (!file) {
      setIsPreparingBundle(false);
      return;
    }

    const sizeError = getBehaviorLogBundleSizeError(file.size);

    if (sizeError) {
      setClientError(sizeError);
      setIsPreparingBundle(false);
      return;
    }

    setIsPreparingBundle(true);

    try {
      const payload = await readBehaviorLogBundleAsBase64(file);

      if (bundleReadVersionRef.current === readVersion) {
        setBundlePayload(payload);
      }
    } catch {
      if (bundleReadVersionRef.current === readVersion) {
        setClientError("Cadence could not prepare this file. Choose it again.");
      }
    } finally {
      if (bundleReadVersionRef.current === readVersion) {
        setIsPreparingBundle(false);
      }
    }
  }

  return (
    <section
      id="behaviorlog-restore"
      className="scroll-mt-20 bg-background"
      aria-labelledby="behaviorlog-restore-title"
    >
      <div className="flex flex-col gap-4 border-b border-line pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3
            id="behaviorlog-restore-title"
            className="text-xl leading-tight"
          >
            BehaviorLog restore
          </h3>
          <p className="mt-3 text-sm text-muted-readable">
            Preview a trusted bundle before any restore apply confirmation.
          </p>
        </div>
        {state.upload ? (
          <p className="break-all text-sm font-bold text-muted-readable">
            {state.upload.fileName} · {formatBytes(state.upload.fileSize)}
          </p>
        ) : null}
      </div>

      <form
        action={formAction}
        onSubmit={(event) => {
          const file = new FormData(event.currentTarget).get(
            "restore_behaviorlog_file",
          );
          const sizeError =
            file instanceof File
              ? getBehaviorLogBundleSizeError(file.size)
              : null;

          if (sizeError) {
            event.preventDefault();
            setClientError(sizeError);
          }
        }}
        className="mt-5 grid gap-4"
      >
        <input type="hidden" name="intent" value="restore_preview" />
        <label className="grid gap-2">
          <span className="text-sm font-bold text-muted-readable">
            Upload trusted .behaviorlog.zip
          </span>
          <input
            type="file"
            name="restore_behaviorlog_file"
            accept=".behaviorlog.zip,application/zip"
            onChange={(event) => {
              void handleBundleFileChange(event.currentTarget.files?.[0] ?? null);
            }}
            className="min-h-11 w-full bg-background px-0 py-2 text-sm text-foreground file:mr-4 file:border-0 file:bg-transparent file:px-0 file:py-1 file:text-sm file:font-bold file:text-foreground file:underline file:decoration-1 file:underline-offset-4"
          />
          <span className="text-sm text-muted-readable">
            Maximum file size: 2 MB.
          </span>
        </label>
        <div>
          <button
            type="submit"
            disabled={isPending || isPreparingBundle || clientError !== null}
            className="product-action product-action-primary min-h-11 py-2 text-sm font-bold"
          >
            Preview restore
          </button>
        </div>
      </form>

      {clientError ? (
        <p className="mt-5 text-sm font-bold text-accent" role="alert">
          {clientError}
        </p>
      ) : null}

      {state.message ? <RestoreMessage state={state} /> : null}
      {state.applyResult ? <RestoreApplyResult state={state} /> : null}
      {preview ? <BehaviorLogRestorePreviewDetails preview={preview} /> : null}
      {preview && state.archiveFingerprint && state.previewRun ? (
        <RestoreApplyControls
          key={`${state.previewRun.id}:${preview.previewFingerprint}`}
          bundlePayload={bundlePayload}
          formAction={formAction}
          state={state}
          isPending={isPending}
        />
      ) : null}
      <RestoreRunHistory runs={runs} />
    </section>
  );
}

export function BehaviorLogRestorePreviewDetails({
  preview,
}: Readonly<{
  preview: BehaviorLogRestorePreview;
}>) {
  const actions = flattenRestoreActions(preview);

  return (
    <div className="mt-6 grid gap-6">
      <section aria-labelledby="restore-summary-title">
        <div className="border-b border-line pb-3">
          <h3 id="restore-summary-title" className="text-xl leading-tight">
            Restore preview
          </h3>
        </div>
        <dl className="mt-4 grid gap-0 border border-line sm:grid-cols-2 lg:grid-cols-4">
          <SummaryStat label="Create" value={preview.summary.createdCount} />
          <SummaryStat label="Replace" value={preview.summary.replacedCount} />
          <SummaryStat label="Archive" value={preview.summary.archivedCount} />
          <SummaryStat label="Delete" value={preview.summary.deletedCount} />
          <SummaryStat label="Keep" value={preview.summary.keptCount} />
          <SummaryStat label="Skip" value={preview.summary.skippedCount} />
          <SummaryStat
            label="Sensitive notes"
            value={preview.summary.highOrRestrictedNoteCount}
          />
          <SummaryStat
            label="Redacted fields"
            value={preview.summary.redactedInterventionFieldCount}
          />
        </dl>
        <div
          data-testid="restore-destructive-count"
          className="mt-4 border-t border-line pt-4 text-sm font-bold"
        >
          <p>{preview.summary.destructiveActionCount} destructive action(s).</p>
        </div>
      </section>

      <section aria-labelledby="restore-fingerprints-title">
        <div className="border-b border-line pb-3">
          <h3
            id="restore-fingerprints-title"
            className="text-xl leading-tight"
          >
            Fingerprints
          </h3>
        </div>
        <dl className="mt-4 grid gap-0 border border-line">
          <FingerprintRow
            label="Preview"
            value={preview.previewFingerprint}
            testId="restore-preview-fingerprint"
          />
          <FingerprintRow label="Local data" value={preview.localDataFingerprint} />
          <FingerprintRow label="Bundle" value={preview.bundleFingerprint} />
        </dl>
      </section>

      <section aria-labelledby="restore-boundaries-title">
        <div className="border-b border-line pb-3">
          <h3
            id="restore-boundaries-title"
            className="text-xl leading-tight"
          >
            Not restored
          </h3>
        </div>
        <ul className="mt-4 divide-y divide-line border border-line">
          {preview.nonRestorableFields.map((field) => (
            <li key={field.field} className="p-4">
              <p className="text-sm font-bold text-foreground">{field.field}</p>
              <p className="mt-1 text-sm text-muted-readable">{field.reason}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="restore-policy-title">
        <div className="border-b border-line pb-3">
          <h3 id="restore-policy-title" className="text-xl leading-tight">
            Status history
          </h3>
        </div>
        <p className="mt-4 border-t border-line pt-4 text-sm font-bold text-muted-readable">
          {preview.statusHistoryPolicy.selected}. Apply support for this policy:{" "}
          {preview.statusHistoryPolicy.applySupportedInThisTicket ? "Yes" : "No"}
        </p>
      </section>

      <IssueList title="Errors" issues={preview.errors} tone="error" />
      <IssueList title="Warnings" issues={preview.warnings} tone="warning" />

      <section aria-labelledby="restore-actions-title">
        <div className="border-b border-line pb-3">
          <h3 id="restore-actions-title" className="text-xl leading-tight">
            Restore actions
          </h3>
        </div>
        <div className="mt-4 max-h-[32rem] overflow-auto border border-line">
          {actions.length > 0 ? (
            <ul className="divide-y divide-line">
              {actions.map((action, index) => (
                <li
                  key={`${action.recordType}:${action.externalId ?? "local"}:${action.localId ?? index}`}
                  className="p-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-bold text-foreground">
                        {RECORD_LABELS[action.recordType]} ·{" "}
                        {action.externalId ?? action.localId ?? "local"}
                      </p>
                      <p className="mt-1 text-sm font-bold text-muted-readable">
                        {ACTION_LABELS[action.action]}
                        {action.destructive ? " · Destructive" : ""}
                      </p>
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
              No restore actions.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function RestoreApplyControls({
  bundlePayload,
  formAction,
  state,
  isPending,
}: Readonly<{
  bundlePayload: string | null;
  formAction: (formData: FormData) => void;
  state: BehaviorLogRestoreActionState;
  isPending: boolean;
}>) {
  const preview = state.preview;
  const unavailable =
    !preview ||
    !preview.valid ||
    !preview.statusHistoryPolicy.applySupportedInThisTicket ||
    preview.summary.unsupportedActionCount > 0 ||
    preview.summary.skippedCount > 0 ||
    !bundlePayload ||
    isPending;
  const [backupAcknowledged, setBackupAcknowledged] = useState(false);
  const [sensitiveNotesAcknowledged, setSensitiveNotesAcknowledged] =
    useState(false);
  const [typedConfirmation, setTypedConfirmation] = useState("");
  const requiresSensitiveNoteConfirmation =
    preview?.sensitivity.highOrRestrictedNotesPresent === true;
  const canSubmit = isBehaviorLogRestoreApplyReady({
    unavailable,
    backupAcknowledged,
    requiresSensitiveNoteConfirmation,
    sensitiveNotesAcknowledged,
    typedConfirmation,
  });

  return (
    <section className="mt-6 border-t border-line pt-5">
      <h3 className="text-xl leading-tight">Apply restore</h3>
      {preview && preview.summary.unsupportedActionCount > 0 ? (
        <p
          data-testid="restore-stale-preview-message"
          className="mt-3 border-t border-line pt-4 text-sm font-bold text-accent"
          role="alert"
        >
          Resolve skipped or unsupported actions before applying restore.
        </p>
      ) : null}
      {preview && !preview.statusHistoryPolicy.applySupportedInThisTicket ? (
        <p
          className="mt-3 border-t border-line pt-4 text-sm font-bold text-accent"
          role="alert"
        >
          The selected status-history policy is preview-only and cannot be applied.
        </p>
      ) : null}
      <form action={formAction} className="mt-4 grid gap-4 border-t border-line pt-4">
        <input type="hidden" name="intent" value="restore_apply" />
        <input type="hidden" name="bundle_payload" value={bundlePayload ?? ""} />
        <input
          type="hidden"
          name="archive_fingerprint"
          value={state.archiveFingerprint ?? ""}
        />
        <input type="hidden" name="restore_preview_run_id" value={state.previewRun?.id ?? ""} />
        <input type="hidden" name="preview_fingerprint" value={preview?.previewFingerprint ?? ""} />
        <input type="hidden" name="local_data_fingerprint" value={preview?.localDataFingerprint ?? ""} />
        <input type="hidden" name="bundle_fingerprint" value={preview?.bundleFingerprint ?? ""} />
        <input type="hidden" name="upload_file_name" value={state.upload?.fileName ?? ""} />
        <input type="hidden" name="upload_file_size" value={state.upload?.fileSize ?? 0} />

        <label className="flex items-start gap-3 text-sm font-bold">
          <input
            type="checkbox"
            name="confirm_backup"
            value="yes"
            required
            disabled={unavailable}
            checked={backupAcknowledged}
            onChange={(event) =>
              setBackupAcknowledged(event.currentTarget.checked)
            }
            className="mt-1 h-5 w-5 accent-foreground"
          />
          <span>I created or downloaded a fresh backup before restoring.</span>
        </label>
        {preview?.sensitivity.highOrRestrictedNotesPresent ? (
          <label className="flex items-start gap-3 text-sm font-bold">
            <input
              type="checkbox"
              name="confirm_sensitive_notes"
              value="yes"
              required
              disabled={unavailable}
              checked={sensitiveNotesAcknowledged}
              onChange={(event) =>
                setSensitiveNotesAcknowledged(event.currentTarget.checked)
              }
              className="mt-1 h-5 w-5 accent-foreground"
            />
            <span>I reviewed high or restricted note sensitivity warnings.</span>
          </label>
        ) : null}
        <label className="grid gap-2 text-sm font-bold">
          <span>Type RESTORE</span>
          <input
            name="confirm_restore_text"
            autoComplete="off"
            required
            disabled={unavailable}
            value={typedConfirmation}
            onChange={(event) => setTypedConfirmation(event.currentTarget.value)}
            className="min-h-11 border border-line bg-background px-3 py-2"
          />
        </label>
        <button
          data-testid="restore-apply-button"
          type="submit"
          disabled={!canSubmit}
          className="product-action product-action-primary min-h-11 w-fit py-2 text-sm font-bold"
        >
          Apply restore
        </button>
      </form>
    </section>
  );
}

export function isBehaviorLogRestoreApplyReady({
  unavailable,
  backupAcknowledged,
  requiresSensitiveNoteConfirmation,
  sensitiveNotesAcknowledged,
  typedConfirmation,
}: Readonly<{
  unavailable: boolean;
  backupAcknowledged: boolean;
  requiresSensitiveNoteConfirmation: boolean;
  sensitiveNotesAcknowledged: boolean;
  typedConfirmation: string;
}>): boolean {
  return (
    !unavailable &&
    backupAcknowledged &&
    typedConfirmation === "RESTORE" &&
    (!requiresSensitiveNoteConfirmation || sensitiveNotesAcknowledged)
  );
}

function RestoreMessage({
  state,
}: Readonly<{
  state: BehaviorLogRestoreActionState;
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

function RestoreApplyResult({
  state,
}: Readonly<{
  state: BehaviorLogRestoreActionState;
}>) {
  const result = state.applyResult;

  if (!result) {
    return null;
  }

  return (
    <section className="mt-5 border-t border-line pt-4">
      <h3 className="text-lg leading-tight">Restore applied</h3>
      <dl className="mt-4 grid gap-0 border border-line bg-background sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(result.appliedCounts).map(([label, value]) => (
          <SummaryStat key={label} label={label} value={value} />
        ))}
      </dl>
    </section>
  );
}

function RestoreRunHistory({
  runs,
}: Readonly<{
  runs: BehaviorLogRestoreRunView[];
}>) {
  return (
    <section className="mt-6" aria-labelledby="restore-runs-title">
      <h3 id="restore-runs-title" className="text-xl leading-tight">
        Recent restores
      </h3>
      {runs.length > 0 ? (
        <ul className="mt-4 divide-y divide-line border border-line">
          {runs.map((run) => (
            <li key={run.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <p className="break-all text-sm font-bold text-foreground">
                  {formatRunMode(run.mode)} · {run.status}
                </p>
                <p className="mt-1 text-sm font-bold text-muted-readable">
                  Started {formatDateTime(run.startedAt)}
                </p>
                {run.failureMessage ? (
                  <p className="mt-2 text-sm text-accent">{run.failureMessage}</p>
                ) : null}
              </div>
              <p className="break-all text-sm font-bold text-muted-readable">
                {run.completedAt ? formatDateTime(run.completedAt) : "Still open"}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm font-bold text-muted-readable">
          No restore runs yet.
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
    <div className="border-b border-line p-4 sm:border-r sm:last:border-r-0">
      <dt className="text-sm font-bold text-muted-readable">{label}</dt>
      <dd className="mt-2 break-words text-xl font-bold leading-tight">{value}</dd>
    </div>
  );
}

function FingerprintRow({
  label,
  value,
  testId,
}: Readonly<{
  label: string;
  value: string;
  testId?: string;
}>) {
  return (
    <div className="grid gap-1 border-b border-line p-4 last:border-b-0">
      <dt className="text-sm font-bold text-muted-readable">{label}</dt>
      <dd data-testid={testId} className="break-all text-sm font-bold text-foreground">
        {value}
      </dd>
    </div>
  );
}

function IssueList({
  title,
  issues,
  tone,
}: Readonly<{
  title: string;
  issues: Array<{ code: string; message: string; file?: string; row?: number }>;
  tone: "error" | "warning";
}>) {
  if (issues.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby={`restore-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="border-b border-line pb-3">
        <h3
          id={`restore-${title.toLowerCase().replace(/\s+/g, "-")}`}
          className="text-xl leading-tight"
        >
          {title}
        </h3>
      </div>
      <ul className="mt-4 divide-y divide-line border border-line">
        {issues.map((issue, index) => (
          <li
            key={`${issue.code}:${issue.file ?? ""}:${issue.row ?? ""}:${index}`}
            className="p-4"
          >
            <p
              className={`text-sm font-bold ${
                tone === "error" ? "text-accent" : "text-foreground"
              }`}
            >
              {issue.code}
            </p>
            <p className="mt-1 text-sm text-muted-readable">{issue.message}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function flattenRestoreActions(
  preview: BehaviorLogRestorePreview,
): BehaviorLogRestoreAction[] {
  return [
    ...preview.actions.behaviors,
    ...preview.actions.schedules,
    ...preview.actions.occurrences,
    ...preview.actions.statusEvents,
    ...preview.actions.inlineOccurrenceNotes,
    ...preview.actions.importedNotes,
    ...preview.actions.importedInterventions,
  ];
}

function mergeRecentRuns(
  runs: BehaviorLogRestoreRunView[],
  state: BehaviorLogRestoreActionState,
): BehaviorLogRestoreRunView[] {
  const currentRuns = [state.applyResult?.importRun, state.previewRun].filter(
    (run): run is BehaviorLogRestoreRunView => Boolean(run),
  );
  const byId = new Map<string, BehaviorLogRestoreRunView>();

  for (const run of [...currentRuns, ...runs]) {
    byId.set(run.id, run);
  }

  return [...byId.values()].slice(0, 6);
}

function formatRunMode(mode: string): string {
  return mode.replace(/_/g, " ");
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
