import { describe, expect, it } from "vitest";

import { shouldPlayCompletionChime } from "../lib/ui/completion-feedback";

describe("completion feedback", () => {
  it("plays when an occurrence moves into Completed", () => {
    expect(
      shouldPlayCompletionChime({
        currentStatus: "unresolved",
        nextStatus: "done",
      }),
    ).toBe(true);
    expect(
      shouldPlayCompletionChime({
        currentStatus: "not_done",
        nextStatus: "done",
      }),
    ).toBe(true);
  });

  it("stays quiet for non-completion submissions", () => {
    expect(
      shouldPlayCompletionChime({
        currentStatus: "unresolved",
        nextStatus: "not_done",
      }),
    ).toBe(false);
    expect(
      shouldPlayCompletionChime({
        currentStatus: "done",
        nextStatus: "done",
      }),
    ).toBe(false);
    expect(
      shouldPlayCompletionChime({
        currentStatus: "unresolved",
        nextStatus: null,
      }),
    ).toBe(false);
  });
});
