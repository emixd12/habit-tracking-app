import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  resolveActionStateForRequest,
  TimeTracker,
} from "@/components/timeline/TimeTracker";
import type {
  TimeTrackingActionState,
  TimeTrackingFormAction,
} from "@/lib/types/timeline";

const action: TimeTrackingFormAction = async (state) => state;
const IDLE: TimeTrackingActionState = { status: "idle", message: "" };

describe("Timeline time tracking", () => {
  it("renders idle, running, and recorded controls with the required labels", () => {
    const idle = renderToStaticMarkup(
      <TimeTracker
        occurrenceId="occurrence-1"
        tracking={{ recordedSeconds: 0, runningStartedAt: null }}
        canStart
        startAction={action}
        stopAction={action}
        resetAction={action}
      />,
    );
    const running = renderToStaticMarkup(
      <TimeTracker
        occurrenceId="occurrence-1"
        tracking={{ recordedSeconds: 65, runningStartedAt: "2026-08-02T14:00:00Z" }}
        canStart
        startAction={action}
        stopAction={action}
        resetAction={action}
      />,
    );
    const stopped = renderToStaticMarkup(
      <TimeTracker
        occurrenceId="occurrence-1"
        tracking={{ recordedSeconds: 65, runningStartedAt: null }}
        canStart
        startAction={action}
        stopAction={action}
        resetAction={action}
      />,
    );

    expect(idle).toContain(">Track Time</button>");
    expect(running).toContain(">Stop</button>");
    expect(running).toContain(">Reset tracked time</button>");
    expect(stopped).toContain("00:01:05");
    expect(stopped).toContain(">Track Time</button>");
    expect(stopped).toContain(">Reset tracked time</button>");
  });

  it("accepts only the latest response across start, stop, reset, then start", () => {
    const firstStart: TimeTrackingActionState = {
      status: "success",
      message: "Time tracking started.",
      requestId: "start-1",
      tracking: { recordedSeconds: 0, runningStartedAt: "2026-08-02T14:00:00Z" },
    };
    const stop: TimeTrackingActionState = {
      status: "success",
      message: "Time tracking stopped.",
      requestId: "stop-2",
      tracking: { recordedSeconds: 20, runningStartedAt: null },
    };
    const reset: TimeTrackingActionState = {
      status: "success",
      message: "Tracked time reset.",
      requestId: "reset-3",
      tracking: { recordedSeconds: 0, runningStartedAt: null },
    };
    const secondStart: TimeTrackingActionState = {
      status: "success",
      message: "Time tracking started.",
      requestId: "start-4",
      tracking: { recordedSeconds: 0, runningStartedAt: "2026-08-02T15:00:00Z" },
    };

    expect(resolveActionStateForRequest("stop-2", firstStart, stop, IDLE)).toBe(stop);
    expect(resolveActionStateForRequest("reset-3", firstStart, stop, reset)).toBe(reset);
    expect(resolveActionStateForRequest("start-4", secondStart, stop, reset)).toBe(secondStart);
    expect(resolveActionStateForRequest("start-4", firstStart, stop, reset)).toBeNull();
  });
});
