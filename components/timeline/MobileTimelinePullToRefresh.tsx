"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { useRouter } from "next/navigation";

import {
  beginPullToRefresh,
  claimPullToRefreshRequest,
  continuePullToRefresh,
  IDLE_PULL_TO_REFRESH_STATE,
  MOBILE_TIMELINE_MAX_WIDTH,
  PULL_TO_REFRESH_THRESHOLD,
  type PullToRefreshState,
} from "@/components/timeline/mobile-pull-to-refresh";

const INTERACTIVE_TARGET_SELECTOR =
  'a, button, input, select, summary, textarea, [role="button"], [contenteditable="true"]';

type MobileTimelinePullToRefreshProps = Readonly<{
  children: ReactNode;
}>;

export function MobileTimelinePullToRefresh({
  children,
}: MobileTimelinePullToRefreshProps) {
  const router = useRouter();
  const [pullState, setPullState] =
    useState<PullToRefreshState>(IDLE_PULL_TO_REFRESH_STATE);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const pullStateRef = useRef<PullToRefreshState>(IDLE_PULL_TO_REFRESH_STATE);
  const refreshInFlightRef = useRef(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isRefreshing || isPending) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      refreshInFlightRef.current = false;
      setIsRefreshing(false);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isPending, isRefreshing]);

  const updatePullState = useCallback((nextState: PullToRefreshState) => {
    pullStateRef.current = nextState;
    setPullState(nextState);
  }, []);

  const resetPull = useCallback(() => {
    updatePullState(IDLE_PULL_TO_REFRESH_STATE);
  }, [updatePullState]);

  const requestRefresh = useCallback(() => {
    if (refreshInFlightRef.current) {
      return;
    }

    refreshInFlightRef.current = true;
    setIsRefreshing(true);
    startTransition(() => {
      router.refresh();
    });
  }, [router, startTransition]);

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        resetPull();
        return;
      }

      const touch = event.touches[0];
      const nextPullState = continuePullToRefresh(pullStateRef.current, {
        x: touch.clientX,
        y: touch.clientY,
      });

      if (nextPullState.phase === "pulling") {
        // React delegates touchmove passively. This native non-passive listener
        // prevents native refresh and a synthetic disclosure click only after
        // the gesture has locked to a downward pull.
        event.preventDefault();
      }

      updatePullState(nextPullState);
    },
    [resetPull, updatePullState],
  );

  useEffect(() => {
    const wrapper = wrapperRef.current;

    if (!wrapper) {
      return;
    }

    wrapper.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      wrapper.removeEventListener("touchmove", handleTouchMove);
    };
  }, [handleTouchMove]);

  function handleTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    if (event.touches.length !== 1) {
      resetPull();
      return;
    }

    const touch = event.touches[0];
    const target = event.target instanceof Element ? event.target : null;
    const startedOnInteractiveElement = Boolean(
      target?.closest(INTERACTIVE_TARGET_SELECTOR),
    );

    updatePullState(
      beginPullToRefresh({
        isMobile: window.innerWidth <= MOBILE_TIMELINE_MAX_WIDTH,
        isAtScrollTop: getNearestScrollTop(target) <= 0,
        isModalOpen: document.querySelector('[role="dialog"][aria-modal="true"]') !== null,
        startedOnInteractiveElement,
        x: touch.clientX,
        y: touch.clientY,
      }),
    );
  }

  function handleTouchEnd() {
    const refreshRequest = claimPullToRefreshRequest(
      pullStateRef.current,
      refreshInFlightRef.current,
    );
    resetPull();

    if (refreshRequest.shouldRefresh) {
      requestRefresh();
    }
  }

  const isPulling = pullState.phase === "pulling";
  const isReadyToRefresh =
    isPulling && pullState.distance >= PULL_TO_REFRESH_THRESHOLD;
  const feedback = isRefreshing
    ? "Refreshing timeline"
    : isReadyToRefresh
      ? "Release to refresh"
      : "Pull to refresh";

  return (
    <div
      ref={wrapperRef}
      data-timeline-pull-to-refresh
      data-pull-state={isRefreshing ? "refreshing" : pullState.phase}
      className="timeline-pull-to-refresh"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={resetPull}
    >
      {isPulling || isRefreshing ? (
        <p
          aria-live="polite"
          className="pointer-events-none fixed left-1/2 top-[calc(4rem+max(0.5rem,env(safe-area-inset-top)))] z-30 -translate-x-1/2 border border-line bg-background px-3 py-1.5 text-xs text-muted-readable motion-safe:transition-opacity motion-reduce:transition-none"
          role="status"
        >
          {feedback}
        </p>
      ) : null}
      {children}
    </div>
  );
}

function getPageScrollTop(): number {
  return Math.max(
    window.scrollY,
    document.documentElement.scrollTop,
    document.body.scrollTop,
  );
}

function getNearestScrollTop(target: Element | null): number {
  let element = target;

  while (element && element !== document.body && element !== document.documentElement) {
    const { overflowY } = window.getComputedStyle(element);

    if (
      /^(auto|overlay|scroll)$/.test(overflowY) &&
      element.scrollHeight > element.clientHeight
    ) {
      return element.scrollTop;
    }

    element = element.parentElement;
  }

  return getPageScrollTop();
}
