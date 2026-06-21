import { createHash } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BehaviorLogImportPreviewDetails,
} from "../components/export/BehaviorLogImportPanel";
import {
  applyBehaviorLogImportUploadFromFormData,
  previewBehaviorLogImportUploadFromFormData,
  resolveBehaviorLogImportCapabilities,
} from "../lib/services/behaviorlog-import.service";
import { createStoredZip } from "../lib/services/zip";
import { resolveBehaviorLogImportMergePreview } from "../lib/resolvers/behaviorlog-import.resolver";
import type { BehaviorLogImportFile } from "../lib/types/behaviorlog-import";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TIMEZONE = "America/New_York";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  listUserBehaviors: vi.fn(),
  listUserOccurrences: vi.fn(),
  listOccurrenceStatusEventsByOccurrenceIds: vi.fn(),
  listBehaviorLogImportRecordMappings: vi.fn(),
  listBehaviorLogImportRuns: vi.fn(),
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
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: USER_ID,
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

  it("rejects unsupported upload files before auth or persistence", async () => {
    const formData = new FormData();

    formData.set(
      "behaviorlog_file",
      new File(["not a zip"], "cadence-export.zip", {
        type: "application/zip",
      }),
    );

    await expect(
      previewBehaviorLogImportUploadFromFormData(formData),
    ).rejects.toThrow("Upload a .behaviorlog.zip bundle");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createBehaviorLogImportRunFromPreview).not.toHaveBeenCalled();
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

  it("requires separate acknowledgement before applying high-sensitivity notes", async () => {
    const zip = createStoredZip(behaviorLogFiles({ includeNote: true }));
    const baseFormData = new FormData();

    baseFormData.set("intent", "apply");
    baseFormData.set("import_mode", "create_missing_only");
    baseFormData.set("confirm_apply", "yes");
    baseFormData.set("bundle_payload", Buffer.from(zip).toString("base64"));
    baseFormData.set("upload_file_name", "cadence-export.behaviorlog.zip");
    baseFormData.set("upload_file_size", String(zip.byteLength));

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
});

function behaviorLogFiles(
  input: {
    includeNote?: boolean;
    includeIntervention?: boolean;
  } = {},
): BehaviorLogImportFile[] {
  const records = {
    behavior: {
      record_type: "behavior",
      behavior_id: "behavior-brush",
      title: "Brush teeth",
      description: "Night brushing",
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
    ["README.md", "# BehaviorLog"],
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

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
