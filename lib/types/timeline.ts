export * from "@cadence/core/types/timeline";

import type { OccurrenceActionState, TimeTrackingActionState } from "@cadence/core/types/timeline";

export type OccurrenceFormAction = (
  previousState: OccurrenceActionState,
  formData: FormData,
) => Promise<OccurrenceActionState>;

export type TimeTrackingFormAction = (
  previousState: TimeTrackingActionState,
  formData: FormData,
) => Promise<TimeTrackingActionState>;
