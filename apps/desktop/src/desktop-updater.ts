export type DesktopUpdate = Readonly<{
  version: string;
  body?: string;
  downloadAndInstall: () => Promise<void>;
  close: () => Promise<void>;
}>;

export type DesktopUpdateTransport = Readonly<{
  configuration: () => Promise<{ configured: boolean; version: string }>;
  check: () => Promise<DesktopUpdate | null>;
  restart: () => Promise<void>;
}>;

export type DesktopUpdateState = Readonly<{
  phase: "loading" | "unavailable" | "idle" | "checking" | "current" | "available" | "installing" | "installed" | "error";
  currentVersion?: string;
  version?: string;
  notes?: string;
  error?: string;
}>;

/** One app-lifetime controller keeps an approved installation alive across screen navigation. */
export function createDesktopUpdater(transport: DesktopUpdateTransport) {
  let state: DesktopUpdateState = { phase: "loading" };
  let initialization: Promise<void> | undefined;
  let configured = false;
  let busy = false;
  let candidate: DesktopUpdate | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: DesktopUpdateState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const release = async () => {
    const previous = candidate;
    candidate = null;
    // Resource cleanup must not turn a confirmed installation into a failed installation.
    if (previous) await previous.close().catch(() => {});
  };

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    initialize() {
      initialization ??= (async () => {
        try {
          const configuration = await transport.configuration();
          configured = configuration.configured;
          publish({ phase: configured ? "idle" : "unavailable", currentVersion: configuration.version });
        } catch {
          publish({ phase: "unavailable" });
        }
      })();
      return initialization;
    },
    async check() {
      if (!configured || busy || state.phase === "installed") return;
      busy = true;
      publish({ phase: "checking", currentVersion: state.currentVersion });
      try {
        await release();
        candidate = await transport.check();
        publish(candidate
          ? { phase: "available", currentVersion: state.currentVersion, version: candidate.version, notes: candidate.body }
          : { phase: "current", currentVersion: state.currentVersion });
      } catch {
        publish({ phase: "error", currentVersion: state.currentVersion, error: "Cadence could not check for updates. Check your connection and try again." });
      } finally { busy = false; }
    },
    async install() {
      if (busy || state.phase !== "available" || !candidate) return;
      busy = true;
      publish({ ...state, phase: "installing", error: undefined });
      try {
        // The native updater verifies the signature before replacing the application.
        await candidate.downloadAndInstall();
        publish({ ...state, phase: "installed" });
      } catch {
        publish({ ...state, phase: "error", error: "Cadence could not confirm the update was installed. Check for updates to retry." });
      } finally {
        await release();
        busy = false;
      }
    },
    async restart() {
      if (busy || state.phase !== "installed") return;
      busy = true;
      try { await transport.restart(); }
      catch {
        publish({ ...state, error: "Cadence could not restart. Quit and reopen Cadence to finish the update." });
      } finally { busy = false; }
    },
  };
}
