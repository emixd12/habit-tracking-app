import { createHash } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import type { DailyBriefResponse, DailyBriefSettings } from "@cadence/core/types/daily-brief";
import { readAdvisorCadenceRevision, readAdvisorProfileTimezone } from "@/lib/db/advisor-context.repo";
import { beginDailyBrief, finishDailyBrief, listDailyBriefBehaviorIds, readDailyBriefPreferences, saveDailyBriefPreferences } from "@/lib/db/daily-brief.repo";
import { createAdvisorOpaqueRef, readAdvisorDayContext, type AdvisorAuthorizationFence } from "./advisor-day-context.service";
import { assertBriefContextFresh, DailyBriefError, generateDailyBrief, type DailyBriefGenerator } from "./daily-brief-consumer";
import { generateOpenAIDailyBrief } from "./daily-brief-openai";
import { getCalendarConnection, type CalendarCaller } from "./google-calendar.service";

const CLIENT_ID = "cadence-daily-brief";
const accountRef = (userId: string) => createHash("sha256").update(`cadence-daily-brief-account\0${userId}`).digest("base64url");

export async function getDailyBriefSettings(caller: CalendarCaller): Promise<DailyBriefSettings> {
  const preferences = await readDailyBriefPreferences(caller.client);
  const timezone = await readAdvisorProfileTimezone(caller.client, caller.user.id);
  return { accountRef: accountRef(caller.user.id), available: !!process.env.OPENAI_API_KEY,
    enabled: preferences.enabled, includeCalendar: preferences.includeCalendar, revision: preferences.revision,
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
  const key = createHash("sha256").update(`cadence-daily-brief-refs\0${apiKey}`).digest();
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
      const expiresAt = clock().add({ minutes: 5 }).toString();
      const readAuthorization = async (): Promise<AdvisorAuthorizationFence> => {
        signal.throwIfAborted();
        const current = await readDailyBriefPreferences(caller.client, signal);
        if (!current.enabled || current.revision !== preferences.revision) throw new DailyBriefError("context_changed");
        const behaviorIds = await listDailyBriefBehaviorIds(caller.client, caller.user.id, signal);
        let calendar: AdvisorAuthorizationFence["calendar"] = null;
        if (preferences.includeCalendar) {
          const connection = await getCalendarConnection(caller);
          if (connection.status !== "connected" || connection.generation !== preferences.calendarConnectionGeneration || connection.selectionRevision !== preferences.calendarSelectionRevision) {
            throw new DailyBriefError("context_changed");
          }
          calendar = { calendarIds: [...connection.preferences.selectedCalendarIds].sort(), connectionGeneration: connection.generation, selectionRevision: connection.selectionRevision };
        }
        signal.throwIfAborted();
        return { userId: caller.user.id, clientId: CLIENT_ID, accountRef: accountRef(caller.user.id),
          grantGeneration: preferences.revision, grantExpiresAt: expiresAt, behaviorIds, calendar };
      };
      const authorization = await readAuthorization();
      const context = await readAdvisorDayContext({ caller, authorization, revalidateAuthorization: readAuthorization,
        includeGoogleCalendar: preferences.includeCalendar, localDate: admission.localDate, opaqueRefKey: key, clock });
      const assertCurrent = async () => {
        signal.throwIfAborted();
        const revision = await readAdvisorCadenceRevision(caller.client, { localDate: context.localDate,
          historyStartLocalDate: Temporal.PlainDate.from(context.localDate).subtract({ days: 90 }).toString(), behaviorIds: authorization.behaviorIds, signal });
        const timezone = await readAdvisorProfileTimezone(caller.client, caller.user.id);
        if (timezone !== context.timezone || createAdvisorOpaqueRef(key, authorization)("revision", revision) !== context.cadence.revision ||
            JSON.stringify(await readAuthorization()) !== JSON.stringify(authorization)) throw new DailyBriefError("context_changed");
        assertBriefContextFresh(context, clock());
        signal.throwIfAborted();
      };
      await assertCurrent();
      const modelSignal = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
      const briefing = await raceAbort(generateDailyBrief(context, { now: clock, signal: modelSignal,
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

function raceAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DailyBriefError("timeout"));
    if (signal.aborted) { void work.catch(() => undefined); abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
