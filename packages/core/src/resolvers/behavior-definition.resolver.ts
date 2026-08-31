import type {
  BehaviorDefinition,
  BehaviorDefinitionChangedField,
  BehaviorDefinitionEventPlan,
  BehaviorDefinitionEventSource,
} from "../types/behavior-definition-event";

type BehaviorDefinitionEventContext = {
  recordedAt: string;
  source: BehaviorDefinitionEventSource;
  reason?: string | null;
};

export function planInitialBehaviorDefinitionEvent(
  input: BehaviorDefinitionEventContext & {
    definition: BehaviorDefinition;
  },
): BehaviorDefinitionEventPlan {
  const definition = normalizeBehaviorDefinition(input.definition);
  const changedFields: BehaviorDefinitionChangedField[] = ["title"];

  if (definition.description !== null) {
    changedFields.push("description");
  }

  return {
    previousTitle: null,
    nextTitle: definition.title,
    previousDescription: null,
    nextDescription: definition.description,
    changedFields,
    recordedAt: input.recordedAt,
    source: input.source,
    reason: input.reason ?? null,
  };
}

export function planBehaviorDefinitionChangeEvent(
  input: BehaviorDefinitionEventContext & {
    previousDefinition: BehaviorDefinition;
    nextDefinition: BehaviorDefinition;
  },
): BehaviorDefinitionEventPlan | null {
  const previousDefinition = normalizeBehaviorDefinition(
    input.previousDefinition,
  );
  const nextDefinition = normalizeBehaviorDefinition(input.nextDefinition);
  const changedFields: BehaviorDefinitionChangedField[] = [];

  if (previousDefinition.title !== nextDefinition.title) {
    changedFields.push("title");
  }

  if (previousDefinition.description !== nextDefinition.description) {
    changedFields.push("description");
  }

  if (changedFields.length === 0) {
    return null;
  }

  return {
    previousTitle: previousDefinition.title,
    nextTitle: nextDefinition.title,
    previousDescription: previousDefinition.description,
    nextDescription: nextDefinition.description,
    changedFields,
    recordedAt: input.recordedAt,
    source: input.source,
    reason: input.reason ?? null,
  };
}

export function normalizeBehaviorDefinition(
  definition: BehaviorDefinition,
): BehaviorDefinition {
  return {
    title: normalizeText(definition.title),
    description: normalizeOptionalText(definition.description),
  };
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = normalizeText(value);

  return normalized.length > 0 ? normalized : null;
}

function normalizeText(value: string): string {
  return value.trim();
}
