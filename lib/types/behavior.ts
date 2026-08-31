export * from "@cadence/core/types/behavior";

import type { BehaviorActionState } from "@cadence/core/types/behavior";

export type BehaviorFormAction = (
  previousState: BehaviorActionState,
  formData: FormData,
) => Promise<BehaviorActionState>;
