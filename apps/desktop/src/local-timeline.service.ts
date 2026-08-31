import { Temporal } from "@js-temporal/polyfill";
import { resolveGenerationWindow } from "@cadence/core/resolvers/occurrence.resolver";
import { resolvePersistedTimeline } from "@cadence/core/services/timeline.service";
import { localCommand } from "./local-store";
import { ensureLocalOccurrencesFresh, toLocalBehaviorGraphRecord } from "./local-generation.service";
import { toTimeSession } from "./local-occurrence.service";

export async function loadLocalTimeline(futureDays = 7, now = Temporal.Now.instant()) {
  const profile = await localCommand("readProfile", {});
  await ensureLocalOccurrencesFresh(profile, now);
  const profileId = profile.id;
  const window = resolveGenerationWindow({ now, timezone: profile.timezone, horizonDays: 30 });
  const priorDate = Temporal.PlainDate.from(window.startLocalDate).subtract({ days: 1 }).toString();
  const [graphs, categories, visibleOccurrences, priorUnresolved] = await Promise.all([
    localCommand("readBehaviorGraphs", { profileId }),
    localCommand("readCategories", { profileId }),
    localCommand("readOccurrences", { profileId, startLocalDate: window.startLocalDate, endLocalDate: window.endLocalDate }),
    localCommand("readOccurrences", { profileId, startLocalDate: "0001-01-01", endLocalDate: priorDate, status: "unresolved" }),
  ]);
  const occurrences = [...priorUnresolved, ...visibleOccurrences];
  const history = await localCommand("readOccurrenceHistory", { profileId, occurrenceIds: occurrences.map(({ id }) => id) });
  const behaviors = graphs.map((graph) => toLocalBehaviorGraphRecord(graph, categories));
  return { profile, behaviors, categories,
    timeline: resolvePersistedTimeline({ behaviors, occurrences, timeSessions: history.timeSessions.map(toTimeSession),
      now, timezone: profile.timezone, futureDays }) };
}
