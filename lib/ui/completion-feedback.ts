import type { TimelineStatus } from "@/lib/types/timeline";

export const COMPLETION_CHIME_SRC = "/sounds/completion-chime.mp3";
export const COMPLETION_CHIME_PLAYED_EVENT =
  "cadence:completion-chime-played";
export const COMPLETION_CHIME_BLOCKED_EVENT =
  "cadence:completion-chime-blocked";

const COMPLETION_CHIME_VOLUME = 1;
const SYNTH_CHIME_DURATION_SECONDS = 0.12;
const SYNTH_CHIME_PEAK_GAIN = 0.045;
const SYNTH_CHIME_START_FREQUENCY = 660;
const SYNTH_CHIME_END_FREQUENCY = 880;

type AudioContextConstructor = typeof AudioContext;
type CompletionChimeSubmittedStatus = Extract<
  TimelineStatus,
  "completed" | "not_completed"
>;

export type CompletionChimeIntent = Readonly<{
  currentStatus: TimelineStatus;
  submittedStatus: CompletionChimeSubmittedStatus;
}>;

let completionChimeContext: AudioContext | null = null;
let completionChimeArrayBufferPromise: Promise<ArrayBuffer | null> | null = null;
let completionChimeBufferPromise: Promise<AudioBuffer | null> | null = null;
let completionChimePlaybackAudio: HTMLAudioElement | null = null;
let completionChimePrimerAudio: HTMLAudioElement | null = null;
const activeCompletionChimeSources = new Set<AudioBufferSourceNode>();

export function shouldPlayCompletionChime({
  currentStatus,
  nextStatus,
}: Readonly<{
  currentStatus: TimelineStatus;
  nextStatus: TimelineStatus | null;
}>): boolean {
  return nextStatus === "completed" && currentStatus !== "completed";
}

export function shouldPlayCompletionChimeForStatusSuccess({
  intent,
  serverNextStatus,
}: Readonly<{
  intent: CompletionChimeIntent | null;
  serverNextStatus?: TimelineStatus | null;
}>): boolean {
  if (!intent || intent.submittedStatus !== "completed") {
    return false;
  }

  return shouldPlayCompletionChime({
    currentStatus: intent.currentStatus,
    nextStatus: serverNextStatus ?? null,
  });
}

export function preloadCompletionChime(): void {
  void loadCompletionChimeArrayBuffer();
  getCompletionChimePlaybackAudio()?.load();
}

export function prepareCompletionChimeForUserGesture(): void {
  const context = getCompletionChimeContext();

  if (context) {
    primeCompletionChimeContext(context);
    void context.resume().catch(() => undefined);
    void loadCompletionChimeBuffer();
  }

  primeCompletionChimeAudioFallback();
}

export async function playCompletionChime(): Promise<void> {
  try {
    await playCompletionChimeFromMediaElement();
    return;
  } catch {
    // Fall through to Web Audio for browsers that reject delayed media replay.
  }

  try {
    await playCompletionChimeFromBuffer();
    return;
  } catch {
    // Fall through to a short synthesized chime if the MP3 buffer cannot play.
  }

  try {
    await playSynthesizedCompletionChime();
  } catch {
    reportCompletionChimeBlocked("synth");
  }
}

async function playCompletionChimeFromBuffer(): Promise<void> {
  const context = getCompletionChimeContext();

  if (!context) {
    throw new Error("AudioContext is unavailable.");
  }

  await ensureCompletionChimeContextIsRunning(context);

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
  activeCompletionChimeSources.add(source);
  source.onended = () => {
    activeCompletionChimeSources.delete(source);
  };
  source.start();
  reportCompletionChimePlayback("buffer");
}

async function playSynthesizedCompletionChime(): Promise<void> {
  const context = getCompletionChimeContext();

  if (!context) {
    throw new Error("AudioContext is unavailable.");
  }

  if (
    typeof context.createOscillator !== "function" ||
    typeof context.createGain !== "function"
  ) {
    throw new Error("Synthesized chime nodes are unavailable.");
  }

  await ensureCompletionChimeContextIsRunning(context);

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const startTime = context.currentTime;
  const endTime = startTime + SYNTH_CHIME_DURATION_SECONDS;

  oscillator.type = "sine";
  setAudioParamValue(oscillator.frequency, SYNTH_CHIME_START_FREQUENCY, startTime);
  rampAudioParamValue(
    oscillator.frequency,
    SYNTH_CHIME_END_FREQUENCY,
    startTime + SYNTH_CHIME_DURATION_SECONDS * 0.45,
  );

  setAudioParamValue(gain.gain, 0.0001, startTime);
  rampAudioParamValue(gain.gain, SYNTH_CHIME_PEAK_GAIN, startTime + 0.015, {
    preferLinear: true,
  });
  rampAudioParamValue(gain.gain, 0.0001, endTime);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(endTime);
  reportCompletionChimePlayback("synth");
}

async function ensureCompletionChimeContextIsRunning(
  context: AudioContext,
): Promise<void> {
  if (context.state !== "running") {
    await context.resume();
  }

  if (context.state !== "running") {
    throw new Error("AudioContext is not running.");
  }
}

function setAudioParamValue(
  audioParam: AudioParam,
  value: number,
  startTime: number,
): void {
  if (typeof audioParam.setValueAtTime === "function") {
    audioParam.setValueAtTime(value, startTime);
    return;
  }

  audioParam.value = value;
}

function rampAudioParamValue(
  audioParam: AudioParam,
  value: number,
  endTime: number,
  options: Readonly<{
    preferLinear?: boolean;
  }> = {},
): void {
  if (
    options.preferLinear &&
    typeof audioParam.linearRampToValueAtTime === "function"
  ) {
    audioParam.linearRampToValueAtTime(value, endTime);
    return;
  }

  if (typeof audioParam.exponentialRampToValueAtTime === "function") {
    audioParam.exponentialRampToValueAtTime(value, endTime);
    return;
  }

  if (typeof audioParam.linearRampToValueAtTime === "function") {
    audioParam.linearRampToValueAtTime(value, endTime);
    return;
  }

  audioParam.value = value;
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

async function playCompletionChimeFromMediaElement(): Promise<void> {
  const audio = getCompletionChimePlaybackAudio();

  if (!audio) {
    throw new Error("HTMLAudioElement is unavailable.");
  }

  audio.pause();
  audio.currentTime = 0;
  audio.muted = false;
  audio.volume = COMPLETION_CHIME_VOLUME;
  await audio.play();
  reportCompletionChimePlayback("media");
}

function getCompletionChimePlaybackAudio(): HTMLAudioElement | null {
  completionChimePlaybackAudio ??= createCompletionChimeAudio();

  return completionChimePlaybackAudio;
}

function getCompletionChimePrimerAudio(): HTMLAudioElement | null {
  completionChimePrimerAudio ??= createCompletionChimeAudio();

  return completionChimePrimerAudio;
}

function createCompletionChimeAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (typeof Audio === "undefined") {
    return null;
  }

  const audio = new Audio(COMPLETION_CHIME_SRC);
  audio.preload = "auto";
  audio.volume = COMPLETION_CHIME_VOLUME;

  return audio;
}

function primeCompletionChimeAudioFallback(): void {
  const audio = getCompletionChimePrimerAudio();

  if (!audio) {
    return;
  }

  audio.load();
  audio.muted = true;
  audio.volume = 0;
  audio.currentTime = 0;

  void audio
    .play()
    .then(() => {
      audio.pause();
      audio.currentTime = 0;
    })
    .catch(() => undefined)
    .finally(() => {
      audio.muted = false;
      audio.volume = COMPLETION_CHIME_VOLUME;
    });
}

function reportCompletionChimePlayback(source: ChimePlaybackSource): void {
  dispatchCompletionChimeEvent(COMPLETION_CHIME_PLAYED_EVENT, source);
}

function reportCompletionChimeBlocked(source: ChimePlaybackSource): void {
  dispatchCompletionChimeEvent(COMPLETION_CHIME_BLOCKED_EVENT, source);
}

type ChimePlaybackSource = "buffer" | "media" | "synth";

function dispatchCompletionChimeEvent(
  eventName: string,
  source: ChimePlaybackSource,
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
