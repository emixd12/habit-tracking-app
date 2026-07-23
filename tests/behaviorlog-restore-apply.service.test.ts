import { createHash } from "node:crypto";

import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveExportBundle } from "../lib/resolvers/export.resolver";
import {
  applyBehaviorLogRestoreUploadFromFormData,
  BehaviorLogRestoreAuthError,
  createBehaviorLogRestorePreviewRun,
  deriveBehaviorLogRestoreLocalId,
  previewBehaviorLogRestoreFromZip,
  previewBehaviorLogRestoreUploadFromFormData,
} from "../lib/services/behaviorlog-restore.service";
import { createStoredZip } from "../lib/services/zip";
import { BEHAVIORLOG_BUNDLE_SIZE_ERROR } from "../lib/types/behaviorlog-bundle-ui";
import type {
  ExportBehaviorInput,
  ExportCategoryInput,
  ExportOccurrenceInput,
  ExportStatusEventInput,
} from "../lib/types/export";
import { DEFAULT_TIMEZONE } from "../lib/types/recurrence";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOW = Temporal.Instant.from("2026-06-08T16:00:00Z");
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
type RestorePayloadForTest = {
  behaviors: Array<{
    id: string;
    external_id: string;
    title: string;
    description: string | null;
    created_at: string | null;
  }>;
  behavior_definition_events: Array<{
    event_kind: "baseline" | "transition";
    behavior_id: string;
    previous_title: string | null;
    next_title: string;
    previous_description: string | null;
    next_description: string | null;
    changed_fields: Array<"title" | "description">;
    recorded_at: string;
    source: "import";
    reason: "behaviorlog_restore";
    expected_previous_title: string | null;
    expected_previous_description: string | null;
  }>;
  schedules: Array<{
    id: string;
    external_id: string;
    behavior_id: string;
  }>;
  occurrences: Array<{
    id: string;
    external_id: string;
    behavior_id: string;
    behavior_schedule_slot_id: string;
    scheduled_for: string;
    local_date: string;
    status: "unresolved" | "completed" | "not_completed";
  }>;
  status_events: Array<{
    id: string;
    external_id: string;
    occurrence_id: string;
    behavior_id: string;
    recorded_at: string;
    status: "unresolved" | "completed" | "not_completed";
    status_semantics: "explicit_user_mark";
    revises_event_id: string | null;
  }>;
  mappings: Array<{
    record_type: string;
    external_id: string;
    local_id: string;
  }>;
  preconditions: Array<{
    record_type: string;
    local_id: string;
    expectation: "absent" | "unchanged";
    expected_updated_at: string | null;
  }>;
  apply_payload_digest: string;
};

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getBehaviorLogImportRunById: vi.fn(),
  getAppliedBehaviorLogRestoreRunByAcceptedPreview: vi.fn(),
  createBehaviorLogImportRun: vi.fn(),
  markBehaviorLogRestoreRunFailedIfPending: vi.fn(),
  bindBehaviorLogRestoreApplyPayload: vi.fn(),
  listBehaviorLogExistingRecords: vi.fn(),
  markOccurrenceSyncStale: vi.fn(),
  repairUserOccurrenceReminderGraphBestEffort: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/db/behaviorLogImports.repo", async (importOriginal) => {
  const original = await importOriginal<object>();

  return {
    ...original,
    getBehaviorLogImportRunById: mocks.getBehaviorLogImportRunById,
    getAppliedBehaviorLogRestoreRunByAcceptedPreview:
      mocks.getAppliedBehaviorLogRestoreRunByAcceptedPreview,
    createBehaviorLogImportRun: mocks.createBehaviorLogImportRun,
    markBehaviorLogRestoreRunFailedIfPending:
      mocks.markBehaviorLogRestoreRunFailedIfPending,
    bindBehaviorLogRestoreApplyPayload:
      mocks.bindBehaviorLogRestoreApplyPayload,
  };
});

vi.mock("@/lib/services/behaviorlog-import.service", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../lib/services/behaviorlog-import.service")>();

  return {
    ...original,
    listBehaviorLogExistingRecords: mocks.listBehaviorLogExistingRecords,
  };
});

vi.mock("@/lib/services/occurrence-sync-state.service", () => ({
  markOccurrenceSyncStale: mocks.markOccurrenceSyncStale,
}));

vi.mock("@/lib/services/occurrence-reminder-repair.service", () => ({
  repairUserOccurrenceReminderGraphBestEffort:
    mocks.repairUserOccurrenceReminderGraphBestEffort,
}));

describe("BehaviorLog restore apply service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: {
        getClaims: vi.fn(async () => ({
          data: {
            claims: {
              sub: USER_ID,
            },
          },
          error: null,
        })),
      },
      rpc: vi.fn(),
    });
    mocks.listBehaviorLogExistingRecords.mockResolvedValue(emptyExisting());
    mocks.getAppliedBehaviorLogRestoreRunByAcceptedPreview.mockResolvedValue(
      null,
    );
    mocks.markBehaviorLogRestoreRunFailedIfPending.mockResolvedValue({});
    mocks.markOccurrenceSyncStale.mockResolvedValue({});
    mocks.repairUserOccurrenceReminderGraphBestEffort.mockResolvedValue(false);
    mocks.bindBehaviorLogRestoreApplyPayload.mockResolvedValue(
      "a".repeat(64),
    );
  });

  it("derives account-scoped ids for create actions even when external ids are UUID-shaped", () => {
    const externalId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const createAction = {
      recordType: "behavior" as const,
      action: "create" as const,
      destructive: false,
      externalId,
      localId: null,
      reasons: [],
    };
    const first = deriveBehaviorLogRestoreLocalId(createAction, {
      externalId,
      label: "behavior",
      recordType: "behavior",
      userId: USER_ID,
      bundleFingerprint: "bundle-fingerprint",
    });
    const repeated = deriveBehaviorLogRestoreLocalId(createAction, {
      externalId,
      label: "behavior",
      recordType: "behavior",
      userId: USER_ID,
      bundleFingerprint: "bundle-fingerprint",
    });
    const otherAccount = deriveBehaviorLogRestoreLocalId(createAction, {
      externalId,
      label: "behavior",
      recordType: "behavior",
      userId: "99999999-9999-4999-8999-999999999999",
      bundleFingerprint: "bundle-fingerprint",
    });

    expect(first).toMatch(UUID_PATTERN);
    expect(first).not.toBe(externalId);
    expect(repeated).toBe(first);
    expect(otherAccount).not.toBe(first);
  });

  it("requires a fresh-backup acknowledgement before auth or writes", async () => {
    await expect(
      applyBehaviorLogRestoreUploadFromFormData(new FormData()),
    ).rejects.toThrow("fresh backup");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createBehaviorLogImportRun).not.toHaveBeenCalled();
  });

  it("authenticates before parsing a supported-name restore upload", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getClaims: vi.fn(async () => ({
          data: { claims: {} },
          error: null,
        })),
      },
      rpc: vi.fn(),
    });
    const formData = new FormData();

    formData.set(
      "restore_behaviorlog_file",
      new File(["not a zip"], "cadence-export.behaviorlog.zip", {
        type: "application/zip",
      }),
    );

    await expect(
      previewBehaviorLogRestoreUploadFromFormData(formData),
    ).rejects.toBeInstanceOf(BehaviorLogRestoreAuthError);
    expect(mocks.createClient).toHaveBeenCalled();
    expect(mocks.createBehaviorLogImportRun).not.toHaveBeenCalled();
  });

  it("authenticates before decoding a restore apply bundle payload", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getClaims: vi.fn(async () => ({
          data: { claims: {} },
          error: null,
        })),
      },
      rpc: vi.fn(),
    });
    const formData = new FormData();

    formData.set("confirm_backup", "yes");
    formData.set("confirm_restore_text", "RESTORE");
    formData.set("bundle_payload", Buffer.from("not a zip").toString("base64"));

    await expect(
      applyBehaviorLogRestoreUploadFromFormData(formData),
    ).rejects.toBeInstanceOf(BehaviorLogRestoreAuthError);
    expect(mocks.getBehaviorLogImportRunById).not.toHaveBeenCalled();
    expect(mocks.createBehaviorLogImportRun).not.toHaveBeenCalled();
  });

  it("rejects restore files above 2 MB with Cadence's exact size error", async () => {
    const formData = new FormData();

    formData.set(
      "restore_behaviorlog_file",
      new File(
        [new Uint8Array(2 * 1024 * 1024 + 1)],
        "too-large.behaviorlog.zip",
        { type: "application/zip" },
      ),
    );

    await expect(
      previewBehaviorLogRestoreUploadFromFormData(formData),
    ).rejects.toThrow(BEHAVIORLOG_BUNDLE_SIZE_ERROR);
    expect(mocks.createBehaviorLogImportRun).not.toHaveBeenCalled();
  });

  it("keeps only the exact raw-archive fingerprint in restore preview action state", async () => {
    const zip = createStoredZip(bundleFiles());
    const formData = new FormData();

    mocks.createBehaviorLogImportRun.mockResolvedValueOnce({
      id: "preview-run",
      user_id: USER_ID,
      import_mode: "restore_preview",
      status: "previewed",
      dry_run_summary: {},
      started_at: "2026-06-08T21:10:00Z",
      completed_at: "2026-06-08T21:10:01Z",
      failure_message: null,
    });
    formData.set(
      "restore_behaviorlog_file",
      new File([new Uint8Array(zip)], "cadence-export.behaviorlog.zip", {
        type: "application/zip",
      }),
    );

    const state =
      await previewBehaviorLogRestoreUploadFromFormData(formData);

    expect(state.status).toBe("previewed");
    expect(state).not.toHaveProperty("bundlePayload");
    expect(state.archiveFingerprint).toBe(sha256Bytes(zip));
  });

  it("records synchronously completed restore previews with a completion time", async () => {
    mocks.createBehaviorLogImportRun.mockResolvedValueOnce({
      id: "preview-run",
      user_id: USER_ID,
      import_mode: "restore_preview",
      status: "previewed",
      dry_run_summary: {},
      started_at: "2026-06-08T21:10:00Z",
      completed_at: "2026-06-08T21:10:01Z",
      failure_message: null,
    });

    const result = await createBehaviorLogRestorePreviewRun(
      {} as never,
      {
        userId: USER_ID,
        files: bundleFiles(),
        archiveFingerprint: sha256Bytes(createStoredZip(bundleFiles())),
      },
    );

    expect(result.importRun.completed_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/u,
    );
    expect(mocks.createBehaviorLogImportRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        importMode: "restore_preview",
        status: "previewed",
        startedAt: expect.any(String),
        completedAt: expect.any(String),
      }),
    );
  });

  it("requires typed restore confirmation before auth or writes", async () => {
    const formData = new FormData();

    formData.set("confirm_backup", "yes");

    await expect(applyBehaviorLogRestoreUploadFromFormData(formData)).rejects.toThrow(
      "Type RESTORE",
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("refuses stale previews when local data no longer matches the accepted run", async () => {
    const zip = createStoredZip(bundleFiles());
    const bundlePreview = previewBehaviorLogRestoreFromZip({
      zip,
      existing: emptyExisting(),
    });
    const formData = new FormData();

    formData.set("confirm_backup", "yes");
    formData.set("confirm_restore_text", "RESTORE");
    formData.set("restore_preview_run_id", "preview-run");
    formData.set("preview_fingerprint", "accepted-preview");
    formData.set("local_data_fingerprint", "accepted-local");
    formData.set("archive_fingerprint", sha256Bytes(zip));
    formData.set("bundle_payload", Buffer.from(zip).toString("base64"));
    formData.set("upload_file_name", "cadence-export.behaviorlog.zip");
    formData.set("upload_file_size", String(zip.byteLength));
    mocks.getBehaviorLogImportRunById.mockResolvedValue({
      id: "preview-run",
      user_id: USER_ID,
      import_mode: "restore_preview",
      status: "previewed",
      dry_run_summary: {
        ...acceptedPreviewSnapshot(bundlePreview),
        previewFingerprint: "accepted-preview",
        localDataFingerprint: "accepted-local",
      },
      bundle_fingerprint: bundlePreview.bundleFingerprint,
      started_at: "2026-06-08T21:10:00Z",
      completed_at: null,
      failure_message: null,
    });

    await expect(applyBehaviorLogRestoreUploadFromFormData(formData)).rejects.toThrow(
      "Local data changed",
    );
    expect(mocks.createBehaviorLogImportRun).not.toHaveBeenCalled();
  });

  it("rejects a replacement status-history preview as preview-only", async () => {
    const zip = createStoredZip(bundleFiles());
    const preview = previewBehaviorLogRestoreFromZip({
      zip,
      existing: emptyExisting(),
      statusHistoryPolicy: "replace_status_history",
    });

    expect(preview.valid).toBe(true);
    expect(preview.statusHistoryPolicy.applySupportedInThisTicket).toBe(false);
    mocks.getBehaviorLogImportRunById.mockResolvedValue(
      restorePreviewRun(preview),
    );

    await expect(
      applyBehaviorLogRestoreUploadFromFormData(
        restoreApplyFormData(zip, preview),
      ),
    ).rejects.toThrow("status-history policy is preview-only");
    expect(mocks.createBehaviorLogImportRun).not.toHaveBeenCalled();
    expect(mocks.bindBehaviorLogRestoreApplyPayload).not.toHaveBeenCalled();
  });

  it("returns the applied result for an exact accepted preview before recomputing changed local data", async () => {
    const zip = createStoredZip(bundleFiles());
    const preview = previewBehaviorLogRestoreFromZip({
      zip,
      existing: emptyExisting(),
    });
    const previewRun = restorePreviewRun(preview);
    const appliedRun = restoreAppliedRun(preview);

    mocks.getBehaviorLogImportRunById.mockResolvedValue(previewRun);
    mocks.getAppliedBehaviorLogRestoreRunByAcceptedPreview.mockResolvedValue(
      appliedRun,
    );

    const result = await applyBehaviorLogRestoreUploadFromFormData(
      restoreApplyFormData(zip, preview),
    );

    expect(result.status).toBe("applied");
    expect(result.message).toContain("already applied");
    expect(result.preview?.previewFingerprint).toBe(preview.previewFingerprint);
    expect(
      mocks.repairUserOccurrenceReminderGraphBestEffort,
    ).toHaveBeenCalledWith(expect.anything(), USER_ID, {
      operation: "behaviorlog_restore",
    });
    expect(result.applyResult?.importRun.id).toBe(appliedRun.id);
    expect(result.applyResult?.appliedCounts).toEqual({
      upserted_schedules: 1,
      provenance_mappings: 4,
    });
    expect(mocks.listBehaviorLogExistingRecords).not.toHaveBeenCalled();
    expect(mocks.createBehaviorLogImportRun).not.toHaveBeenCalled();
  });

  it("does not reuse an applied result for a changed bundle payload", async () => {
    const files = bundleFiles();
    const zip = createStoredZip(files);
    const preview = previewBehaviorLogRestoreFromZip({
      zip,
      existing: emptyExisting(),
    });
    const previewRun = restorePreviewRun(preview);
    const changedFiles = files.map((file, index) =>
      index === 0 ? { ...file, content: `${file.content}\n` } : file,
    );

    mocks.getBehaviorLogImportRunById.mockResolvedValue(previewRun);
    mocks.getAppliedBehaviorLogRestoreRunByAcceptedPreview.mockResolvedValue(
      restoreAppliedRun(preview),
    );

    await expect(
      applyBehaviorLogRestoreUploadFromFormData(
        restoreApplyFormData(createStoredZip(changedFiles), preview, zip),
      ),
    ).rejects.toThrow(
      "The uploaded bundle no longer matches the accepted restore preview. Preview the restore again.",
    );
    expect(
      mocks.getAppliedBehaviorLogRestoreRunByAcceptedPreview,
    ).not.toHaveBeenCalled();
  });

  it("recognizes a concurrent apply that commits during stale-preview recomputation", async () => {
    const zip = createStoredZip(bundleFiles());
    const preview = previewBehaviorLogRestoreFromZip({
      zip,
      existing: emptyExisting(),
    });
    const previewRun = restorePreviewRun(preview);
    const appliedRun = restoreAppliedRun(preview);

    mocks.getBehaviorLogImportRunById.mockResolvedValue(previewRun);
    mocks.getAppliedBehaviorLogRestoreRunByAcceptedPreview
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(appliedRun);
    mocks.listBehaviorLogExistingRecords.mockResolvedValue({
      ...emptyExisting(),
      behaviors: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          title: "Local data committed by the concurrent request",
          category: null,
          active: true,
          archivedAt: null,
          schedules: [],
        },
      ],
    });

    const result = await applyBehaviorLogRestoreUploadFromFormData(
      restoreApplyFormData(zip, preview),
    );

    expect(result.status).toBe("applied");
    expect(
      mocks.repairUserOccurrenceReminderGraphBestEffort,
    ).toHaveBeenCalledWith(expect.anything(), USER_ID, {
      operation: "behaviorlog_restore",
    });
    expect(result.applyResult?.importRun.id).toBe(appliedRun.id);
    expect(
      mocks.getAppliedBehaviorLogRestoreRunByAcceptedPreview,
    ).toHaveBeenCalledTimes(2);
    expect(mocks.createBehaviorLogImportRun).not.toHaveBeenCalled();
  });

  it("does not overwrite an atomically applied run when the RPC acknowledgement is uncertain", async () => {
    const zip = createStoredZip(bundleFiles());
    const preview = previewBehaviorLogRestoreFromZip({
      zip,
      existing: emptyExisting(),
    });
    const previewRun = restorePreviewRun(preview);
    const applyRun = {
      ...restoreAppliedRun(preview),
      status: "previewed",
      completed_at: null,
    };
    const committedRun = restoreAppliedRun(preview);
    const rpc = vi.fn(async () => ({
      data: null,
      error: new Error("RPC response was interrupted"),
    }));

    mocks.createClient.mockResolvedValue({
      auth: {
        getClaims: vi.fn(async () => ({
          data: { claims: { sub: USER_ID } },
          error: null,
        })),
      },
      rpc,
    });
    mocks.getBehaviorLogImportRunById.mockResolvedValue(previewRun);
    mocks.getAppliedBehaviorLogRestoreRunByAcceptedPreview
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(committedRun);
    mocks.createBehaviorLogImportRun.mockResolvedValue(applyRun);
    mocks.markBehaviorLogRestoreRunFailedIfPending.mockResolvedValue(null);

    const result = await applyBehaviorLogRestoreUploadFromFormData(
      restoreApplyFormData(zip, preview),
    );

    expect(result.status).toBe("applied");
    expect(result.applyResult?.importRun.id).toBe(committedRun.id);
    expect(mocks.markBehaviorLogRestoreRunFailedIfPending).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ importRunId: applyRun.id }),
    );
  });

  it("builds stable restore ids and resolver-planned definition history", async () => {
    const zip = createStoredZip(bundleFiles());
    const preview = previewBehaviorLogRestoreFromZip({
      zip,
      existing: emptyExisting(),
    });
    const scheduleAction = preview.actions.schedules[0];

    expect(scheduleAction?.action).toBe("create");
    expect(scheduleAction?.localId).toBeNull();
    expect(scheduleAction?.externalId).toMatch(/^sch_/u);
    expect(preview.actions.occurrences[0]?.action).toBe("create");
    expect(preview.actions.statusEvents[0]?.action).toBe("create");

    const rpc = vi.fn(
      async (
        functionName: string,
        args: { restore_payload: RestorePayloadForTest },
      ) => {
        expect(functionName).toBe("apply_behaviorlog_restore");
        expect(args.restore_payload.schedules.length).toBe(1);

        return {
          data: {
            behaviors: 1,
            schedules: 1,
            occurrences: 1,
            status_events: 1,
          },
          error: null,
        };
      },
    );
    mocks.createClient.mockResolvedValue({
      auth: {
        getClaims: vi.fn(async () => ({
          data: {
            claims: {
              sub: USER_ID,
            },
          },
          error: null,
        })),
      },
      rpc,
    });
    mocks.getBehaviorLogImportRunById.mockResolvedValue(
      restorePreviewRun(preview),
    );
    const applyRun = {
      id: "33333333-3333-4333-8333-333333333333",
      user_id: USER_ID,
      import_mode: "restore_apply",
      status: "previewed",
      dry_run_summary: {},
      started_at: "2026-06-08T21:11:00Z",
      completed_at: null,
      failure_message: null,
    };
    const secondApplyRun = {
      ...applyRun,
      id: "44444444-4444-4444-8444-444444444444",
    };
    const replaceApplyRun = {
      ...applyRun,
      id: "55555555-5555-4555-8555-555555555555",
    };
    const normalizedNoOpApplyRun = {
      ...applyRun,
      id: "66666666-6666-4666-8666-666666666666",
    };
    mocks.createBehaviorLogImportRun
      .mockResolvedValueOnce(applyRun)
      .mockResolvedValueOnce(secondApplyRun)
      .mockResolvedValueOnce(normalizedNoOpApplyRun)
      .mockResolvedValueOnce(replaceApplyRun);

    const result = await applyBehaviorLogRestoreUploadFromFormData(
      restoreApplyFormData(zip, preview),
    );

    expect(result.status).toBe("applied");
    const restorePayload = rpc.mock.calls[0]?.[1]?.restore_payload;
    const restoredScheduleId = restorePayload.schedules[0]?.id;

    expect(restoredScheduleId).toMatch(UUID_PATTERN);
    expect(restoredScheduleId).not.toBe(scheduleAction?.externalId);
    expect(restorePayload.occurrences[0]?.behavior_schedule_slot_id).toBe(
      restoredScheduleId,
    );
    expect(restorePayload.behavior_definition_events).toEqual([
      {
        event_kind: "baseline",
        behavior_id: restorePayload.behaviors[0]?.id,
        previous_title: null,
        next_title: "Brush teeth",
        previous_description: null,
        next_description: "Night brushing",
        changed_fields: ["title", "description"],
        recorded_at: "2026-05-01T12:00:00Z",
        source: "import",
        reason: "behaviorlog_restore",
        expected_previous_title: null,
        expected_previous_description: null,
      },
    ]);
    expect(restorePayload.behaviors[0]?.created_at).toBe(
      "2026-05-01T12:00:00Z",
    );
    expect(restorePayload.mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          record_type: "schedule",
          external_id: scheduleAction?.externalId,
          local_id: restoredScheduleId,
        }),
      ]),
    );
    expect(restorePayload.apply_payload_digest).toBe("a".repeat(64));
    expect(mocks.bindBehaviorLogRestoreApplyPayload).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        importRunId: applyRun.id,
        restorePayload: expect.objectContaining({
          apply_run_id: applyRun.id,
          preconditions: expect.arrayContaining([
            expect.objectContaining({
              record_type: "schedule",
              local_id: restoredScheduleId,
              expectation: "absent",
            }),
          ]),
        }),
      }),
    );
    expect(mocks.markBehaviorLogRestoreRunFailedIfPending).not.toHaveBeenCalled();

    await applyBehaviorLogRestoreUploadFromFormData(
      restoreApplyFormData(zip, preview),
    );
    const repeatedPayload = rpc.mock.calls[1]?.[1]?.restore_payload;

    expect(repeatedPayload.schedules[0]?.id).toBe(restoredScheduleId);
    expect(
      repeatedPayload.mappings.find(
        (mapping) => mapping.record_type === "schedule",
      )?.local_id,
    ).toBe(restoredScheduleId);

    const existingAfterRestore = existingRecordsFromRestorePayload(restorePayload);
    const existingBehavior = existingAfterRestore.behaviors[0];

    if (!existingBehavior) {
      throw new Error("Expected a restored behavior fixture.");
    }

    existingBehavior.title = "\t\u00a0Brush teeth\u3000";
    existingBehavior.description = "\u2003Night brushing\u202f";
    const normalizedNoOpPreview = previewBehaviorLogRestoreFromZip({
      zip,
      existing: existingAfterRestore,
    });

    expect(normalizedNoOpPreview.actions.behaviors[0]?.action).toBe("keep");
    mocks.listBehaviorLogExistingRecords.mockResolvedValueOnce(
      existingAfterRestore,
    );
    mocks.getBehaviorLogImportRunById.mockResolvedValueOnce(
      restorePreviewRun(normalizedNoOpPreview),
    );

    await applyBehaviorLogRestoreUploadFromFormData(
      restoreApplyFormData(zip, normalizedNoOpPreview),
    );
    const normalizedNoOpPayload = rpc.mock.calls[2]?.[1]?.restore_payload;

    expect(normalizedNoOpPayload.behavior_definition_events).toEqual([]);
    expect(normalizedNoOpPayload.status_events).toEqual([]);
    expect(normalizedNoOpPayload.behaviors[0]).toMatchObject({
      title: "\t\u00a0Brush teeth\u3000",
      description: "\u2003Night brushing\u202f",
    });

    existingBehavior.title = "Old brush title";
    existingBehavior.description = "Old description";
    const laterPreview = previewBehaviorLogRestoreFromZip({
      zip,
      existing: existingAfterRestore,
    });
    const laterScheduleAction = laterPreview.actions.schedules.find(
      (action) => action.externalId === scheduleAction?.externalId,
    );

    expect(laterScheduleAction?.localId).toBe(restoredScheduleId);
    expect(laterScheduleAction?.action).not.toBe("create");
    expect(laterPreview.actions.occurrences[0]?.action).not.toBe("skip");
    expect(laterPreview.actions.statusEvents[0]?.action).not.toBe("skip");
    expect(laterPreview.actions.behaviors[0]?.action).toBe("replace");

    mocks.listBehaviorLogExistingRecords.mockResolvedValueOnce(
      existingAfterRestore,
    );
    mocks.getBehaviorLogImportRunById.mockResolvedValueOnce(
      restorePreviewRun(laterPreview),
    );

    await applyBehaviorLogRestoreUploadFromFormData(
      restoreApplyFormData(zip, laterPreview),
    );
    const replacePayload = rpc.mock.calls[3]?.[1]?.restore_payload;

    expect(replacePayload.behavior_definition_events).toEqual([
      expect.objectContaining({
        event_kind: "transition",
        behavior_id: restorePayload.behaviors[0]?.id,
        previous_title: "Old brush title",
        next_title: "Brush teeth",
        previous_description: "Old description",
        next_description: "Night brushing",
        changed_fields: ["title", "description"],
        recorded_at: expect.any(String),
        source: "import",
        reason: "behaviorlog_restore",
        expected_previous_title: "Old brush title",
        expected_previous_description: "Old description",
      }),
    ]);
    expect(replacePayload.preconditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          record_type: "behavior",
          local_id: restorePayload.behaviors[0]?.id,
          expectation: "unchanged",
          expected_updated_at: "2026-06-08T21:12:00Z",
        }),
      ]),
    );
  });
});

function emptyExisting() {
  return {
    behaviors: [],
    schedules: [],
    occurrences: [],
    statusEvents: [],
    importedNotes: [],
    importedInterventions: [],
    mappings: [],
  };
}

function restorePreviewRun(
  preview: ReturnType<typeof previewBehaviorLogRestoreFromZip>,
  zip: Uint8Array = createStoredZip(bundleFiles()),
) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    user_id: USER_ID,
    import_mode: "restore_preview",
    status: "previewed",
    bundle_fingerprint: preview.bundleFingerprint,
    dry_run_summary: acceptedPreviewSnapshot(preview, zip),
    started_at: "2026-06-08T21:10:00Z",
    completed_at: "2026-06-08T21:10:01Z",
    failure_message: null,
  };
}

function acceptedPreviewSnapshot(
  preview: ReturnType<typeof previewBehaviorLogRestoreFromZip>,
  zip: Uint8Array = createStoredZip(bundleFiles()),
) {
  return {
    ...preview,
    errorCount: preview.errors.length,
    warningCount: preview.warnings.length,
    archiveFingerprint: sha256Bytes(zip),
  };
}

function restoreAppliedRun(
  preview: ReturnType<typeof previewBehaviorLogRestoreFromZip>,
) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    user_id: USER_ID,
    import_mode: "restore_apply",
    status: "applied",
    accepted_preview_run_id: "22222222-2222-4222-8222-222222222222",
    accepted_preview_fingerprint: preview.previewFingerprint,
    bundle_fingerprint: preview.bundleFingerprint,
    dry_run_summary: {
      ...preview,
      applyResult: {
        upserted_schedules: 1,
        provenance_mappings: 4,
      },
    },
    started_at: "2026-06-08T21:11:00Z",
    completed_at: "2026-06-08T21:11:30Z",
    failure_message: null,
  };
}

function existingRecordsFromRestorePayload(payload: RestorePayloadForTest) {
  const behavior = payload.behaviors[0];
  const schedule = payload.schedules[0];
  const occurrence = payload.occurrences[0];
  const statusEvent = payload.status_events[0];

  if (!behavior || !schedule || !occurrence || !statusEvent) {
    throw new Error("Expected a complete core restore payload.");
  }

  const existingSchedule = {
    id: schedule.id,
    rowUpdatedAtUtc: "2026-06-08T21:12:00Z",
    behaviorId: behavior.id,
    recurrenceProfile: "behaviorlog.calendar_simple.v1",
    recurrence: { type: "daily", interval: 1 },
    timezone: DEFAULT_TIMEZONE,
    localTime: "22:00",
    windowStartLocal: null,
    windowEndLocal: null,
    cadenceScheduleKind: "exact" as const,
    cadenceSchedulePreset: null,
    activeFromLocalDate: "2026-05-01",
    activeUntilLocalDate: null,
    sourceOriginalId: schedule.id,
  };

  return {
    behaviors: [
      {
        id: behavior.id,
        rowUpdatedAtUtc: "2026-06-08T21:12:00Z",
        title: "Brush teeth",
        description: "Night brushing",
        category: "Grooming",
        active: true,
        archivedAt: null,
        sourceOriginalId: behavior.id,
        schedules: [existingSchedule],
      },
    ],
    schedules: [existingSchedule],
    occurrences: [
      {
        id: occurrence.id,
        rowUpdatedAtUtc: "2026-06-08T21:12:00Z",
        behaviorId: behavior.id,
        scheduleId: schedule.id,
        behaviorTitle: "Brush teeth",
        scheduledForUtc: occurrence.scheduled_for,
        localDate: occurrence.local_date,
        timezone: DEFAULT_TIMEZONE,
        status: occurrence.status,
        note: null,
        sourceOriginalId: occurrence.id,
      },
    ],
    statusEvents: [
      {
        id: statusEvent.id,
        rowUpdatedAtUtc: "2026-06-08T21:12:00Z",
        occurrenceId: occurrence.id,
        behaviorId: behavior.id,
        recordedAtUtc: statusEvent.recorded_at,
        status: statusEvent.status,
        statusSemantics: statusEvent.status_semantics,
        sourceCaptureMethod: "manual_tap" as const,
        sourceConfidence: "high" as const,
        revisesEventId: statusEvent.revises_event_id,
        sourceOriginalId: statusEvent.id,
      },
    ],
    importedNotes: [],
    importedInterventions: [],
    mappings: payload.mappings.map((mapping) => ({
      recordType: mapping.record_type as
        | "behavior"
        | "schedule"
        | "occurrence"
        | "status_event"
        | "note"
        | "intervention",
      externalId: mapping.external_id,
      localId: mapping.local_id,
    })),
  };
}

function bundleFiles() {
  const categories: ExportCategoryInput[] = [
    {
      id: "category-grooming",
      name: "Grooming",
      sortOrder: 1,
    },
  ];
  const behavior: ExportBehaviorInput = {
    id: "11111111-1111-4111-8111-111111111112",
    categoryId: "category-grooming",
    categoryName: "Grooming",
    title: "Brush teeth",
    description: "Night brushing",
    recurrenceRule: {
      frequency: "daily",
      interval: 1,
    },
    scheduledTime: "22:00",
    scheduleSlots: [
      {
        id: "11111111-1111-4111-8111-111111111113",
        kind: "exact",
        preset: null,
        startTime: "22:00",
        endTime: null,
        sortOrder: 0,
        label: "10:00 PM",
      },
    ],
    timezone: DEFAULT_TIMEZONE,
    browserReminderEnabled: true,
    emailReminderEnabled: false,
    reminderOffsetMinutes: 0,
    active: true,
    archivedAt: null,
    createdAt: "2026-05-01T12:00:00Z",
    updatedAt: "2026-05-01T12:00:00Z",
  };
  const occurrence: ExportOccurrenceInput = {
    id: "11111111-1111-4111-8111-111111111114",
    behaviorId: behavior.id,
    behaviorScheduleSlotId: behavior.scheduleSlots[0]?.id ?? null,
    scheduledFor: "2026-06-08T13:00:00Z",
    scheduledTimeLabel: "9:00 AM",
    scheduleKind: "exact",
    schedulePreset: null,
    scheduleStartTime: "09:00",
    scheduleEndTime: null,
    localDate: "2026-06-08",
    status: "completed",
    completedAt: "2026-06-08T13:20:00Z",
    statusMarkedAt: "2026-06-08T13:22:00Z",
    note: null,
    createdAt: "2026-06-08T12:00:00Z",
    updatedAt: "2026-06-08T12:00:00Z",
  };
  const statusEvent: ExportStatusEventInput = {
    id: "evt_11111111111141118111111111111114_completed",
    occurrenceId: occurrence.id,
    behaviorId: behavior.id,
    previousStatus: "unresolved",
    status: "completed",
    statusSemantics: "explicit_user_mark",
    recordedAt: "2026-06-08T13:22:00Z",
    effectiveAt: "2026-06-08T13:20:00Z",
    localDate: occurrence.localDate,
    timezone: DEFAULT_TIMEZONE,
    sourceCaptureMethod: "manual_tap",
    sourceConfidence: "high",
    revisesEventId: null,
    reasonCode: null,
    createdAt: "2026-06-08T13:22:00Z",
    updatedAt: "2026-06-08T13:22:00Z",
  };

  return resolveExportBundle({
    profile: {
      timezone: DEFAULT_TIMEZONE,
      subjectId: "subject_test",
    },
    categories,
    behaviors: [behavior],
    occurrences: [occurrence],
    statusEvents: [statusEvent],
    reminderDeliveries: [],
    now: NOW,
    timezone: DEFAULT_TIMEZONE,
    range: "30",
  }).behaviorLog.files;
}

function restoreApplyFormData(
  zip: Uint8Array,
  preview: {
    previewFingerprint: string;
    localDataFingerprint: string;
  },
  acceptedZip: Uint8Array = zip,
): FormData {
  const formData = new FormData();

  formData.set("confirm_backup", "yes");
  formData.set("confirm_restore_text", "RESTORE");
  formData.set("restore_preview_run_id", "22222222-2222-4222-8222-222222222222");
  formData.set("preview_fingerprint", preview.previewFingerprint);
  formData.set("local_data_fingerprint", preview.localDataFingerprint);
  formData.set("archive_fingerprint", sha256Bytes(acceptedZip));
  formData.set("bundle_payload", Buffer.from(zip).toString("base64"));
  formData.set("upload_file_name", "cadence-export.behaviorlog.zip");
  formData.set("upload_file_size", String(zip.byteLength));

  return formData;
}

function sha256Bytes(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}
