import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import {
  BehaviorLogRestorePanel,
  BehaviorLogRestorePreviewDetails,
} from "../components/export/BehaviorLogRestorePanel";
import type { BehaviorLogRestorePreview } from "../lib/types/behaviorlog-restore";

describe("BehaviorLog restore UI", () => {
  it("renders destructive actions, fingerprints, non-restorable fields, and warnings", () => {
    const html = renderToStaticMarkup(
      <BehaviorLogRestorePreviewDetails preview={restorePreview()} />,
    );

    expect(html).toContain("Restore preview");
    expect(html).toContain("2 destructive action(s)");
    expect(html).toContain("preview-fingerprint");
    expect(html).toContain("auth_identity");
    expect(html).toContain("push_subscriptions");
    expect(html).toContain("Replace · Destructive");
    expect(html).toContain("Archive · Destructive");
    expect(html).toContain("high_sensitivity_note_present");
    expect(html).toContain("Sensitive notes");
    expect(html).toContain("Redacted fields");
    expect(html).toContain("Apply support for this policy: Yes");
  });

  it("labels recent restore runs without completion timestamps as still open", () => {
    const html = renderToStaticMarkup(
      <BehaviorLogRestorePanel
        recentRuns={[
          {
            id: "restore-run-open",
            mode: "restore_preview",
            status: "previewed",
            startedAt: "2026-06-08T21:10:00Z",
            completedAt: null,
            failureMessage: null,
          },
        ]}
      />,
    );

    expect(html).toContain("Recent restores");
    expect(html).toContain("Still open");
  });
});

function restorePreview(): BehaviorLogRestorePreview {
  return {
    mode: "restore_preview",
    valid: true,
    previewFingerprint: "preview-fingerprint",
    localDataFingerprint: "local-fingerprint",
    bundleFingerprint: "bundle-fingerprint",
    statusHistoryPolicy: {
      selected: "preserve_append_only_history",
      default: "preserve_append_only_history",
      available: ["preserve_append_only_history", "replace_status_history"],
      applySupportedInThisTicket: true,
    },
    semantics: {
      jsonlAuthoritative: true,
      csvIgnoredForRestore: true,
      statusEventsAuthoritative: true,
      currentStatusIsSnapshotOnly: true,
      unresolvedIsFailure: false,
      behaviorLogIsNotAccountImage: true,
      providerSideEffects: false,
      reminderDeliverySideEffects: false,
    },
    summary: {
      actionCounts: {
        create: 1,
        replace: 1,
        archive: 1,
        delete: 0,
        keep: 0,
        skip: 0,
      },
      destructiveActionCount: 2,
      createdCount: 1,
      replacedCount: 1,
      archivedCount: 1,
      deletedCount: 0,
      keptCount: 0,
      skippedCount: 0,
      highOrRestrictedNoteCount: 1,
      redactedInterventionFieldCount: 1,
      unsupportedActionCount: 0,
    },
    nonRestorableFields: [
      {
        field: "auth_identity",
        reason: "Auth identity is external.",
      },
      {
        field: "push_subscriptions",
        reason: "Push subscriptions are browser/device state.",
      },
    ],
    sensitivity: {
      highOrRestrictedNotesPresent: true,
      noteSensitivities: ["high"],
      redactedInterventionFieldsPresent: true,
    },
    errors: [],
    warnings: [
      {
        severity: "warning",
        code: "high_sensitivity_note_present",
        message: "High sensitivity note present.",
      },
    ],
    actions: {
      behaviors: [
        {
          recordType: "behavior",
          action: "replace",
          destructive: true,
          externalId: "behavior-1",
          localId: "behavior-1",
          reasons: ["Behavior differs."],
        },
        {
          recordType: "behavior",
          action: "archive",
          destructive: true,
          externalId: null,
          localId: "behavior-2",
          reasons: ["Local behavior is absent from the bundle."],
        },
      ],
      schedules: [],
      occurrences: [],
      statusEvents: [],
      inlineOccurrenceNotes: [],
      importedNotes: [],
      importedInterventions: [
        {
          recordType: "intervention",
          action: "create",
          destructive: false,
          externalId: "intervention-1",
          localId: null,
          reasons: ["Passive history row."],
        },
      ],
    },
  };
}
