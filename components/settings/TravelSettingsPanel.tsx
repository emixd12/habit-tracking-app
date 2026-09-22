"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { TravelMode, TravelNavigationPreference, TravelSettings } from "@cadence/core/types/travel";
import { SettingsPanel } from "./SettingsPanels";
import { readBrowserForegroundLocation, type ForegroundLocation } from "@/lib/ui/foreground-location";
import { notifyTravelSettingsChanged, webTravelSettingsClient, type TravelSettingsClient } from "@/lib/ui/travel-settings";

export function TravelSettingsPanel({ client = webTravelSettingsClient, readLocation = readBrowserForegroundLocation, desktop = false }: Readonly<{
  client?: TravelSettingsClient;
  readLocation?: (requestPermission: boolean) => Promise<ForegroundLocation>;
  desktop?: boolean;
}>) {
  const id = useId();
  const [settings, setSettings] = useState<TravelSettings | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [location, setLocation] = useState<ForegroundLocation["state"] | null>(null);
  const sequence = useRef(0);
  useEffect(() => {
    const current = ++sequence.current;
    void client.load().then((value) => {
      if (current !== sequence.current) return;
      setSettings(value); setAccepted(Boolean(value.routingConsentAt));
    }).catch(() => { if (current === sequence.current) setMessage("Travel settings could not load."); });
    // The cleanup deliberately invalidates every pending load/save/location result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { sequence.current++; };
  }, [client]);
  const save = async () => {
    if (!settings) return;
    const current = ++sequence.current;
    setPending(true); setMessage("");
    try {
      const saved = await client.save({ enabled: settings.enabled, baseLocationText: settings.baseLocationText,
        mode: settings.mode, navigationPreference: settings.navigationPreference,
        expectedUpdatedAt: settings.updatedAt, acceptRoutingDisclosure: accepted });
      if (current !== sequence.current) return;
      setSettings(saved); setAccepted(Boolean(saved.routingConsentAt)); setLocation(null);
      setMessage("Travel settings saved.");
      notifyTravelSettingsChanged();
    } catch { if (current === sequence.current) setMessage("Travel settings could not save. Reload settings if another device changed them."); }
    finally { if (current === sequence.current) setPending(false); }
  };
  const locate = async () => {
    const current = ++sequence.current;
    setPending(true);
    try {
      const result = await readLocation(true);
      if (current === sequence.current) setLocation(result.state);
    } catch { if (current === sequence.current) setLocation("unavailable"); }
    finally { if (current === sequence.current) setPending(false); }
  };
  return <SettingsPanel title="Travel" description="Plan travel between located commitments without changing their schedules or statuses.">
    <div className="grid max-w-2xl gap-4 text-sm leading-6">
      <p>After setup, Cadence can send route endpoints, your chosen mode and travel times to Google Maps automatically while you use the app. Google processes requests under its own retention terms.</p>
      <p>Route estimates are available only after this deployment completes provider review.</p>
      <p>Calendar permission stays separate. Device location needs a separate browser or macOS permission. Travel locations and route results are not sent to the Daily Brief model.</p>
      <p>Cadence saves only the locations you enter. Device positions and route results stay temporary and never enter tracking exports or synced backups. Turning travel off clears temporary results and preserves your saved locations.</p>
      {desktop ? <p>Saved locations work offline. Route estimates require a linked account, a synchronized working copy and an internet connection.</p> : null}
      {settings ? <fieldset disabled={pending} className="grid min-w-0 gap-4">
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} />Enable proactive travel estimates</label>
        <label className="flex min-h-11 items-start gap-2"><input className="mt-2" type="checkbox" checked={accepted} onChange={(event) => { setAccepted(event.target.checked); if (!event.target.checked) setSettings({ ...settings, enabled: false }); }} />I agree to send travel endpoints and timing to Google Maps for proactive routing.</label>
        <div className="grid gap-1"><label htmlFor={`${id}-base`}>Saved base (optional)</label><input id={`${id}-base`} maxLength={500} value={settings.baseLocationText ?? ""} onChange={(event) => setSettings({ ...settings, baseLocationText: event.target.value || null })} className="min-h-11 min-w-0 border-0 border-b border-line bg-background" autoComplete="off" /><p className="text-muted-readable">Use a full address. Without a base, outbound and event-to-event estimates still work; final return stays unknown. Clear this field to remove the base.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1"><label htmlFor={`${id}-mode`}>Travel mode</label><select id={`${id}-mode`} value={settings.mode ?? ""} onChange={(event) => setSettings({ ...settings, mode: (event.target.value || null) as TravelMode | null })} className="min-h-11 min-w-0 border-0 border-b border-line bg-background"><option value="">Choose a mode</option><option value="walking">Walking</option><option value="cycling">Cycling</option><option value="transit">Public transit</option><option value="driving">Driving</option></select></div>
          <div className="grid gap-1"><label htmlFor={`${id}-navigation`}>Open locations in</label><select id={`${id}-navigation`} value={settings.navigationPreference ?? "google_maps"} onChange={(event) => setSettings({ ...settings, navigationPreference: event.target.value as TravelNavigationPreference })} className="min-h-11 min-w-0 border-0 border-b border-line bg-background"><option value="google_maps">Google Maps</option><option value="apple_maps">Apple Maps</option></select></div>
        </div>
        <p className="text-muted-readable">A navigation link sends that location to the selected app only when you open it. Search links do not verify timing.</p>
        <button type="button" onClick={save} disabled={settings.enabled && (!accepted || !settings.mode)} className="product-action product-action-primary min-h-11 w-fit">{pending ? "Saving…" : "Save travel settings"}</button>
        <div className="grid gap-2 border-t border-line pt-4"><p>A permitted foreground position supplies the immediate origin. Cadence does not track your location continuously or save it as your base.</p><button type="button" onClick={locate} className="product-action product-action-secondary min-h-11 w-fit">Check device location permission</button></div>
      </fieldset> : <p>Loading travel settings…</p>}
      {location ? <p role="status">{location === "available" ? "A current position is available. This check did not save or send it." : `Location ${location}. Add a saved base for the immediate origin, or continue with known event-to-event routes.`}</p> : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
  </SettingsPanel>;
}
