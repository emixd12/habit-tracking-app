import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import {
  AccountDeletionPanel,
  isAccountDeletionReady,
  type DeleteAccountAction,
} from "../components/settings/AccountDeletionPanel";
import {
  TimezonePanel,
  type TimezoneUpdateAction,
} from "../components/settings/TimezonePanel";
import { NeedsDecisionDialog } from "../components/timeline/NeedsDecisionDialog";
import { TimelineGroup } from "../components/timeline/TimelineGroup";
import type {
  OccurrenceActionState,
  OccurrenceFormAction,
  TimelineDaySection,
} from "../lib/types/timeline";
import type { TimezoneActionState } from "../lib/types/settings";

const timezoneAction: TimezoneUpdateAction = async (
  state: TimezoneActionState,
) => state;

const deleteAccountAction: DeleteAccountAction = async () => ({
  status: "idle",
  message: "",
});

const occurrenceAction: OccurrenceFormAction = async (
  state: OccurrenceActionState,
) => state;

describe("UX Tickets 049-052 UI regressions", () => {
  it("keeps the Settings timezone anchor separate from the labeled input", () => {
    const html = renderToStaticMarkup(
      <TimezonePanel
        currentTimezone="America/New_York"
        updateTimezoneAction={timezoneAction}
      />,
    );

    expect(html.match(/id="timezone"/g)).toHaveLength(1);
    expect(html).toContain('for="timezone-select"');
    expect(html).toContain('id="timezone-select"');
    expect(html).toContain("<select");
    expect(html).not.toContain("Browser timezone");
    expect(html).not.toContain("datalist");
    expect(html).toContain("Saving updates active behavior schedules");
    expect(html).toContain("Past and resolved history stays unchanged");
  });

  it("mirrors account deletion gates before submit", () => {
    expect(
      isAccountDeletionReady({
        exportAcknowledged: false,
        confirmation: "DELETE",
        confirmationLabel: "DELETE",
      }),
    ).toBe(false);
    expect(
      isAccountDeletionReady({
        exportAcknowledged: true,
        confirmation: "delete",
        confirmationLabel: "DELETE",
      }),
    ).toBe(false);
    expect(
      isAccountDeletionReady({
        exportAcknowledged: true,
        confirmation: " DELETE ",
        confirmationLabel: "DELETE",
      }),
    ).toBe(true);

    const html = renderToStaticMarkup(
      <AccountDeletionPanel
        confirmationLabel="DELETE"
        deleteAccountAction={deleteAccountAction}
      />,
    );

    expect(html).toContain("disabled");
    expect(html).toContain(
      "Deletion unlocks after the export acknowledgement and typed confirmation match.",
    );
  });

  it("clarifies Needs Decision retained rows when there is nothing left to decide", () => {
    const html = renderToStaticMarkup(
      <NeedsDecisionDialog
        title="Needs decision"
        occurrenceCount={0}
        hasRetainedRows
      >
        <span>Retained row</span>
      </NeedsDecisionDialog>,
    );

    expect(html).toContain("Review decisions from today");
    expect(html).toContain(
      "Open Needs decision, no prior unresolved occurrences, review decisions from today",
    );
  });

  it("labels resolved Needs Decision date groups without calling past dates today", () => {
    const html = renderToStaticMarkup(
      <TimelineGroup
        section={needsDecisionSection({
          unresolvedOccurrenceCount: 0,
        })}
        statusAction={occurrenceAction}
        noteAction={occurrenceAction}
        variant="needsDecisionDialog"
      />,
    );

    expect(html).toContain("None left to decide");
    expect(html).not.toContain("All decided today");
    expect(html).not.toContain("0 left to decide");
  });
});

function needsDecisionSection(
  overrides: Partial<TimelineDaySection> = {},
): TimelineDaySection {
  return {
    key: "needs-2026-07-05",
    kind: "needs_decision_day",
    localDate: "2026-07-05",
    label: "Sunday, July 5",
    relativeLabel: "Yesterday",
    emptyMessage: "No behaviors on this day",
    occurrences: [],
    unresolvedOccurrenceCount: 0,
    occurrenceGroups: [],
    ...overrides,
  };
}
