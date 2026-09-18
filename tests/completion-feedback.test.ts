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

  it("suspends the prepared context when a failed save never starts playback", async () => {
    const { MockAudioContext } = installAudioMocks();
    const { prepareCompletionChimeForUserGesture } = await import(
      "../lib/ui/completion-feedback"
    );

    prepareCompletionChimeForUserGesture();
    await flushPromises();

    expect(MockAudioContext.instances[0]?.suspend).toHaveBeenCalledTimes(1);
  });

  it("suspends a new gesture even when the prior suspension is still settling", async () => {
    const { MockAudioContext } = installAudioMocks();
    const { prepareCompletionChimeForUserGesture } = await import(
      "../lib/ui/completion-feedback"
    );
    prepareCompletionChimeForUserGesture();
    await flushPromises();
    const context = MockAudioContext.instances[0]!;
    let suspended!: () => void;
    context.suspend.mockImplementationOnce(() => new Promise<void>((resolve) => { suspended = resolve; }));
    prepareCompletionChimeForUserGesture();
    await flushPromises();
    prepareCompletionChimeForUserGesture();
    await flushPromises();
    suspended();
    await flushPromises();
    expect(context.state).toBe("suspended");
    expect(context.suspend).toHaveBeenCalledTimes(3);
  });

  it("keeps an unlocked context running through pending resume and decode work", async () => {
    const { MockAudioContext, resumeCalls } = installAudioMocks({
      deferResume: true,
    });
    const { prepareCompletionChimeForUserGesture, playCompletionChime } =
      await import("../lib/ui/completion-feedback");

    prepareCompletionChimeForUserGesture();
    const playback = playCompletionChime();
    await flushPromises();

    const context = MockAudioContext.instances[0]!;
    expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(context.suspend).not.toHaveBeenCalled();
    for (const resume of resumeCalls) {
      resume();
    }
    await playback;

    expect(context.startedSources).toBe(2);
    expect(context.suspend).not.toHaveBeenCalled();
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
    expect(context.resume).toHaveBeenCalledTimes(2);
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
    const { dispatchEvent, MockAudio, MockAudioContext } = installAudioMocks({
      mediaPlay: "resolve",
    });
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
    expect(MockAudioContext.instances[0]?.suspend).toHaveBeenCalledTimes(1);
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
    expect(context.suspend).not.toHaveBeenCalled();
    context.oscillators[0]?.onended?.(new Event("ended"));
    expect(context.suspend).toHaveBeenCalledTimes(1);
  });

  it("keeps the context running until overlapping buffer fallbacks both end", async () => {
    const { MockAudioContext } = installAudioMocks();
    const { playCompletionChime } = await import(
      "../lib/ui/completion-feedback"
    );

    await Promise.all([playCompletionChime(), playCompletionChime()]);

    const context = MockAudioContext.instances[0]!;

    expect(context.startedSources).toBe(2);
    expect(context.suspend).not.toHaveBeenCalled();
    context.bufferSources[0]?.onended?.(new Event("ended"));
    expect(context.suspend).not.toHaveBeenCalled();
    context.bufferSources[1]?.onended?.(new Event("ended"));
    expect(context.suspend).toHaveBeenCalledTimes(1);
  });

  it("keeps two plays alive while their shared decode is pending", async () => {
    const { MockAudioContext, decodeResolvers } = installAudioMocks({
      deferDecode: true,
    });
    const { playCompletionChime } = await import(
      "../lib/ui/completion-feedback"
    );

    const first = playCompletionChime();
    const second = playCompletionChime();
    await flushPromises();

    const context = MockAudioContext.instances[0]!;
    expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(context.suspend).not.toHaveBeenCalled();
    decodeResolvers[0]?.();
    await Promise.all([first, second]);

    expect(context.startedSources).toBe(2);
    context.bufferSources[0]?.onended?.(new Event("ended"));
    expect(context.suspend).not.toHaveBeenCalled();
    context.bufferSources[1]?.onended?.(new Event("ended"));
    expect(context.suspend).toHaveBeenCalledTimes(1);
  });

  it("releases failed buffer and synth sources", async () => {
    const { MockAudioContext } = installAudioMocks({
      bufferStartFails: true,
      oscillatorStartFails: true,
    });
    const { playCompletionChime } = await import(
      "../lib/ui/completion-feedback"
    );

    await playCompletionChime();

    const context = MockAudioContext.instances[0]!;
    expect(context.bufferSources[0]?.disconnect).toHaveBeenCalledTimes(1);
    expect(context.oscillators[0]?.disconnect).toHaveBeenCalledTimes(1);
    expect(context.suspend).toHaveBeenCalledTimes(1);
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
    expect(context.suspend).not.toHaveBeenCalled();
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
    bufferStartFails?: boolean;
    decodeFails?: boolean;
    deferDecode?: boolean;
    deferResume?: boolean;
    mediaPlay?: "none" | "reject" | "resolve";
    oscillatorStartFails?: boolean;
    oscillator?: boolean;
  }> = {},
) {
  const dispatchEvent = vi.fn();
  const decodeResolvers: Array<() => void> = [];
  const mediaPlay = options.mediaPlay ?? "none";
  const resumeCalls: Array<() => void> = [];

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
    bufferSources: AudioBufferSourceNode[] = [];
    destination = {};
    resume = vi.fn(() => {
      if (!options.deferResume) {
        this.state = "running";
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        resumeCalls.push(() => {
          this.state = "running";
          resolve();
        });
      });
    });
    suspend = vi.fn(async () => {
      this.state = "suspended";
    });
    sampleRate = 44100;
    oscillators: OscillatorNode[] = [];
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
      const source = {
        buffer: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        onended: null,
        start: vi.fn(() => {
          if (options.bufferStartFails) {
            throw new Error("buffer start failed");
          }
          this.startedSources += 1;
        }),
      } as unknown as AudioBufferSourceNode;
      this.bufferSources.push(source);
      return source;
    }

    createOscillator =
      options.oscillator === false
        ? undefined
        : vi.fn(() => {
            const oscillator = {
              connect: vi.fn(),
              disconnect: vi.fn(),
              frequency: createMockAudioParam(),
              onended: null,
              start: vi.fn(() => {
                if (options.oscillatorStartFails) {
                  throw new Error("oscillator start failed");
                }
                this.startedOscillators += 1;
              }),
              stop: vi.fn(),
              type: "sine",
            } as unknown as OscillatorNode;
            this.oscillators.push(oscillator);
            return oscillator;
          });

    createGain(): GainNode {
      return {
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: createMockAudioParam(),
      } as unknown as GainNode;
    }

    decodeAudioData = vi.fn(async (): Promise<AudioBuffer> => {
      if (options.decodeFails) {
        throw new Error("decode failed");
      }

      if (options.deferDecode) {
        return new Promise<AudioBuffer>((resolve) => {
          decodeResolvers.push(() => resolve({ duration: 0.4 } as AudioBuffer));
        });
      }

      return { duration: 0.4 } as AudioBuffer;
    });
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

  return {
    decodeResolvers,
    dispatchEvent,
    MockAudio,
    MockAudioContext,
    resumeCalls,
  };
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
