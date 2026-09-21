"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DailyBriefing } from "@cadence/core/types/daily-brief";

import {
  DailyBriefRequestError,
  createWebDailyBriefClient,
  dailyBriefInstallationId,
  markDailyBriefPresentation,
  readDailyBriefPresentation,
  type DailyBriefClient,
} from "@/lib/ui/daily-brief";
import { DailyBriefBubble } from "./DailyBriefBubble";

type DailyBriefLauncherProps = Readonly<{ client?: DailyBriefClient | null; desktop?: boolean; sessionKey?: string }>;

export function DailyBriefLauncher({ client, desktop = false, sessionKey = "current" }: DailyBriefLauncherProps) {
  const resolvedClient = useMemo(() => client === undefined ? createWebDailyBriefClient() : client, [client]);
  const [state, setState] = useState<"hidden" | "loading" | "ready" | "error">("hidden");
  const [briefing, setBriefing] = useState<DailyBriefing>();
  const [message, setMessage] = useState("");
  const [stateSession, setStateSession] = useState(sessionKey);
  const current = useRef<{ accountRef: string; localDate: string; dismissed: boolean } | null>(null);
  const epoch = useRef(0);
  const retryController = useRef<AbortController | null>(null);

  useEffect(() => {
    current.current = null;
    if (!resolvedClient || (desktop && !navigator.onLine)) return;
    const controller = new AbortController();
    const requestEpoch = ++epoch.current;
    const active = () => requestEpoch === epoch.current && !controller.signal.aborted && !current.current?.dismissed;
    void resolvedClient.preferences(controller.signal).then(async (settings) => {
      if (!active() || !settings.available || !settings.enabled) return;
      const presentation = readDailyBriefPresentation(settings.accountRef, settings.localDate);
      current.current = { accountRef: settings.accountRef, localDate: settings.localDate, dismissed: presentation.dismissed };
      if (presentation.dismissed || presentation.attempted) return;
      markDailyBriefPresentation(settings.accountRef, settings.localDate, { ...presentation, attempted: true });
      setState("loading");
      const response = await resolvedClient.requestBrief({ installationId: await dailyBriefInstallationId(), retry: false }, controller.signal);
      if (!active()) return;
      if (response.state !== "ready") { setStateSession(sessionKey); setState("hidden"); return; }
      setBriefing(response.briefing);
      setStateSession(sessionKey);
      setState("ready");
    }).catch((error: unknown) => {
      if (!active()) return;
      if (!current.current) { setState("hidden"); return; }
      setMessage(error instanceof DailyBriefRequestError && error.code === "brief_unavailable"
        ? "Today’s Daily Brief is unavailable."
        : "Cadence could not prepare today’s Daily Brief.");
      setStateSession(sessionKey);
      setState("error");
    });
    const hideForSettingsChange = (event: Event) => {
      const next = (event as CustomEvent<{ accountRef?: string }>).detail;
      if (!next?.accountRef || next.accountRef === current.current?.accountRef) {
        controller.abort();
        retryController.current?.abort();
        epoch.current += 1;
        setState("hidden");
      }
    };
    window.addEventListener("cadence:daily-brief-settings", hideForSettingsChange);
    const hideForFocusOrStorage = (event: Event) => {
      if (event.type === "storage") {
        const key = (event as StorageEvent).key;
        if (key !== "cadence.daily-brief.settings-revision.v1" && !key?.startsWith("cadence.daily-brief.presentation.v1:")) return;
      }
      controller.abort();
      retryController.current?.abort();
      epoch.current += 1;
      setState("hidden");
    };
    window.addEventListener("focus", hideForFocusOrStorage);
    window.addEventListener("storage", hideForFocusOrStorage);
    return () => {
      window.removeEventListener("cadence:daily-brief-settings", hideForSettingsChange);
      window.removeEventListener("focus", hideForFocusOrStorage);
      window.removeEventListener("storage", hideForFocusOrStorage);
      controller.abort(); retryController.current?.abort(); epoch.current += 1;
    };
  }, [resolvedClient, desktop, sessionKey]);

  useEffect(() => {
    if (state !== "ready" || !briefing) return;
    const expiresAt = Date.parse(briefing.expiresAt);
    if (!Number.isFinite(expiresAt)) return;
    const timer = window.setTimeout(() => {
      setBriefing(undefined);
      setState("hidden");
    }, Math.min(2_147_483_647, Math.max(0, expiresAt - Date.now())));
    return () => window.clearTimeout(timer);
  }, [briefing, state]);

  const dismiss = () => {
    const presentation = current.current;
    if (presentation) {
      presentation.dismissed = true;
      markDailyBriefPresentation(presentation.accountRef, presentation.localDate, { attempted: true, dismissed: true });
    }
    epoch.current += 1;
    setState("hidden");
  };

  const retry = () => {
    const presentation = current.current;
    if (!resolvedClient || !presentation || presentation.dismissed) return;
    retryController.current?.abort();
    const controller = new AbortController();
    retryController.current = controller;
    const requestEpoch = ++epoch.current;
    setState("loading");
    void dailyBriefInstallationId().then((installationId) => resolvedClient.requestBrief({ installationId, retry: true }, controller.signal)).then((response) => {
      if (requestEpoch !== epoch.current || presentation.dismissed) return;
      if (response.state !== "ready") { setStateSession(sessionKey); setState("hidden"); return; }
      setBriefing(response.briefing);
      setStateSession(sessionKey);
      setState("ready");
    }).catch(() => {
      if (requestEpoch === epoch.current && !presentation.dismissed) {
        setMessage("Cadence could not prepare today’s Daily Brief.");
        setStateSession(sessionKey);
        setState("error");
      }
    });
  };

  return !resolvedClient || state === "hidden" || stateSession !== sessionKey ? null : <DailyBriefBubble state={state} briefing={briefing} message={message} onDismiss={dismiss} onRetry={state === "error" ? retry : undefined} />;
}
