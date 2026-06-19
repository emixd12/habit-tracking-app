import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  resolveBehaviorLogImportMergePreview,
  resolveBehaviorLogImportPreview,
} from "../lib/resolvers/behaviorlog-import.resolver";
import type { BehaviorLogImportFile } from "../lib/types/behaviorlog-import";

describe("BehaviorLog Intervention Profile import preview", () => {
  it("previews valid interventions by channel, delivery status, and linked behavior", () => {
    const preview = resolveBehaviorLogImportPreview({
      files: behaviorLogFiles({
        interventions: [
          interventionRecord({
            intervention_id: "delivery-email-sent",
            channel: "email",
            delivery_status: "sent",
          }),
          interventionRecord({
            intervention_id: "delivery-browser-pending",
            channel: "browser_push",
            delivery_status: "pending",
            sent_at_utc: null,
          }),
        ],
      }),
    });

    expect(preview.valid).toBe(true);
    expect(preview.summary).toMatchObject({
      interventionCount: 2,
      interventionPreviewOnlyCount: 2,
      interventionStoredCount: 2,
      interventionSensitiveFieldDropCount: 0,
      interventionRedactedFieldCount: 0,
      createCount: 4,
      skipCount: 0,
      errorCount: 0,
    });
    expect(preview.summary.interventionCounts).toEqual({
      byChannel: [
        { value: "browser_push", count: 1 },
        { value: "email", count: 1 },
      ],
      byDeliveryStatus: [
        { value: "pending", count: 1 },
        { value: "sent", count: 1 },
      ],
      byBehavior: [
        {
          behaviorExternalId: "behavior-brush",
          behaviorTitle: "Brush teeth",
          count: 2,
        },
      ],
    });
    expect(preview.plan.interventions).toEqual([
      expect.objectContaining({
        action: "preview_only",
        previewOnly: true,
        externalId: "delivery-email-sent",
        behaviorExternalId: "behavior-brush",
        occurrenceExternalId: "occurrence-1",
        channel: "email",
        deliveryStatus: "sent",
        storageDecision: expect.objectContaining({
          decision: "store_passive_history",
          rawMessageBodyStored: false,
          rawEndpointStored: false,
          reminderDeliverySideEffects: false,
          providerSideEffects: false,
        }),
      }),
      expect.objectContaining({
        action: "preview_only",
        previewOnly: true,
        externalId: "delivery-browser-pending",
        channel: "browser_push",
        deliveryStatus: "pending",
      }),
    ]);
  });

  it("reports intervention manifest hash mismatches and JSONL parse errors", () => {
    const files = replaceFileContent(
      behaviorLogFiles(),
      "data/interventions.jsonl",
      '{"record_type":"intervention"\n',
      { updateManifestHash: false },
    );
    const preview = resolveBehaviorLogImportPreview({ files });

    expect(preview.valid).toBe(false);
    expect(preview.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "manifest_hash_mismatch",
          path: "data/interventions.jsonl",
        }),
        expect.objectContaining({
          code: "jsonl_parse_error",
          file: "data/interventions.jsonl",
          row: 1,
        }),
      ]),
    );
  });

  it("rejects interventions with missing behavior or occurrence references", () => {
    const preview = resolveBehaviorLogImportPreview({
      files: behaviorLogFiles({
        interventions: [
          interventionRecord({
            intervention_id: "delivery-missing-parents",
            behavior_id: "missing-behavior",
            occurrence_id: "missing-occurrence",
          }),
        ],
      }),
    });

    expect(preview.valid).toBe(false);
    expect(preview.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "intervention_behavior_missing",
          file: "data/interventions.jsonl",
        }),
        expect.objectContaining({
          code: "intervention_occurrence_missing",
          file: "data/interventions.jsonl",
        }),
      ]),
    );
  });

  it("rejects unsupported intervention channels and delivery statuses", () => {
    const preview = resolveBehaviorLogImportPreview({
      files: behaviorLogFiles({
        interventions: [
          interventionRecord({
            channel: "sms",
            delivery_status: "queued",
          }),
        ],
      }),
    });

    expect(preview.valid).toBe(false);
    expect(preview.plan.interventions).toHaveLength(0);
    expect(preview.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "intervention_channel_invalid",
          file: "data/interventions.jsonl",
        }),
        expect.objectContaining({
          code: "intervention_delivery_status_invalid",
          file: "data/interventions.jsonl",
        }),
      ]),
    );
  });

  it("warns when intervention records contain sensitive delivery payload fields", () => {
    const preview = resolveBehaviorLogImportPreview({
      files: behaviorLogFiles({
        interventions: [
          interventionRecord({
            message_body: "Brush teeth reminder",
            endpoint: "https://push.example.test/subscription",
            provider_message_id: "provider-secret-message-id",
            subscription_keys: {
              p256dh: "secret-key",
              auth: "auth-key",
            },
            extensions: {
              vendor: {
                recipient_email: "emma@example.com",
              },
            },
          }),
        ],
      }),
    });

    expect(preview.valid).toBe(true);
    expect(preview.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "intervention_sensitive_payload_present",
          file: "data/interventions.jsonl",
          row: 1,
          message: expect.stringContaining("message_body"),
        }),
      ]),
    );
    expect(preview.warnings[0]?.message).toEqual(
      expect.stringContaining("endpoint"),
    );
    expect(preview.warnings[0]?.message).toEqual(
      expect.stringContaining("provider_message_id"),
    );
    expect(preview.warnings[0]?.message).toEqual(
      expect.stringContaining("subscription_keys"),
    );
    expect(preview.warnings[0]?.message).toEqual(
      expect.stringContaining("extensions.vendor.recipient_email"),
    );
    expect(preview.plan.interventions[0]?.storageDecision).toMatchObject({
      decision: "store_passive_history",
      droppedSensitiveFields: expect.arrayContaining([
        "endpoint",
        "message_body",
        "provider_message_id",
        "subscription_keys",
        "subscription_keys.auth",
        "subscription_keys.p256dh",
        "extensions.vendor.recipient_email",
      ]),
      rawMessageBodyStored: false,
      rawEndpointStored: false,
      recipientIdentifiersStored: false,
    });
    expect(preview.summary).toMatchObject({
      interventionStoredCount: 1,
      interventionSensitiveFieldDropCount: 7,
    });
  });

  it("plans passive intervention history without CSV or reminder write actions", () => {
    const files = behaviorLogFiles();
    const preview = resolveBehaviorLogImportMergePreview({ files });

    expect(files.some((file) => file.path === "csv/interventions.csv")).toBe(
      false,
    );
    expect(preview.plan.interventions).toEqual([
      expect.objectContaining({
        action: "preview_only",
        previewOnly: true,
      }),
    ]);
    expect(preview.mergePreview.actions.interventions).toEqual([
      expect.objectContaining({
        recordType: "intervention",
        externalId: "delivery-1",
        action: "create_new",
        localId: null,
        metadata: expect.objectContaining({
          interventionDecision: "store_passive_history",
          storageDecision: expect.objectContaining({
            reminderDeliverySideEffects: false,
            providerSideEffects: false,
          }),
        }),
      }),
    ]);
    expect(preview.mergePreview.actions.interventions[0]?.reasons[0]).toContain(
      "passive imported intervention history",
    );
    expect(preview.mergePreview.actionCounts).toMatchObject({
      create_new: 5,
      skip_existing: 0,
    });
  });
});

function behaviorLogFiles(input: {
  interventions?: Array<Record<string, unknown>>;
} = {}): BehaviorLogImportFile[] {
  const contentByPath = new Map([
    ["schema.json", "{}"],
    ["README.md", "# BehaviorLog"],
    ["AGENTS.md", "# AGENTS"],
    ["data/behaviors.jsonl", JSON.stringify(behaviorRecord())],
    ["data/schedules.jsonl", JSON.stringify(scheduleRecord())],
    ["data/occurrences.jsonl", JSON.stringify(occurrenceRecord())],
    ["data/status_events.jsonl", JSON.stringify(statusEventRecord())],
    [
      "data/interventions.jsonl",
      (input.interventions ?? [interventionRecord()])
        .map((record) => JSON.stringify(record))
        .join("\n"),
    ],
  ]);
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
      contains_notes: false,
      contains_raw_location: false,
      contains_health_data: false,
      contains_ai_generated_content: false,
    },
    profiles: ["core", "interventions"],
    files: [...contentByPath.entries()].map(([path, content]) => ({
      path,
      media_type: path.endsWith(".jsonl")
        ? "application/jsonl"
        : path.endsWith(".md")
          ? "text/markdown"
          : "application/json",
      sha256: sha256(content),
      required: !path.includes("interventions"),
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

function behaviorRecord(): Record<string, unknown> {
  return {
    record_type: "behavior",
    behavior_id: "behavior-brush",
    title: "Brush teeth",
    description: "Night brushing",
    category: "Grooming",
    created_at_utc: "2026-05-01T12:00:00Z",
    source: {
      original_id: "behavior-brush",
      capture_method: "system_generated",
      confidence: "high",
    },
  };
}

function scheduleRecord(): Record<string, unknown> {
  return {
    record_type: "schedule",
    schedule_id: "schedule-brush",
    behavior_id: "behavior-brush",
    recurrence_profile: "behaviorlog.calendar_simple.v1",
    recurrence: {
      type: "daily",
      interval: 1,
    },
    timezone: "America/New_York",
    local_time: "09:00",
    active_from_local_date: "2026-05-01",
    source: {
      original_id: "slot-brush",
      capture_method: "system_generated",
      confidence: "high",
    },
  };
}

function occurrenceRecord(): Record<string, unknown> {
  return {
    record_type: "occurrence",
    occurrence_id: "occurrence-1",
    behavior_id: "behavior-brush",
    schedule_id: "schedule-brush",
    scheduled_for_utc: "2026-06-08T13:00:00Z",
    local_date: "2026-06-08",
    local_time: "09:00",
    timezone: "America/New_York",
    occurrence_state: "active",
    current_status: "completed",
    source: {
      original_id: "occurrence-1",
      capture_method: "system_generated",
      confidence: "high",
    },
  };
}

function statusEventRecord(): Record<string, unknown> {
  return {
    record_type: "status_event",
    event_id: "event-1",
    occurrence_id: "occurrence-1",
    behavior_id: "behavior-brush",
    previous_status: "unresolved",
    status: "completed",
    status_semantics: "explicit_user_mark",
    recorded_at_utc: "2026-06-08T13:10:00Z",
    effective_at_utc: "2026-06-08T13:10:00Z",
    local_date: "2026-06-08",
    timezone: "America/New_York",
    source: {
      original_id: "event-1",
      capture_method: "manual_tap",
      confidence: "high",
    },
  };
}

function interventionRecord(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
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
    ...overrides,
  };
}

function replaceFileContent(
  files: BehaviorLogImportFile[],
  path: string,
  content: string,
  options: { updateManifestHash?: boolean } = {},
): BehaviorLogImportFile[] {
  const cloned = files.map((file) => ({ ...file }));
  const target = cloned.find((file) => file.path === path);

  if (!target) {
    throw new Error(`Missing fixture file ${path}.`);
  }

  target.content = content;

  if (options.updateManifestHash === false) {
    return cloned;
  }

  const manifestFile = cloned.find((file) => file.path === "manifest.json");

  if (!manifestFile) {
    throw new Error("Missing fixture manifest.");
  }

  const manifest = JSON.parse(manifestFile.content);
  manifest.files = manifest.files.map((entry: Record<string, unknown>) =>
    entry.path === path ? { ...entry, sha256: sha256(content) } : entry,
  );
  manifestFile.content = JSON.stringify(manifest);

  return cloned;
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
