import { useEffect, useState } from "react";
import { backupLocalDatabase, readLocalDatabaseInfo, restoreLocalDatabase, revealLocalDatabase, type LocalDatabaseInfo } from "./local-database";
import { localErrorMessage } from "./local-actions";

export function LocalDatabaseControls({ onRestored }: Readonly<{ onRestored: () => void }>) {
  const [info, setInfo] = useState<LocalDatabaseInfo | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { void readLocalDatabaseInfo().then(setInfo).catch((error) => setMessage(localErrorMessage(error))); }, []);
  const run = async (action: () => Promise<string>) => {
    setBusy(true); setMessage("");
    try { setMessage(await action()); } catch (error) { setMessage(localErrorMessage(error)); }
    finally { setBusy(false); }
  };
  return <LocalDatabaseSection info={info} confirmation={confirmation} busy={busy} message={message}
    onConfirmationChange={setConfirmation}
    onReveal={() => void run(async () => { await revealLocalDatabase(); return "Opened the database location in Finder."; })}
    onBackup={() => void run(async () => await backupLocalDatabase() ? "Backup saved." : "Backup cancelled.")}
    onRestore={() => void run(async () => { const protectedPath = await restoreLocalDatabase(confirmation); if (!protectedPath) return "Restore cancelled."; setConfirmation(""); onRestored(); return `Restore complete. The prior database is protected at ${protectedPath}`; })} />;
}

export function LocalDatabaseSection({ info, confirmation, busy, message, onConfirmationChange, onReveal, onBackup, onRestore }: Readonly<{
  info: LocalDatabaseInfo | null; confirmation: string; busy: boolean; message: string;
  onConfirmationChange: (value: string) => void; onReveal: () => void; onBackup: () => void; onRestore: () => void;
}>) {
  return <section id="local-database" aria-busy={busy} className="bg-background py-4">
    <h2 className="text-xl leading-tight">Local database</h2>
    <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-readable">Cadence stores the live database in its macOS Application Support folder.</p>
    <dl className="mt-4 text-sm leading-6"><div><dt>Exact path</dt><dd className="break-all text-muted-readable">{info?.path ?? "Loading…"}</dd></div></dl>
    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
      <button type="button" disabled={busy || !info} onClick={onReveal} className="product-action product-action-secondary min-h-11 py-2 text-sm">Reveal in Finder</button>
      <button type="button" disabled={busy || !info} onClick={onBackup} className="product-action product-action-primary min-h-11 py-2 text-sm">Back Up</button>
    </div>
    {info && !info.localMode ? <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-readable">Disconnect the account before restoring a raw database backup.</p> : <div className="mt-6 max-w-md border-t border-line pt-4">
      <label htmlFor="database-restore-confirmation" className="text-sm leading-6">Type RESTORE to replace local data</label>
      <input id="database-restore-confirmation" value={confirmation} onChange={(event) => onConfirmationChange(event.target.value)} autoComplete="off" className="mt-2 block min-h-11 w-full border border-line bg-background px-3 py-2 text-sm" />
      <p className="mt-3 text-sm leading-6 text-muted-readable">Cadence validates the backup and protects the current database before replacement.</p>
      <button type="button" disabled={busy || !info || confirmation !== "RESTORE"} onClick={onRestore} className="product-action product-action-danger mt-3 min-h-11 py-2 text-sm">Restore local database</button>
    </div>}
    {message ? <p role="status" aria-live="polite" className="mt-4 max-w-2xl break-all text-sm leading-6">{message}</p> : null}
  </section>;
}
