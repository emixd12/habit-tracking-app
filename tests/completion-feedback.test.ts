import { afterEach, describe, expect, it, vi } from "vitest";

import {
  COMPLETION_CHIME_BLOCKED_EVENT,
  COMPLETION_CHIME_PLAYED_EVENT,
  shouldPlayCompletionChime,
} from "../lib/ui/completion-feedback";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("completion feedback", () => {
  it("plays when an occurrence moves into Completed", () => {
    expect(
      shouldPlayCompletionChime({
        currentStatus: "unresolved",
        nextStatus: "completed",
      }),
    ).toBe(true);
    expect(
      shouldPlayCompletionChime({
        currentStatus: "not_completed",
        nextStatus: "completed",
      }),
    ).toBe(true);
  });

  it("stays quiet for non-completion submissions", () => {
    expect(
      shouldPlayCompletionChime({
        currentStatus: "unresolved",
        nextStatus: "not_completed",
      }),
    ).toBe(false);
    expect(
      shouldPlayCompletionChime({
        currentStatus: "completed",
        nextStatus: "completed",
      }),
    ).toBe(false);
    expect(
      shouldPlayCompletionChime({
        currentStatus: "unresolved",
        nextStatus: null,
      }),
    ).toBe(false);
  });

  it("primes Web Audio synchronously inside the user gesture", async () => {
    const { MockAudioContext, dispatchEvent } = installAudioMocks();
    const { prepareCompletionChimeForUserGesture } = await import(
      "../lib/ui/completion-feedback"
    );

    prepareCompletionChimeForUserGesture();

    const context = MockAudioContext.instances[0];

    expect(context).toBeDefined();
    expect(context.startedSources).toBe(1);
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("reports when buffer playback starts", async () => {
    const { MockAudioContext, dispatchEvent } = installAudioMocks();
    const { prepareCompletionChimeForUserGesture, playCompletionChime } =
      await import("../lib/ui/completion-feedback");

    prepareCompletionChimeForUserGesture();
    await flushPromises();
    playCompletionChime();
    await flushPromises();

    const context = MockAudioContext.instances[0];

    expect(context.startedSources).toBe(2);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          source: "buffer",
        },
        type: COMPLETION_CHIME_PLAYED_EVENT,
      }),
    );
  });

  it("prefers an unlocked media element when available", async () => {
    const { dispatchEvent, MockAudio } = installMediaMocks();
    const { prepareCompletionChimeForUserGesture, playCompletionChime } =
      await import("../lib/ui/completion-feedback");

    prepareCompletionChimeForUserGesture();
    await flushPromises();
    await playCompletionChime();

    const audio = MockAudio.instances[0];

    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.pause).toHaveBeenCalledTimes(2);
    expect(audio.muted).toBe(false);
    expect(audio.volume).toBe(1);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          source: "media",
        },
        type: COMPLETION_CHIME_PLAYED_EVENT,
      }),
    );
  });

  it("reports blocked playback when no browser audio API is available", async () => {
    const dispatchEvent = installNoAudioMocks();
    const { playCompletionChime } = await import(
      "../lib/ui/completion-feedback"
    );

    playCompletionChime();
    await flushPromises();

    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          source: "buffer",
        },
        type: COMPLETION_CHIME_BLOCKED_EVENT,
      }),
    );
  });
});

function installAudioMocks() {
  const dispatchEvent = vi.fn();

  class MockCustomEvent<T = unknown> extends Event {
    detail: T;

    constructor(type: string, eventInitDict?: CustomEventInit<T>) {
      super(type);
      this.detail = eventInitDict?.detail as T;
    }
  }

  class MockAudioContext {
    static instances: MockAudioContext[] = [];

    destination = {};
    resume = vi.fn(async () => {
      this.state = "running";
    });
    sampleRate = 44100;
    state: AudioContextState = "suspended";
    startedSources = 0;

    constructor() {
      MockAudioContext.instances.push(this);
    }

    createBuffer(): AudioBuffer {
      return { duration: 0 } as AudioBuffer;
    }

    createBufferSource(): AudioBufferSourceNode {
      return {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(() => {
          this.startedSources += 1;
        }),
      } as unknown as AudioBufferSourceNode;
    }

    createGain(): GainNode {
      return {
        connect: vi.fn(),
        gain: {
          value: 1,
        },
      } as unknown as GainNode;
    }

    async decodeAudioData(): Promise<AudioBuffer> {
      return { duration: 0.4 } as AudioBuffer;
    }
  }

  vi.stubGlobal("CustomEvent", MockCustomEvent);
  vi.stubGlobal("fetch", async () => new Response(new Uint8Array([1, 2, 3])));
  vi.stubGlobal("window", {
    AudioContext: MockAudioContext,
    dispatchEvent,
  });

  return { MockAudioContext, dispatchEvent };
}

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
    play = vi.fn(async () => undefined);
    preload = "";
    volume = 1;

    constructor(public src: string) {
      MockAudio.instances.push(this);
    }
  }

  vi.stubGlobal("Audio", MockAudio);
  vi.stubGlobal("CustomEvent", MockCustomEvent);
  vi.stubGlobal("window", {
    dispatchEvent,
  });

  return { dispatchEvent, MockAudio };
}

function installNoAudioMocks() {
  const dispatchEvent = vi.fn();

  class MockCustomEvent<T = unknown> extends Event {
    detail: T;

    constructor(type: string, eventInitDict?: CustomEventInit<T>) {
      super(type);
      this.detail = eventInitDict?.detail as T;
    }
  }

  vi.stubGlobal("CustomEvent", MockCustomEvent);
  vi.stubGlobal("window", {
    dispatchEvent,
  });

  return dispatchEvent;
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
