import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveExportBundle } from "../lib/resolvers/export.resolver";
import {
  applyBehaviorLogRestoreUploadFromFormData,
  createBehaviorLogRestorePreviewRun,
  previewBehaviorLogRestoreFromZip,
} from "../lib/services/behaviorlog-restore.service";
import { createStoredZip } from "../lib/services/zip";
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
  schedules: Array<{ id: string }>;
  occurrences: Array<{ behavior_schedule_slot_id: string }>;
};

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getBehaviorLogImportRunById: vi.fn(),
  createBehaviorLogImportRun: vi.fn(),
  createBehaviorLogImportRecordMappings: vi.fn(),
  updateBehaviorLogImportRunStatus: vi.fn(),
  listBehaviorLogExistingRecords: vi.fn(),
  markOccurrenceSyncStale: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/db/behaviorLogImports.repo", async (importOriginal) => {
  const original = await importOriginal<object>();

  return {
    ...original,
    getBehaviorLogImportRunById: mocks.getBehaviorLogImportRunById,
    createBehaviorLogImportRun: mocks.createBehaviorLogImportRun,
    createBehaviorLogImportRecordMappings:
      mocks.createBehaviorLogImportRecordMappings,
    updateBehaviorLogImportRunStatus: mocks.updateBehaviorLogImportRunStatus,
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
    mocks.createBehaviorLogImportRecordMappings.mockResolvedValue(undefined);
    mocks.markOccurrenceSyncStale.mockResolvedValue({});
  });

  it("requires a fresh-backup acknowledgement before auth or writes", async () => {
    await expect(
      applyBehaviorLogRestoreUploadFromFormData(new FormData()),
    ).rejects.toThrow("fresh backup");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createBehaviorLogImportRun).not.toHaveBeenCalled();
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
    const formData = new FormData();

    formData.set("confirm_backup", "yes");
    formData.set("confirm_restore_text", "RESTORE");
    formData.set("restore_preview_run_id", "preview-run");
    formData.set("preview_fingerprint", "accepted-preview");
    formData.set("local_data_fingerprint", "accepted-local");
    formData.set("bundle_payload", Buffer.from(zip).toString("base64"));
    formData.set("upload_file_name", "cadence-export.behaviorlog.zip");
    formData.set("upload_file_size", String(zip.byteLength));
    mocks.getBehaviorLogImportRunById.mockResolvedValue({
      id: "preview-run",
      user_id: USER_ID,
      import_mode: "restore_preview",
      status: "previewed",
      dry_run_summary: {
        previewFingerprint: "accepted-preview",
        localDataFingerprint: "accepted-local",
      },
      started_at: "2026-06-08T21:10:00Z",
      completed_at: null,
      failure_message: null,
    });

    await expect(applyBehaviorLogRestoreUploadFromFormData(formData)).rejects.toThrow(
      "Local data changed",
    );
    expect(mocks.createBehaviorLogImportRun).not.toHaveBeenCalled();
  });

  it("maps Cadence schedule external ids to UUIDs before restore apply", async () => {
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
    mocks.getBehaviorLogImportRunById.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      user_id: USER_ID,
      import_mode: "restore_preview",
      status: "previewed",
      dry_run_summary: {
        previewFingerprint: preview.previewFingerprint,
        localDataFingerprint: preview.localDataFingerprint,
      },
      started_at: "2026-06-08T21:10:00Z",
      completed_at: null,
      failure_message: null,
    });
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
    mocks.createBehaviorLogImportRun.mockResolvedValue(applyRun);
    mocks.updateBehaviorLogImportRunStatus.mockResolvedValue({
      ...applyRun,
      status: "applied",
      completed_at: "2026-06-08T21:11:30Z",
    });

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
    expect(mocks.createBehaviorLogImportRecordMappings).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({
          userId: USER_ID,
          importRunId: applyRun.id,
          recordType: "schedule",
          externalId: scheduleAction?.externalId,
          localId: restoredScheduleId,
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
): FormData {
  const formData = new FormData();

  formData.set("confirm_backup", "yes");
  formData.set("confirm_restore_text", "RESTORE");
  formData.set("restore_preview_run_id", "22222222-2222-4222-8222-222222222222");
  formData.set("preview_fingerprint", preview.previewFingerprint);
  formData.set("local_data_fingerprint", preview.localDataFingerprint);
  formData.set("bundle_payload", Buffer.from(zip).toString("base64"));
  formData.set("upload_file_name", "cadence-export.behaviorlog.zip");
  formData.set("upload_file_size", String(zip.byteLength));

  return formData;
}
