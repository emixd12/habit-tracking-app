import { DEFAULT_CATEGORY_NAMES } from "../types/database";
import type { PortabilitySnapshot } from "../types/portability-rows";

const DEFAULT_TIMEZONE = "America/New_York";

export function hasRecognizedLocalData(snapshot: PortabilitySnapshot & { reminderDeliveries?: readonly unknown[] }): boolean {
  if (snapshot.profile.timezone !== DEFAULT_TIMEZONE) return true;
  const categories = [...snapshot.categories]
    .sort((left, right) => left.sort_order - right.sort_order)
    .map(({ name }) => name);
  if (categories.length !== DEFAULT_CATEGORY_NAMES.length ||
      categories.some((name, index) => name !== DEFAULT_CATEGORY_NAMES[index])) return true;
  return snapshot.graphs.length > 0 || snapshot.definitionEvents.length > 0 ||
    snapshot.configurationEvents.length > 0 || snapshot.occurrences.length > 0 ||
    snapshot.statusEvents.length > 0 || snapshot.timeSessions.length > 0 ||
    snapshot.importRuns.length > 0 || snapshot.mappings.length > 0 ||
    snapshot.importedNotes.length > 0 || snapshot.importedInterventions.length > 0 ||
    (snapshot.reminderDeliveries?.length ?? 0) > 0;
}
