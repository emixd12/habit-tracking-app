import { Temporal } from "@js-temporal/polyfill";
import { resolveDueBehaviorArchives } from "@cadence/core/resolvers/occurrence.resolver";
import { setBehaviorActive } from "@cadence/core/services/behavior.service";

import { createLocalBehaviorStore } from "./local-behavior.service";
import { localCommand } from "./local-store";

export async function reconcileLocalBehaviorEndDates(
  now = Temporal.Now.instant(),
): Promise<number> {
  const profile = await localCommand("readProfile", {});
  const graphs = await localCommand("readBehaviorGraphs", {
    profileId: profile.id,
  });
  const due = resolveDueBehaviorArchives({
    now,
    behaviors: graphs.map(({ behavior }) => ({
      id: behavior.id,
      active: behavior.active,
      endDate: behavior.end_date,
      timezone: behavior.timezone,
    })),
  });
  const store = createLocalBehaviorStore(profile.id, now);
  let archivedCount = 0;

  for (const archive of due) {
    const graph = graphs.find(({ behavior }) => behavior.id === archive.id);
    if (!graph) continue;
    const behavior = await setBehaviorActive(store, {
      behaviorId: archive.id,
      active: false,
      automatic: true,
      expectedUpdatedAt: graph.behavior.updated_at,
      recordedAt: now.toString(),
      effectiveAt: archive.effectiveAt,
      newArchiveNoteId: crypto.randomUUID(),
    });
    if (!behavior.active && behavior.auto_archived_at === now.toString()) {
      archivedCount += 1;
    }
  }

  return archivedCount;
}
