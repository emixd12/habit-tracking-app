import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { createBehavior, setBehaviorActive } from "@cadence/core/services/behavior.service";
import { planCategoryRemoval } from "@cadence/core/services/category.service";
import { createBehaviorStore } from "../../lib/db/behavior-store";
import { commitCategoryChange } from "../../lib/db/categories.repo";
import { listBehaviorCategories, listUserBehaviors, type AppSupabaseClient } from "../../lib/db/behaviors.repo";
import { listBehaviorConfigurationEvents } from "../../lib/db/behaviorConfigurationEvents.repo";
import { CONTRACT_VALUES } from "./behavior-store-contract";
import { getUserExportBundle } from "../../lib/services/export.service";
import { Temporal } from "@js-temporal/polyfill";

export async function exerciseCategorySqlContract(client: AppSupabaseClient, userId: string, stranger: AppSupabaseClient) {
  const now = "2026-09-05T00:00:00Z";
  let before = await listBehaviorCategories(client, userId);
  const id = randomUUID();
  await commitCategoryChange(client, before, [...before, { id, name: "Travel", description: "Routines while away", sort_order: 20, updated_at: now }], []);
  let categories = await listBehaviorCategories(client, userId);
  expect(categories.find((row) => row.id === id)?.description).toBe("Routines while away");
  await expect(commitCategoryChange(client, before, [], [])).rejects.toThrow();
  const foreign = await stranger.rpc("manage_categories", { expected_categories: categories, next_categories: [], behavior_changes: [] });
  expect(foreign.error).not.toBeNull();
  const store = createBehaviorStore(client, userId);
  const created = await createBehavior(store, { userId, timezone: "America/New_York", recordedAt: now,
    values: { ...CONTRACT_VALUES, title: "Travel routine", categoryId: id } });
  const archived = await createBehavior(store, { userId, timezone: "America/New_York", recordedAt: now,
    values: { ...CONTRACT_VALUES, title: "Archived travel routine", categoryId: id } });
  await setBehaviorActive(store, { behaviorId: archived.id, active: false, expectedUpdatedAt: archived.updated_at, newArchiveNoteId: crypto.randomUUID(), recordedAt: now });
  const baseline = (await listBehaviorConfigurationEvents(client, userId)).find((event) => event.behavior_id === created.id)!;
  const bundle = await getUserExportBundle({ range: "all", includeArchived: true, includeNotes: true, now: Temporal.Instant.from(now) });
  expect(bundle.jsonBackup.categories.find((row) => row.id === id)?.description).toBe("Routines while away");
  expect(bundle.markdownSummary).toContain("Routines while away");
  before = categories;
  await commitCategoryChange(client, before, before.map((row) => row.id === id ? { ...row, name: "Trips" } : row), []);
  categories = await listBehaviorCategories(client, userId);
  expect((await listBehaviorConfigurationEvents(client, userId)).find((event) => event.id === baseline.id)).toEqual(baseline);
  const changes = planCategoryRemoval(await listUserBehaviors(client, userId), id, now);
  const next = categories.filter((row) => row.id !== id);
  await expect(commitCategoryChange(client, categories, next, changes.map((change) => ({ ...change, expectedUpdatedAt: "2000-01-01T00:00:00Z" })))).rejects.toThrow();
  expect((await listUserBehaviors(client, userId)).find((row) => row.id === created.id)?.category_id).toBe(id);
  await commitCategoryChange(client, categories, next, changes);
  expect((await listUserBehaviors(client, userId)).find((row) => row.id === created.id)?.category_id).toBeNull();
  expect((await listBehaviorConfigurationEvents(client, userId)).filter((event) => event.behavior_id === created.id)).toHaveLength(2);
  expect((await listUserBehaviors(client, userId)).find((row) => row.id === archived.id)).toMatchObject({ category_id: null, active: false });
  expect((await listBehaviorConfigurationEvents(client, userId)).filter((event) => event.behavior_id === archived.id)).toHaveLength(3);
  expect((await listBehaviorConfigurationEvents(client, userId)).find((event) => event.id === baseline.id)).toEqual(baseline);
}
