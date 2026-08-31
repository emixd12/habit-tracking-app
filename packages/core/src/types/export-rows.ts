import type { BehaviorGraphRecord } from "../behavior-store";
import type { OccurrenceRecord, OccurrenceStatusEventRecord } from "../data-store";
import type { Json } from "./json";

export type ExportPageBehaviorRow = Pick<BehaviorGraphRecord, "id" | "current_configuration_event_id" | "updated_at">;
export type ExportPageCategoryRow = { id: string; name: string; sort_order: number; created_at: string; updated_at: string };
export type ExportPageOccurrenceRow = Omit<OccurrenceRecord, "user_id" | "schedule_range_identity">;
export type ExportPageStatusEventRow = Omit<OccurrenceStatusEventRecord, "user_id">;
export type ExportPageReminderDeliveryRow = {
  id: string; occurrence_id: string; channel: string; scheduled_send_at: string; sent_at: string | null;
  status: string; error: string | null; processing_started_at: string | null; created_at: string; updated_at: string;
};
export type ExportTimeSessionRow = {
  id: string; occurrence_id: string; behavior_id: string; started_at: string; stopped_at: string | null;
};
export type ExportDefinitionEventRow = {
  id: string; behavior_id: string; previous_title: string | null; next_title: string;
  previous_description: string | null; next_description: string | null; changed_fields: string[];
  recorded_at: string; source: string; reason: string | null; created_at: string; updated_at: string;
};
export type ExportConfigurationEventRow = {
  id: string; behavior_id: string; event_kind: string; previous_configuration: Json | null;
  next_configuration: Json; changed_fields: string[]; recorded_at: string; effective_at: string;
  effective_local_date: string; timezone: string; source: string; reason_code: string; created_at: string;
};
