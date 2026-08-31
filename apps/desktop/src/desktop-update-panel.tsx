import { useEffect, useSyncExternalStore } from "react";
import { desktopUpdater } from "./native-updater";

export function DesktopUpdatePanel() {
  const state = useSyncExternalStore(desktopUpdater.subscribe, desktopUpdater.getSnapshot, desktopUpdater.getSnapshot);
  useEffect(() => { void desktopUpdater.initialize(); }, []);
  const busy = state.phase === "checking" || state.phase === "installing";
  const canCheck = !["loading", "unavailable", "installed", "installing"].includes(state.phase);
  return (
    <section className="bg-background py-4" aria-busy={busy} aria-labelledby="desktop-updates-title">
      <h2 id="desktop-updates-title" className="text-xl leading-tight">App updates</h2>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-readable">
        {state.currentVersion ? `Cadence ${state.currentVersion}. ` : ""}
        Updates run only when you request them. Cadence verifies the update signature before installation.
      </p>
      <p className="mt-3 text-sm leading-6 text-muted-readable" role="status">
        {state.phase === "loading" && "Reading update configuration…"}
        {state.phase === "unavailable" && "Signed updates are not configured for this build."}
        {state.phase === "checking" && "Checking for updates…"}
        {state.phase === "current" && "No newer version is available."}
        {state.phase === "available" && `Cadence ${state.version} is available.`}
        {state.phase === "installing" && "Downloading and installing the signed update. Keep Cadence open."}
        {state.phase === "installed" && "The update is installed. Restart Cadence to use it."}
      </p>
      {state.phase === "available" && state.notes ? (
        <p className="mt-3 max-w-2xl whitespace-pre-wrap break-words text-sm leading-6">{state.notes}</p>
      ) : null}
      {state.error ? <p role="alert" className="mt-3 text-sm leading-6 text-accent">{state.error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        {canCheck ? <button type="button" disabled={busy} onClick={() => void desktopUpdater.check()} className="product-action product-action-secondary min-h-11 py-2 text-sm">Check for updates</button> : null}
        {state.phase === "available" ? <button type="button" onClick={() => void desktopUpdater.install()} className="product-action product-action-primary min-h-11 py-2 text-sm">Download and install</button> : null}
        {state.phase === "installed" ? <button type="button" onClick={() => void desktopUpdater.restart()} className="product-action product-action-primary min-h-11 py-2 text-sm">Restart Cadence</button> : null}
      </div>
    </section>
  );
}
