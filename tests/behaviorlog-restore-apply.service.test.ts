import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveExportBundle } from "../lib/resolvers/export.resolver";
import { applyBehaviorLogRestoreUploadFromFormData } from "../lib/services/behaviorlog-restore.service";
import { createStoredZip } from "../lib/services/zip";
import type {
  ExportBehaviorInput,
  ExportCategoryInput,
  ExportOccurrenceInput,
} from "../lib/types/export";
import { DEFAULT_TIMEZONE } from "../lib/types/recurrence";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOW = Temporal.Instant.from("2026-06-08T16:00:00Z");

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getBehaviorLogImportRunById: vi.fn(),
  createBehaviorLogImportRun: vi.fn(),
  updateBehaviorLogImportRunStatus: vi.fn(),
  listBehaviorLogExistingRecords: vi.fn(),
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
  });

  it("requires a fresh-backup acknowledgement before auth or writes", async () => {
    await expect(
      applyBehaviorLogRestoreUploadFromFormData(new FormData()),
    ).rejects.toThrow("fresh backup");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createBehaviorLogImportRun).not.toHaveBeenCalled();
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
    status: "unresolved",
    completedAt: null,
    statusMarkedAt: null,
    note: null,
    createdAt: "2026-06-08T12:00:00Z",
    updatedAt: "2026-06-08T12:00:00Z",
  };

  return resolveExportBundle({
    profile: {
      timezone: DEFAULT_TIMEZONE,
      subjectId: "subject_test",
    },
    categories,
    behaviors: [behavior],
    occurrences: [occurrence],
    statusEvents: [],
    reminderDeliveries: [],
    now: NOW,
    timezone: DEFAULT_TIMEZONE,
    range: "30",
  }).behaviorLog.files;
}
