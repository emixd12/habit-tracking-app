import { EventEmitter } from "node:events";
import { beforeAll, describe, expect, it, vi } from "vitest";

type CooperativeSignal = "SIGINT" | "SIGTERM" | "SIGHUP";

type SignalController = {
  readonly firstSignal: CooperativeSignal | null;
  readonly handled: boolean;
  readonly installed: boolean;
  uninstall: () => void;
};

type SignalControllerModule = {
  COOPERATIVE_SIGNALS: readonly CooperativeSignal[];
  installCooperativeSignalController: (options: {
    emitter: EventEmitter;
    onFirstSignal: (signal: CooperativeSignal) => void;
  }) => SignalController;
};

let signalControllerModule: SignalControllerModule;

beforeAll(async () => {
  // @ts-expect-error The signal controller is a plain Node ESM module.
  signalControllerModule = await import("../scripts/cooperative-signal-controller.mjs");
});

describe("cooperative signal controller", () => {
  it.each([
    "SIGINT",
    "SIGTERM",
    "SIGHUP",
  ] as const)("handles %s as the first cooperative signal", (signal) => {
    const emitter = new EventEmitter();
    const onFirstSignal = vi.fn();
    const controller =
      signalControllerModule.installCooperativeSignalController({
        emitter,
        onFirstSignal,
      });

    expect(controller.handled).toBe(false);
    expect(controller.firstSignal).toBeNull();
    expect(controller.installed).toBe(true);

    emitter.emit(signal);

    expect(onFirstSignal).toHaveBeenCalledOnce();
    expect(onFirstSignal).toHaveBeenCalledWith(signal);
    expect(controller.handled).toBe(true);
    expect(controller.firstSignal).toBe(signal);
  });

  it("invokes the callback once and ignores repeated cross-signal cleanup requests", () => {
    const emitter = new EventEmitter();
    const onFirstSignal = vi.fn(() => {
      emitter.emit("SIGINT");
      emitter.emit("SIGHUP");
    });
    const controller =
      signalControllerModule.installCooperativeSignalController({
        emitter,
        onFirstSignal,
      });

    emitter.emit("SIGTERM");
    emitter.emit("SIGTERM");
    emitter.emit("SIGINT");
    emitter.emit("SIGHUP");

    expect(onFirstSignal).toHaveBeenCalledOnce();
    expect(controller.handled).toBe(true);
    expect(controller.firstSignal).toBe("SIGTERM");
    expect(controller.installed).toBe(true);
  });

  it("uninstalls only its own listeners and is idempotent", () => {
    const emitter = new EventEmitter();
    const unrelatedListener = vi.fn();
    emitter.on("SIGINT", unrelatedListener);
    const onFirstSignal = vi.fn();
    const controller =
      signalControllerModule.installCooperativeSignalController({
        emitter,
        onFirstSignal,
      });

    for (const signal of signalControllerModule.COOPERATIVE_SIGNALS) {
      expect(emitter.listenerCount(signal)).toBe(
        signal === "SIGINT" ? 2 : 1,
      );
    }

    controller.uninstall();
    controller.uninstall();

    expect(controller.installed).toBe(false);
    for (const signal of signalControllerModule.COOPERATIVE_SIGNALS) {
      expect(emitter.listenerCount(signal)).toBe(
        signal === "SIGINT" ? 1 : 0,
      );
      emitter.emit(signal);
    }
    expect(onFirstSignal).not.toHaveBeenCalled();
    expect(unrelatedListener).toHaveBeenCalledOnce();
    expect(controller.handled).toBe(false);
    expect(controller.firstSignal).toBeNull();
  });
});
