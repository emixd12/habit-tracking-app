// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BriefingWorkbenchGuide } from "@/app/design-system/BriefingWorkbenchGuide";
import ontology from "@/docs/ontology/briefing-workbench.json";
import presets from "@/packages/core/src/data/briefing-presets.json";
import references from "@/packages/core/src/data/briefing-references.json";

let container: HTMLDivElement;
let root: Root;
const copy = vi.fn();

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("fetch", vi.fn());
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy.mockResolvedValue(undefined) } });
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(() => root.render(<BriefingWorkbenchGuide repositoryRoot="/workspace/test repo" />));
});
afterEach(async () => {
  await act(() => root.unmount()); container.remove();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals(); vi.restoreAllMocks(); copy.mockReset();
});

it("exposes the actual editable documents, encoded editor links and original sources without any request", async () => {
  for (const [filename, value] of [["briefing-presets.json", presets], ["briefing-references.json", references], ["briefing-workbench-ontology.json", ontology]] as const) {
    const link = container.querySelector<HTMLAnchorElement>(`a[download="${filename}"]`)!;
    expect(JSON.parse(decodeURIComponent(link.href.split(",").slice(1).join(",")))).toEqual(value);
  }
  const document = container.querySelector('[aria-label="Preset document"]')!;
  expect(document.querySelector("a")?.getAttribute("href")).toBe("vscode://file/workspace/test%20repo/packages/core/src/data/briefing-presets.json");
  await act(() => document.querySelector<HTMLButtonElement>("button")!.click());
  expect(copy).toHaveBeenCalledWith("/workspace/test repo/packages/core/src/data/briefing-presets.json");
  expect(document.textContent).toContain("File path copied.");
  for (const source of references.references) expect(container.querySelector(`a[href="${source.url}"]`)?.getAttribute("rel")).toBe("noreferrer");
  expect(fetch).not.toHaveBeenCalled();
});

it("searches contract terms and opens a related definition by stable fragment", async () => {
  const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "config.tone");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(container.querySelectorAll("article").length).toBeLessThan(ontology.terms.length);
  const term = ontology.terms.find(term => term.id === "config.tone")!;
  expect(container.textContent).toContain(term.definition);
  const related = term.relatedIds[0];
  await act(() => {
    window.history.replaceState(null, "", `/#briefing-term-${related}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  await act(() => new Promise(resolve => requestAnimationFrame(resolve)));
  expect(container.querySelector<HTMLDetailsElement>("#briefing-glossary")!.open).toBe(true);
  expect(document.activeElement?.id).toBe(`briefing-term-${related}`);
  expect(input.value).toBe("");
  expect(fetch).not.toHaveBeenCalled();
});

it("provides a usable fallback when clipboard access is unavailable", async () => {
  copy.mockRejectedValue(new Error("unavailable"));
  const section = container.querySelector('[aria-label="Reference document"]')!;
  await act(() => section.querySelector<HTMLButtonElement>("button")!.click());
  expect(section.textContent).toContain("Copy unavailable. Select the file path above.");
  expect(section.querySelector("code")?.textContent).toBe("/workspace/test repo/packages/core/src/data/briefing-references.json");
});

it.each([
  ["no_feasible_option", "planner.outcome.no-feasible-option", "No feasible option"],
  ["completed_stopped_occurrence_mean", "duration.source.completed-mean", "Completed-session mean"],
  ["end_unspecified", "calendar.duration.unknown-end", "Unknown event end"],
])("finds raw contract value %s as well as readable labels", async (value, id, label) => {
  const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(container.querySelectorAll("article").length).toBeLessThan(ontology.terms.length);
  expect(document.getElementById(`briefing-term-${id}`)?.textContent).toContain(label);
});
