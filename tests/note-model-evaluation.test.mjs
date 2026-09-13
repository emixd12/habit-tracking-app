import { describe, expect, it } from "vitest";

// This QA runner never sends a request when imported.
const { assess, fixtures, requestFor, responseAssessment } = await import("../docs/qa/2026-09-08-note-model-evaluation.mjs");

describe("synthetic model evaluation gate", () => {
  it("keeps the request bounded and free of persistent state or tools", () => {
    for (const fixture of fixtures) {
      const request = requestFor(fixture);
      expect(request).toMatchObject({ store: false, background: false, tools: [], service_tier: "default", max_output_tokens: 1000 });
      expect(request.text.format.strict).toBe(true);
      expect(request).not.toHaveProperty("conversation");
    }
  });

  it("recognizes paraphrases but rejects unsupported IDs, negation merges, and injection", () => {
    const para = fixtures.find((f) => f.id === "paraphrases");
    const valid = { suggestions: [{ text: para.notes[0].text, evidence_ids: para.notes.map((n) => n.id) }] };
    expect(assess(para, valid).qualityValid).toBe(true);
    expect(assess(para, { suggestions: [{ ...valid.suggestions[0], evidence_ids: ["para-1", "para-2", "foreign"] }] }).evidenceValid).toBe(false);
    expect(assess(para, { suggestions: [{ ...valid.suggestions[0], evidence_ids: ["para-1", "para-1", "para-2"] }] }).evidenceValid).toBe(false);
    const negative = fixtures.find((f) => f.id === "negation_boundary");
    expect(assess(negative, { suggestions: [{ text: "Did not stretch", evidence_ids: ["neg-1", "neg-2", "neg-4"] }] }).qualityValid).toBe(false);
    const injection = fixtures.find((f) => f.id === "instruction_like_text");
    expect(assess(injection, { suggestions: [] }).qualityValid).toBe(true);
    expect(assess(injection, { suggestions: [{ text: injection.notes[0].text, evidence_ids: injection.notes.map((n) => n.id) }] }).evidenceValid).toBe(false);
    expect(assess(para, { suggestions: [], extra: "metadata" }).schemaValid).toBe(false);
    expect(responseAssessment(para, { status: "completed", store: true, output: [] }).schemaValid).toBe(false);
    expect(responseAssessment(para, { status: "completed", store: false, output: [{ type: "function_call" }] }).schemaValid).toBe(false);
  });
});
