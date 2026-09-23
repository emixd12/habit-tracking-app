import { createHash } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";

import { resolveTravelEvidence, resolveTravelPlan } from "@cadence/core/resolvers/travel.resolver";
import { resolveBehaviorDurationEstimate } from "@cadence/core/resolvers/timeline-context.resolver";
import type { BehaviorDurationHistoryOccurrence, BehaviorDurationEstimate } from "@cadence/core/types/day-progress";
import type { TravelCollisionCandidate, TravelCommitment, TravelEndpoint } from "@cadence/core/types/travel";
import { consumeTravelRouteQuota } from "@/lib/db/travelRouteQuota.repo";
import { listOccurrencesBetweenLocalDates } from "@/lib/db/occurrences.repo";
import { getProfileTimezone, listUserBehaviors } from "@/lib/db/behaviors.repo";
import { listTimeSessionHistory } from "@/lib/db/timeSessions.repo";
import { projectTravelRouteDisplay, type TravelRoutesResponse } from "@/lib/services/travel-display.service";
import { assertTravelProviderReady, geocodeGoogleAddress, type TravelProviderConfig } from "@/lib/services/travel-provider";
import { TravelRoutingError, routeTravelLegs } from "@/lib/services/travel-routing.service";
import { parseTravelRouteRefreshRequest, type TravelRouteRefreshRequest } from "@/lib/services/travel-route-request";
import { getCalendarConnection, getCalendarEvents, type CalendarCaller } from "@/lib/services/google-calendar.service";
import { readTravelRouteSource } from "@/lib/services/travel-settings.service";

const ZERO_BUFFERS = { arrivalSeconds: 0, exitSeconds: 0, settlingSeconds: 0 } as const;

// Pending the Geocoding policy caching allowance check recorded in docs/qa/travel-release.md.
const BASE_GEOCODE_REUSE_ENABLED = false;
const BASE_GEOCODE_REUSE_MS = 30 * 24 * 60 * 60 * 1000;
const BASE_GEOCODE_REUSE_CAP = 500;
let baseGeocodeReuseEnabled = BASE_GEOCODE_REUSE_ENABLED;
/** Per-instance, in-memory only: place-id points for a saved base, never coordinates or text. */
const baseGeocodeReuse = new Map<string, { point: TravelEndpoint["point"]; expiresAt: number }>();

/** Test-only toggle for the base geocode reuse branch. */
export function setBaseGeocodeReuseForTest(enabled: boolean): void {
  baseGeocodeReuseEnabled = enabled;
  baseGeocodeReuse.clear();
}

export async function refreshTravelRoutes(
  caller: CalendarCaller,
  raw: unknown,
  config: TravelProviderConfig,
  now = Temporal.Now.instant(),
): Promise<TravelRoutesResponse> {
  assertTravelProviderReady(config);
  const request = parseTravelRouteRefreshRequest(raw);
  const source = await readTravelRouteSource(caller.client, caller.user.id);
  if (!source.settings.enabled || !source.settings.mode || !source.settings.routingConsentAt) {
    throw new TravelRoutingError({ code: "context_changed", retryable: false, retryAfterSeconds: null });
  }
  const calendar = await getCalendarConnection(caller);
  const snapshot = calendar.status === "connected"
    ? await getCalendarEvents(caller, request.startLocalDate, request.endLocalDate)
    : null;
  let admitted = false;
  let admitting: Promise<void> | null = null;
  // Admit only when a provider call is about to happen; later calls reuse the first admission.
  const ensureAdmitted = () => admitting ??= (async () => {
    const admission = await consumeTravelRouteQuota(caller.client);
    if (!admission.allowed) throw new TravelRoutingError({ code: "quota_exceeded", retryable: true, retryAfterSeconds: admission.retryAfterSeconds || 1 });
    admitted = true;
  })();
  const [behaviorOccurrences, behaviors, timezone] = await Promise.all([
    listOccurrencesBetweenLocalDates(caller.client, caller.user.id, request.startLocalDate, request.endLocalDate),
    listUserBehaviors(caller.client, caller.user.id),
    snapshot ? Promise.resolve(snapshot.requestedRange.timezone) : getProfileTimezone(caller.client, caller.user.id),
  ]);
  if (!timezone) throw new TravelRoutingError({ code: "context_changed", retryable: true, retryAfterSeconds: null });
  const historyRange = durationHistoryRange(request.startLocalDate);
  const readDurationHistory = () => Promise.all([
    listOccurrencesBetweenLocalDates(caller.client, caller.user.id, historyRange.startLocalDate, historyRange.endLocalDate),
    listTimeSessionHistory(caller.client, { userId: caller.user.id, startLocalDate: historyRange.startLocalDate, endLocalDate: historyRange.endLocalDate, includeArchived: false, throughStartedAt: now.toString() }),
  ]);
  const [historyOccurrences, historySessions] = await readDurationHistory();
  const durationEstimates = behaviorDurationEstimates(historyOccurrences, historySessions, behaviors, now, timezone);
  const occurrenceRevisions: [string, string][] = behaviorOccurrences.map((occurrence) => [occurrence.id, occurrence.updated_at]);
  const durationRevision = historyRevision(historyOccurrences, historySessions);
  const deadline = AbortSignal.timeout(45_000);
  const assertCurrent = async (signal: AbortSignal) => {
    if (signal.aborted) throw new TravelRoutingError({ code: "context_changed", retryable: true, retryAfterSeconds: null });
    const current = await readTravelRouteSource(caller.client, caller.user.id);
    const currentCalendar = await getCalendarConnection(caller);
    if (current.settingsRevision !== source.settingsRevision || current.settings.enabled !== source.settings.enabled ||
      current.settings.mode !== source.settings.mode || current.settings.routingConsentAt !== source.settings.routingConsentAt ||
      currentCalendar.status !== calendar.status || currentCalendar.generation !== calendar.generation || currentCalendar.selectionRevision !== calendar.selectionRevision ||
      !sameBehaviors(current.behaviors, source.behaviors) ||
      !sameOccurrences(await listOccurrencesBetweenLocalDates(caller.client, caller.user.id, request.startLocalDate, request.endLocalDate), occurrenceRevisions)) {
      throw new TravelRoutingError({ code: "context_changed", retryable: true, retryAfterSeconds: null });
    }
    const [currentHistoryOccurrences, currentHistorySessions] = await readDurationHistory();
    if (historyRevision(currentHistoryOccurrences, currentHistorySessions) !== durationRevision) {
      throw new TravelRoutingError({ code: "context_changed", retryable: true, retryAfterSeconds: null });
    }
    if (snapshot) {
      const currentEvents = await getCalendarEvents(caller, request.startLocalDate, request.endLocalDate);
      if (!sameCalendarRevisions(snapshot.events, currentEvents.events)) {
        throw new TravelRoutingError({ code: "context_changed", retryable: true, retryAfterSeconds: null });
      }
    }
    if (signal.aborted) throw new TravelRoutingError({ code: "context_changed", retryable: true, retryAfterSeconds: null });
  };
  await assertCurrent(deadline);
  const calendarCommitmentsValue = await calendarCommitments(snapshot?.events ?? [], request, source.settingsRevision, config, now, assertCurrent, ensureAdmitted, deadline);
  const behaviorCommitmentsValue = await behaviorCommitments(behaviorOccurrences, source.behaviors, durationEstimates, timezone, config, now, assertCurrent, ensureAdmitted, deadline);
  const behaviorOccupancy = behaviorOccupancyCandidates(behaviorOccurrences, source.behaviors, durationEstimates, timezone, now);
  const allCommitments = [...calendarCommitmentsValue, ...behaviorCommitmentsValue].sort((left, right) => compareInstants(left.startAt, right.startAt));
  // Keep one unrouteable boundary commitment when the bounded source window truncates.
  const commitments = allCommitments.length > 9 ? [...allCommitments.slice(0, 8), { ...allCommitments[8]!, endpoint: null, attendance: "unknown" as const }] : allCommitments;
  const base = commitments.length ? await baseEndpoint(caller.user.id, source.settings.baseLocationText, source.settingsRevision, config, now, assertCurrent, ensureAdmitted, deadline) : null;
  const device = request.device ? endpointForDevice(request.device, source.settingsRevision) : null;
  const journeyRevision = revision(source.settingsRevision, calendar.generation, calendar.selectionRevision, commitments, request.corrections);
  const plan = resolveTravelPlan({
    journeyRef: `${request.startLocalDate}:${request.endLocalDate}`,
    journeyRevision,
    grantRevision: source.settingsRevision,
    now: now.toString(),
    defaultMode: source.settings.mode,
    base,
    device,
    predictedOrigin: null,
    corrections: [],
    commitments,
    buffers: ZERO_BUFFERS,
  });
  if (!plan.legs.length) {
    await assertCurrent(deadline);
    const evidence = resolveTravelEvidence({ plan, results: [], collisionCandidates: collisionCandidates(plan.commitments, behaviorOccupancy), buffers: ZERO_BUFFERS, now: now.toString(), expectedJourneyRevision: journeyRevision, expectedGrantRevision: source.settingsRevision, modelProjection: "disabled" });
    return response(caller.user.id, source, projectTravelRouteDisplay(evidence));
  }
  const routed = await routeTravelLegs({
    routes: plan.legs.map((leg) => ({ id: leg.id, request: leg.request })),
    provider: config,
    quota: { consume: () => consumeTravelRouteQuota(caller.client) },
    quotaAlreadyConsumed: admitted,
    assertCurrent,
    now,
    signal: deadline,
  });
  await assertCurrent(deadline);
  const finalSnapshot = snapshot ? await getCalendarEvents(caller, request.startLocalDate, request.endLocalDate) : null;
  if (deadline.aborted || (snapshot && (!finalSnapshot || !sameCalendarRevisions(snapshot.events, finalSnapshot.events)))) {
    throw new TravelRoutingError({ code: "context_changed", retryable: true, retryAfterSeconds: null });
  }
  const results = routed.map((result) => ({
    legId: result.id,
    provenance: plan.legs.find((leg) => leg.id === result.id)!.provenance,
    estimate: result.estimate,
    unavailableReason: result.failure?.code,
  }));
  const evidence = resolveTravelEvidence({ plan, results, collisionCandidates: collisionCandidates(plan.commitments, behaviorOccupancy), buffers: ZERO_BUFFERS, now: now.toString(), expectedJourneyRevision: journeyRevision, expectedGrantRevision: source.settingsRevision, modelProjection: "disabled" });
  return response(caller.user.id, source, projectTravelRouteDisplay(evidence));
}

async function calendarCommitments(
  events: Awaited<ReturnType<typeof getCalendarEvents>>["events"],
  request: TravelRouteRefreshRequest,
  settingsRevision: string,
  config: TravelProviderConfig,
  now: Temporal.Instant,
  assertCurrent: (signal: AbortSignal) => Promise<void>,
  ensureAdmitted: () => Promise<void>,
  signal: AbortSignal,
): Promise<TravelCommitment[]> {
  const correctionById = new Map(request.corrections.map((correction) => [correction.eventId, correction]));
  const allTimed = events.filter((event) => event.kind === "timed");
  for (const correction of request.corrections) {
    const event = allTimed.find((candidate) => candidate.id === correction.eventId);
    if (!event || eventRevision(event) !== correction.revision) throw new TravelRoutingError({ code: "context_changed", retryable: true, retryAfterSeconds: null });
  }
  const prospective = allTimed
    .filter((event) => event.state !== "cancelled" && event.currentUserResponse !== "declined" && afterNow(event.startAt, now) && correctionById.get(event.id)?.attendance !== "remote")
    .sort((left, right) => compareInstants(left.startAt, right.startAt));
  const timed = prospective.length > 9 ? prospective.slice(0, 9) : prospective;
  const commitments: TravelCommitment[] = [];
  for (const [index, event] of timed.entries()) {
    const correction = correctionById.get(event.id);
    const locationText = correction?.locationText ?? (event.location || null);
    const overflow = prospective.length > 9 && index === 8;
    const attendance = overflow ? "unknown" : correction?.attendance ?? (locationText ? (event.conference ? "hybrid" : "physical") : "unknown");
    commitments.push({
      ref: event.id,
      revision: eventRevision(event),
      kind: "calendar",
      startAt: event.startAt,
      endAt: event.endUnspecified ? null : event.endAt,
      attendance,
      endpoint: attendance === "physical"
        ? await endpointForText(locationText, event.id, correction ? "correction" : "calendar", correction?.revision ?? eventRevision(event), config, now, assertCurrent, ensureAdmitted, signal)
        : null,
      mode: null,
      excluded: event.state === "cancelled" || event.currentUserResponse === "declined",
    } as TravelCommitment);
  }
  return commitments;
}

async function behaviorCommitments(
  occurrences: Awaited<ReturnType<typeof listOccurrencesBetweenLocalDates>>,
  behaviors: readonly { id: string; locationText: string | null; updatedAt: string }[],
  durations: ReadonlyMap<string, BehaviorDurationEstimate>,
  timezone: string,
  config: TravelProviderConfig,
  now: Temporal.Instant,
  assertCurrent: (signal: AbortSignal) => Promise<void>,
  ensureAdmitted: () => Promise<void>,
  signal: AbortSignal,
): Promise<TravelCommitment[]> {
  const behaviorById = new Map(behaviors.map((behavior) => [behavior.id, behavior]));
  const prospective = occurrences
    .filter((occurrence) => occurrence.status === "unresolved" && afterNow(occurrence.scheduled_for, now) && !!behaviorById.get(occurrence.behavior_id)?.locationText)
    .sort((left, right) => compareInstants(left.scheduled_for, right.scheduled_for));
  const candidates = prospective.length > 9 ? prospective.slice(0, 9) : prospective;
  const commitments: TravelCommitment[] = [];
  for (const [index, occurrence] of candidates.entries()) {
    const behavior = behaviorById.get(occurrence.behavior_id);
    if (!behavior?.locationText) continue;
    const endAt = behaviorEndAt(occurrence, durations.get(occurrence.behavior_id), timezone);
    const isExcluded = false;
    const overflow = prospective.length > 9 && index === 8;
    const endpoint = !overflow
      ? await endpointForText(behavior.locationText, occurrence.id, "behavior", `${behavior.updatedAt}:${occurrence.updated_at}`, config, now, assertCurrent, ensureAdmitted, signal)
      : null;
    commitments.push({
      ref: occurrence.id,
      revision: `${behavior.updatedAt}:${occurrence.updated_at}`,
      kind: "behavior",
      startAt: occurrence.scheduled_for,
      endAt,
      attendance: overflow ? "unknown" : "physical",
      endpoint,
      mode: null,
      excluded: isExcluded,
    });
  }
  return commitments;
}

function behaviorOccupancyCandidates(
  occurrences: Awaited<ReturnType<typeof listOccurrencesBetweenLocalDates>>,
  behaviors: readonly { id: string; locationText: string | null; updatedAt: string }[],
  durations: ReadonlyMap<string, BehaviorDurationEstimate>,
  timezone: string,
  now: Temporal.Instant,
): TravelCollisionCandidate[] {
  const sourceById = new Map(behaviors.map((behavior) => [behavior.id, behavior]));
  return occurrences
    .filter((occurrence) => occurrence.status === "unresolved" && afterNow(occurrence.scheduled_for, now))
    .flatMap((occurrence) => {
      const source = sourceById.get(occurrence.behavior_id);
      // Located Behaviors already enter the travel plan. A nullable location
      // still occupies time, but must never break the route chain.
      if (!source || source.locationText) return [];
      const endAt = behaviorEndAt(occurrence, durations.get(occurrence.behavior_id), timezone);
      return endAt ? [{ ref: occurrence.id, kind: "behavior" as const, startAt: occurrence.scheduled_for, endAt }] : [];
    });
}

function behaviorEndAt(
  occurrence: Awaited<ReturnType<typeof listOccurrencesBetweenLocalDates>>[number],
  estimate: BehaviorDurationEstimate | undefined,
  timezone: string,
): string | null {
  try {
    if (occurrence.schedule_kind === "range" && occurrence.schedule_end_time) {
      return Temporal.PlainDate.from(occurrence.local_date).toZonedDateTime({ timeZone: timezone, plainTime: Temporal.PlainTime.from(occurrence.schedule_end_time) }).toInstant().toString();
    }
    if (occurrence.schedule_kind === "exact" && estimate?.kind === "known") return Temporal.Instant.from(occurrence.scheduled_for).add({ seconds: estimate.seconds }).toString();
  } catch { return null; }
  return null;
}

async function baseEndpoint(userId: string, text: string | null, settingsRevision: string, config: TravelProviderConfig, now: Temporal.Instant, assertCurrent: (signal: AbortSignal) => Promise<void>, ensureAdmitted: () => Promise<void>, signal: AbortSignal): Promise<TravelEndpoint | null> {
  if (!baseGeocodeReuseEnabled || !text) return endpointForText(text, "base", "saved_base", settingsRevision, config, now, assertCurrent, ensureAdmitted, signal);
  const key = `${userId}:${settingsRevision}`;
  const hit = baseGeocodeReuse.get(key);
  if (hit && hit.expiresAt > now.epochMilliseconds) {
    await assertCurrent(signal);
    return { ref: "base", point: hit.point, source: "saved_base", sourceRevision: settingsRevision, observedAt: now.toString() };
  }
  baseGeocodeReuse.delete(key);
  const endpoint = await endpointForText(text, "base", "saved_base", settingsRevision, config, now, assertCurrent, ensureAdmitted, signal);
  if (endpoint && endpoint.point.kind === "place_id") {
    baseGeocodeReuse.set(key, { point: endpoint.point, expiresAt: now.epochMilliseconds + BASE_GEOCODE_REUSE_MS });
    while (baseGeocodeReuse.size > BASE_GEOCODE_REUSE_CAP) baseGeocodeReuse.delete(baseGeocodeReuse.keys().next().value!);
  }
  return endpoint;
}

async function endpointForText(text: string | null, ref: string, source: TravelEndpoint["source"], sourceRevision: string, config: TravelProviderConfig, now: Temporal.Instant, assertCurrent: (signal: AbortSignal) => Promise<void>, ensureAdmitted: () => Promise<void>, signal: AbortSignal): Promise<TravelEndpoint | null> {
  if (!text) return null;
  await assertCurrent(signal);
  await ensureAdmitted();
  const result = await geocodeGoogleAddress(text, { config, signal, maxRetries: 0 });
  await assertCurrent(signal);
  return result.kind === "resolved" ? { ref, point: result.point, source, sourceRevision, observedAt: now.toString() } : null;
}

function endpointForDevice(device: NonNullable<TravelRouteRefreshRequest["device"]>, grantRevision: string): TravelEndpoint {
  return { ref: "device", point: { kind: "coordinates", latitude: device.latitude, longitude: device.longitude }, source: "device", sourceRevision: device.sampledAt, observedAt: device.sampledAt, accuracyMeters: device.accuracyMeters, grantRevision };
}

function eventRevision(event: { revision: { providerEtag: string | null; providerUpdatedAt: string | null }; id: string; startAt?: string; endAt?: string; location: string; conference: unknown; state: string }): string {
  if (event.revision.providerEtag || event.revision.providerUpdatedAt) return event.revision.providerEtag ?? event.revision.providerUpdatedAt!;
  return createHash("sha256").update(JSON.stringify([event.id, event.startAt ?? null, event.endAt ?? null, event.location, event.conference, event.state])).digest("base64url");
}

function revision(settingsRevision: string, generation: number, selectionRevision: number, commitments: readonly TravelCommitment[], corrections: TravelRouteRefreshRequest["corrections"]): string {
  return createHash("sha256").update(JSON.stringify({ settingsRevision, generation, selectionRevision, commitments: commitments.map(({ ref, revision: eventRevisionValue }) => [ref, eventRevisionValue]), corrections: corrections.map(({ eventId, revision: correctionRevision, attendance, locationText }) => [eventId, correctionRevision, attendance, locationText]) })).digest("base64url");
}

function sameBehaviors(left: readonly { id: string; locationText: string | null; updatedAt: string }[], right: readonly { id: string; locationText: string | null; updatedAt: string }[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameOccurrences(current: Awaited<ReturnType<typeof listOccurrencesBetweenLocalDates>>, expected: readonly (readonly [string, string])[]): boolean {
  return JSON.stringify(current.map((occurrence) => [occurrence.id, occurrence.updated_at])) === JSON.stringify(expected);
}

function sameCalendarRevisions(left: Awaited<ReturnType<typeof getCalendarEvents>>["events"], right: Awaited<ReturnType<typeof getCalendarEvents>>["events"]): boolean {
  const revisions = (events: typeof left) => events.map((event) => [event.id, eventRevision(event)]).sort((first, second) => first[0].localeCompare(second[0]));
  return JSON.stringify(revisions(left)) === JSON.stringify(revisions(right));
}

function durationHistoryRange(startLocalDate: string): { startLocalDate: string; endLocalDate: string } {
  const start = Temporal.PlainDate.from(startLocalDate);
  return { startLocalDate: start.subtract({ days: 90 }).toString(), endLocalDate: start.subtract({ days: 1 }).toString() };
}

function behaviorDurationEstimates(
  occurrences: Awaited<ReturnType<typeof listOccurrencesBetweenLocalDates>>,
  sessions: Awaited<ReturnType<typeof listTimeSessionHistory>>,
  behaviors: Awaited<ReturnType<typeof listUserBehaviors>>,
  now: Temporal.Instant,
  timezone: string,
): ReadonlyMap<string, BehaviorDurationEstimate> {
  const sessionsByOccurrence = new Map<string, typeof sessions>();
  for (const session of sessions) {
    const entries = sessionsByOccurrence.get(session.occurrence_id) ?? [];
    entries.push(session);
    sessionsByOccurrence.set(session.occurrence_id, entries);
  }
  const history: BehaviorDurationHistoryOccurrence[] = occurrences.map((occurrence) => ({
    id: occurrence.id, behaviorId: occurrence.behavior_id, localDate: occurrence.local_date,
    status: occurrence.status as BehaviorDurationHistoryOccurrence["status"],
    sessions: (sessionsByOccurrence.get(occurrence.id) ?? []).map((session) => ({
      id: session.id, userId: session.user_id, occurrenceId: session.occurrence_id,
      behaviorId: session.behavior_id, startedAt: session.started_at, stoppedAt: session.stopped_at,
    })),
  }));
  return new Map(behaviors.map((behavior) => [behavior.id, resolveBehaviorDurationEstimate({
    behaviorId: behavior.id, defaultDurationMinutes: behavior.default_duration_minutes,
    occurrences: history, now, timezone,
  })]));
}

function historyRevision(
  occurrences: Awaited<ReturnType<typeof listOccurrencesBetweenLocalDates>>,
  sessions: Awaited<ReturnType<typeof listTimeSessionHistory>>,
): string {
  return createHash("sha256").update(JSON.stringify({
    occurrences: occurrences.map((occurrence) => [occurrence.id, occurrence.updated_at]),
    sessions: sessions.map((session) => [session.id, session.started_at, session.stopped_at]),
  })).digest("base64url");
}

function afterNow(value: string, now: Temporal.Instant): boolean {
  try { return Temporal.Instant.compare(Temporal.Instant.from(value), now) > 0; }
  catch { return false; }
}

function compareInstants(left: string, right: string): number {
  return Temporal.Instant.compare(Temporal.Instant.from(left), Temporal.Instant.from(right));
}

function collisionCandidates(commitments: readonly TravelCommitment[], occupancy: readonly TravelCollisionCandidate[]): TravelCollisionCandidate[] {
  const candidates = commitments
    .filter((commitment) => !commitment.excluded)
    .map((commitment) => ({
      ref: commitment.ref,
      kind: commitment.kind === "behavior" ? "behavior" as const : "commitment" as const,
      startAt: commitment.startAt,
      endAt: commitment.endAt,
    }));
  const refs = new Set(candidates.map((candidate) => candidate.ref));
  return [...candidates, ...occupancy.filter((candidate) => !refs.has(candidate.ref))];
}

function response(accountId: string, source: Awaited<ReturnType<typeof readTravelRouteSource>>, evidence: TravelRoutesResponse["evidence"]): TravelRoutesResponse {
  const expiresAt = evidence?.legs.reduce<string | null>((earliest, leg) => !leg.estimate ? earliest : !earliest || leg.estimate.expiresAt < earliest ? leg.estimate.expiresAt : earliest, null)
    ?? Temporal.Now.instant().add({ seconds: 300 }).toString();
  return { accountId, mode: source.settings.mode, navigationPreference: source.settings.navigationPreference, settingsRevision: source.settingsRevision, expiresAt, evidence };
}
