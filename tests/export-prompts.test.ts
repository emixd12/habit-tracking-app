import { describe, expect, it, vi } from "vitest";

import {
  EXPORT_PROMPT_SEMANTICS_PREAMBLE,
  EXPORT_PROMPT_TEMPLATES,
  copyPromptText,
  type ExportPromptTemplate,
} from "../lib/export-prompts";

const EXPECTED_IDS = [
  "notes-failure-themes",
  "weekday-time-dips",
  "category-comparison",
  "logging-chronology",
  "correction-patterns",
  "reminder-effectiveness",
  "definition-drift",
  "decision-debt",
  "schedule-load",
  "behavior-lifecycle",
  "realistic-timing",
  "cross-source-context",
] as const;

const RAW_STATUS_VALUES_SENTENCE =
  'In raw export files these statuses appear as "completed", "not_completed", and "unresolved".';

describe("export prompt templates", () => {
  it("keeps the twelve stable template ids in order", () => {
    const ids = EXPORT_PROMPT_TEMPLATES.map((template) => template.id);

    expect(EXPORT_PROMPT_TEMPLATES).toHaveLength(12);
    expect(ids).toEqual(EXPECTED_IDS);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("starts every prompt with the shared export semantics", () => {
    for (const template of EXPORT_PROMPT_TEMPLATES) {
      expect(template.prompt.startsWith(EXPORT_PROMPT_SEMANTICS_PREAMBLE)).toBe(
        true,
      );
      expect(template.prompt).toContain(
        "treat it as missing data, never as failure",
      );
      expect(template.prompt).toContain("Occurrence rows are current snapshots");
      expect(template.prompt).toContain(
        "Use local_date with my IANA timezone",
      );
      expect(template.prompt).toContain(
        "Report Completed versus Not Completed adherence and Unresolved counts separately",
      );
    }
  });

  it("states the export requirements for optional data", () => {
    expect(templateById("notes-failure-themes").requirements).toContain(
      "Include occurrence notes",
    );

    for (const id of [
      "logging-chronology",
      "correction-patterns",
      "realistic-timing",
    ]) {
      const requirements = templateById(id).requirements;
      expect(requirements).toContain("App JSON backup");
      expect(requirements).toContain("BehaviorLog");
      expect(requirements).toContain("status_events");
    }

    for (const id of ["definition-drift", "behavior-lifecycle"]) {
      const requirements = templateById(id).requirements;
      expect(requirements).toContain("App JSON backup");
      expect(requirements).toContain("BehaviorLog");
      expect(requirements).toContain("definition history");
    }

    const reminderRequirements = templateById(
      "reminder-effectiveness",
    ).requirements;
    expect(reminderRequirements).toContain("BehaviorLog");
    expect(reminderRequirements).toContain("data/interventions.jsonl");
  });

  it("keeps every field provider-generic", () => {
    const externalServiceName =
      /google|gmail|outlook|icloud|apple|fitbit|garmin|oura|whoop|notion|slack|chatgpt|openai|claude|anthropic|gemini|alexa|siri|todoist|strava/i;

    for (const template of EXPORT_PROMPT_TEMPLATES) {
      for (const field of [
        template.title,
        template.purpose,
        template.requirements,
        template.prompt,
      ]) {
        expect(field).not.toMatch(externalServiceName);
      }
    }
  });

  it("uses the canonical display casing for status vocabulary", () => {
    for (const template of EXPORT_PROMPT_TEMPLATES) {
      for (const field of [
        template.title,
        template.purpose,
        template.requirements,
      ]) {
        expectCanonicalStatusCasing(field);
      }

      const displayPrompt = template.prompt
        .replace(RAW_STATUS_VALUES_SENTENCE, "")
        .replaceAll("not_completed", "");
      expectCanonicalStatusCasing(displayPrompt);
    }
  });
});

describe("copyPromptText", () => {
  it("returns copied when the clipboard write succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(copyPromptText("Prompt text", { writeText })).resolves.toBe(
      "copied",
    );
    expect(writeText).toHaveBeenCalledWith("Prompt text");
  });

  it("returns failed when the clipboard write rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Unavailable"));

    await expect(copyPromptText("Prompt text", { writeText })).resolves.toBe(
      "failed",
    );
  });

  it("returns failed when the clipboard is unavailable", async () => {
    await expect(copyPromptText("Prompt text", undefined)).resolves.toBe(
      "failed",
    );
  });
});

function templateById(id: string): ExportPromptTemplate {
  const template = EXPORT_PROMPT_TEMPLATES.find((item) => item.id === id);

  if (!template) {
    throw new Error(`Missing export prompt template: ${id}`);
  }

  return template;
}

function expectCanonicalStatusCasing(text: string) {
  expect(text.match(/unresolved/gi) ?? []).toEqual(
    (text.match(/unresolved/gi) ?? []).map(() => "Unresolved"),
  );
  expect(text.match(/not completed/gi) ?? []).toEqual(
    (text.match(/not completed/gi) ?? []).map(() => "Not Completed"),
  );
  expect(text.match(/needs decision\b/gi) ?? []).toEqual(
    (text.match(/needs decision\b/gi) ?? []).map(() => "Needs decision"),
  );
}
