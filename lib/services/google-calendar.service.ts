import { Temporal } from "@js-temporal/polyfill";
import type { User } from "@supabase/supabase-js";
import type { AppSupabaseClient } from "@/lib/db/behaviors.repo";
import { beginCalendarAttempt, consumeCalendarAttempt, installCalendarCredential, readCalendarCallbackUser, readCalendarConnection, readCalendarCredential, removeCalendarCredential, saveCalendarPreferences } from "@/lib/db/google-calendar.repo";
import type { CalendarConnection, CalendarConnectionView, CalendarPreferences } from "@/lib/types/google-calendar";
import { DEFAULT_CALENDAR_PREFERENCES } from "@/lib/types/google-calendar";
import { CalendarConnectionError, calendarGoogleSubject, createCalendarAuthorization, exchangeCalendarCode, hashCalendarState, openCalendarSecret, readCalendarOAuthConfig, refreshCalendarToken, revokeCalendarToken, sealCalendarSecret } from "./google-calendar-oauth";
import { readGoogleCalendarEvents, readGoogleCalendarCalendars, GoogleCalendarProviderError } from "./google-calendar-provider";

export type CalendarCaller = { client: AppSupabaseClient; user: User };
function config(requestOrigin?: string) { const value = readCalendarOAuthConfig(process.env, requestOrigin); if (!value) throw new CalendarConnectionError("not_configured"); return value; }
export async function getCalendarConnection(caller: CalendarCaller): Promise<CalendarConnectionView> {
  if (!readCalendarOAuthConfig()) return { accountId: caller.user.id, status: "not_configured", generation: 0, selectionRevision: 0, preferences: DEFAULT_CALENDAR_PREFERENCES };
  const connection = await readCalendarConnection(caller.client, caller.user.id);
  if (connection && connection.googleSubject !== calendarGoogleSubject(caller.user)) throw new CalendarConnectionError("same_account_required");
  return connection ? { accountId: caller.user.id, status: connection.status, generation: connection.generation, selectionRevision: connection.selectionRevision, preferences: connection.preferences }
    : { accountId: caller.user.id, status: "disconnected", generation: 0, selectionRevision: 0, preferences: DEFAULT_CALENDAR_PREFERENCES };
}
export async function startCalendarConnection(caller: CalendarCaller, target: "web" | "desktop", clientState = "", requestOrigin?: string) {
  const settings = config(requestOrigin);
  const googleSubject = calendarGoogleSubject(caller.user);
  if (target === "desktop" && !/^[a-zA-Z0-9_-]{32,128}$/.test(clientState)) throw new CalendarConnectionError("invalid_request");
  const existing = await readCalendarConnection(caller.client, caller.user.id);
  const generation = existing?.generation ?? 0;
  const flow = createCalendarAuthorization(settings, googleSubject);
  const stateHash = hashCalendarState(flow.state);
  await beginCalendarAttempt({ userId: caller.user.id, googleSubject, generation, stateHash, target, clientState,
    sealedVerifier: sealCalendarSecret(settings, flow.verifier, { purpose: "verifier", userId: caller.user.id, googleSubject, generation, stateHash }) });
  return { url: flow.url };
}
export async function finishCalendarConnection(input: { state: string; code: string | null; denied: boolean; cookieUser: User | null; requestOrigin?: string }): Promise<string> {
  const settings = config(input.requestOrigin);
  const fallback = new URL("/settings?calendar=error", settings.callbackUrl).toString();
  if (!/^[a-zA-Z0-9_-]{43}$/.test(input.state)) return fallback;
  const attempt = await consumeCalendarAttempt(hashCalendarState(input.state));
  if (!attempt) return fallback;
  let result = "error";
  try {
    if (attempt.target === "web" && input.cookieUser?.id !== attempt.userId) throw new CalendarConnectionError("unauthenticated");
    const user = await readCalendarCallbackUser(attempt.userId);
    if (calendarGoogleSubject(user) !== attempt.googleSubject) throw new CalendarConnectionError("same_account_required");
    if (input.denied) result = "cancelled";
    else {
      if (!input.code || input.code.length > 8192) throw new CalendarConnectionError("invalid_request");
      const verifier = openCalendarSecret(settings, attempt.sealedVerifier, { ...attempt, purpose: "verifier" });
      const token = await exchangeCalendarCode(settings, input.code, verifier, attempt.googleSubject);
      await installCalendarCredential(attempt, sealCalendarSecret(settings, token.refreshToken, { ...attempt, purpose: "refresh", generation: attempt.generation + 1, stateHash: undefined }));
      result = "connected";
    }
  } catch (error) {
    if (error instanceof CalendarConnectionError && (attempt.target === "web" || error.code === "same_account_required")) result = error.code;
  }
  if (attempt.target === "desktop") return `cadence://calendar/callback?${new URLSearchParams({ state: attempt.clientState, result })}`;
  return new URL(`/settings?calendar=${encodeURIComponent(result)}`, settings.callbackUrl).toString();
}
async function connected(caller: CalendarCaller): Promise<CalendarConnection> {
  config();
  const connection = await readCalendarConnection(caller.client, caller.user.id);
  if (!connection || connection.status !== "connected") throw new CalendarConnectionError("reconnect_required");
  if (connection.googleSubject !== calendarGoogleSubject(caller.user)) throw new CalendarConnectionError("same_account_required");
  return connection;
}
async function accessToken(connection: CalendarConnection): Promise<string> {
  const settings = config();
  try {
    const sealed = await readCalendarCredential(connection);
    const refresh = openCalendarSecret(settings, sealed, { ...connection, purpose: "refresh" });
    return await refreshCalendarToken(settings, refresh);
  } catch (error) {
    if (error instanceof CalendarConnectionError && error.code === "reconnect_required") await removeCalendarCredential(connection, "reconnect_required");
    throw error;
  }
}
async function assertCurrent(caller: CalendarCaller, old: CalendarConnection) {
  const current = await connected(caller);
  if (current.generation !== old.generation || current.selectionRevision !== old.selectionRevision) throw new CalendarConnectionError("connection_changed");
}
async function listCalendarsWithToken(accessToken: string, connection: CalendarConnection) {
  try { return await readGoogleCalendarCalendars({ accessToken }); }
  catch (error) {
    if (error instanceof GoogleCalendarProviderError) {
      if (error.failure.code === "reconnect_required") await removeCalendarCredential(connection, "reconnect_required");
      throw new CalendarConnectionError(error.failure.code);
    }
    throw error;
  }
}
export async function listCalendarCalendars(caller: CalendarCaller) {
  const connection = await connected(caller);
  const calendars = await listCalendarsWithToken(await accessToken(connection), connection);
  await assertCurrent(caller, connection);
  return { calendars };
}
export async function updateCalendarPreferences(caller: CalendarCaller, raw: unknown) {
  const connection = await connected(caller);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new CalendarConnectionError("invalid_request");
  const value = raw as Record<string, unknown>;
  for (const key of ["selectedCalendarIds", "hiddenCalendarIds"]) {
    const ids = value[key];
    if (!Array.isArray(ids) || ids.length > 32 || ids.some((id) => typeof id !== "string" || !id || id.length > 1024) || new Set(ids).size !== ids.length) throw new CalendarConnectionError("invalid_request");
  }
  if (typeof value.visible !== "boolean" || typeof value.showAllDay !== "boolean") throw new CalendarConnectionError("invalid_request");
  const preferences = value as CalendarPreferences;
  const available = await listCalendarsWithToken(await accessToken(connection), connection);
  if (preferences.selectedCalendarIds.some((id) => !available.some((calendar) => calendar.id === id)) || preferences.hiddenCalendarIds.some((id) => !preferences.selectedCalendarIds.includes(id))) throw new CalendarConnectionError("invalid_request");
  await assertCurrent(caller, connection);
  await saveCalendarPreferences(caller.client, caller.user.id, preferences);
  return getCalendarConnection(caller);
}
const pendingReads = new Map<string, Promise<Awaited<ReturnType<typeof readGoogleCalendarEvents>>>>();
export async function getCalendarEvents(caller: CalendarCaller, start: string, end: string) {
  const connection = await connected(caller);
  const { data: profile, error } = await caller.client.from("profiles").select("timezone").eq("id", caller.user.id).single();
  if (error || !profile) throw new CalendarConnectionError("provider_unavailable");
  let first: Temporal.PlainDate; let last: Temporal.PlainDate;
  try { first = Temporal.PlainDate.from(start); last = Temporal.PlainDate.from(end); }
  catch { throw new CalendarConnectionError("invalid_request"); }
  const today = Temporal.Now.instant().toZonedDateTimeISO(profile.timezone).toPlainDate();
  if (first.toString() !== start || last.toString() !== end || Temporal.PlainDate.compare(first, today) !== 0 || first.until(last).days < 0 || first.until(last).days > 30) throw new CalendarConnectionError("invalid_request");
  const key = JSON.stringify([caller.user.id, connection.generation, connection.selectionRevision, start, end, profile.timezone]);
  let pending = pendingReads.get(key);
  if (!pending) {
    pending = (async () => {
      const token = await accessToken(connection);
      const calendars = await listCalendarsWithToken(token, connection);
      const selected = connection.preferences.selectedCalendarIds.map((id) => {
        const calendar = calendars.find((value) => value.id === id);
        if (!calendar) throw new CalendarConnectionError("provider_unavailable");
        return calendar;
      });
      return readGoogleCalendarEvents({ accessToken: token, accountId: caller.user.id, connectionGeneration: connection.generation,
        calendars: selected, range: { startLocalDate: start, endLocalDate: end, timezone: profile.timezone, selectedCalendarIds: selected.map((calendar) => calendar.id) }, fetchedAt: Temporal.Now.instant().toString() });
    })();
    pendingReads.set(key, pending);
    void pending.finally(() => pendingReads.delete(key)).catch(() => undefined);
  }
  const result = await pending;
  await assertCurrent(caller, connection);
  if (!result.ok) {
    if (result.error.code === "reconnect_required") await removeCalendarCredential(connection, "reconnect_required");
    throw new CalendarConnectionError(result.error.code);
  }
  return result.snapshot;
}
export async function disconnectCalendar(caller: CalendarCaller) {
  const connection = await readCalendarConnection(caller.client, caller.user.id);
  let revocationFailed = false;
  if (connection) {
    if (connection.googleSubject !== calendarGoogleSubject(caller.user)) throw new CalendarConnectionError("same_account_required");
    const sealed = await removeCalendarCredential(connection, "disconnected");
    if (sealed) {
      try { await revokeCalendarToken(openCalendarSecret(config(), sealed, { ...connection, purpose: "refresh" })); }
      catch { revocationFailed = true; }
    }
  }
  return { ...await getCalendarConnection(caller), revocationFailed };
}
