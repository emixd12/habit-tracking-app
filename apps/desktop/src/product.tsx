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
import { LocalDatabaseControls } from "./local-database-controls";
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
import { AccountConflictReview, AccountDisconnectPanel, AccountPanel, AccountSyncPanel, FirstAccountLinkChoice } from "./account/account-panel";
import { DesktopAuth, readDesktopAuthConfig, type DesktopAccountState } from "./account/auth";
import { planAccountSync, synchronizeAccount, synchronizeReviewedAccount, type AccountSyncInputs } from "./account/account-sync";
import { shouldRetryAccountSync, type SyncStatus } from "./sync-engine";
import type { AccountSyncConflict, AccountSyncConflictDecision } from "@cadence/core/resolvers/account-sync.resolver";
import { hasRecognizedLocalData } from "@cadence/core/services/first-account-link";
import { completedFirstLinkState, finishFirstAccountLink, finishReviewedFirstAccountLink, firstLinkFailureBackupPath, recoverRejectedFirstLinkReview, type FirstLinkConflict } from "./account/first-link";

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
  const [account, setAccount] = useState<DesktopAccountState>({ status: "local" });
  const [accountBusy, setAccountBusy] = useState(false);
  const [firstLink, setFirstLink] = useState<{ recognized: boolean; complete?: boolean; backupPath?: string; error?: string } | null>(null);
  const [syncReady, setSyncReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: "offline" });
  const [conflictReview, setConflictReview] = useState<{ inputs: AccountSyncInputs; conflicts: readonly AccountSyncConflict[]; firstLink?: FirstLinkConflict; error?: string } | null>(null);
  const [disconnectResult, setDisconnectResult] = useState("");
  const [disconnectError, setDisconnectError] = useState("");
  const [syncRequest, setSyncRequest] = useState(0);
  const syncRunning = useRef(false);
  const syncPending = useRef(false);
  const syncRetry = useRef(0);
  const syncRetryTimer = useRef<number | null>(null);
  const auth = useRef<DesktopAuth | null>(null);
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
  useEffect(() => {
    const config = readDesktopAuthConfig();
    if (!isTauri() || !config) return;
    const service = new DesktopAuth(config, setAccount);
    auth.current = service;
    let stop: (() => void) | undefined;
    void service.initialize().then((value) => { stop = value; }).catch(() => setAccount({ status: "error", message: "The saved account session could not be read." }));
    return () => { auth.current = null; stop?.(); };
  }, []);
  const runAccount = (action: () => Promise<void>) => {
    setAccountBusy(true);
    void action().catch((failure) => setAccount({ status: "error", message: localErrorMessage(failure) })).finally(() => setAccountBusy(false));
  };
  const runFirstLink = (choice: "import" | "ignore" | "hydrate") => {
    if (account.status !== "linked" || !profile || !auth.current) return;
    setAccountBusy(true); setFirstLink((value) => value ? { ...value, error: undefined } : value);
    void finishFirstAccountLink({ client: auth.current.accountClient(), profile, hostedUserId: account.userId, choice }).then((result) => {
      if (result.status === "conflict") {
        if (result.inputs && result.conflicts && result.attempt) setConflictReview({ inputs: result.inputs, conflicts: result.conflicts, firstLink: { inputs: result.inputs, conflicts: result.conflicts, attempt: result.attempt, backupPath: result.backupPath } });
        setFirstLink({ recognized: true, error: `Conflict review is required for ${result.count} item${result.count === 1 ? "" : "s"}.` });
      }
      else { setFirstLink({ recognized: false, complete: true, backupPath: result.backupPath ?? undefined }); setSyncReady(true); refresh(); }
    }).catch((failure) => setFirstLink((value) => ({ recognized: value?.recognized ?? true, backupPath: firstLinkFailureBackupPath(failure) ?? value?.backupPath, error: localErrorMessage(failure) }))).finally(() => setAccountBusy(false));
  };
  const profile = bundle?.timeline.profile;
  useEffect(() => {
    if (!profile || !auth.current) { setFirstLink(null); setSyncReady(false); return; }
    let active = true;
    const service = auth.current;
    if (account.status !== "linked") {
      void service.firstLinkBaseline().then((baseline) => {
        if (!active) return;
        setFirstLink(null);
        setSyncReady(Boolean(baseline));
        if (baseline && account.status !== "waiting") setSyncStatus({ state: "revoked" });
      }).catch(() => { if (active) setSyncReady(false); });
      return () => { active = false; };
    }
    void Promise.all([service.firstLinkBaseline(), localCommand("readImportSnapshot", { profileId: profile.id })]).then(([baseline, snapshot]) => {
      if (!active) return;
      if (baseline) { setSyncReady(true); return; }
      const recognized = hasRecognizedLocalData(snapshot);
      setFirstLink({ recognized });
      if (!recognized) runFirstLink("hydrate");
    }).catch((failure) => { if (active) setFirstLink({ recognized: true, error: localErrorMessage(failure) }); });
    return () => { active = false; };
  // The authenticated user ID is the stable first-link identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.status === "linked" ? account.userId : null, profile?.id]);
  const syncAccount = useCallback(() => {
    if (!syncReady || account.status !== "linked" || !profile || !auth.current) return;
    if (syncRunning.current) { syncPending.current = true; return; }
    syncRunning.current = true;
    syncPending.current = false;
    if (syncRetryTimer.current !== null) { window.clearTimeout(syncRetryTimer.current); syncRetryTimer.current = null; }
    setSyncStatus({ state: "syncing" });
    void synchronizeAccount(profile.id, auth.current.accountClient()).then((status) => {
      if (!mounted.current) return;
      setSyncStatus(status);
      if (status.state === "current") { syncRetry.current = 0; setConflictReview(null); }
      else if (status.state === "conflict") {
        syncRetry.current = 0;
        void planAccountSync(profile.id, auth.current!.accountClient()).then(({ inputs, plan }) => {
          if (mounted.current) setConflictReview({ inputs, conflicts: plan.conflicts });
        }).catch((failure) => { if (mounted.current) setSyncStatus({ state: "failed", message: localErrorMessage(failure) }); });
      }
      else if (shouldRetryAccountSync(status, syncRetry.current)) {
        const attempt = syncRetry.current++;
        const delay = Math.min(30_000, 1_000 * 2 ** attempt) * (0.75 + Math.random() * 0.5);
        syncRetryTimer.current = window.setTimeout(() => { syncRetryTimer.current = null; setSyncRequest((value) => value + 1); }, delay);
      }
    }).finally(() => {
      syncRunning.current = false;
      if (syncPending.current && mounted.current) setSyncRequest((value) => value + 1);
    });
  }, [account.status, profile, syncReady]);
  useEffect(() => {
    if (!syncReady) return;
    const trigger = () => syncAccount();
    const resume = () => { if (document.visibilityState === "visible") trigger(); };
    window.addEventListener("online", trigger);
    window.addEventListener("focus", trigger);
    document.addEventListener("visibilitychange", resume);
    trigger();
    return () => { window.removeEventListener("online", trigger); window.removeEventListener("focus", trigger); document.removeEventListener("visibilitychange", resume); if (syncRetryTimer.current !== null) window.clearTimeout(syncRetryTimer.current); };
  }, [syncAccount, syncReady, syncRequest]);
  useEffect(() => { if (syncReady && bundle) syncAccount(); }, [bundle, syncAccount, syncReady]);
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
  const accountControls = <><AccountPanel state={account} configured={readDesktopAuthConfig() !== null} connected={syncReady} busy={accountBusy}
    onSignIn={() => auth.current && runAccount(() => auth.current!.begin())}
    onCancel={() => auth.current && runAccount(() => auth.current!.cancel())} />
    {firstLink ? <FirstAccountLinkChoice recognized={firstLink.recognized} complete={firstLink.complete} busy={accountBusy} backupPath={firstLink.backupPath} error={firstLink.error}
      onImport={() => runFirstLink("import")} onIgnore={() => runFirstLink("ignore")}
      onCancel={() => auth.current && runAccount(() => auth.current!.cancelLink())} /> : null}
    {syncReady ? <AccountSyncPanel status={syncStatus} busy={accountBusy || syncStatus.state === "syncing"} onSync={syncAccount}
      onReconnect={() => { if (!auth.current) return; setSyncStatus({ state: "revoked" }); runAccount(() => auth.current!.reconnect()); }} /> : null}</>;

  const resolveConflicts = (decisions: readonly AccountSyncConflictDecision[]) => {
    if (!conflictReview || !profile || !auth.current) return;
    setAccountBusy(true); setConflictReview((value) => value ? { ...value, error: undefined } : value);
    const firstLinkReview = conflictReview.firstLink;
    const reviewed = firstLinkReview
      ? finishReviewedFirstAccountLink({ client: auth.current.accountClient(), profileId: profile.id, reviewed: firstLinkReview, decisions })
          .then((result): SyncStatus => {
            const completion = completedFirstLinkState(result);
            setFirstLink(completion.firstLink);
            setSyncReady(completion.syncReady);
            return { state: "current", completedAt: Temporal.Now.instant().toString() };
          })
      : synchronizeReviewedAccount(profile.id, auth.current.accountClient(), conflictReview.inputs, decisions);
    void reviewed.then((status) => {
      setSyncStatus(status);
      if (status.state === "current") { setConflictReview(null); refresh(); }
      else if (status.state === "failed") setConflictReview((value) => value ? { ...value, error: status.message } : value);
    }).catch((failure) => {
      if (firstLinkReview) {
        setConflictReview(null);
        setFirstLink(recoverRejectedFirstLinkReview(firstLinkReview, localErrorMessage(failure)));
      } else setConflictReview((value) => value ? { ...value, error: localErrorMessage(failure) } : value);
    }).finally(() => setAccountBusy(false));
  };
  const disconnect = (mode: "keep" | "remove") => {
    if (!auth.current) return;
    setAccountBusy(true); setDisconnectError(""); setDisconnectResult("");
    void auth.current.disconnect(mode).then((result) => {
      setSyncReady(false); setConflictReview(null); setSyncStatus({ state: "offline" });
      setDisconnectResult(mode === "keep" ? `Local copy kept at ${result.databasePath}` : `Account data removed. Safety backup: ${result.backupPath}. Fresh local database: ${result.databasePath}`);
      refresh();
    }).catch((failure) => setDisconnectError(localErrorMessage(failure))).finally(() => setAccountBusy(false));
  };
  const completeAccountControls = <>{accountControls}
    {conflictReview ? <AccountConflictReview conflicts={conflictReview.conflicts} busy={accountBusy} error={conflictReview.error} onResolve={resolveConflicts} /> : null}
    {account.status === "linked" || syncReady || disconnectResult ? <AccountDisconnectPanel busy={accountBusy} result={disconnectResult} error={disconnectError} onDisconnect={disconnect} /> : null}</>;

  return <DesktopApp activeScreen={activeScreen} onNavigate={navigate} availableScreens={AVAILABLE_SCREENS} conflictCount={conflictReview?.conflicts.length ?? 0}>
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
      {activeScreen === "settings" ? <SettingsScreen currentTimezone={bundle.timeline.profile.timezone} accountConnected={syncReady}
        accountControls={completeAccountControls}
        updates={<DesktopUpdatePanel />}
        databaseControls={<LocalDatabaseControls onRestored={refresh} />}
        updateTimezoneAction={timezoneAction} permission={permission} coverage={coverage}
        busy={reminderBusy} error={reminderError} onRequestPermission={() => refreshReminders(true)}
        onReconcile={() => refreshReminders()} onShowOnboarding={() => { setGuideRequest((value) => value + 1); navigate("timeline"); }} /> : null}
      {activeScreen === "export" ? <LocalExportScreen onChanged={refresh} /> : null}
    </> : null}
  </DesktopApp>;
}
