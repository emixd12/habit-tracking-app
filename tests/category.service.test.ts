import { describe, it, expect } from "vitest";
import { categorySnapshot, planCategoryChange } from "../packages/core/src/services/category.service";
const rows = [{ id: "a", name: "Home", description: null, sort_order: 0, updated_at: "2026-09-05T00:00:00Z" },
  { id: "b", name: "Work", description: "Office routines", sort_order: 1, updated_at: "2026-09-05T00:00:00Z" }];
function form(intent: string, values: Record<string, string> = {}) {
  const input = new FormData();
  for (const [key, value] of Object.entries({ intent, expected: categorySnapshot(rows), ...values })) input.set(key, value);
  return input;
}
describe("category management plans", () => {
  it("creates, renames, reorders, and deletes without mutating its snapshot", () => {
    expect(planCategoryChange(rows, form("create", { name: " Travel ", description: " Trips " }), "c", "now").categories[2]).toMatchObject({ id: "c", name: "Travel", description: "Trips" });
    expect(planCategoryChange(rows, form("update", { category_id: "b", name: "Office" }), "c", "now").categories[1]).toMatchObject({ id: "b", name: "Office", description: null });
    expect(planCategoryChange(rows, form("up", { category_id: "b" }), "c", "now").categories.map((row) => row.id)).toEqual(["b", "a"]);
    expect(planCategoryChange(rows, form("delete", { category_id: "a", confirm_delete: "yes" }), "c", "now")).toMatchObject({ deletedId: "a", categories: [{ id: "b", sort_order: 0 }] });
    expect(rows[0].name).toBe("Home");
  });
  it("rejects stale drafts, duplicate or invalid names, oversized descriptions, and unconfirmed deletion", () => {
    const nonText = form("create", { name: "Valid" });
    nonText.set("description", new Blob(["file content"]));
    expect(() => planCategoryChange(rows, nonText, "c", "now")).toThrow(/plain text/);
    for (const input of [form("create", { name: "home" }), form("create", { name: "" }), form("create", { name: "x".repeat(121) }),
      form("create", { name: "Good", description: "x".repeat(2001) }), form("create", { name: "Good", expected: "[]" }),
      form("delete", { category_id: "a" }), form("update", { category_id: "foreign", name: "X" })]) {
      expect(() => planCategoryChange(rows, input, "c", "now")).toThrow();
    }
  });
});
