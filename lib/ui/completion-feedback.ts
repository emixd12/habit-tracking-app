import type { TimelineStatus } from "@/lib/types/timeline";

export const COMPLETION_CHIME_SRC = "/sounds/completion-chime.mp3";
export const COMPLETION_CHIME_PLAYED_EVENT =
  "cadence:completion-chime-played";
export const COMPLETION_CHIME_BLOCKED_EVENT =
  "cadence:completion-chime-blocked";

const COMPLETION_CHIME_VOLUME = 0.72;

type AudioContextConstructor = typeof AudioContext;

let completionChimeContext: AudioContext | null = null;
let completionChimeArrayBufferPromise: Promise<ArrayBuffer | null> | null = null;
let completionChimeBufferPromise: Promise<AudioBuffer | null> | null = null;
let completionChimeAudio: HTMLAudioElement | null = null;

export function shouldPlayCompletionChime({
  currentStatus,
  nextStatus,
}: Readonly<{
  currentStatus: TimelineStatus;
  nextStatus: TimelineStatus | null;
}>): boolean {
  return nextStatus === "done" && currentStatus !== "done";
}

export function preloadCompletionChime(): void {
  void loadCompletionChimeArrayBuffer();
  getCompletionChimeAudioFallback()?.load();
}

export function prepareCompletionChimeForUserGesture(): void {
  const context = getCompletionChimeContext();

  if (context) {
    primeCompletionChimeContext(context);
    void context.resume().catch(() => undefined);
    void loadCompletionChimeBuffer();
    return;
  }

  getCompletionChimeAudioFallback()?.load();
}

export function playCompletionChime(): void {
  void playCompletionChimeFromBuffer().catch(() => {
    playCompletionChimeFallback();
  });
}

async function playCompletionChimeFromBuffer(): Promise<void> {
  const context = getCompletionChimeContext();

  if (!context) {
    throw new Error("AudioContext is unavailable.");
  }

  if (context.state !== "running") {
    await context.resume();
  }

  const audioBuffer = await loadCompletionChimeBuffer();

  if (!audioBuffer) {
    throw new Error("Completion chime could not be loaded.");
  }

  const source = context.createBufferSource();
  const gain = context.createGain();

  source.buffer = audioBuffer;
  gain.gain.value = COMPLETION_CHIME_VOLUME;

  source.connect(gain);
  gain.connect(context.destination);
  source.start();
  reportCompletionChimePlayback("buffer");
}

async function loadCompletionChimeBuffer(): Promise<AudioBuffer | null> {
  const context = getCompletionChimeContext();

  if (!context) {
    return null;
  }

  completionChimeBufferPromise ??= loadCompletionChimeArrayBuffer()
    .then((arrayBuffer) =>
      arrayBuffer ? context.decodeAudioData(arrayBuffer.slice(0)) : null,
    )
    .catch(() => null);

  const audioBuffer = await completionChimeBufferPromise;

  if (!audioBuffer) {
    completionChimeBufferPromise = null;
  }

  return audioBuffer;
}

async function loadCompletionChimeArrayBuffer(): Promise<ArrayBuffer | null> {
  if (typeof window === "undefined") {
    return null;
  }

  completionChimeArrayBufferPromise ??= fetch(COMPLETION_CHIME_SRC)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Completion chime request failed.");
      }

      return response.arrayBuffer();
    })
    .catch(() => null);

  const arrayBuffer = await completionChimeArrayBufferPromise;

  if (!arrayBuffer) {
    completionChimeArrayBufferPromise = null;
  }

  return arrayBuffer;
}

function getCompletionChimeContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextClass =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: AudioContextConstructor })
      .webkitAudioContext;

  if (!AudioContextClass) {
    return null;
  }

  try {
    completionChimeContext ??= new AudioContextClass();
  } catch {
    return null;
  }

  return completionChimeContext;
}

function primeCompletionChimeContext(context: AudioContext): void {
  try {
    const source = context.createBufferSource();
    const gain = context.createGain();

    source.buffer = context.createBuffer(1, 1, context.sampleRate);
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(context.destination);
    source.start();
  } catch {
    // A failed silent primer should not block the real completion action.
  }
}

function playCompletionChimeFallback(): void {
  const audio = getCompletionChimeAudioFallback();

  if (!audio) {
    reportCompletionChimeBlocked("fallback");
    return;
  }

  audio.currentTime = 0;
  void audio
    .play()
    .then(() => {
      reportCompletionChimePlayback("fallback");
    })
    .catch(() => {
      reportCompletionChimeBlocked("fallback");
    });
}

function getCompletionChimeAudioFallback(): HTMLAudioElement | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (typeof Audio === "undefined") {
    return null;
  }

  completionChimeAudio ??= new Audio(COMPLETION_CHIME_SRC);
  completionChimeAudio.preload = "auto";
  completionChimeAudio.volume = COMPLETION_CHIME_VOLUME;

  return completionChimeAudio;
}

function reportCompletionChimePlayback(source: "buffer" | "fallback"): void {
  dispatchCompletionChimeEvent(COMPLETION_CHIME_PLAYED_EVENT, source);
}

function reportCompletionChimeBlocked(source: "buffer" | "fallback"): void {
  dispatchCompletionChimeEvent(COMPLETION_CHIME_BLOCKED_EVENT, source);
}

function dispatchCompletionChimeEvent(
  eventName: string,
  source: "buffer" | "fallback",
): void {
  if (typeof window === "undefined") {
    return;
  }

  if (process.env.NODE_ENV === "development") {
    console.info(eventName, source);
  }

  try {
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail: {
          source,
        },
      }),
    );
  } catch {
    // Some embedded browser test surfaces expose console but not CustomEvent.
  }
}
