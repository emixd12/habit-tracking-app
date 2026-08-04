import { afterEach, describe, expect, it, vi } from "vitest";

import {
  captureCompletionChimeIntent,
  createStatusSubmissionEventHandlers,
} from "../components/timeline/StatusButtons";
import {
  COMPLETION_CHIME_PLAYED_EVENT,
  playCompletionChime,
  prepareCompletionChimeForUserGesture,
} from "../lib/ui/completion-feedback";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("StatusButtons completion chime", () => {
  it("submits once and makes one media playback attempt for one mobile Completed activation", async () => {
    const { MockAudio, dispatchEvent } = installMediaMocks();
    const submissions = vi.fn();
    const completionChimeIntentRef = { current: null };
    const preparedChimeForSubmitRef = { current: false };
    const handlers = createStatusSubmissionEventHandlers({
      onStatusIntent: () => {
        captureCompletionChimeIntent({
          currentStatus: "unresolved",
          submittedStatus: "completed",
          completionChimeIntentRef,
          preparedChimeForSubmitRef,
          prepareChime: prepareCompletionChimeForUserGesture,
        });
      },
      onStatusSubmit: submissions,
    });

    // Mobile activation dispatches pointerdown, click, then the form submit.
    handlers.onPointerDown();
    handlers.onClick();
    handlers.onSubmit();
    await playCompletionChime();

    const playbackAudio = MockAudio.instances[0];

    expect(submissions).toHaveBeenCalledTimes(1);
    expect(MockAudio.instances).toHaveLength(1);
    expect(playbackAudio.play).toHaveBeenCalledTimes(1);
    const playbackStartEvents = dispatchEvent.mock.calls.filter(
      ([event]) => event.type === COMPLETION_CHIME_PLAYED_EVENT,
    );

    expect(playbackStartEvents).toHaveLength(1);
    expect(playbackStartEvents[0]?.[0]).toEqual(
      expect.objectContaining({
        detail: { source: "media" },
        type: COMPLETION_CHIME_PLAYED_EVENT,
      }),
    );
  });

  it("does not prepare audio for Not Completed or an already Completed occurrence", () => {
    const prepareChime = vi.fn();
    const completionChimeIntentRef = { current: null };
    const preparedChimeForSubmitRef = { current: false };

    captureCompletionChimeIntent({
      currentStatus: "unresolved",
      submittedStatus: "not_completed",
      completionChimeIntentRef,
      preparedChimeForSubmitRef,
      prepareChime,
    });
    captureCompletionChimeIntent({
      currentStatus: "completed",
      submittedStatus: "completed",
      completionChimeIntentRef,
      preparedChimeForSubmitRef,
      prepareChime,
    });

    expect(prepareChime).not.toHaveBeenCalled();
  });
});

function installMediaMocks() {
  const dispatchEvent = vi.fn();

  class MockCustomEvent<T = unknown> extends Event {
    detail: T;

    constructor(type: string, eventInitDict?: CustomEventInit<T>) {
      super(type);
      this.detail = eventInitDict?.detail as T;
    }
  }

  class MockAudio {
    static instances: MockAudio[] = [];

    currentTime = 0;
    load = vi.fn();
    muted = false;
    pause = vi.fn();
    play = vi.fn(() => Promise.resolve());
    preload = "";
    volume = 1;

    constructor(public src: string) {
      MockAudio.instances.push(this);
    }
  }

  vi.stubGlobal("Audio", MockAudio);
  vi.stubGlobal("CustomEvent", MockCustomEvent);
  vi.stubGlobal("window", { dispatchEvent });

  return { MockAudio, dispatchEvent };
}
