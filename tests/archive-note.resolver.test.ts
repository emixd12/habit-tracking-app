import { describe, expect, it } from "vitest";

import {
  appendArchiveNote,
  normalizeArchiveNote,
  parseArchiveNotes,
  replaceArchiveNote,
  serializeArchiveNotes,
} from "../packages/core/src/resolvers/archive-note.resolver";

const id = "11111111-1111-4111-8111-111111111111";
const archivedAt = "2026-09-05T12:00:00Z";

describe("archive note resolver", () => {
  it("defaults missing history and round-trips every valid entry", () => {
    expect(parseArchiveNotes(undefined)).toEqual([]);
    const notes = appendArchiveNote([], { id, archivedAt, note: "Reason", updatedAt: archivedAt });
    expect(parseArchiveNotes(serializeArchiveNotes(notes))).toEqual(notes);
  });

  it("normalizes UUID casing before duplicate detection", () => {
    const upper = id.toUpperCase();
    const row = { archived_at: archivedAt, note: null, updated_at: archivedAt };
    expect(parseArchiveNotes([{ id: upper, ...row }])[0]?.id).toBe(id);
    expect(() => parseArchiveNotes([{ id: upper, ...row }, { id, ...row }])).toThrow("duplicated");
  });

  it("trims input, converts blanks to null, and edits without removing the entry", () => {
    expect(normalizeArchiveNote("  Later  ")).toBe("Later");
    expect(normalizeArchiveNote("  ")).toBeNull();
    const notes = [{ id, archivedAt, note: "Reason", updatedAt: archivedAt }];
    expect(replaceArchiveNote(notes, { id, note: null, updatedAt: "2026-09-06T12:00:00Z" }))
      .toEqual([{ id, archivedAt, note: null, updatedAt: "2026-09-06T12:00:00Z" }]);
  });

  it("rejects malformed ids, instants, duplicate ids, and overlong text", () => {
    expect(() => parseArchiveNotes([{ id: "bad", archived_at: archivedAt, note: null, updated_at: archivedAt }]))
      .toThrow("must be a UUID");
    expect(() => parseArchiveNotes([{ id, archived_at: "2026-09-05", note: null, updated_at: archivedAt }]))
      .toThrow("must be a UTC instant");
    const row = { id, archived_at: archivedAt, note: null, updated_at: archivedAt };
    expect(() => parseArchiveNotes([row, row])).toThrow("duplicated");
    expect(() => normalizeArchiveNote("x".repeat(2001))).toThrow("2,000 characters or fewer");
  });

  it("rejects unknown keys and updates before the archive instant", () => {
    expect(() => parseArchiveNotes([{ id, archived_at: archivedAt, note: null, updated_at: archivedAt, extra: true }]))
      .toThrow("contain only");
    expect(() => parseArchiveNotes([{ id, archived_at: archivedAt, note: null, updated_at: "2026-09-04T12:00:00Z" }]))
      .toThrow("cannot be earlier");
    expect(() => replaceArchiveNote([], { id: "bad", note: null, updatedAt: archivedAt }))
      .toThrow("must be a UUID");
  });
});
