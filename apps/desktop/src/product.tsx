import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DesktopApp, type DesktopScreen } from "./desktop-app";
import { TimelineScreen } from "./timeline-screen";
import { BehaviorsScreen } from "./behaviors-screen";
import { SettingsScreen } from "./settings-screen";
import { LocalExportScreen } from "./export-screen";
import { localCommand } from "./local-store";
import { DesktopOnboardingGuide } from "./onboarding-guide";
import { DesktopUpdatePanel } from "./desktop-update-panel";
import { createLocalTimezoneAction } from "./local-settings.service";
import { reconcileLocalReminders, reminderCoverageView, requestLocalNotificationPermission, retainNativeDeliveryEvents, type LocalReminderResult } from "./local-reminder.service";
import { readNativeEvents } from "./native-spike";
import { createLocalBehaviorActions, createLocalOccurrenceActions, localErrorMessage } from "./local-actions";
import { getLocalBehaviorsPageData } from "./local-behaviors-read.service";
import { loadLocalTimeline } from "./local-timeline.service";
import { latestNotificationOccurrenceId, loadNotificationOccurrence, type NotificationTarget } from "./notification-activation";
import { scrollAfterDesktopNavigation } from "./desktop-navigation";
import { scheduleLocalDayRefresh } from "./desktop-lifecycle";
import type { AnalyticsSelection } from "@cadence/core/services/analytics";
import "./timeline.css";

type Bundle = { timeline: Awaited<ReturnType<typeof loadLocalTimeline>>;
  behaviors: Awaited<ReturnType<typeof getLocalBehaviorsPageData>>; hasImportRuns: boolean };
const AVAILABLE_SCREENS: DesktopScreen[] = ["timeline", "behaviors", "export", "settings"];

export function Product() {
  const [activeScreen, setActiveScreen] = useState<DesktopScreen>("timeline");
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reminders, setReminders] = useState<LocalReminderResult | null>(null);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderError, setReminderError] = useState("");
  const [guideRequest, setGuideRequest] = useState(0);
  const [notificationTarget, setNotificationTarget] = useState<NotificationTarget | null>(null);
  const [navigationRequest, setNavigationRequest] = useState<{ anchor?: string } | null>(null);
  const activation = useRef<{ occurrenceId: string; requestKey: number } | null>(null);
  const activationSequence = useRef(0);
  const reminderRevision = useRef(0);
  const parameters = useRef<{ days: number; analytics: AnalyticsSelection }>({ days: 7, analytics: {} });
  const revision = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    if (navigationRequest) return scrollAfterDesktopNavigation(navigationRequest.anchor);
  }, [navigationRequest]);
  const refreshReminders = useCallback((requestPermission = false) => {
    if (!isTauri()) return;
    const current = ++reminderRevision.current;
    setReminderBusy(true);
    setReminderError("");
    setReminders((previous) => previous ? { ...previous, state: { ...previous.state, coverage: null } } : null);
    void (requestPermission ? requestLocalNotificationPermission() : reconcileLocalReminders()).then((result) => {
      if (mounted.current && current === reminderRevision.current) setReminders(result);
    }).catch((failure) => {
      if (mounted.current && current === reminderRevision.current) setReminderError(localErrorMessage(failure));
    }).finally(() => {
      if (mounted.current && current === reminderRevision.current) setReminderBusy(false);
    });
  }, []);
  const refresh = useCallback(() => {
    const current = ++revision.current;
    const requestedActivation = activation.current;
    if (!isTauri()) { setLoading(false); return; }
    refreshReminders();
    const now = Temporal.Now.instant();
    void (async () => {
      try {
        const timeline = await loadLocalTimeline(parameters.current.days, now);
        const behaviors = await getLocalBehaviorsPageData(timeline.profile, { ...parameters.current.analytics, now });
        const imports = await localCommand("readImportRuns", { profileId: timeline.profile.id, limit: 1 });
        if (requestedActivation) {
          let target: NotificationTarget;
          try {
            const occurrence = await loadNotificationOccurrence({ occurrenceId: requestedActivation.occurrenceId,
              profile: timeline.profile, behaviors: timeline.behaviors, now });
            target = occurrence ? { requestKey: requestedActivation.requestKey, status: "available", occurrence }
              : { requestKey: requestedActivation.requestKey, status: "unavailable" };
          } catch (failure) {
            target = { requestKey: requestedActivation.requestKey, status: "error", message: localErrorMessage(failure) };
          }
          if (mounted.current && current === revision.current && activation.current?.requestKey === requestedActivation.requestKey) setNotificationTarget(target);
        }
        if (mounted.current && current === revision.current) { setBundle({ timeline, behaviors, hasImportRuns: imports.length > 0 }); setError(""); }
      } catch (failure) {
        if (mounted.current && current === revision.current) {
          setError(localErrorMessage(failure));
          if (requestedActivation && activation.current?.requestKey === requestedActivation.requestKey) setNotificationTarget({ requestKey: requestedActivation.requestKey,
            status: "error", message: localErrorMessage(failure) });
        }
      } finally {
        if (mounted.current && current === revision.current) setLoading(false);
      }
    })();
  }, [refreshReminders]);
  useEffect(() => {
    mounted.current = true;
    const browserRefresh = !isTauri() ? window.setTimeout(refresh, 0) : undefined;
    let unlisten: (() => void) | undefined;
    const nativeChanged = async () => {
      try {
        const events = await readNativeEvents();
        if (!mounted.current) return;
        retainNativeDeliveryEvents(events);
        const occurrenceId = latestNotificationOccurrenceId(events);
        if (occurrenceId) {
          const requestKey = ++activationSequence.current;
          activation.current = { occurrenceId, requestKey };
          setNotificationTarget({ requestKey, status: "loading" });
          setNavigationRequest(null);
          setActiveScreen("timeline");
        }
        return events.length > 0;
      } catch (failure) { if (mounted.current) setReminderError(localErrorMessage(failure)); }
      return false;
    };
    if (isTauri()) void listen("desktop-native-event", () => {
      void nativeChanged().then((changed) => { if (mounted.current && changed) refresh(); });
    }).then(async (stop) => {
      if (!mounted.current) { stop(); return; }
      unlisten = stop;
      await nativeChanged();
      if (mounted.current) refresh();
    }).catch((failure) => { if (mounted.current) { refresh(); setReminderError(localErrorMessage(failure)); } });
    const timer = window.setInterval(refresh, 60_000);
    return () => { mounted.current = false; unlisten?.(); window.clearTimeout(browserRefresh); window.clearInterval(timer); };
  }, [refresh]);
  const profile = bundle?.timeline.profile;
  useEffect(() => {
    if (profile?.timezone) return scheduleLocalDayRefresh(profile.timezone, refresh);
  }, [profile?.timezone, refresh]);
  /* eslint-disable react-hooks/refs -- These factories only capture refresh; event callbacks read its refs after render. */
  const occurrenceActions = useMemo(() => profile ? createLocalOccurrenceActions(profile.id, () => refresh()) : null, [profile, refresh]);
  const behaviorActions = useMemo(() => profile ? createLocalBehaviorActions(profile, () => refresh()) : null, [profile, refresh]);
  const timezoneAction = useMemo(() => createLocalTimezoneAction(() => refresh()), [refresh]);
  /* eslint-enable react-hooks/refs */
  const coverage = reminders ? reminderCoverageView(reminders.state) : null;
  const permission = reminders?.permission ?? "checking";
  const navigate = (screen: DesktopScreen, anchor?: string) => {
    activation.current = null;
    setNotificationTarget(null);
    setActiveScreen(screen);
    setNavigationRequest({ anchor });
  };

  return <DesktopApp activeScreen={activeScreen} onNavigate={navigate} availableScreens={AVAILABLE_SCREENS}>
    {!isTauri() ? <div className="p-8"><h1 className="text-3xl font-bold">Open Cadence on your Mac</h1>
      <p className="mt-4">Local tracking uses the desktop app’s SQLite database. This browser preview cannot read or change it.</p></div> : null}
    {loading ? <p role="status" className="p-8">Opening local tracking data…</p> : null}
    {error ? <div role="alert" className="m-6 border border-line p-4"><p>{error}</p>
      <button className="product-action product-action-primary mt-3" onClick={refresh}>Try again</button></div> : null}
    {bundle && occurrenceActions && behaviorActions ? <>
      {activeScreen === "timeline" ? <DesktopOnboardingGuide key={guideRequest} forceOpen={guideRequest > 0} onDismiss={() => setGuideRequest(0)}
        hasAnyBehavior={bundle.timeline.behaviors.length > 0} hasImportRuns={bundle.hasImportRuns} currentTimezone={bundle.timeline.profile.timezone}
        permission={permission} coverage={coverage} onNavigate={navigate} availableScreens={AVAILABLE_SCREENS} /> : null}
      {activeScreen === "timeline" ? <TimelineScreen timeline={bundle.timeline.timeline} {...occurrenceActions}
        notificationTarget={notificationTarget}
        onRefresh={refresh} onShowMore={(days) => { parameters.current.days = days; refresh(); }} /> : null}
      {activeScreen === "behaviors" ? <BehaviorsScreen {...bundle.behaviors.behaviors} analytics={bundle.behaviors.analytics}
        {...occurrenceActions} {...behaviorActions} onRefresh={refresh}
        onNavigateReview={(selection) => { parameters.current.analytics = selection; refresh(); }} /> : null}
      {activeScreen === "settings" ? <SettingsScreen currentTimezone={bundle.timeline.profile.timezone}
        updates={<DesktopUpdatePanel />}
        updateTimezoneAction={timezoneAction} permission={permission} coverage={coverage}
        busy={reminderBusy} error={reminderError} onRequestPermission={() => refreshReminders(true)}
        onReconcile={() => refreshReminders()} onShowOnboarding={() => { setGuideRequest((value) => value + 1); navigate("timeline"); }} /> : null}
      {activeScreen === "export" ? <LocalExportScreen onChanged={refresh} /> : null}
    </> : null}
  </DesktopApp>;
}
