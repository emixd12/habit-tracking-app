export type BehaviorDefinitionChangedField = "title" | "description";

export type BehaviorDefinitionEventSource = "manual" | "import" | "system";

export type BehaviorDefinition = {
  title: string;
  description: string | null;
};

export type BehaviorDefinitionEventPlan = {
  previousTitle: string | null;
  nextTitle: string;
  previousDescription: string | null;
  nextDescription: string | null;
  changedFields: BehaviorDefinitionChangedField[];
  recordedAt: string;
  source: BehaviorDefinitionEventSource;
  reason: string | null;
};
