import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  beginPullToRefresh,
  claimPullToRefreshRequest,
  continuePullToRefresh,
  IDLE_PULL_TO_REFRESH_STATE,
  PULL_TO_REFRESH_THRESHOLD,
  releasePullToRefresh,
} from "@/components/timeline/mobile-pull-to-refresh";
import {
  continueDesktopWheelReload,
  IDLE_DESKTOP_WHEEL_RELOAD_STATE,
} from "@/lib/ui/timeline-wheel-reload";

const topMobilePull = () =>
  beginPullToRefresh({
    isMobile: true,
    isAtScrollTop: true,
    isModalOpen: false,
    startedOnInteractiveElement: false,
    x: 120,
    y: 20,
  });

describe("mobile Timeline pull-to-refresh", () => {
  it("requests exactly one refresh after a top-edge downward pull crosses the threshold", () => {
    const pulling = continuePullToRefresh(topMobilePull(), {
      x: 123,
      y: 20 + PULL_TO_REFRESH_THRESHOLD,
    });

    const firstRequest = claimPullToRefreshRequest(pulling, false);

    expect(firstRequest).toEqual({
      shouldRefresh: true,
      isRefreshInFlight: true,
    });
    expect(claimPullToRefreshRequest(pulling, firstRequest.isRefreshInFlight)).toEqual({
      shouldRefresh: false,
      isRefreshInFlight: true,
    });
    expect(releasePullToRefresh(IDLE_PULL_TO_REFRESH_STATE)).toEqual({
      shouldRefresh: false,
    });
  });

  it.each([
    ["a short pull", () => continuePullToRefresh(topMobilePull(), { x: 120, y: 64 })],
    ["a horizontal drag", () => continuePullToRefresh(topMobilePull(), { x: 180, y: 25 })],
    [
      "a pull that began below the top",
      () =>
        beginPullToRefresh({
          isMobile: true,
          isAtScrollTop: false,
          isModalOpen: false,
          startedOnInteractiveElement: false,
          x: 120,
          y: 20,
        }),
    ],
    [
      "a pull on a status, note, timing, or Needs decision control",
      () =>
        beginPullToRefresh({
          isMobile: true,
          isAtScrollTop: true,
          isModalOpen: false,
          startedOnInteractiveElement: true,
          x: 120,
          y: 20,
        }),
    ],
    [
      "a pull while a modal is open",
      () =>
        beginPullToRefresh({
          isMobile: true,
          isAtScrollTop: true,
          isModalOpen: true,
          startedOnInteractiveElement: false,
          x: 120,
          y: 20,
        }),
    ],
    [
      "a desktop drag",
      () =>
        beginPullToRefresh({
          isMobile: false,
          isAtScrollTop: true,
          isModalOpen: false,
          startedOnInteractiveElement: false,
          x: 120,
          y: 20,
        }),
    ],
  ])("does not refresh for %s", (_label, createState) => {
    expect(releasePullToRefresh(createState())).toEqual({ shouldRefresh: false });
  });

  it("does not refresh after a cancelled pull resets the gesture state", () => {
    const pulling = continuePullToRefresh(topMobilePull(), {
      x: 120,
      y: 20 + PULL_TO_REFRESH_THRESHOLD,
    });

    expect(releasePullToRefresh(pulling)).toEqual({ shouldRefresh: true });
    expect(releasePullToRefresh(IDLE_PULL_TO_REFRESH_STATE)).toEqual({
      shouldRefresh: false,
    });
  });

  it("allows a pull started on an occurrence summary without turning a normal summary tap into a refresh", () => {
    const summaryStart = topMobilePull();

    expect(releasePullToRefresh(summaryStart)).toEqual({ shouldRefresh: false });

    const pulling = continuePullToRefresh(summaryStart, {
      x: 120,
      y: 20 + PULL_TO_REFRESH_THRESHOLD,
    });

    expect(claimPullToRefreshRequest(pulling, false)).toEqual({
      shouldRefresh: true,
      isRefreshInFlight: true,
    });
  });

  it("suppresses native top-edge refresh only where the custom mobile gesture exists", () => {
    const styles = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
    const component = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/timeline/MobileTimelinePullToRefresh.tsx",
      ),
      "utf8",
    );
    const wheelReload = fs.readFileSync(
      path.join(process.cwd(), "lib/ui/timeline-wheel-reload.ts"),
      "utf8",
    );

    expect(styles).toContain("@media (width <= 39.9375rem)");
    expect(styles).toContain("html:has([data-timeline-pull-to-refresh])");
    expect(styles).toContain("overscroll-behavior-y: contain");
    expect(component).toContain(
      'addEventListener("touchmove", handleTouchMove, { passive: false })',
    );
    expect(component).not.toContain("onTouchMove={handleTouchMove}");
    expect(component).toContain("isTimelineInteractiveTarget(target)");
    expect(component).toContain("getNearestScrollTop(target)");
    expect(component).toContain("hasTimelineScrollableAncestor");
    expect(wheelReload).toContain('addEventListener("wheel", handleWheel, { passive: false })');
    expect(wheelReload).toContain("button, input, select, summary, textarea");
    expect(wheelReload).toContain("[aria-modal=\"true\"]");
  });
});

describe("desktop Timeline wheel reload", () => {
  const input = {
    deltaX: 0,
    deltaY: -24,
    deltaMode: 0,
    now: 100,
    isAtScrollTop: true,
    isModalOpen: false,
    isNestedScroll: false,
    isInteractive: false,
    isLocked: false,
  };

  it("accumulates a top-edge upward trackpad gesture and accepts a mouse-wheel step", () => {
    const first = continueDesktopWheelReload(IDLE_DESKTOP_WHEEL_RELOAD_STATE, input);
    expect(first.shouldReload).toBe(false);
    expect(continueDesktopWheelReload(first.state, { ...input, now: 180 })).toEqual(expect.objectContaining({ shouldReload: true }));
    expect(continueDesktopWheelReload(IDLE_DESKTOP_WHEEL_RELOAD_STATE, {
      ...input,
      deltaY: -3,
      deltaMode: 1,
    }).shouldReload).toBe(true);
  });

  it.each([
    ["normal page scrolling", { isAtScrollTop: false }],
    ["an open dialog", { isModalOpen: true }],
    ["a nested scroller", { isNestedScroll: true }],
    ["an interactive control", { isInteractive: true }],
    ["an in-flight reload", { isLocked: true }],
    ["a downward wheel", { deltaY: 24 }],
    ["a horizontal gesture", { deltaX: 24, deltaY: -20 }],
  ])("ignores %s", (_label, override) => {
    expect(continueDesktopWheelReload(IDLE_DESKTOP_WHEEL_RELOAD_STATE, { ...input, ...override }).shouldReload).toBe(false);
  });

  it("does not combine separate wheel gestures", () => {
    const first = continueDesktopWheelReload(IDLE_DESKTOP_WHEEL_RELOAD_STATE, input);
    const later = continueDesktopWheelReload(first.state, { ...input, now: 500 });
    expect(later.shouldReload).toBe(false);
    expect(later.state.distance).toBe(24);
  });
});
