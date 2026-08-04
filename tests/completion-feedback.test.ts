import { afterEach, describe, expect, it, vi } from "vitest";

import {
  COMPLETION_CHIME_BLOCKED_EVENT,
  COMPLETION_CHIME_PLAYED_EVENT,
  shouldPlayCompletionChime,
  shouldPlayCompletionChimeForStatusSuccess,
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
    expect(
      shouldPlayCompletionChime({
        currentStatus: "completed",
        nextStatus: "unresolved",
      }),
    ).toBe(false);
  });

  it("allows an unresolved to completed intent after the server confirms completed", () => {
    expect(
      shouldPlayCompletionChimeForStatusSuccess({
        intent: {
          currentStatus: "unresolved",
          submittedStatus: "completed",
        },
        serverNextStatus: "completed",
      }),
    ).toBe(true);
  });

  it("allows a not completed to completed intent after the server confirms completed", () => {
    expect(
      shouldPlayCompletionChimeForStatusSuccess({
        intent: {
          currentStatus: "not_completed",
          submittedStatus: "completed",
        },
        serverNextStatus: "completed",
      }),
    ).toBe(true);
  });

  it("stays quiet when an already completed occurrence is submitted as completed", () => {
    expect(
      shouldPlayCompletionChimeForStatusSuccess({
        intent: {
          currentStatus: "completed",
          submittedStatus: "completed",
        },
        serverNextStatus: "completed",
      }),
    ).toBe(false);
  });

  it("stays quiet when completed intent is not confirmed by the server status", () => {
    expect(
      shouldPlayCompletionChimeForStatusSuccess({
        intent: {
          currentStatus: "unresolved",
          submittedStatus: "completed",
        },
        serverNextStatus: "not_completed",
      }),
    ).toBe(false);
    expect(
      shouldPlayCompletionChimeForStatusSuccess({
        intent: {
          currentStatus: "unresolved",
          submittedStatus: "completed",
        },
      }),
    ).toBe(false);
  });

  it("requires a captured user intent before a completed success may chime", () => {
    expect(
      shouldPlayCompletionChimeForStatusSuccess({
        intent: null,
        serverNextStatus: "completed",
      }),
    ).toBe(false);
  });

  it("stays quiet when a resolved occurrence is submitted as unresolved", () => {
    expect(
      shouldPlayCompletionChimeForStatusSuccess({
        intent: {
          currentStatus: "completed",
          submittedStatus: "unresolved",
        },
        serverNextStatus: "unresolved",
      }),
    ).toBe(false);
  });

  it("preloads the completion chime only once per module instance", async () => {
    const { MockAudio } = installAudioMocks({ mediaPlay: "resolve" });
    const { preloadCompletionChime } = await import(
      "../lib/ui/completion-feedback"
    );

    preloadCompletionChime();
    preloadCompletionChime();

    expect(MockAudio.instances).toHaveLength(1);
    expect(MockAudio.instances[0]?.load).toHaveBeenCalledTimes(1);
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

  it("starts one media element after a prepared successful completion", async () => {
    const { dispatchEvent, MockAudio } = installMediaMocks();
    const { prepareCompletionChimeForUserGesture, playCompletionChime } =
      await import("../lib/ui/completion-feedback");

    prepareCompletionChimeForUserGesture();
    await flushPromises();
    await playCompletionChime();

    const playbackAudio = MockAudio.instances[0];

    expect(MockAudio.instances).toHaveLength(1);
    expect(playbackAudio.play).toHaveBeenCalledTimes(1);
    expect(playbackAudio.pause).toHaveBeenCalledTimes(1);
    expect(playbackAudio.muted).toBe(false);
    expect(playbackAudio.volume).toBe(1);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          source: "media",
        },
        type: COMPLETION_CHIME_PLAYED_EVENT,
      }),
    );
  });

  it("does not start media playback while preparing the user gesture", async () => {
    const { dispatchEvent, MockAudio, playCalls } = installMediaMocks({
      deferPlay: true,
    });
    const { prepareCompletionChimeForUserGesture, playCompletionChime } =
      await import("../lib/ui/completion-feedback");

    prepareCompletionChimeForUserGesture();

    expect(MockAudio.instances).toHaveLength(0);
    expect(playCalls).toHaveLength(0);

    const playbackPromise = playCompletionChime();
    const playbackAudio = MockAudio.instances[0];

    expect(playbackAudio).toBeDefined();
    expect(playbackAudio.muted).toBe(false);
    expect(playbackAudio.volume).toBe(1);
    expect(playCalls).toHaveLength(1);
    expect(playCalls[0]?.audio).toBe(playbackAudio);

    playCalls[0]?.resolve();
    await playbackPromise;

    playbackAudio.currentTime = 0.42;
    playbackAudio.muted = false;
    playbackAudio.volume = 1;

    await flushPromises();

    expect(playbackAudio.pause).toHaveBeenCalledTimes(1);
    expect(playbackAudio.currentTime).toBe(0.42);
    expect(playbackAudio.muted).toBe(false);
    expect(playbackAudio.volume).toBe(1);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          source: "media",
        },
        type: COMPLETION_CHIME_PLAYED_EVENT,
      }),
    );
  });

  it("falls back to a synthesized chime when media playback and MP3 decode fail", async () => {
    const { dispatchEvent, MockAudio, MockAudioContext } = installAudioMocks({
      decodeFails: true,
      mediaPlay: "reject",
    });
    const { playCompletionChime } = await import(
      "../lib/ui/completion-feedback"
    );

    await playCompletionChime();

    const playbackAudio = MockAudio.instances[0];
    const context = MockAudioContext.instances[0];

    expect(playbackAudio.play).toHaveBeenCalledTimes(1);
    expect(context.startedSources).toBe(0);
    expect(context.startedOscillators).toBe(1);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          source: "synth",
        },
        type: COMPLETION_CHIME_PLAYED_EVENT,
      }),
    );
    expect(dispatchEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: COMPLETION_CHIME_BLOCKED_EVENT,
      }),
    );
  });

  it("reports blocked when media and decode fail with no oscillator support", async () => {
    const { dispatchEvent, MockAudioContext } = installAudioMocks({
      decodeFails: true,
      mediaPlay: "reject",
      oscillator: false,
    });
    const { playCompletionChime } = await import(
      "../lib/ui/completion-feedback"
    );

    await playCompletionChime();

    const context = MockAudioContext.instances[0];

    expect(context.startedSources).toBe(0);
    expect(context.startedOscillators).toBe(0);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          source: "synth",
        },
        type: COMPLETION_CHIME_BLOCKED_EVENT,
      }),
    );
  });

  it("reports blocked playback when no browser audio API is available", async () => {
    const dispatchEvent = installNoAudioMocks();
    const { playCompletionChime } = await import(
      "../lib/ui/completion-feedback"
    );

    await playCompletionChime();

    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          source: "synth",
        },
        type: COMPLETION_CHIME_BLOCKED_EVENT,
      }),
    );
  });
});

function installAudioMocks(
  options: Readonly<{
    decodeFails?: boolean;
    mediaPlay?: "none" | "reject" | "resolve";
    oscillator?: boolean;
  }> = {},
) {
  const dispatchEvent = vi.fn();
  const mediaPlay = options.mediaPlay ?? "none";

  class MockCustomEvent<T = unknown> extends Event {
    detail: T;

    constructor(type: string, eventInitDict?: CustomEventInit<T>) {
      super(type);
      this.detail = eventInitDict?.detail as T;
    }
  }

  class MockAudioContext {
    static instances: MockAudioContext[] = [];

    currentTime = 0;
    destination = {};
    resume = vi.fn(async () => {
      this.state = "running";
    });
    sampleRate = 44100;
    state: AudioContextState = "suspended";
    startedOscillators = 0;
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

    createOscillator =
      options.oscillator === false
        ? undefined
        : vi.fn(() => {
            return {
              connect: vi.fn(),
              frequency: createMockAudioParam(),
              start: vi.fn(() => {
                this.startedOscillators += 1;
              }),
              stop: vi.fn(),
              type: "sine",
            } as unknown as OscillatorNode;
          });

    createGain(): GainNode {
      return {
        connect: vi.fn(),
        gain: createMockAudioParam(),
      } as unknown as GainNode;
    }

    async decodeAudioData(): Promise<AudioBuffer> {
      if (options.decodeFails) {
        throw new Error("decode failed");
      }

      return { duration: 0.4 } as AudioBuffer;
    }
  }

  class MockAudio {
    static instances: MockAudio[] = [];

    currentTime = 0;
    load = vi.fn();
    muted = false;
    pause = vi.fn();
    play = vi.fn(() => {
      if (mediaPlay === "reject") {
        return Promise.reject(new Error("media playback rejected"));
      }

      return Promise.resolve();
    });
    preload = "";
    volume = 1;

    constructor(public src: string) {
      MockAudio.instances.push(this);
    }
  }

  if (mediaPlay !== "none") {
    vi.stubGlobal("Audio", MockAudio);
  }

  vi.stubGlobal("CustomEvent", MockCustomEvent);
  vi.stubGlobal("fetch", async () => new Response(new Uint8Array([1, 2, 3])));
  vi.stubGlobal("window", {
    AudioContext: MockAudioContext,
    dispatchEvent,
  });

  return { dispatchEvent, MockAudio, MockAudioContext };
}

function createMockAudioParam(): AudioParam {
  return {
    exponentialRampToValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    value: 1,
  } as unknown as AudioParam;
}

function installMediaMocks(
  options: Readonly<{
    deferPlay?: boolean;
  }> = {},
) {
  const dispatchEvent = vi.fn();
  const playCalls: Array<{
    audio: unknown;
    resolve: () => void;
    reject: (reason?: unknown) => void;
  }> = [];

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
    play = vi.fn(() => {
      if (!options.deferPlay) {
        return Promise.resolve();
      }

      let resolvePlay!: () => void;
      let rejectPlay!: (reason?: unknown) => void;
      const promise = new Promise<void>((resolve, reject) => {
        resolvePlay = resolve;
        rejectPlay = reject;
      });

      playCalls.push({
        audio: this,
        resolve: resolvePlay,
        reject: rejectPlay,
      });

      return promise;
    });
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

  return { dispatchEvent, MockAudio, playCalls };
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
