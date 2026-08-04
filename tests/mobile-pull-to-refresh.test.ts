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

const topMobilePull = () =>
  beginPullToRefresh({
    isMobile: true,
    isAtScrollTop: true,
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
          startedOnInteractiveElement: true,
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

    expect(styles).toContain("@media (width <= 39.9375rem)");
    expect(styles).toContain("html:has([data-timeline-pull-to-refresh])");
    expect(styles).toContain("overscroll-behavior-y: contain");
    expect(component).toContain(
      'addEventListener("touchmove", handleTouchMove, { passive: false })',
    );
    expect(component).not.toContain("onTouchMove={handleTouchMove}");
  });
});
