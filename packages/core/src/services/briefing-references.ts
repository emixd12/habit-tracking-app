import { Temporal } from "@js-temporal/polyfill";
import rawCatalog from "../data/briefing-references.json";

/** Catalog summaries are original paraphrases, not redistributed source excerpts. */
export type BriefingReference = Readonly<{
  id: string;
  revision: string;
  title: string;
  url: string;
  publishedAt: string | null;
  reviewedAt: string;
  kind: "research_evidence" | "interpretation" | "editorial_guidance";
  summary: string;
  applicability: string;
  limitations: string;
  status: "active" | "withdrawn";
}>;

export function parseBriefingReferenceCatalog(value: unknown): { version: string; references: readonly BriefingReference[] } {
  const fail = (): never => { throw new Error("invalid_reference_catalog"); };
  const record = (item: unknown, keys: readonly string[]): Record<string, unknown> => {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).sort().join() !== [...keys].sort().join()) return fail();
    return item as Record<string, unknown>;
  };
  const text = (item: unknown): string => typeof item === "string" && item.trim() ? item : fail();
  const date = (item: unknown): string => {
    const day = text(item);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail();
    try { Temporal.PlainDate.from(day); } catch { return fail(); }
    return day;
  };
  const catalog = record(value, ["version", "references"]);
  if (!Array.isArray(catalog.references)) return fail();
  const ids = new Set<string>();
  const references = catalog.references.map((item): BriefingReference => {
    const source = record(item, ["id", "revision", "title", "url", "publishedAt", "reviewedAt", "kind", "summary", "applicability", "limitations", "status"]);
    const id = text(source.id), url = text(source.url);
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) || ids.has(id) || !/^https:\/\/[^\s]+$/.test(url)) return fail();
    ids.add(id);
    if (source.kind !== "research_evidence" && source.kind !== "interpretation" && source.kind !== "editorial_guidance") return fail();
    if (source.status !== "active" && source.status !== "withdrawn") return fail();
    return { id, url, revision: text(source.revision), title: text(source.title),
      publishedAt: source.publishedAt === null ? null : date(source.publishedAt), reviewedAt: date(source.reviewedAt),
      kind: source.kind, summary: text(source.summary), applicability: text(source.applicability),
      limitations: text(source.limitations), status: source.status };
  });
  return { version: text(catalog.version), references };
}

const catalog = parseBriefingReferenceCatalog(rawCatalog);
export const BRIEFING_REFERENCE_VERSION = catalog.version;
export const BRIEFING_REFERENCES: readonly BriefingReference[] = catalog.references;

export function selectBriefingReferences(ids: readonly string[], catalog: readonly BriefingReference[] = BRIEFING_REFERENCES) {
  if (ids.length > 4 || new Set(ids).size !== ids.length) throw new Error("invalid_reference_selection");
  const included: BriefingReference[] = [];
  const omissions: { id: string; reason: string }[] = [];
  let bytes = 0;
  for (const id of ids) {
    const source = catalog.find((entry) => entry.id === id);
    if (!source) { omissions.push({ id, reason: "missing" }); continue; }
    if (source.status === "withdrawn") { omissions.push({ id, reason: "withdrawn" }); continue; }
    if (!source.summary || !source.applicability || !source.limitations || !/^https:\/\//.test(source.url)) {
      omissions.push({ id, reason: "unsuitable" }); continue;
    }
    const size = encodeURIComponent(JSON.stringify(source)).replace(/%[0-9A-F]{2}/g, "x").length;
    if (size > 4096 || bytes + size > 8192) { omissions.push({ id, reason: "byte_limit" }); continue; }
    bytes += size;
    included.push(source);
  }
  return { version: BRIEFING_REFERENCE_VERSION, included, omissions };
}
