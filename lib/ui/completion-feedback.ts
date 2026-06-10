import type { TimelineStatus } from "@/lib/types/timeline";

export const COMPLETION_CHIME_SRC = "/sounds/completion-chime.mp3";

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
    void context.resume();
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

  return completionChimeBufferPromise;
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

  return completionChimeArrayBufferPromise;
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

  completionChimeContext ??= new AudioContextClass();

  return completionChimeContext;
}

function playCompletionChimeFallback(): void {
  const audio = getCompletionChimeAudioFallback();

  if (!audio) {
    return;
  }

  audio.currentTime = 0;
  void audio.play().catch(() => undefined);
}

function getCompletionChimeAudioFallback(): HTMLAudioElement | null {
  if (typeof window === "undefined") {
    return null;
  }

  completionChimeAudio ??= new Audio(COMPLETION_CHIME_SRC);
  completionChimeAudio.preload = "auto";
  completionChimeAudio.volume = COMPLETION_CHIME_VOLUME;

  return completionChimeAudio;
}
