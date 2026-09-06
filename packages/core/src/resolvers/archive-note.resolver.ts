import { Temporal } from "@js-temporal/polyfill";

import type { ArchiveNote } from "../types/behavior";
import type { Json } from "../types/json";

export const ARCHIVE_NOTE_MAX_LENGTH = 2_000;

export function normalizeArchiveNote(value: unknown): string | null {
  if (typeof value !== "string") {
    throw new Error("Archive note must be text.");
  }

  const note = value.trim();
  if (note.length > ARCHIVE_NOTE_MAX_LENGTH) {
    throw new Error(`Archive note must be ${ARCHIVE_NOTE_MAX_LENGTH.toLocaleString("en-US")} characters or fewer.`);
  }
  return note || null;
}

export function parseArchiveNotes(value: Json | undefined): ArchiveNote[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Archive notes must be an array.");

  const ids = new Set<string>();
  return value.map((item) => {
    if (!isObject(item)) throw new Error("Archive note entries must be objects.");
    if (Object.keys(item).sort().join(",") !== "archived_at,id,note,updated_at") {
      throw new Error("Archive note entries must contain only id, archived_at, note, and updated_at.");
    }
    const id = requiredUuid(item.id);
    if (ids.has(id)) throw new Error(`Archive note id ${id} is duplicated.`);
    ids.add(id);
    const note = item.note;
    if (note !== null && (typeof note !== "string" || note.trim() !== note || note.length === 0 || note.length > ARCHIVE_NOTE_MAX_LENGTH)) {
      throw new Error("Archive note text must be null or trimmed non-empty text up to 2,000 characters.");
    }
    const archivedAt = requiredInstant(item.archived_at, "archived_at");
    const updatedAt = requiredInstant(item.updated_at, "updated_at");
    if (Temporal.Instant.compare(updatedAt, archivedAt) < 0) {
      throw new Error("Archive note updated_at cannot be earlier than archived_at.");
    }
    return {
      id,
      archivedAt,
      note,
      updatedAt,
    };
  });
}

export function serializeArchiveNotes(notes: readonly ArchiveNote[]): Json {
  const parsed = parseArchiveNotes(notes.map((note) => ({
    id: note.id,
    archived_at: note.archivedAt,
    note: note.note,
    updated_at: note.updatedAt,
  })) as Json);
  return parsed.map((note) => ({
    id: note.id,
    archived_at: note.archivedAt,
    note: note.note,
    updated_at: note.updatedAt,
  }));
}

export function appendArchiveNote(
  notes: readonly ArchiveNote[],
  input: { id: string; archivedAt: string; note: string | null; updatedAt: string },
): ArchiveNote[] {
  return parseArchiveNotes(serializeArchiveNotes([...notes, input]));
}

export function replaceArchiveNote(
  notes: readonly ArchiveNote[],
  input: { id: string; note: string | null; updatedAt: string },
): ArchiveNote[] {
  const id = requiredUuid(input.id);
  let found = false;
  const updated = notes.map((note) => {
    if (note.id !== id) return note;
    found = true;
    return { ...note, note: input.note, updatedAt: input.updatedAt };
  });
  if (!found) throw new Error("Archive note not found.");
  return parseArchiveNotes(serializeArchiveNotes(updated));
}

function isObject(value: Json): value is { [key: string]: Json | undefined } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredUuid(value: Json | undefined): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Archive note id must be a UUID.");
  }
  return value.toLowerCase();
}

function requiredInstant(value: Json | undefined, field: string): string {
  if (typeof value !== "string") throw new Error(`Archive note ${field} must be a UTC instant.`);
  try {
    return Temporal.Instant.from(value).toString();
  } catch {
    throw new Error(`Archive note ${field} must be a UTC instant.`);
  }
}
