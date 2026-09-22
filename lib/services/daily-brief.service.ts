import { Temporal } from "@js-temporal/polyfill";
import type { DailyBriefResponse, DailyBriefSettings } from "@cadence/core/types/daily-brief";
import { readAdvisorProfileTimezone } from "@/lib/db/advisor-context.repo";
import { beginDailyBrief, finishDailyBrief, readDailyBriefPreferences, saveDailyBriefPreferences } from "@/lib/db/daily-brief.repo";
import { prepareAccountBriefingContexts, briefingAccountRef } from "./briefing-account-context.service";
import { DailyBriefError, generateDailyBrief, raceBriefAbort as raceAbort, type DailyBriefGenerator } from "./daily-brief-consumer";
import { generateOpenAIDailyBrief } from "./daily-brief-openai";
import { getCalendarConnection, type CalendarCaller } from "./google-calendar.service";

import { activeBriefingConfig, briefingConfigurationRevision } from "./briefing-pipeline";

export async function getDailyBriefSettings(caller: CalendarCaller): Promise<DailyBriefSettings> {
  const preferences = await readDailyBriefPreferences(caller.client);
  const timezone = await readAdvisorProfileTimezone(caller.client, caller.user.id);
  return { accountRef: briefingAccountRef(caller.user.id), available: !!process.env.OPENAI_API_KEY,
    configurationRevision: briefingConfigurationRevision(), enabled: preferences.enabled, includeCalendar: preferences.includeCalendar, revision: preferences.revision,
    timezone, localDate: Temporal.Now.instant().toZonedDateTimeISO(timezone).toPlainDate().toString() };
}

export async function updateDailyBriefSettings(caller: CalendarCaller, value: unknown): Promise<DailyBriefSettings> {
  if (!record(value) || Object.keys(value).sort().join() !== "enabled,includeCalendar" ||
      typeof value.enabled !== "boolean" || typeof value.includeCalendar !== "boolean" || (!value.enabled && value.includeCalendar)) {
    throw new DailyBriefError("invalid_request");
  }
  if (value.enabled && !process.env.OPENAI_API_KEY) throw new DailyBriefError("not_configured");
  if (value.includeCalendar && (await getCalendarConnection(caller)).status !== "connected") throw new DailyBriefError("calendar_unavailable");
  const current = await readDailyBriefPreferences(caller.client);
  await saveDailyBriefPreferences(caller.client, { enabled: value.enabled, includeCalendar: value.includeCalendar }, current.revision);
  return getDailyBriefSettings(caller);
}

export async function requestInAppDailyBrief(caller: CalendarCaller, value: unknown, options: Readonly<{
  generate?: DailyBriefGenerator;
  now?: () => Temporal.Instant;
  deadlineMs?: number;
}> = {}): Promise<DailyBriefResponse> {
  if (!record(value) || Object.keys(value).sort().join() !== "installationId,retry" || typeof value.installationId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.installationId) || typeof value.retry !== "boolean") {
    throw new DailyBriefError("invalid_request");
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new DailyBriefError("not_configured");
  const configuration = activeBriefingConfig();
  const configurationRevision = briefingConfigurationRevision(configuration);
  const clock = options.now ?? (() => Temporal.Now.instant());
  const signal = AbortSignal.timeout(options.deadlineMs ?? 60_000);
  const installationId = value.installationId;
  const work = async (): Promise<DailyBriefResponse> => {
    const preferences = await readDailyBriefPreferences(caller.client, signal);
    signal.throwIfAborted();
    if (!preferences.enabled) throw new DailyBriefError("access_denied");
    const admission = await beginDailyBrief(caller.client, { installationId, retry: value.retry as boolean, expectedRevision: preferences.revision }, signal);
    if (admission.state === "rate_limited") throw new DailyBriefError("rate_limited", admission.retryAfterSeconds);
    if (admission.state !== "acquired") return { state: admission.state };
    const leaseToken = admission.leaseToken;
    let successful = false;
    try {
      signal.throwIfAborted();
      const prepared = await prepareAccountBriefingContexts(caller, {
        historyDays: [configuration.scope.historyDays],
        includeCalendar: configuration.scope.includeCalendar,
        includeRecordedElapsedDurations: configuration.context.includeRecordedElapsedDurations,
        includeHistoricalCompletionTimes: configuration.context.includeHistoricalCompletionTimes,
        signal,
        clock,
        preferences,
        localDate: admission.localDate,
      });
      const context = prepared.contexts[0]!;
      const assertCurrent = async () => {
        if (briefingConfigurationRevision() !== configurationRevision) throw new DailyBriefError("context_changed");
        await prepared.assertCurrent();
      };
      await assertCurrent();
      const modelSignal = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
      const briefing = await raceAbort(generateDailyBrief(context, { config: configuration, now: clock, signal: modelSignal,
        generate: options.generate ?? ((input) => generateOpenAIDailyBrief(input, { apiKey })) }), modelSignal);
      // The lease must still belong to this attempt. A superseded attempt never returns text.
      const finished = await finishDailyBrief(caller.client, { installationId, leaseToken, success: true, expectedRevision: preferences.revision }, signal);
      if (!finished) throw new DailyBriefError("context_changed");
      await assertCurrent();
      successful = true;
      return { state: "ready", briefing };
    } finally {
      if (!successful) void finishDailyBrief(caller.client, { installationId, leaseToken, success: false, expectedRevision: preferences.revision }).catch(() => undefined);
    }
  };
  return raceAbort(work(), signal);
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
