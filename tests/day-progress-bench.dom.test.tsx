// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RefreshProvider } from "@cadence/ui/runtime";
import { DayProgressBench } from "@/app/design-system/DayProgressBench";

let container: HTMLDivElement;
let root: Root;
let style: HTMLStyleElement;
let rowWidth: number;
let resizeCallbacks: (() => void)[];
const originalRangeRect = Object.getOwnPropertyDescriptor(Range.prototype, "getBoundingClientRect");
const action = vi.fn(async () => ({ status: "idle" as const, message: "" }));
const originalDialogMethods = Object.fromEntries(["showModal", "close"].map((name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)]));
const originalPopover = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "showPopover");

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  rowWidth = 720;
  resizeCallbacks = [];
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resizeCallbacks.push(callback); } observe() {} disconnect() {} });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value(this: Range) { return { width: this.toString().length * 8 }; } });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const ids = ["morning-water", "morning-journal", "morning-stretch", "midday-walk", "evening-water"];
    const index = Math.max(0, ids.indexOf(this.closest("[data-bench-occurrence]")?.getAttribute("data-bench-occurrence") ?? ""));
    const isTime = this.tagName === "TIME";
    const isRoot = this.hasAttribute("data-day-progress-date");
    const section = this.closest('section[aria-labelledby$="-proposed-title"]');
    const dayIndex = ["2026-06-08-proposed-title", "2026-06-09-proposed-title", "2026-06-10-proposed-title"].indexOf(section?.getAttribute("aria-labelledby") ?? "");
    const dayTop = Math.max(0, dayIndex) * 420;
    const top = this === section ? dayTop : isRoot ? dayTop + 100 : dayTop + 116 + index * 52 + (isTime ? 14 : 0);
    const height = this === section ? 420 : isRoot ? 292 : isTime ? 20 : 48;
    return { top, bottom: top + height, left: 0, right: rowWidth, width: isTime ? 64 : rowWidth, height, x: 0, y: top, toJSON() {} };
  });
  style = document.createElement("style");
  style.textContent = "[data-day-progress-date] { --calendar-node-x: -96px; --timeline-gap: 24px; --status-icons-only: 0; } summary { padding-left: 12px; } .timeline-occurrence-main { column-gap: 8px; }";
  document.head.append(style);
  Object.defineProperty(HTMLElement.prototype, "showPopover", {
    configurable: true, value() { this.setAttribute("data-test-popover-open", "true"); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event("close")); } });
  action.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() => root.render(
    <RefreshProvider onRefresh={() => {}}>
      <DayProgressBench statusAction={action} noteAction={action}
        startTimeTrackingAction={action} stopTimeTrackingAction={action} resetTimeTrackingAction={action} />
    </RefreshProvider>,
  ));
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  style.remove();
  vi.restoreAllMocks();
  if (originalRangeRect) Object.defineProperty(Range.prototype, "getBoundingClientRect", originalRangeRect);
  else Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const [name, descriptor] of Object.entries(originalDialogMethods)) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
  if (originalPopover) Object.defineProperty(HTMLElement.prototype, "showPopover", originalPopover);
  else delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover;
});

function button(label: string) {
  const result = [...container.querySelectorAll<HTMLButtonElement>("button")].find((element) =>
    element.getAttribute("aria-label") === label || element.textContent?.trim() === label);
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}

it("dismisses and restores all-day events without product writes", async () => {
  const launcher = container.querySelector<HTMLButtonElement>("[data-all-day-control]")!;
  await act(() => launcher.click());
  expect(container.querySelector("dialog")?.open).toBe(false);
  await act(() => button("View details: Design offsite").click());
  expect(container.querySelector("dialog")?.open).toBe(true);
  await act(() => button("Dismiss all-day event: Design offsite").click());
  expect(container.querySelector("dialog")?.open).toBe(false);
  expect(document.activeElement).toBe(launcher);
  expect(launcher.textContent).toBe("Restore All Day Events");
  await act(() => launcher.click());
  expect(launcher.textContent).toBe("All day: Design offsite");
  expect(action).not.toHaveBeenCalled();
});

it("shows desktop labels by default and hides them only for a long title or narrow layout", async () => {
  const labels = () => [...container.querySelectorAll('[data-bench-occurrence="morning-water"] [data-status-region="actions"] button span')];
  expect(labels().every((label) => !label.classList.contains("sr-only"))).toBe(true);
  const longTitle = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((input) => input.parentElement?.textContent?.includes("Long Behavior title"))!;
  await act(() => longTitle.click());
  expect(labels().every((label) => label.classList.contains("sr-only"))).toBe(true);
  await act(() => longTitle.click());
  expect(labels().every((label) => !label.classList.contains("sr-only"))).toBe(true);
  rowWidth = 286;
  style.textContent += "[data-day-progress-date] { --status-icons-only: 1; }";
  await act(() => resizeCallbacks.forEach((callback) => callback()));
  expect(labels().every((label) => label.classList.contains("sr-only"))).toBe(true);
  const actions = container.querySelectorAll('[data-bench-occurrence="morning-water"] [data-status-region="actions"] button');
  expect([...actions].map((element) => element.getAttribute("title"))).toEqual(["Completed", "Not Completed"]);
  const reference = [...container.querySelectorAll("button")].find((element) => element.textContent === "Completed" && !element.closest("[data-day-progress-date]"));
  expect(reference?.querySelector(".sr-only")).toBeNull();
});

it("opens all-day preview on focus without taking focus and opens details from that preview", async () => {
  const launcher = button("All day: Design offsite +1 more");
  await act(() => launcher.focus());
  const preview = container.querySelector('[aria-label="All Day Events preview"]')!;
  expect(preview.textContent).toContain("Design offsite");
  expect(preview.textContent).toContain("School holiday");
  expect(document.activeElement).toBe(launcher);
  expect(preview.querySelector("h2")).toBeNull();
  expect(preview.querySelectorAll('button[aria-label^="View details:"]')).toHaveLength(2);
  await act(() => button("View details: School holiday").click());
  expect(container.querySelector("dialog")?.open).toBe(true);
  expect(container.querySelector("dialog")?.textContent).toContain("School holiday");
  expect(container.querySelector("dialog")?.textContent).not.toContain("Design offsite");
  expect(container.querySelector('[popover="manual"]')).toBeNull();
  await act(() => button("Close Calendar details").click());
  expect(document.activeElement).toBe(launcher);
  expect(container.querySelector("[data-drawer-open]")).toBeNull();
  expect(action).not.toHaveBeenCalled();
});

it("outlines only the inspected event overlaps and joins overnight duration at the displayed stem", async () => {
  const highlighted = () => [...container.querySelectorAll('[data-event-highlight="true"]')].map((row) => row.getAttribute("data-bench-occurrence"));
  expect(highlighted()).toEqual([]);
  expect(container.querySelector('[data-external-overlap]')).toBeNull();
  expect(container.querySelector('[data-current-time]')).toBeNull();
  expect(container.querySelector('[data-behavior-tick]')).toBeNull();
  expect(container.querySelector('[data-calendar-anchor]')).toBeNull();
  expect(container.querySelector('[data-current-time-marker]')?.getAttribute("fill")).toBe("var(--primary)");
  await act(() => button("Preview Calendar event: School run").focus());
  expect(highlighted()).toEqual(["morning-water", "morning-journal", "morning-stretch"]);
  const schoolDuration = container.querySelector('[data-event-duration="event-school-run"]')!;
  expect(schoolDuration.getAttribute("y1")).toBe(container.querySelector('[data-calendar-stem="event-school-run"]')?.getAttribute("y1"));
  const launcher = button("Preview Calendar event: Overnight train");
  await act(() => launcher.focus());
  expect(highlighted()).toEqual([]); // Point activation at 21:30 precedes the train.
  const duration = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((input) => input.parentElement?.textContent?.includes("Evening Behavior duration"))!;
  await act(() => duration.click());
  expect(highlighted()).toEqual(["evening-water"]);
  const segments = [...container.querySelectorAll('[data-event-duration="event-overnight"]')];
  expect(segments).toHaveLength(2);
  const rootTop = (element: Element) => element.closest('[data-day-progress-date]')!.getBoundingClientRect().top;
  expect(segments[0].getAttribute("y1")).toBe(container.querySelector('[data-calendar-stem="event-overnight"]')?.getAttribute("y1"));
  expect(rootTop(segments[0]) + Number(segments[0].getAttribute("y2")))
    .toBe(rootTop(segments[1]) + Number(segments[1].getAttribute("y1")));
  expect(container.querySelectorAll('[data-calendar-node="event-overnight"]')).toHaveLength(1);
  expect(container.querySelector('[data-day-progress-date="2026-06-09"] [data-calendar-stem]')).toBeNull();
  expect(container.querySelector('[data-calendar-drawer="preview"]')?.textContent).toContain("Jun 8");
  expect(container.querySelector('[data-calendar-drawer="preview"]')?.textContent).toContain("Jun 9");
  await act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(container.querySelector('[data-event-duration]')).toBeNull();
  expect(highlighted()).toEqual([]);
  expect(container.querySelector('[data-drawer-open]')).toBeNull();
  expect(action).not.toHaveBeenCalled();
});

it("uses Calendar badges for exact same starts and preserves separate nearby events", async () => {
  const pair = button("Preview 2 Calendar events starting at the same time");
  const triple = button("Preview 3 Calendar events starting at the same time");
  expect(pair.textContent).toBe("×2");
  expect(triple.textContent).toBe("×3");
  expect(button("Preview Calendar event: School run")).toBeDefined();
  expect(button("Preview Calendar event: Delivery window")).toBeDefined();
  expect(pair.querySelector('[data-group-variant="badge"] svg')).not.toBeNull();
  expect(triple.querySelector('[data-group-variant="badge"] svg')).not.toBeNull();
  expect([...container.querySelectorAll('button')].some((item) => item.textContent === "Stack")).toBe(false);
  await act(() => pair.focus());
  const preview = container.querySelector('[popover="manual"]')!;
  expect(preview.textContent).toContain("Team stand-up");
  expect(preview.textContent).toContain("Project check-in");
  const stem = pair.closest('[data-day-progress-date]')!.querySelector(`[data-calendar-stem="${pair.dataset.calendarNode}"]`)!;
  for (const duration of container.querySelectorAll('[data-event-duration]')) {
    expect(duration.getAttribute("y1")).toBe(stem.getAttribute("y1"));
    expect(Number(duration.getAttribute("y2"))).toBeGreaterThan(Number(duration.getAttribute("y1")));
  }
  expect(action).not.toHaveBeenCalled();
});

it("opens a non-modal focus preview without moving focus and restores the launcher when Escape closes it", async () => {
  const launcher = container.querySelector<HTMLButtonElement>("[data-calendar-node]")!;
  await act(() => launcher.focus());
  expect(container.querySelector('[popover="manual"]')).not.toBeNull();
  expect(document.activeElement).toBe(launcher);
  await act(() => button("View details: School run").focus());
  await act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(container.querySelector('[popover="manual"]')).toBeNull();
  expect(document.activeElement).toBe(launcher);
  expect(action).not.toHaveBeenCalled();
});

it("keeps the drawer reachable after pointer leave and replaces it across days", async () => {
  vi.useFakeTimers();
  const launcher = container.querySelector<HTMLButtonElement>("[data-calendar-node]")!;
  await act(() => launcher.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })));
  expect(container.querySelector('[data-drawer-open="true"]')).not.toBeNull();
  const drawer = container.querySelector<HTMLElement>('[data-calendar-drawer="preview"]')!;
  expect(container.querySelector("main")?.style.getPropertyValue("--drawer-height")).toBe(`${drawer.getBoundingClientRect().height}px`);
  await act(() => launcher.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body })));
  await act(() => vi.advanceTimersByTime(1000));
  expect(container.querySelector('[popover="manual"]')).not.toBeNull();
  await act(() => button("All day: Design offsite +1 more").focus());
  expect(container.querySelectorAll('[popover="manual"]')).toHaveLength(1);
  expect(container.querySelector('[popover="manual"]')?.getAttribute("aria-label")).toBe("All Day Events preview");
  await act(() => button("Dismiss Calendar preview").click());
  expect(container.querySelector('[popover="manual"]')).toBeNull();
  expect(action).not.toHaveBeenCalled();
});


it("shows all-day titles only on applicable days and opens persistent previews by click", async () => {
  expect([...container.querySelectorAll("[data-all-day-control]")].map((item) => item.textContent))
    .toEqual(["All day: Design offsite", "All day: Design offsite +1 more"]);
  const launcher = button("Preview 2 Calendar events starting at the same time");
  await act(() => launcher.click());
  expect(container.querySelector("dialog")?.open).toBe(false);
  expect(container.querySelector('[popover="manual"]')?.textContent).toContain("Team stand-up");
  await act(() => button("View details: Project check-in").click());
  expect(container.querySelector("dialog")?.open).toBe(true);
  expect(container.querySelector("dialog")?.textContent).toContain("Project check-in");
  expect(container.querySelector("dialog")?.textContent).not.toContain("Team stand-up");
  await act(() => button("Close Calendar details").click());
  expect(document.activeElement).toBe(launcher);
  expect(action).not.toHaveBeenCalled();
});
