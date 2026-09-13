import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { build } from "esbuild";
import { Temporal } from "@js-temporal/polyfill";

const compiled = await build({ entryPoints: [fileURLToPath(new URL("../../packages/core/src/resolvers/note-suggestion.resolver.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", write: false });
const { resolveNoteSuggestions, normalizeNoteShortcutText } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
const now = Temporal.Instant.from("2026-09-08T03:00:00Z");
const userId = "10000000-0000-4000-8000-000000000001";
const behaviorId = "20000000-0000-4000-8000-000000000001";
const occurrenceId = (i) => `30000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

const fixtures = JSON.parse(
  readFileSync(new URL("./2026-09-07-note-suggestion-provider-evaluation.fixtures.json", import.meta.url), "utf8"),
);

const normalize = (text) => normalizeNoteShortcutText(text).toLowerCase();

function propose(notes) {
  return resolveNoteSuggestions({ userId, now, context: {
    state: null, globalState: null,
    behavior: { id: behaviorId, user_id: userId, active: true, timezone: "America/New_York" },
    importedOccurrenceIds: [],
    notes: notes.map((note, index) => ({ id: occurrenceId(index), user_id: userId,
      behavior_id: behaviorId, note: note.text, local_date: "2026-09-07", scheduled_for: "2026-09-07T12:00:00Z" })),
  } }).map((entry) => ({ text: entry.text, evidenceIds: entry.evidence.map((ref) => ref.occurrence_id) }));
}

function validOutput(output, validIds) {
  return Array.isArray(output)
    && output.length <= 5
    && output.every((item) => typeof item.text === "string"
      && item.text.length > 0
      && [...item.text].length <= 160
      && Array.isArray(item.evidenceIds)
      && new Set(item.evidenceIds).size >= 3
      && item.evidenceIds.every((id) => validIds.has(id)));
}

let truePositives = 0;
let falsePositives = 0;
let falseNegatives = 0;

for (const fixture of fixtures) {
  const output = propose(fixture.notes);
  const texts = output.map(({ text }) => text);
  assert.deepEqual(texts, fixture.expectedDeterministic, fixture.id);
  assert.equal(validOutput(output, new Set(fixture.notes.map((_, i) => occurrenceId(i)))), true, fixture.id);

  const actual = new Set(texts.map(normalize));
  const gold = new Set(fixture.semanticGold.map(normalize));
  truePositives += [...actual].filter((text) => gold.has(text)).length;
  falsePositives += [...actual].filter((text) => !gold.has(text)).length;
  falseNegatives += [...gold].filter((text) => !actual.has(text)).length;
}

const iterations = 1_000;
const startedAt = performance.now();
for (let iteration = 0; iteration < iterations; iteration += 1) {
  for (const fixture of fixtures) propose(fixture.notes);
}
const elapsedMs = performance.now() - startedAt;

console.log(JSON.stringify({
  fixtureCases: fixtures.length,
  checks: "passed",
  structuredOutputsValid: fixtures.length,
  truePositives,
  falsePositives,
  falseNegatives,
  precision: truePositives / (truePositives + falsePositives),
  recall: truePositives / (truePositives + falseNegatives),
  benchmark: {
    iterations,
    evaluations: iterations * fixtures.length,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    meanMsPerEvaluation: Number((elapsedMs / (iterations * fixtures.length)).toFixed(6)),
  },
}, null, 2));
