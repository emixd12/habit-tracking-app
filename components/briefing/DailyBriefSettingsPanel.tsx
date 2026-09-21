"use client";

import { useEffect, useMemo, useState } from "react";
import type { DailyBriefSettings } from "@cadence/core/types/daily-brief";

import { DailyBriefRequestError, createWebDailyBriefClient, type DailyBriefClient } from "@/lib/ui/daily-brief";
import { SettingsPanel } from "@/components/settings/SettingsPanels";

export function DailyBriefSettingsPanel({ client, desktop = false }: Readonly<{ client?: DailyBriefClient | null; desktop?: boolean }>) {
  const resolvedClient = useMemo(() => client === undefined ? createWebDailyBriefClient() : client, [client]);
  const [settings, setSettings] = useState<DailyBriefSettings>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!resolvedClient) return;
    const controller = new AbortController();
    void resolvedClient.preferences(controller.signal).then((value) => {
      if (!controller.signal.aborted) setSettings(value);
    }).catch(() => {
      if (!controller.signal.aborted) setError("Daily Brief settings are unavailable.");
    });
    return () => controller.abort();
  }, [resolvedClient]);

  if (!resolvedClient || (desktop && !navigator.onLine)) {
    return <SettingsPanel title="Daily Brief" description="Daily Brief is available only to linked, online desktop accounts. Local tracking remains available offline."><p className="sr-only">Daily Brief is unavailable.</p></SettingsPanel>;
  }

  const save = (next: Readonly<{ enabled: boolean; includeCalendar: boolean }>) => {
    setSaving(true); setError("");
    void resolvedClient.updatePreferences(next).then((updated) => {
      setSettings(updated);
      localStorage.setItem("cadence.daily-brief.settings-revision.v1", `${updated.accountRef}:${updated.revision}`);
      window.dispatchEvent(new CustomEvent("cadence:daily-brief-settings", { detail: updated }));
    }).catch((failure: unknown) => {
      setError(failure instanceof DailyBriefRequestError ? "Cadence could not save Daily Brief settings." : "Daily Brief settings are unavailable.");
    }).finally(() => setSaving(false));
  };

  return (
    <SettingsPanel title="Daily Brief" description="Cadence can prepare one read-only briefing when you first open Timeline each day.">
      {!settings ? <p role="status" className="text-sm text-muted-readable">{error || "Loading Daily Brief settings…"}</p> : !settings.available ? <p className="text-sm leading-6 text-muted-readable">Daily Brief is unavailable because this Cadence server has no configured model.</p> : <div className="grid gap-3 text-sm leading-6">
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" checked={settings.enabled} disabled={saving} onChange={(event) => save({ enabled: event.target.checked, includeCalendar: event.target.checked && settings.includeCalendar })} />
          <span>Enable Daily Brief</span>
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" checked={settings.includeCalendar} disabled={!settings.enabled || saving} onChange={(event) => save({ enabled: settings.enabled, includeCalendar: event.target.checked })} />
          <span>Include selected Google Calendar timing</span>
        </label>
        <p className="max-w-2xl text-muted-readable">Cadence sends today’s Behavior schedule and completion history to OpenAI. Calendar timing is optional. The briefing cannot change tracking or Calendar records. <a className="underline underline-offset-2" href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noreferrer">OpenAI data retention may apply.</a></p>
        {desktop ? <p className="max-w-2xl text-muted-readable">Hosted context does not include unsynchronized or local-only desktop data.</p> : null}
        {error ? <p role="alert" className="text-accent">{error}</p> : null}
      </div>}
    </SettingsPanel>
  );
}
