export const COOPERATIVE_SIGNALS = Object.freeze([
  "SIGINT",
  "SIGTERM",
  "SIGHUP",
]);

/**
 * Install inert-after-first signal handlers without exiting the process.
 *
 * The emitter must implement the EventEmitter methods used by Node's process
 * object. The caller owns cleanup behavior through `onFirstSignal`.
 */
export function installCooperativeSignalController({
  emitter,
  onFirstSignal,
}) {
  if (
    !emitter ||
    typeof emitter.on !== "function" ||
    typeof emitter.removeListener !== "function"
  ) {
    throw new TypeError(
      "A process-like EventEmitter with on/removeListener is required.",
    );
  }
  if (typeof onFirstSignal !== "function") {
    throw new TypeError("A first-signal callback is required.");
  }

  let firstSignal = null;
  let handled = false;
  let installed = false;
  const listeners = new Map(
    COOPERATIVE_SIGNALS.map((signal) => [
      signal,
      () => {
        if (handled) return;
        handled = true;
        firstSignal = signal;
        onFirstSignal(signal);
      },
    ]),
  );
  const attachedSignals = [];

  try {
    for (const [signal, listener] of listeners) {
      emitter.on(signal, listener);
      attachedSignals.push(signal);
    }
    installed = true;
  } catch (error) {
    for (const signal of attachedSignals) {
      emitter.removeListener(signal, listeners.get(signal));
    }
    throw error;
  }

  return Object.freeze({
    get firstSignal() {
      return firstSignal;
    },
    get handled() {
      return handled;
    },
    get installed() {
      return installed;
    },
    uninstall() {
      if (!installed) return;
      installed = false;
      for (const [signal, listener] of listeners) {
        emitter.removeListener(signal, listener);
      }
    },
  });
}
