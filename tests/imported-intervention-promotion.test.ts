import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBehaviorById } from "@/lib/db/behaviors.repo";
import { listImportedInterventionsByIds } from "@/lib/db/importedInterventions.repo";
import { getOccurrenceById } from "@/lib/db/occurrences.repo";
import {
  attachImportProvenanceToPendingReminderDelivery,
  createMissingReminderDeliveries,
  listReminderDeliveriesByOccurrenceIds,
} from "@/lib/db/reminderDeliveries.repo";
import {
  resolveImportedInterventionPromotion,
  type ExistingReminderDeliveryForPromotion,
  type ImportedInterventionPromotionBehavior,
  type ImportedInterventionPromotionCandidate,
  type ImportedInterventionPromotionOccurrence,
  type ImportedInterventionPromotionRecord,
} from "@/lib/resolvers/imported-intervention-promotion.resolver";
import { promoteImportedInterventionsToReminderDeliveries } from "@/lib/services/imported-intervention-promotion.service";
import type {
  Behavior,
  ImportedIntervention,
  Occurrence,
} from "@/lib/types/database";

vi.mock("@/lib/db/behaviors.repo", () => ({
  getBehaviorById: vi.fn(),
}));

vi.mock("@/lib/db/importedInterventions.repo", () => ({
  listImportedInterventionsByIds: vi.fn(),
}));

vi.mock("@/lib/db/occurrences.repo", () => ({
  getOccurrenceById: vi.fn(),
}));

vi.mock("@/lib/db/reminderDeliveries.repo", () => ({
  attachImportProvenanceToPendingReminderDelivery: vi.fn(),
  createMissingReminderDeliveries: vi.fn(),
  listReminderDeliveriesByOccurrenceIds: vi.fn(),
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const IMPORT_RUN_ID = "22222222-2222-4222-8222-222222222222";
const IMPORTED_INTERVENTION_ID = "33333333-3333-4333-8333-333333333333";
const BEHAVIOR_ID = "44444444-4444-4444-8444-444444444444";
const OCCURRENCE_ID = "55555555-5555-4555-8555-555555555555";
const NOW = Temporal.Instant.from("2026-06-18T12:00:00Z");
const FUTURE_OCCURRENCE_AT = "2026-06-19T13:00:00Z";
const FUTURE_SEND_AT = "2026-06-19T12:00:00Z";
const SUPABASE = { kind: "supabase" } as never;

const BASE_BEHAVIOR: ImportedInterventionPromotionBehavior = {
  id: BEHAVIOR_ID,
  userId: USER_ID,
  active: true,
  browserReminderEnabled: true,
  emailReminderEnabled: true,
  reminderOffsetMinutes: 60,
};

const BASE_OCCURRENCE = {
  id: OCCURRENCE_ID,
  userId: USER_ID,
  behaviorId: BEHAVIOR_ID,
  scheduledFor: FUTURE_OCCURRENCE_AT,
  status: "unresolved" as const,
};

const BASE_IMPORTED_INTERVENTION: ImportedInterventionPromotionRecord = {
  id: IMPORTED_INTERVENTION_ID,
  userId: USER_ID,
  importRunId: IMPORT_RUN_ID,
  behaviorId: BEHAVIOR_ID,
  occurrenceId: OCCURRENCE_ID,
  interventionType: "reminder",
  channel: "email",
  deliveryStatus: "pending",
  scheduledSendAt: FUTURE_SEND_AT,
  sourceConfidence: "high",
};

describe("resolveImportedInterventionPromotion", () => {
  it("plans a future pending reminder intervention that matches current reminder settings", () => {
    const result = resolveImportedInterventionPromotion({
      now: NOW,
      selectedImportedInterventionIds: [IMPORTED_INTERVENTION_ID],
      confirmPromotion: true,
      candidates: [candidate()],
      existingReminderDeliveries: [],
    });

    expect(result.deliveryPlans).toEqual([
      {
        userId: USER_ID,
        occurrenceId: OCCURRENCE_ID,
        channel: "email",
        scheduledSendAt: FUTURE_SEND_AT,
        status: "pending",
        importRunId: IMPORT_RUN_ID,
        importedInterventionId: IMPORTED_INTERVENTION_ID,
        existingReminderDeliveryId: null,
      },
    ]);
    expect(result.decisions).toEqual([
      {
        importedInterventionId: IMPORTED_INTERVENTION_ID,
        eligible: true,
        reason: null,
        reminderDeliveryKey: `${OCCURRENCE_ID}:email:${FUTURE_SEND_AT}`,
        existingReminderDeliveryId: null,
      },
    ]);
  });

  it("requires explicit selection and confirmation before planning deliveries", () => {
    expect(
      resolveImportedInterventionPromotion({
        now: NOW,
        selectedImportedInterventionIds: [],
        confirmPromotion: true,
        candidates: [candidate()],
      }),
    ).toMatchObject({
      deliveryPlans: [],
      decisions: [
        {
          eligible: false,
          reason: "selection_required",
        },
      ],
    });

    expect(
      resolveImportedInterventionPromotion({
        now: NOW,
        selectedImportedInterventionIds: [IMPORTED_INTERVENTION_ID],
        confirmPromotion: false,
        candidates: [candidate()],
      }),
    ).toMatchObject({
      deliveryPlans: [],
      decisions: [
        {
          importedInterventionId: IMPORTED_INTERVENTION_ID,
          eligible: false,
          reason: "confirmation_required",
        },
      ],
    });
  });

  it.each([
    ["sent", "not_pending_status"],
    ["failed", "not_pending_status"],
    ["cancelled", "not_pending_status"],
    ["dismissed", "not_pending_status"],
    ["ambiguous", "not_pending_status"],
  ] as const)(
    "keeps %s imported deliveries passive",
    (deliveryStatus, reason) => {
      expect(
        resolveImportedInterventionPromotion({
          now: NOW,
          selectedImportedInterventionIds: [IMPORTED_INTERVENTION_ID],
          confirmPromotion: true,
          candidates: [
            candidate({
              importedIntervention: {
                deliveryStatus,
              },
            }),
          ],
        }).decisions[0],
      ).toMatchObject({
        eligible: false,
        reason,
      });
    },
  );

  it.each([
    [
      "historical",
      candidate({
        importedIntervention: {
          scheduledSendAt: "2026-06-18T11:59:59Z",
        },
      }),
      "historical",
    ],
    [
      "ambiguous source",
      candidate({
        importedIntervention: {
          sourceConfidence: "ambiguous",
        },
      }),
      "ambiguous_source",
    ],
    [
      "unresolved parent",
      candidate({
        behavior: null,
      }),
      "unresolved_parent",
    ],
    [
      "resolved occurrence",
      candidate({
        occurrence: {
          status: "completed",
        },
      }),
      "resolved_occurrence",
    ],
    [
      "inactive behavior",
      candidate({
        behavior: {
          active: false,
        },
      }),
      "inactive_behavior",
    ],
    [
      "disabled channel",
      candidate({
        behavior: {
          emailReminderEnabled: false,
        },
      }),
      "disabled_channel",
    ],
    [
      "mismatched current settings",
      candidate({
        behavior: {
          reminderOffsetMinutes: 30,
        },
      }),
      "mismatched_current_reminder_settings",
    ],
    [
      "not a reminder",
      candidate({
        importedIntervention: {
          interventionType: "prompt",
        },
      }),
      "not_reminder",
    ],
  ] as const)("marks %s records ineligible", (_label, inputCandidate, reason) => {
    expect(
      resolveImportedInterventionPromotion({
        now: NOW,
        selectedImportedInterventionIds: [IMPORTED_INTERVENTION_ID],
        confirmPromotion: true,
        candidates: [inputCandidate],
      }).decisions[0],
    ).toMatchObject({
      eligible: false,
      reason,
    });
  });

  it("prevents duplicate selected imports from planning duplicate operational deliveries", () => {
    const secondImportedId = "33333333-3333-4333-8333-333333333334";
    const result = resolveImportedInterventionPromotion({
      now: NOW,
      selectedImportedInterventionIds: [
        IMPORTED_INTERVENTION_ID,
        secondImportedId,
      ],
      confirmPromotion: true,
      candidates: [
        candidate(),
        candidate({
          importedIntervention: {
            id: secondImportedId,
          },
        }),
      ],
    });

    expect(result.deliveryPlans).toHaveLength(1);
    expect(result.decisions[1]).toMatchObject({
      importedInterventionId: secondImportedId,
      eligible: false,
      reason: "duplicate_selection",
    });
  });

  it("links an existing pending delivery but refuses sent or differently sourced deliveries", () => {
    const pendingExisting = existingDelivery({
      importedInterventionId: null,
    });
    expect(
      resolveImportedInterventionPromotion({
        now: NOW,
        selectedImportedInterventionIds: [IMPORTED_INTERVENTION_ID],
        confirmPromotion: true,
        candidates: [candidate()],
        existingReminderDeliveries: [pendingExisting],
      }),
    ).toMatchObject({
      deliveryPlans: [
        {
          existingReminderDeliveryId: "delivery-1",
        },
      ],
      decisions: [
        {
          eligible: true,
          existingReminderDeliveryId: "delivery-1",
        },
      ],
    });

    expect(
      resolveImportedInterventionPromotion({
        now: NOW,
        selectedImportedInterventionIds: [IMPORTED_INTERVENTION_ID],
        confirmPromotion: true,
        candidates: [candidate()],
        existingReminderDeliveries: [
          existingDelivery({
            status: "sent",
          }),
        ],
      }).decisions[0],
    ).toMatchObject({
      eligible: false,
      reason: "existing_delivery_not_pending",
    });

    expect(
      resolveImportedInterventionPromotion({
        now: NOW,
        selectedImportedInterventionIds: [IMPORTED_INTERVENTION_ID],
        confirmPromotion: true,
        candidates: [candidate()],
        existingReminderDeliveries: [
          existingDelivery({
            importedInterventionId: "99999999-9999-4999-8999-999999999999",
          }),
        ],
      }).decisions[0],
    ).toMatchObject({
      eligible: false,
      reason: "existing_delivery_has_different_import_source",
    });
  });

  it("normalizes equivalent UTC timestamp spellings before comparing settings", () => {
    const result = resolveImportedInterventionPromotion({
      now: NOW,
      selectedImportedInterventionIds: [IMPORTED_INTERVENTION_ID],
      confirmPromotion: true,
      candidates: [
        candidate({
          importedIntervention: {
            scheduledSendAt: "2026-06-19T12:00:00+00:00",
          },
        }),
      ],
    });

    expect(result.deliveryPlans).toHaveLength(1);
    expect(result.decisions[0]).toMatchObject({ eligible: true });
  });
});

describe("promoteImportedInterventionsToReminderDeliveries", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(listImportedInterventionsByIds).mockResolvedValue([
      importedInterventionRow(),
    ]);
    vi.mocked(getBehaviorById).mockResolvedValue({
      ...behaviorRow(),
      category: null,
      schedule_slots: [],
    });
    vi.mocked(getOccurrenceById).mockResolvedValue(occurrenceRow());
    vi.mocked(listReminderDeliveriesByOccurrenceIds).mockResolvedValue([]);
    vi.mocked(createMissingReminderDeliveries).mockResolvedValue();
    vi.mocked(attachImportProvenanceToPendingReminderDelivery).mockResolvedValue();
  });

  it("creates pending reminder deliveries with import provenance and no provider calls", async () => {
    await expect(
      promoteImportedInterventionsToReminderDeliveries({
        supabase: SUPABASE,
        userId: USER_ID,
        selectedImportedInterventionIds: [IMPORTED_INTERVENTION_ID],
        confirmPromotion: true,
        now: NOW,
      }),
    ).resolves.toMatchObject({
      promotedCount: 1,
      ineligibleCount: 0,
    });

    expect(listImportedInterventionsByIds).toHaveBeenCalledWith(SUPABASE, {
      userId: USER_ID,
      ids: [IMPORTED_INTERVENTION_ID],
    });
    expect(createMissingReminderDeliveries).toHaveBeenCalledWith(SUPABASE, [
      expect.objectContaining({
        user_id: USER_ID,
        occurrence_id: OCCURRENCE_ID,
        channel: "email",
        scheduled_send_at: FUTURE_SEND_AT,
        status: "pending",
        sent_at: null,
        processing_started_at: null,
        error: null,
        import_run_id: IMPORT_RUN_ID,
        imported_intervention_id: IMPORTED_INTERVENTION_ID,
      }),
    ]);
    expect(attachImportProvenanceToPendingReminderDelivery).toHaveBeenCalledWith(
      SUPABASE,
      {
        userId: USER_ID,
        occurrenceId: OCCURRENCE_ID,
        channel: "email",
        scheduledSendAt: FUTURE_SEND_AT,
        importRunId: IMPORT_RUN_ID,
        importedInterventionId: IMPORTED_INTERVENTION_ID,
      },
    );
  });

  it("does not write deliveries when promotion is not confirmed", async () => {
    const result = await promoteImportedInterventionsToReminderDeliveries({
      supabase: SUPABASE,
      userId: USER_ID,
      selectedImportedInterventionIds: [IMPORTED_INTERVENTION_ID],
      confirmPromotion: false,
      now: NOW,
    });

    expect(result).toMatchObject({
      promotedCount: 0,
      ineligibleCount: 1,
      decisions: [
        {
          reason: "confirmation_required",
        },
      ],
    });
    expect(createMissingReminderDeliveries).not.toHaveBeenCalled();
    expect(attachImportProvenanceToPendingReminderDelivery).not.toHaveBeenCalled();
  });

  it("does not promote historical or resolved occurrence records", async () => {
    vi.mocked(listImportedInterventionsByIds).mockResolvedValue([
      importedInterventionRow({
        scheduled_send_at: "2026-06-18T11:00:00Z",
      }),
    ]);

    const historical = await promoteImportedInterventionsToReminderDeliveries({
      supabase: SUPABASE,
      userId: USER_ID,
      selectedImportedInterventionIds: [IMPORTED_INTERVENTION_ID],
      confirmPromotion: true,
      now: NOW,
    });

    expect(historical.decisions[0]).toMatchObject({
      eligible: false,
      reason: "historical",
    });
    expect(createMissingReminderDeliveries).not.toHaveBeenCalled();

    vi.clearAllMocks();
    vi.mocked(listImportedInterventionsByIds).mockResolvedValue([
      importedInterventionRow(),
    ]);
    vi.mocked(getBehaviorById).mockResolvedValue({
      ...behaviorRow(),
      category: null,
      schedule_slots: [],
    });
    vi.mocked(getOccurrenceById).mockResolvedValue({
      ...occurrenceRow(),
      status: "completed",
    });
    vi.mocked(listReminderDeliveriesByOccurrenceIds).mockResolvedValue([]);

    const resolved = await promoteImportedInterventionsToReminderDeliveries({
      supabase: SUPABASE,
      userId: USER_ID,
      selectedImportedInterventionIds: [IMPORTED_INTERVENTION_ID],
      confirmPromotion: true,
      now: NOW,
    });

    expect(resolved.decisions[0]).toMatchObject({
      eligible: false,
      reason: "resolved_occurrence",
    });
    expect(createMissingReminderDeliveries).not.toHaveBeenCalled();
  });
});

describe("imported intervention promotion provenance migration", () => {
  it("adds nullable reminder delivery provenance columns and constraints", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260618222427_add_imported_intervention_promotion_provenance.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("add column import_run_id uuid");
    expect(migration).toContain("add column imported_intervention_id uuid");
    expect(migration).toContain(
      "reminder_deliveries_import_provenance_pair_check",
    );
    expect(migration).toContain(
      "reminder_deliveries_imported_intervention_owner_fkey",
    );
    expect(migration).toContain(
      "reminder_deliveries_imported_intervention_id_key",
    );
  });
});

function candidate(
  overrides: {
    importedIntervention?: Partial<ImportedInterventionPromotionRecord>;
    behavior?: Partial<ImportedInterventionPromotionBehavior> | null;
    occurrence?: Partial<ImportedInterventionPromotionOccurrence> | null;
  } = {},
): ImportedInterventionPromotionCandidate {
  return {
    importedIntervention: {
      ...BASE_IMPORTED_INTERVENTION,
      ...overrides.importedIntervention,
    },
    behavior:
      overrides.behavior === null
        ? null
        : {
            ...BASE_BEHAVIOR,
            ...overrides.behavior,
          },
    occurrence:
      overrides.occurrence === null
        ? null
        : {
            ...BASE_OCCURRENCE,
            ...overrides.occurrence,
          },
  };
}

function existingDelivery(
  overrides: Partial<ExistingReminderDeliveryForPromotion> = {},
): ExistingReminderDeliveryForPromotion {
  return {
    id: "delivery-1",
    userId: USER_ID,
    occurrenceId: OCCURRENCE_ID,
    channel: "email",
    scheduledSendAt: FUTURE_SEND_AT,
    status: "pending",
    processingStartedAt: null,
    importedInterventionId: null,
    ...overrides,
  };
}

function importedInterventionRow(
  overrides: Partial<ImportedIntervention> = {},
): ImportedIntervention {
  return {
    id: IMPORTED_INTERVENTION_ID,
    user_id: USER_ID,
    import_run_id: IMPORT_RUN_ID,
    external_id: "intervention-1",
    behavior_external_id: "behavior-1",
    occurrence_external_id: "occurrence-1",
    behavior_id: BEHAVIOR_ID,
    occurrence_id: OCCURRENCE_ID,
    intervention_type: "reminder",
    channel: "email",
    delivery_status: "pending",
    scheduled_send_at: FUTURE_SEND_AT,
    sent_at: null,
    failure_reason: null,
    source_original_id: null,
    source_capture_method: "system_generated",
    source_confidence: "high",
    redacted_sensitivity_indicators: {},
    metadata: {},
    created_at: "2026-06-18T10:00:00Z",
    updated_at: "2026-06-18T10:00:00Z",
    ...overrides,
  };
}

function behaviorRow(overrides: Partial<Behavior> = {}): Behavior {
  return {
    id: BEHAVIOR_ID,
    user_id: USER_ID,
    category_id: null,
    title: "Brush teeth",
    description: null,
    recurrence_rule: { type: "daily", interval: 1 },
    scheduled_time: "09:00:00",
    timezone: "America/New_York",
    browser_reminder_enabled: true,
    email_reminder_enabled: true,
    reminder_offset_minutes: 60,
    active: true,
    archived_at: null,
    current_configuration_event_id: null,
    created_at: "2026-06-01T10:00:00Z",
    updated_at: "2026-06-01T10:00:00Z",
    ...overrides,
  };
}

function occurrenceRow(overrides: Partial<Occurrence> = {}): Occurrence {
  return {
    id: OCCURRENCE_ID,
    user_id: USER_ID,
    behavior_id: BEHAVIOR_ID,
    behavior_schedule_slot_id: null,
    behavior_configuration_event_id: null,
    scheduled_for: FUTURE_OCCURRENCE_AT,
    local_date: "2026-06-19",
    schedule_kind: "exact",
    schedule_preset: null,
    schedule_start_time: "09:00:00",
    schedule_end_time: null,
    status: "unresolved",
    completed_at: null,
    status_marked_at: null,
    note: null,
    created_at: "2026-06-18T10:00:00Z",
    updated_at: "2026-06-18T10:00:00Z",
    ...overrides,
  };
}
