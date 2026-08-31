import type { BehaviorDataStore } from "@cadence/core/behavior-store";
import { getBehaviorById, type AppSupabaseClient } from "./behaviors.repo";
import {
  createBehaviorWithAtomicScheduleGraph,
  updateBehaviorWithAtomicScheduleGraph,
} from "./behaviorDefinitionEvents.repo";

export function createBehaviorStore(supabase: AppSupabaseClient, userId: string): BehaviorDataStore {
  return {
    getBehaviorById: (id) => getBehaviorById(supabase, userId, id),
    createBehaviorWithAtomicScheduleGraph: (input) => createBehaviorWithAtomicScheduleGraph(supabase, input),
    updateBehaviorWithAtomicScheduleGraph: (input) => updateBehaviorWithAtomicScheduleGraph(supabase, input),
  };
}
