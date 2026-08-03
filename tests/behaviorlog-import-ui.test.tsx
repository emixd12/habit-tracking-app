import { createHash } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearUserReadCache } from "../lib/cache/user-read-cache";

import {
  BehaviorLogImportApplyForm,
  BehaviorLogImportPanel,
  BehaviorLogImportPreviewDetails,
  isBehaviorLogImportApplyReady,
} from "../components/export/BehaviorLogImportPanel";
import {
  applyBehaviorLogImportUploadFromFormData,
  BehaviorLogImportAuthError,
  listBehaviorLogExistingRecords,
  previewBehaviorLogImportUploadFromFormData,
  resolveBehaviorLogImportCapabilities,
} from "../lib/services/behaviorlog-import.service";
import { createStoredZip } from "../lib/services/zip";
import { resolveBehaviorLogImportMergePreview } from "../lib/resolvers/behaviorlog-import.resolver";
import {
  BEHAVIORLOG_BUNDLE_SIZE_ERROR,
  getBehaviorLogBundleSizeError,
} from "../lib/types/behaviorlog-bundle-ui";
import type {
  BehaviorLogExistingRecords,
  BehaviorLogImportFile,
} from "../lib/types/behaviorlog-import";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TIMEZONE = "America/New_York";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  listUserBehaviors: vi.fn(),
  listUserOccurrences: vi.fn(),
  listOccurrenceStatusEventsByOccurrenceIds: vi.fn(),
  listBehaviorLogImportRecordMappings: vi.fn(),
  listBehaviorLogImportRuns: vi.fn(),
  getBehaviorLogImportRunById: vi.fn(),
  listImportedNotes: vi.fn(),
  listImportedInterventions: vi.fn(),
  createBehaviorLogImportRunFromPreview: vi.fn(),
  applyCreateMissingBehaviorLogImportPlan: vi.fn(),
  applyApprovedBehaviorLogMergePlan: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/db/behaviors.repo", async (importOriginal) => {
  const original = await importOriginal<object>();

  return {
    ...original,
    listUserBehaviors: mocks.listUserBehaviors,
  };
});

vi.mock("@/lib/db/occurrences.repo", async (importOriginal) => {
  const original = await importOriginal<object>();

  return {
    ...original,
    listUserOccurrences: mocks.listUserOccurrences,
  };
});

vi.mock("@/lib/db/occurrenceStatusEvents.repo", async (importOriginal) => {
  const original = await importOriginal<object>();

  return {
    ...original,
    listOccurrenceStatusEventsByOccurrenceIds:
      mocks.listOccurrenceStatusEventsByOccurrenceIds,
  };
});

vi.mock("@/lib/db/behaviorLogImports.repo", async (importOriginal) => {
  const original = await importOriginal<object>();

  return {
    ...original,
    listBehaviorLogImportRecordMappings:
      mocks.listBehaviorLogImportRecordMappings,
    listBehaviorLogImportRuns: mocks.listBehaviorLogImportRuns,
    getBehaviorLogImportRunById: mocks.getBehaviorLogImportRunById,
  };
});

vi.mock("@/lib/db/notes.repo", async (importOriginal) => {
  const original = await importOriginal<object>();

  return {
    ...original,
    listImportedNotes: mocks.listImportedNotes,
  };
});

vi.mock("@/lib/db/importedInterventions.repo", async (importOriginal) => {
  const original = await importOriginal<object>();

  return {
    ...original,
    listImportedInterventions: mocks.listImportedInterventions,
  };
});

vi.mock("@/lib/services/behaviorlog-import-write.service", () => ({
  createBehaviorLogImportRunFromPreview:
    mocks.createBehaviorLogImportRunFromPreview,
  applyCreateMissingBehaviorLogImportPlan:
    mocks.applyCreateMissingBehaviorLogImportPlan,
  applyApprovedBehaviorLogMergePlan: mocks.applyApprovedBehaviorLogMergePlan,
}));

describe("BehaviorLog import UI workflow", () => {
  beforeEach(() => {
    clearUserReadCache();
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
    });
    mocks.listUserBehaviors.mockResolvedValue([]);
    mocks.listUserOccurrences.mockResolvedValue([]);
    mocks.listOccurrenceStatusEventsByOccurrenceIds.mockResolvedValue([]);
    mocks.listBehaviorLogImportRecordMappings.mockResolvedValue([]);
    mocks.listBehaviorLogImportRuns.mockResolvedValue([]);
    mocks.listImportedNotes.mockResolvedValue([]);
    mocks.listImportedInterventions.mockResolvedValue([]);
    mocks.createBehaviorLogImportRunFromPreview.mockResolvedValue({
      id: "import-run-preview",
      import_mode: "merge_preview",
      status: "previewed",
      started_at: "2026-06-08T21:10:00Z",
      completed_at: "2026-06-08T21:10:02Z",
      failure_message: null,
    });
  });

  it("renders the bundle upload and Preview import interactions", () => {
    const html = renderToStaticMarkup(
      <BehaviorLogImportPanel recentRuns={[]} />,
    );

    expect(html).toContain('name="behaviorlog_file"');
    expect(html).toContain(
      'accept=".behaviorlog.zip,application/zip"',
    );
    expect(html).toContain(">Preview import</button>");
  });

  it("authenticates before parsing a supported-name upload", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getClaims: vi.fn(async () => ({
          data: { claims: {} },
          error: null,
        })),
      },
    });
    const formData = new FormData();

    formData.set(
      "behaviorlog_file",
      new File(["not a zip"], "cadence-export.behaviorlog.zip", {
        type: "application/zip",
      }),
    );

    await expect(
      previewBehaviorLogImportUploadFromFormData(formData),
    ).rejects.toBeInstanceOf(BehaviorLogImportAuthError);
    expect(mocks.createClient).toHaveBeenCalled();
    expect(mocks.createBehaviorLogImportRunFromPreview).not.toHaveBeenCalled();
  });

  it("authenticates before decoding an apply bundle payload", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getClaims: vi.fn(async () => ({
          data: { claims: {} },
          error: null,
        })),
      },
    });
    const formData = new FormData();

    formData.set("import_mode", "merge_by_user_approved_plan");
    formData.set("confirm_apply", "yes");
    formData.set("bundle_payload", Buffer.from("not a zip").toString("base64"));

    await expect(
      applyBehaviorLogImportUploadFromFormData(formData),
    ).rejects.toBeInstanceOf(BehaviorLogImportAuthError);
    expect(mocks.getBehaviorLogImportRunById).not.toHaveBeenCalled();
    expect(mocks.applyApprovedBehaviorLogMergePlan).not.toHaveBeenCalled();
  });

  it("persists preview runs without calling import writers", async () => {
    const formData = new FormData();
    const zip = createStoredZip(behaviorLogFiles());

    formData.set(
      "behaviorlog_file",
      new File([new Uint8Array(zip)], "cadence-export.behaviorlog.zip", {
        type: "application/zip",
      }),
    );

    const state = await previewBehaviorLogImportUploadFromFormData(formData);

    expect(state.status).toBe("previewed");
    expect(state.preview?.valid).toBe(true);
    expect(mocks.createBehaviorLogImportRunFromPreview).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: USER_ID,
        importMode: "merge_preview",
      }),
    );
    expect(mocks.applyCreateMissingBehaviorLogImportPlan).not.toHaveBeenCalled();
    expect(mocks.applyApprovedBehaviorLogMergePlan).not.toHaveBeenCalled();
  });

  it("projects both canonical and Cadence display categories for merge identity", async () => {
    mocks.listUserBehaviors.mockResolvedValueOnce([
      {
        id: "local-behavior",
        updated_at: "2026-06-08T12:00:00Z",
        title: "Track measurement",
        description: null,
        active: true,
        archived_at: null,
        created_at: "2026-05-01T12:00:00Z",
        timezone: TIMEZONE,
        recurrence_rule: { frequency: "daily", interval: 1 },
        schedule_slots: [],
        category: {
          name: "Measurements",
        },
      },
    ]);

    const existing = await listBehaviorLogExistingRecords(
      {} as never,
      USER_ID,
    );

    expect(existing.behaviors?.[0]).toMatchObject({
      category: "health_wellness",
      cadenceCategoryName: "Measurements",
    });
  });

  it("renders invalid bundle errors", () => {
    const preview = resolveBehaviorLogImportMergePreview({ files: [] });
    const html = renderToStaticMarkup(
      <BehaviorLogImportPreviewDetails
        preview={preview}
        capabilities={resolveBehaviorLogImportCapabilities(preview)}
      />,
    );

    expect(html).toContain("Dry-run summary");
    expect(html).toContain("Errors");
    expect(html).toContain("required_file_missing");
    expect(html).toContain("Fix validation errors before applying");
  });

  it("renders summary counts, note warnings, privacy, and intervention counts", () => {
    const preview = resolveBehaviorLogImportMergePreview({
      files: behaviorLogFiles({
        includeNote: true,
        includeIntervention: true,
      }),
    });
    const html = renderToStaticMarkup(
      <BehaviorLogImportPreviewDetails
        preview={preview}
        capabilities={resolveBehaviorLogImportCapabilities(preview)}
      />,
    );

    expect(html).toContain("Behaviors");
    expect(html).toContain("Interventions");
    expect(html).toContain("Note sensitivity warnings");
    expect(html).toContain("high_sensitivity_note_present");
    expect(html).toContain("Imported note records");
    expect(html).toContain("Imported interventions");
    expect(html).toContain("Inline note fills");
    expect(html).toContain("Unsupported fields");
    expect(html).toContain("Sensitive note warnings");
    expect(html).toContain(
      "Stores an imported note record and may fill the occurrence Note field.",
    );
    expect(html).toContain("Privacy");
    expect(html).toContain("standard_redaction");
    expect(html).toContain("Channels");
    expect(html).toContain("Passive history rows");
    expect(html).toContain("Dropped sensitive fields");
    expect(html).toContain("No reminder deliveries, provider calls, or message bodies.");
    expect(html).toContain("email");
  });

  it("labels recent import runs without completion timestamps as still open", () => {
    const html = renderToStaticMarkup(
      <BehaviorLogImportPanel
        recentRuns={[
          {
            id: "import-run-open",
            import_mode: "merge_preview",
            status: "previewed",
            started_at: "2026-06-08T21:10:00Z",
            completed_at: null,
            failure_message: null,
          },
        ]}
      />,
    );

    expect(html).toContain("Recent imports");
    expect(html).toContain("Still open");
  });

  it("gates create-only and merge apply when conflicts require decisions", () => {
    const preview = resolveBehaviorLogImportMergePreview({
      files: behaviorLogFiles(),
      existing: {
        behaviors: [
          {
            id: "local-behavior",
            title: "Brush teeth",
            category: "Grooming",
            active: false,
            archivedAt: "2026-06-01T00:00:00Z",
            sourceOriginalId: "source-behavior",
          },
        ],
      },
    });
    const capabilities = resolveBehaviorLogImportCapabilities(preview);
    const html = renderToStaticMarkup(
      <BehaviorLogImportPreviewDetails
        preview={preview}
        capabilities={capabilities}
      />,
    );

    expect(preview.mergePreview.conflictCount).toBeGreaterThan(0);
    expect(capabilities.canApplyCreateOnly).toBe(false);
    expect(capabilities.canApplyMerge).toBe(false);
    expect(html).toContain("Resolve merge conflicts");
  });

  it("renders apply controls with the exact accepted preview binding", () => {
    const preview = resolveBehaviorLogImportMergePreview({
      files: behaviorLogFiles(),
      existing: EMPTY_EXISTING_RECORDS,
    });
    const html = renderToStaticMarkup(
      <BehaviorLogImportApplyForm
        title="Create missing records"
        mode="create_missing_only"
        buttonLabel="Apply create-only import"
        disabled={false}
        disabledReason={null}
        requiresSensitiveNoteConfirmation
        bundlePayload="encoded-bundle"
        formAction={() => undefined}
        state={{
          status: "previewed",
          message: "BehaviorLog preview ready.",
          upload: {
            fileName: "cadence-export.behaviorlog.zip",
            fileSize: 123,
          },
          archiveFingerprint: "a".repeat(64),
          preview,
          previewRun: {
            id: "import-run-preview",
            import_mode: "merge_preview",
            status: "previewed",
            started_at: "2026-06-08T21:10:00Z",
            completed_at: "2026-06-08T21:10:02Z",
            failure_message: null,
          },
          capabilities: resolveBehaviorLogImportCapabilities(preview),
          applyResult: null,
        }}
      />,
    );
    const mergeHtml = renderToStaticMarkup(
      <BehaviorLogImportApplyForm
        title="Approved merge"
        mode="merge_by_user_approved_plan"
        buttonLabel="Apply approved merge"
        disabled={false}
        disabledReason={null}
        requiresSensitiveNoteConfirmation={false}
        bundlePayload="encoded-bundle"
        formAction={() => undefined}
        state={{
          status: "previewed",
          message: "BehaviorLog preview ready.",
          upload: {
            fileName: "cadence-export.behaviorlog.zip",
            fileSize: 123,
          },
          archiveFingerprint: "a".repeat(64),
          preview,
          previewRun: {
            id: "import-run-preview",
            import_mode: "merge_preview",
            status: "previewed",
            started_at: "2026-06-08T21:10:00Z",
            completed_at: "2026-06-08T21:10:02Z",
            failure_message: null,
          },
          capabilities: resolveBehaviorLogImportCapabilities(preview),
          applyResult: null,
        }}
      />,
    );

    expect(html).toContain('name="import_preview_run_id"');
    expect(html).toContain('value="import-run-preview"');
    expect(html).toContain('name="preview_fingerprint"');
    expect(html).toContain(`value="${preview.previewFingerprint}"`);
    expect(html).toContain('name="local_data_fingerprint"');
    expect(html).toContain(`value="${preview.localDataFingerprint}"`);
    expect(html).toContain('name="bundle_fingerprint"');
    expect(html).toContain(`value="${preview.bundleFingerprint}"`);
    expect(html).toContain('name="archive_fingerprint"');
    expect(html).toContain(`value="${"a".repeat(64)}"`);
    expect(html).toContain('name="confirm_apply"');
    expect(html).toContain("I reviewed this exact preview.");
    expect(html).toContain('name="confirm_sensitive_notes"');
    expect(html).toContain(
      "I reviewed high or restricted note sensitivity warnings.",
    );
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*>Apply create-only import<\/button>/,
    );
    expect(mergeHtml).toContain(">Apply approved merge</button>");
  });

  it("keeps import apply unavailable until every applicable acknowledgement is complete", () => {
    expect(
      isBehaviorLogImportApplyReady({
        unavailable: false,
        previewAcknowledged: false,
        requiresSensitiveNoteConfirmation: false,
        sensitiveNotesAcknowledged: false,
      }),
    ).toBe(false);
    expect(
      isBehaviorLogImportApplyReady({
        unavailable: false,
        previewAcknowledged: true,
        requiresSensitiveNoteConfirmation: false,
        sensitiveNotesAcknowledged: false,
      }),
    ).toBe(true);
    expect(
      isBehaviorLogImportApplyReady({
        unavailable: false,
        previewAcknowledged: true,
        requiresSensitiveNoteConfirmation: true,
        sensitiveNotesAcknowledged: false,
      }),
    ).toBe(false);
    expect(
      isBehaviorLogImportApplyReady({
        unavailable: false,
        previewAcknowledged: true,
        requiresSensitiveNoteConfirmation: true,
        sensitiveNotesAcknowledged: true,
      }),
    ).toBe(true);
    expect(
      isBehaviorLogImportApplyReady({
        unavailable: true,
        previewAcknowledged: true,
        requiresSensitiveNoteConfirmation: false,
        sensitiveNotesAcknowledged: true,
      }),
    ).toBe(false);
  });

  it("requires separate acknowledgement before applying high-sensitivity notes", async () => {
    const files = behaviorLogFiles({ includeNote: true });
    const preview = resolveBehaviorLogImportMergePreview({
      files,
      existing: EMPTY_EXISTING_RECORDS,
    });
    const baseFormData = createApplyFormData({ files, preview });
    mocks.getBehaviorLogImportRunById.mockResolvedValue(
      createAcceptedPreviewRun(preview, files),
    );

    await expect(
      applyBehaviorLogImportUploadFromFormData(baseFormData),
    ).rejects.toThrow("acknowledge high or restricted note sensitivity");
    expect(mocks.applyCreateMissingBehaviorLogImportPlan).not.toHaveBeenCalled();

    const confirmedFormData = new FormData();

    for (const [key, value] of baseFormData.entries()) {
      confirmedFormData.set(key, value);
    }

    confirmedFormData.set("confirm_sensitive_notes", "yes");
    mocks.createBehaviorLogImportRunFromPreview.mockResolvedValueOnce({
      id: "import-run-apply",
      import_mode: "create_missing_only",
      status: "previewed",
      started_at: "2026-06-08T21:11:00Z",
      completed_at: "2026-06-08T21:11:02Z",
      failure_message: null,
    });
    mocks.applyCreateMissingBehaviorLogImportPlan.mockResolvedValueOnce({
      importRun: {
        id: "import-run-apply",
        import_mode: "create_missing_only",
        status: "applied",
        started_at: "2026-06-08T21:11:00Z",
        completed_at: "2026-06-08T21:11:02Z",
        failure_message: null,
      },
      created: {
        behaviors: 1,
        schedules: 1,
        occurrences: 1,
        statusEvents: 1,
        notes: 1,
        mappings: 5,
      },
      skipped: {
        behaviors: 0,
        schedules: 0,
        occurrences: 0,
        statusEvents: 0,
        notes: 0,
      },
      warnings: [],
    });

    const state = await applyBehaviorLogImportUploadFromFormData(
      confirmedFormData,
    );

    expect(state.status).toBe("applied");
    expect(state.applyResult?.created.notes).toBe(1);
    expect(mocks.applyCreateMissingBehaviorLogImportPlan).toHaveBeenCalledTimes(1);
  });

  it("rejects applies without a persisted accepted preview binding", async () => {
    const formData = createApplyFormData({
      files: behaviorLogFiles(),
      preview: resolveBehaviorLogImportMergePreview({
        files: behaviorLogFiles(),
        existing: EMPTY_EXISTING_RECORDS,
      }),
      includePreviewBinding: false,
    });

    await expect(
      applyBehaviorLogImportUploadFromFormData(formData),
    ).rejects.toThrow("Preview the .behaviorlog.zip bundle again before applying.");
    expect(mocks.getBehaviorLogImportRunById).not.toHaveBeenCalled();
    expect(mocks.createBehaviorLogImportRunFromPreview).not.toHaveBeenCalled();
    expect(mocks.applyCreateMissingBehaviorLogImportPlan).not.toHaveBeenCalled();
  });

  it("rejects a mismatched accepted preview run before importing", async () => {
    const files = behaviorLogFiles();
    const preview = resolveBehaviorLogImportMergePreview({
      files,
      existing: EMPTY_EXISTING_RECORDS,
    });
    const formData = createApplyFormData({ files, preview });
    mocks.getBehaviorLogImportRunById.mockResolvedValue({
      ...createAcceptedPreviewRun(preview),
      dry_run_summary: {
        ...createAcceptedPreviewRun(preview).dry_run_summary,
        previewFingerprint: "d".repeat(64),
      },
    });

    await expect(
      applyBehaviorLogImportUploadFromFormData(formData),
    ).rejects.toThrow("Import preview no longer matches the accepted preview run.");
    expect(mocks.createBehaviorLogImportRunFromPreview).not.toHaveBeenCalled();
    expect(mocks.applyCreateMissingBehaviorLogImportPlan).not.toHaveBeenCalled();
  });

  it("rejects archive bytes that no longer match the accepted preview", async () => {
    const acceptedFiles = behaviorLogFiles();
    const preview = resolveBehaviorLogImportMergePreview({
      files: acceptedFiles,
      existing: EMPTY_EXISTING_RECORDS,
    });
    const formData = createApplyFormData({
      files: behaviorLogFiles({ behaviorDescription: "Changed after review." }),
      preview,
      acceptedFiles,
    });
    mocks.getBehaviorLogImportRunById.mockResolvedValue(
      createAcceptedPreviewRun(preview, acceptedFiles),
    );

    await expect(
      applyBehaviorLogImportUploadFromFormData(formData),
    ).rejects.toThrow(
      "The uploaded bundle no longer matches the accepted import preview. Preview the import again.",
    );
    expect(mocks.createBehaviorLogImportRunFromPreview).not.toHaveBeenCalled();
    expect(mocks.applyCreateMissingBehaviorLogImportPlan).not.toHaveBeenCalled();
  });

  it("rejects an accepted preview when local data changes before apply", async () => {
    const files = behaviorLogFiles();
    const preview = resolveBehaviorLogImportMergePreview({
      files,
      existing: EMPTY_EXISTING_RECORDS,
    });
    const formData = createApplyFormData({ files, preview });
    mocks.getBehaviorLogImportRunById.mockResolvedValue(
      createAcceptedPreviewRun(preview),
    );
    mocks.listBehaviorLogImportRecordMappings.mockResolvedValueOnce([
      {
        record_type: "behavior",
        external_id: "new-local-mapping",
        local_id: "00000000-0000-4000-8000-000000000055",
      },
    ]);

    await expect(
      applyBehaviorLogImportUploadFromFormData(formData),
    ).rejects.toThrow("Local data changed since this import preview.");
    expect(mocks.createBehaviorLogImportRunFromPreview).not.toHaveBeenCalled();
    expect(mocks.applyCreateMissingBehaviorLogImportPlan).not.toHaveBeenCalled();
  });

  it("applies only the exact accepted preview and preserves its audit link", async () => {
    const files = behaviorLogFiles();
    const preview = resolveBehaviorLogImportMergePreview({
      files,
      existing: EMPTY_EXISTING_RECORDS,
    });
    const formData = createApplyFormData({ files, preview });
    mocks.getBehaviorLogImportRunById.mockResolvedValue(
      createAcceptedPreviewRun(preview),
    );
    mocks.createBehaviorLogImportRunFromPreview.mockResolvedValueOnce({
      id: "import-run-apply",
      import_mode: "create_missing_only",
      status: "previewed",
      started_at: "2026-06-08T21:11:00Z",
      completed_at: "2026-06-08T21:11:02Z",
      failure_message: null,
    });
    mocks.applyCreateMissingBehaviorLogImportPlan.mockResolvedValueOnce({
      importRun: {
        id: "import-run-apply",
        import_mode: "create_missing_only",
        status: "applied",
        started_at: "2026-06-08T21:11:00Z",
        completed_at: "2026-06-08T21:11:02Z",
        failure_message: null,
      },
      created: {
        behaviors: 1,
        schedules: 1,
        occurrences: 1,
        statusEvents: 1,
        notes: 0,
        mappings: 4,
      },
      skipped: {
        behaviors: 0,
        schedules: 0,
        occurrences: 0,
        statusEvents: 0,
        notes: 0,
      },
      warnings: [],
    });

    const state = await applyBehaviorLogImportUploadFromFormData(formData);

    expect(state.status).toBe("applied");
    expect(mocks.createBehaviorLogImportRunFromPreview).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        importMode: "create_missing_only",
        acceptedPreviewRunId: "import-run-preview",
        acceptedPreviewFingerprint: preview.previewFingerprint,
      }),
    );
    expect(mocks.applyCreateMissingBehaviorLogImportPlan).toHaveBeenCalledTimes(1);
  });

  it("previews, accepts, and applies one valid bundle larger than 750 KiB", async () => {
    const files = behaviorLogFiles({
      readmeContent: createDeterministicArchivePadding(1_700_000),
    });
    const zip = createStoredZip(files);

    expect(zip.byteLength).toBeGreaterThan(750 * 1024);
    expect(zip.byteLength).toBeLessThan(2 * 1024 * 1024);

    const previewFormData = new FormData();

    previewFormData.set(
      "behaviorlog_file",
      new File([new Uint8Array(zip)], "large-valid.behaviorlog.zip", {
        type: "application/zip",
      }),
    );

    const previewState =
      await previewBehaviorLogImportUploadFromFormData(previewFormData);
    const preview = previewState.preview;

    expect(preview?.valid).toBe(true);
    expect(previewState).not.toHaveProperty("bundlePayload");
    expect(previewState.archiveFingerprint).toBe(sha256Bytes(zip));

    if (!preview) {
      throw new Error("Expected a valid large-bundle preview.");
    }

    mocks.getBehaviorLogImportRunById.mockResolvedValue(
      createAcceptedPreviewRun(preview, files),
    );
    mocks.createBehaviorLogImportRunFromPreview.mockResolvedValueOnce({
      id: "large-import-run-apply",
      import_mode: "create_missing_only",
      status: "previewed",
      started_at: "2026-06-08T21:11:00Z",
      completed_at: "2026-06-08T21:11:02Z",
      failure_message: null,
    });
    mocks.applyCreateMissingBehaviorLogImportPlan.mockResolvedValueOnce({
      importRun: {
        id: "large-import-run-apply",
        import_mode: "create_missing_only",
        status: "applied",
        started_at: "2026-06-08T21:11:00Z",
        completed_at: "2026-06-08T21:11:02Z",
        failure_message: null,
      },
      created: {
        behaviors: 1,
        schedules: 1,
        occurrences: 1,
        statusEvents: 1,
        notes: 0,
        mappings: 4,
      },
      skipped: {
        behaviors: 0,
        schedules: 0,
        occurrences: 0,
        statusEvents: 0,
        notes: 0,
      },
      warnings: [],
    });

    const appliedState = await applyBehaviorLogImportUploadFromFormData(
      createApplyFormData({ files, preview }),
    );

    expect(appliedState.status).toBe("applied");
  });

  it("rejects files above 2 MB with Cadence's exact size error", async () => {
    expect(getBehaviorLogBundleSizeError(2 * 1024 * 1024 + 1)).toBe(
      BEHAVIORLOG_BUNDLE_SIZE_ERROR,
    );
    const formData = new FormData();

    formData.set(
      "behaviorlog_file",
      new File(
        [new Uint8Array(2 * 1024 * 1024 + 1)],
        "too-large.behaviorlog.zip",
        { type: "application/zip" },
      ),
    );

    await expect(
      previewBehaviorLogImportUploadFromFormData(formData),
    ).rejects.toThrow(BEHAVIORLOG_BUNDLE_SIZE_ERROR);
    expect(mocks.createBehaviorLogImportRunFromPreview).not.toHaveBeenCalled();
  });
});

const EMPTY_EXISTING_RECORDS: BehaviorLogExistingRecords = {
  behaviors: [],
  schedules: [],
  occurrences: [],
  statusEvents: [],
  importedNotes: [],
  importedInterventions: [],
  mappings: [],
};

function behaviorLogFiles(
  input: {
    includeNote?: boolean;
    includeIntervention?: boolean;
    behaviorDescription?: string;
    readmeContent?: string;
  } = {},
): BehaviorLogImportFile[] {
  const records = {
    behavior: {
      record_type: "behavior",
      behavior_id: "behavior-brush",
      title: "Brush teeth",
      description: input.behaviorDescription ?? "Night brushing",
      category: "Grooming",
      success_definition: "Complete Brush teeth for each scheduled occurrence.",
      created_at_utc: "2026-05-01T12:00:00Z",
      archived_at_utc: null,
      source: {
        original_id: "source-behavior",
        capture_method: "manual_text",
        confidence: "high",
      },
      extensions: {
        "app.cadence": {
          category_name: "Grooming",
          active: true,
          browser_reminder_enabled: true,
          email_reminder_enabled: false,
          reminder_offset_minutes: 0,
        },
      },
    },
    schedule: {
      record_type: "schedule",
      schedule_id: "schedule-brush",
      behavior_id: "behavior-brush",
      recurrence_profile: "behaviorlog.calendar_simple.v1",
      recurrence: {
        type: "daily",
        interval: 1,
      },
      timezone: TIMEZONE,
      local_time: "09:00",
      window_start_local: null,
      window_end_local: null,
      active_from_local_date: "2026-05-01",
      active_until_local_date: null,
      source: {
        original_id: "local-schedule",
        capture_method: "system_generated",
        confidence: "high",
      },
      extensions: {
        "app.cadence": {
          schedule_kind: "exact",
          schedule_preset: null,
        },
      },
    },
    occurrence: {
      record_type: "occurrence",
      occurrence_id: "occurrence-1",
      behavior_id: "behavior-brush",
      schedule_id: "schedule-brush",
      scheduled_for_utc: "2026-06-08T13:00:00Z",
      local_date: "2026-06-08",
      local_time: "09:00",
      timezone: TIMEZONE,
      generated_at_utc: "2026-06-08T12:00:00Z",
      occurrence_state: "active",
      current_status: "completed",
      source: {
        original_id: "local-occurrence",
        capture_method: "system_generated",
        confidence: "high",
      },
    },
    statusEvent: {
      record_type: "status_event",
      event_id: "event-1",
      occurrence_id: "occurrence-1",
      behavior_id: "behavior-brush",
      previous_status: "unresolved",
      status: "completed",
      status_semantics: "explicit_user_mark",
      recorded_at_utc: "2026-06-08T13:10:00Z",
      effective_at_utc: "2026-06-08T13:05:00Z",
      local_date: "2026-06-08",
      timezone: TIMEZONE,
      source: {
        original_id: "local-event",
        capture_method: "manual_tap",
        confidence: "high",
      },
      revises_event_id: null,
      reason_code: null,
    },
    note: {
      record_type: "note",
      note_id: "note-1",
      attached_to_type: "occurrence",
      attached_to_id: "occurrence-1",
      body_markdown: "Skipped before work.",
      note_role: "user",
      created_at_utc: "2026-06-08T14:10:00Z",
      updated_at_utc: null,
      sensitivity: "high",
      source: {
        original_id: "occurrence-1",
        capture_method: "manual_text",
        confidence: "high",
      },
    },
    intervention: {
      record_type: "intervention",
      intervention_id: "delivery-1",
      behavior_id: "behavior-brush",
      occurrence_id: "occurrence-1",
      intervention_type: "reminder",
      channel: "email",
      scheduled_send_at_utc: "2026-06-08T12:45:00Z",
      sent_at_utc: "2026-06-08T12:46:00Z",
      delivery_status: "sent",
      failure_reason: null,
      source: {
        original_id: "delivery-1",
        capture_method: "system_generated",
        confidence: "high",
      },
    },
  };
  const contentByPath = new Map([
    ["schema.json", "{}"],
    ["README.md", input.readmeContent ?? "# BehaviorLog"],
    ["AGENTS.md", "# AGENTS"],
    ["data/behaviors.jsonl", JSON.stringify(records.behavior)],
    ["data/schedules.jsonl", JSON.stringify(records.schedule)],
    ["data/occurrences.jsonl", JSON.stringify(records.occurrence)],
    ["data/status_events.jsonl", JSON.stringify(records.statusEvent)],
  ]);

  if (input.includeNote) {
    contentByPath.set("data/notes.jsonl", JSON.stringify(records.note));
  }

  if (input.includeIntervention) {
    contentByPath.set(
      "data/interventions.jsonl",
      JSON.stringify(records.intervention),
    );
  }

  const manifest = {
    format: "behaviorlog.bundle",
    schema_version: "0.1.0-draft",
    producer: {
      name: "Cadence Tracker",
      version: "0.1.0",
    },
    privacy: {
      redaction_level: "standard_redaction",
      subject_id_strategy: "pseudonymous",
      contains_notes: input.includeNote ?? false,
      contains_context: false,
      contains_raw_location: false,
      contains_health_data: false,
      contains_ai_generated_content: false,
    },
    profiles: [
      "core",
      input.includeNote ? "notes" : null,
      input.includeIntervention ? "interventions" : null,
    ].filter(Boolean),
    files: [...contentByPath.entries()].map(([path, content]) => ({
      path,
      media_type: path.endsWith(".jsonl")
        ? "application/jsonl"
        : path.endsWith(".md")
          ? "text/markdown"
          : "application/json",
      sha256: sha256(content),
      required: !path.includes("notes") && !path.includes("interventions"),
    })),
  };

  return [
    {
      path: "manifest.json",
      mediaType: "application/json",
      content: JSON.stringify(manifest),
    },
    ...[...contentByPath.entries()].map(([path, content]) => ({
      path,
      mediaType: path.endsWith(".jsonl")
        ? "application/jsonl"
        : path.endsWith(".md")
          ? "text/markdown"
          : "application/json",
      content,
    })),
  ];
}

function createApplyFormData(input: {
  files: BehaviorLogImportFile[];
  preview: ReturnType<typeof resolveBehaviorLogImportMergePreview>;
  includePreviewBinding?: boolean;
  acceptedFiles?: BehaviorLogImportFile[];
}): FormData {
  const zip = createStoredZip(input.files);
  const acceptedZip = createStoredZip(input.acceptedFiles ?? input.files);
  const formData = new FormData();

  formData.set("intent", "apply");
  formData.set("import_mode", "create_missing_only");
  formData.set("confirm_apply", "yes");
  formData.set("bundle_payload", Buffer.from(zip).toString("base64"));
  formData.set("upload_file_name", "cadence-export.behaviorlog.zip");
  formData.set("upload_file_size", String(zip.byteLength));

  if (input.includePreviewBinding !== false) {
    formData.set("import_preview_run_id", "import-run-preview");
    formData.set("preview_fingerprint", input.preview.previewFingerprint);
    formData.set(
      "local_data_fingerprint",
      input.preview.localDataFingerprint,
    );
    formData.set("bundle_fingerprint", input.preview.bundleFingerprint);
    formData.set("archive_fingerprint", sha256Bytes(acceptedZip));
  }

  return formData;
}

function createAcceptedPreviewRun(
  preview: ReturnType<typeof resolveBehaviorLogImportMergePreview>,
  files: BehaviorLogImportFile[] = behaviorLogFiles(),
) {
  return {
    id: "import-run-preview",
    import_mode: "merge_preview",
    status: "previewed",
    bundle_fingerprint: preview.bundleFingerprint,
    dry_run_summary: {
      valid: preview.valid,
      bundleFingerprint: preview.bundleFingerprint,
      archiveFingerprint: sha256Bytes(createStoredZip(files)),
      localDataFingerprint: preview.localDataFingerprint,
      previewFingerprint: preview.previewFingerprint,
    },
  };
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function sha256Bytes(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function createDeterministicArchivePadding(length: number): string {
  let output = "";
  let seed = "cadence-large-bundle";

  while (output.length < length) {
    seed = sha256(seed);
    output += seed;
  }

  return output.slice(0, length);
}
