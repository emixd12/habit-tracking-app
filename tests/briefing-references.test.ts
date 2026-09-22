import { expect, it } from "vitest";
import { BRIEFING_REFERENCES, BRIEFING_REFERENCE_VERSION, parseBriefingReferenceCatalog, selectBriefingReferences } from "@cadence/core/services/briefing-references";
import document from "@/packages/core/src/data/briefing-references.json";

it("uses the editable reference document and rejects ambiguous or malformed catalog edits", () => {
  expect(parseBriefingReferenceCatalog(document)).toEqual({ version: BRIEFING_REFERENCE_VERSION, references: BRIEFING_REFERENCES });
  const source = document.references[0];
  for (const change of [{ kind: "proof" }, { status: "published" }, { reviewedAt: "2026-02-30" },
    { url: "javascript:alert(1)" }, { revision: "" }, { limitations: "" }, { prompt: "unrecognized field" }]) {
    expect(() => parseBriefingReferenceCatalog({ ...document, references: [{ ...source, ...change }] })).toThrow("invalid_reference_catalog");
  }
  expect(() => parseBriefingReferenceCatalog({ ...document, references: [source, source] })).toThrow("invalid_reference_catalog");
  expect(() => parseBriefingReferenceCatalog({ ...document, version: "" })).toThrow("invalid_reference_catalog");
  expect(() => parseBriefingReferenceCatalog({ ...document, references: null })).toThrow("invalid_reference_catalog");
});
it("bounds curated references and reports missing, withdrawn, unsuitable and oversized sources", () => {
  const source = BRIEFING_REFERENCES[0];
  expect(selectBriefingReferences([]).included).toEqual([]);
  expect(selectBriefingReferences([source.id]).included).toEqual([source]);
  expect(selectBriefingReferences(["missing"]).omissions[0].reason).toBe("missing");
  for (const [change, reason] of [[{status: "withdrawn"}, "withdrawn"], [{url: "javascript:alert(1)"}, "unsuitable"], [{summary: "x".repeat(8193)}, "byte_limit"]] as const) {
    expect(selectBriefingReferences([source.id], [{...source, ...change}]).omissions[0].reason).toBe(reason);
  }
  expect(() => selectBriefingReferences(["1", "2", "3", "4", "5"])).toThrow();
  expect(() => selectBriefingReferences([source.id, source.id])).toThrow();
});
