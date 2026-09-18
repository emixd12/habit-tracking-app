import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  localCommand: vi.fn(),
  resolveDueBehaviorArchives: vi.fn(),
  setBehaviorActive: vi.fn(),
  createLocalBehaviorStore: vi.fn(),
}));

vi.mock("../apps/desktop/src/local-store", () => ({
  localCommand: mocks.localCommand,
}));
vi.mock("@cadence/core/resolvers/occurrence.resolver", () => ({
  resolveDueBehaviorArchives: mocks.resolveDueBehaviorArchives,
}));
vi.mock("@cadence/core/services/behavior.service", () => ({
  setBehaviorActive: mocks.setBehaviorActive,
}));
vi.mock("../apps/desktop/src/local-behavior.service", () => ({
  createLocalBehaviorStore: mocks.createLocalBehaviorStore,
}));

describe("desktop Behavior end-date lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.localCommand.mockImplementation((command: string) => {
      if (command === "readProfile") return Promise.resolve({ id: "profile-1" });
      if (command === "readBehaviorGraphs") return Promise.resolve([{
        behavior: {
          id: "behavior-1",
          active: true,
          end_date: "2026-09-18",
          timezone: "America/New_York",
          updated_at: "2026-09-17T15:00:00Z",
        },
      }]);
      throw new Error(`Unexpected command: ${command}`);
    });
    mocks.createLocalBehaviorStore.mockReturnValue({ kind: "store" });
    mocks.resolveDueBehaviorArchives.mockReturnValue([{
      id: "behavior-1",
      endDate: "2026-09-18",
      effectiveAt: "2026-09-18T04:00:00Z",
      effectiveLocalDate: "2026-09-18",
    }]);
    mocks.setBehaviorActive.mockResolvedValue({
      active: false,
      auto_archived_at: "2026-09-18T15:00:00Z",
    });
    vi.stubGlobal("crypto", { randomUUID: () => "archive-note-1" });
  });

  it("archives planned Behaviors through the shared atomic service", async () => {
    const now = Temporal.Instant.from("2026-09-18T15:00:00Z");
    const { reconcileLocalBehaviorEndDates } = await import(
      "../apps/desktop/src/local-behavior-lifecycle.service"
    );

    await expect(reconcileLocalBehaviorEndDates(now)).resolves.toBe(1);

    expect(mocks.resolveDueBehaviorArchives).toHaveBeenCalledWith({
      now,
      behaviors: [{
        id: "behavior-1",
        active: true,
        endDate: "2026-09-18",
        timezone: "America/New_York",
      }],
    });
    expect(mocks.setBehaviorActive).toHaveBeenCalledWith(
      { kind: "store" },
      {
        behaviorId: "behavior-1",
        active: false,
        automatic: true,
        expectedUpdatedAt: "2026-09-17T15:00:00Z",
        recordedAt: "2026-09-18T15:00:00Z",
        effectiveAt: "2026-09-18T04:00:00Z",
        newArchiveNoteId: "archive-note-1",
      },
    );
  });
});
