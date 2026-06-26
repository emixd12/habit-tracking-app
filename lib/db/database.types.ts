export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      behavior_schedule_slots: {
        Row: {
          behavior_id: string
          behavior_schedule_id: string | null
          created_at: string
          end_time: string | null
          id: string
          kind: string
          preset: string | null
          sort_order: number
          start_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          behavior_id: string
          behavior_schedule_id?: string | null
          created_at?: string
          end_time?: string | null
          id?: string
          kind: string
          preset?: string | null
          sort_order?: number
          start_time: string
          updated_at?: string
          user_id: string
        }
        Update: {
          behavior_id?: string
          behavior_schedule_id?: string | null
          created_at?: string
          end_time?: string | null
          id?: string
          kind?: string
          preset?: string | null
          sort_order?: number
          start_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "behavior_schedule_slots_behavior_id_fkey"
            columns: ["behavior_id"]
            isOneToOne: false
            referencedRelation: "behaviors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "behavior_schedule_slots_behavior_owner_fkey"
            columns: ["user_id", "behavior_id"]
            isOneToOne: false
            referencedRelation: "behaviors"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "behavior_schedule_slots_schedule_owner_fkey"
            columns: ["user_id", "behavior_schedule_id"]
            isOneToOne: false
            referencedRelation: "behavior_schedules"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      behavior_schedules: {
        Row: {
          behavior_id: string
          created_at: string
          id: string
          recurrence_rule: Json
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          behavior_id: string
          created_at?: string
          id?: string
          recurrence_rule: Json
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          behavior_id?: string
          created_at?: string
          id?: string
          recurrence_rule?: Json
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "behavior_schedules_behavior_id_fkey"
            columns: ["behavior_id"]
            isOneToOne: false
            referencedRelation: "behaviors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "behavior_schedules_behavior_owner_fkey"
            columns: ["user_id", "behavior_id"]
            isOneToOne: false
            referencedRelation: "behaviors"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      behaviorlog_import_record_mappings: {
        Row: {
          created_at: string
          external_id: string
          id: string
          import_run_id: string
          local_id: string
          record_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          import_run_id: string
          local_id: string
          record_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          import_run_id?: string
          local_id?: string
          record_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "behaviorlog_import_record_mappings_import_run_owner_fkey"
            columns: ["user_id", "import_run_id"]
            isOneToOne: false
            referencedRelation: "behaviorlog_import_runs"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      behaviorlog_import_runs: {
        Row: {
          bundle_fingerprint: string | null
          bundle_format: string
          completed_at: string | null
          created_at: string
          dry_run_summary: Json
          failure_message: string | null
          id: string
          import_mode: string
          manifest_sha256: string | null
          privacy_redaction_level: string | null
          producer_name: string | null
          producer_version: string | null
          schema_version: string | null
          started_at: string
          status: string
          subject_id_strategy: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bundle_fingerprint?: string | null
          bundle_format: string
          completed_at?: string | null
          created_at?: string
          dry_run_summary?: Json
          failure_message?: string | null
          id?: string
          import_mode: string
          manifest_sha256?: string | null
          privacy_redaction_level?: string | null
          producer_name?: string | null
          producer_version?: string | null
          schema_version?: string | null
          started_at?: string
          status?: string
          subject_id_strategy?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bundle_fingerprint?: string | null
          bundle_format?: string
          completed_at?: string | null
          created_at?: string
          dry_run_summary?: Json
          failure_message?: string | null
          id?: string
          import_mode?: string
          manifest_sha256?: string | null
          privacy_redaction_level?: string | null
          producer_name?: string | null
          producer_version?: string | null
          schema_version?: string | null
          started_at?: string
          status?: string
          subject_id_strategy?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      behaviors: {
        Row: {
          active: boolean
          archived_at: string | null
          browser_reminder_enabled: boolean
          category_id: string | null
          created_at: string
          description: string | null
          email_reminder_enabled: boolean
          id: string
          recurrence_rule: Json
          reminder_offset_minutes: number
          scheduled_time: string
          timezone: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          browser_reminder_enabled?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          email_reminder_enabled?: boolean
          id?: string
          recurrence_rule: Json
          reminder_offset_minutes?: number
          scheduled_time: string
          timezone?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          browser_reminder_enabled?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          email_reminder_enabled?: boolean
          id?: string
          recurrence_rule?: Json
          reminder_offset_minutes?: number
          scheduled_time?: string
          timezone?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "behaviors_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "behaviors_category_owner_fkey"
            columns: ["user_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      imported_interventions: {
        Row: {
          behavior_external_id: string
          behavior_id: string | null
          channel: string
          created_at: string
          delivery_status: string
          external_id: string
          failure_reason: string | null
          id: string
          import_run_id: string
          intervention_type: string | null
          metadata: Json
          occurrence_external_id: string
          occurrence_id: string | null
          redacted_sensitivity_indicators: Json
          scheduled_send_at: string
          sent_at: string | null
          source_capture_method: string
          source_confidence: string
          source_original_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          behavior_external_id: string
          behavior_id?: string | null
          channel: string
          created_at?: string
          delivery_status: string
          external_id: string
          failure_reason?: string | null
          id?: string
          import_run_id: string
          intervention_type?: string | null
          metadata?: Json
          occurrence_external_id: string
          occurrence_id?: string | null
          redacted_sensitivity_indicators?: Json
          scheduled_send_at: string
          sent_at?: string | null
          source_capture_method?: string
          source_confidence?: string
          source_original_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          behavior_external_id?: string
          behavior_id?: string | null
          channel?: string
          created_at?: string
          delivery_status?: string
          external_id?: string
          failure_reason?: string | null
          id?: string
          import_run_id?: string
          intervention_type?: string | null
          metadata?: Json
          occurrence_external_id?: string
          occurrence_id?: string | null
          redacted_sensitivity_indicators?: Json
          scheduled_send_at?: string
          sent_at?: string | null
          source_capture_method?: string
          source_confidence?: string
          source_original_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "imported_interventions_behavior_owner_fkey"
            columns: ["user_id", "behavior_id"]
            isOneToOne: false
            referencedRelation: "behaviors"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "imported_interventions_import_run_owner_fkey"
            columns: ["user_id", "import_run_id"]
            isOneToOne: false
            referencedRelation: "behaviorlog_import_runs"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "imported_interventions_occurrence_owner_fkey"
            columns: ["user_id", "occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      imported_notes: {
        Row: {
          body_markdown: string
          created_at: string
          external_id: string
          id: string
          import_run_id: string
          imported_created_at: string
          imported_updated_at: string | null
          metadata: Json
          note_role: string
          sensitivity: string | null
          source_capture_method: string
          source_confidence: string
          source_original_id: string | null
          target_external_id: string
          target_local_id: string | null
          target_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body_markdown: string
          created_at?: string
          external_id: string
          id?: string
          import_run_id: string
          imported_created_at: string
          imported_updated_at?: string | null
          metadata?: Json
          note_role: string
          sensitivity?: string | null
          source_capture_method: string
          source_confidence: string
          source_original_id?: string | null
          target_external_id: string
          target_local_id?: string | null
          target_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body_markdown?: string
          created_at?: string
          external_id?: string
          id?: string
          import_run_id?: string
          imported_created_at?: string
          imported_updated_at?: string | null
          metadata?: Json
          note_role?: string
          sensitivity?: string | null
          source_capture_method?: string
          source_confidence?: string
          source_original_id?: string | null
          target_external_id?: string
          target_local_id?: string | null
          target_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "imported_notes_import_run_owner_fkey"
            columns: ["user_id", "import_run_id"]
            isOneToOne: false
            referencedRelation: "behaviorlog_import_runs"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      occurrence_status_events: {
        Row: {
          behavior_id: string
          created_at: string
          effective_at: string | null
          id: string
          local_date: string
          occurrence_id: string
          previous_status: string | null
          reason_code: string | null
          recorded_at: string
          revises_event_id: string | null
          source_capture_method: string
          source_confidence: string
          status: string
          status_semantics: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          behavior_id: string
          created_at?: string
          effective_at?: string | null
          id?: string
          local_date: string
          occurrence_id: string
          previous_status?: string | null
          reason_code?: string | null
          recorded_at: string
          revises_event_id?: string | null
          source_capture_method?: string
          source_confidence?: string
          status: string
          status_semantics: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          behavior_id?: string
          created_at?: string
          effective_at?: string | null
          id?: string
          local_date?: string
          occurrence_id?: string
          previous_status?: string | null
          reason_code?: string | null
          recorded_at?: string
          revises_event_id?: string | null
          source_capture_method?: string
          source_confidence?: string
          status?: string
          status_semantics?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "occurrence_status_events_occurrence_owner_fkey"
            columns: ["user_id", "occurrence_id", "behavior_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["user_id", "id", "behavior_id"]
          },
          {
            foreignKeyName: "occurrence_status_events_revises_event_owner_fkey"
            columns: ["user_id", "revises_event_id"]
            isOneToOne: false
            referencedRelation: "occurrence_status_events"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      occurrence_sync_state: {
        Row: {
          created_at: string
          last_successful_sync_at: string | null
          last_sync_behavior_count: number
          last_sync_created_count: number
          last_sync_deleted_count: number
          last_sync_updated_count: number
          last_synced_local_date: string | null
          stale: boolean
          stale_reason: string | null
          synced_through_local_date: string | null
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_successful_sync_at?: string | null
          last_sync_behavior_count?: number
          last_sync_created_count?: number
          last_sync_deleted_count?: number
          last_sync_updated_count?: number
          last_synced_local_date?: string | null
          stale?: boolean
          stale_reason?: string | null
          synced_through_local_date?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_successful_sync_at?: string | null
          last_sync_behavior_count?: number
          last_sync_created_count?: number
          last_sync_deleted_count?: number
          last_sync_updated_count?: number
          last_synced_local_date?: string | null
          stale?: boolean
          stale_reason?: string | null
          synced_through_local_date?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      occurrences: {
        Row: {
          behavior_id: string
          behavior_schedule_slot_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          local_date: string
          note: string | null
          schedule_end_time: string | null
          schedule_kind: string
          schedule_preset: string | null
          schedule_start_time: string
          scheduled_for: string
          status: string
          status_marked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          behavior_id: string
          behavior_schedule_slot_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          local_date: string
          note?: string | null
          schedule_end_time?: string | null
          schedule_kind?: string
          schedule_preset?: string | null
          schedule_start_time: string
          scheduled_for: string
          status?: string
          status_marked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          behavior_id?: string
          behavior_schedule_slot_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          local_date?: string
          note?: string | null
          schedule_end_time?: string | null
          schedule_kind?: string
          schedule_preset?: string | null
          schedule_start_time?: string
          scheduled_for?: string
          status?: string
          status_marked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "occurrences_behavior_id_fkey"
            columns: ["behavior_id"]
            isOneToOne: false
            referencedRelation: "behaviors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_behavior_owner_fkey"
            columns: ["user_id", "behavior_id"]
            isOneToOne: false
            referencedRelation: "behaviors"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "occurrences_schedule_slot_owner_fkey"
            columns: ["user_id", "behavior_schedule_slot_id"]
            isOneToOne: false
            referencedRelation: "behavior_schedule_slots"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          active: boolean
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reminder_deliveries: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          id: string
          import_run_id: string | null
          imported_intervention_id: string | null
          occurrence_id: string
          processing_started_at: string | null
          scheduled_send_at: string
          sent_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          error?: string | null
          id?: string
          import_run_id?: string | null
          imported_intervention_id?: string | null
          occurrence_id: string
          processing_started_at?: string | null
          scheduled_send_at: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          import_run_id?: string | null
          imported_intervention_id?: string | null
          occurrence_id?: string
          processing_started_at?: string | null
          scheduled_send_at?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_deliveries_import_run_owner_fkey"
            columns: ["user_id", "import_run_id"]
            isOneToOne: false
            referencedRelation: "behaviorlog_import_runs"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "reminder_deliveries_imported_intervention_owner_fkey"
            columns: ["user_id", "imported_intervention_id"]
            isOneToOne: false
            referencedRelation: "imported_interventions"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "reminder_deliveries_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_deliveries_occurrence_owner_fkey"
            columns: ["user_id", "occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_behaviorlog_restore: {
        Args: { restore_payload: Json }
        Returns: Json
      }
      get_export_page_read_bundle: {
        Args: { range_end_local_date: string; range_start_local_date: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

