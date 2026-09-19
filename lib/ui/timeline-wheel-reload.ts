"use client";

import { useEffect, useRef, type RefObject } from "react";

export const DESKTOP_WHEEL_RELOAD_THRESHOLD = 48;
const WHEEL_GESTURE_GAP_MS = 240;
const WHEEL_UNLOCK_MS = 320;
const INTERACTIVE_TARGET_SELECTOR =
  'a, button, input, select, summary, textarea, [role="button"], [contenteditable="true"]';
const MODAL_SELECTOR = '[role="dialog"][aria-modal="true"], dialog[open]';

export type DesktopWheelReloadState = Readonly<{
  distance: number;
  lastEventAt: number;
}>;

export const IDLE_DESKTOP_WHEEL_RELOAD_STATE: DesktopWheelReloadState = {
  distance: 0,
  lastEventAt: 0,
};

export function continueDesktopWheelReload(
  state: DesktopWheelReloadState,
  input: Readonly<{
    deltaX: number;
    deltaY: number;
    deltaMode: number;
    now: number;
    isAtScrollTop: boolean;
    isModalOpen: boolean;
    isNestedScroll: boolean;
    isInteractive: boolean;
    isLocked: boolean;
  }>,
): Readonly<{ state: DesktopWheelReloadState; shouldReload: boolean }> {
  if (
    !input.isAtScrollTop ||
    input.isModalOpen ||
    input.isNestedScroll ||
    input.isInteractive ||
    input.isLocked ||
    input.deltaY >= 0 ||
    Math.abs(input.deltaX) >= Math.abs(input.deltaY)
  ) {
    return { state: IDLE_DESKTOP_WHEEL_RELOAD_STATE, shouldReload: false };
  }

  const unit = input.deltaMode === 1 ? 16 : input.deltaMode === 2 ? 800 : 1;
  const distance = (input.now - state.lastEventAt > WHEEL_GESTURE_GAP_MS ? 0 : state.distance)
    + Math.min(-input.deltaY * unit, DESKTOP_WHEEL_RELOAD_THRESHOLD);
  const nextState = { distance, lastEventAt: input.now };
  return { state: nextState, shouldReload: distance >= DESKTOP_WHEEL_RELOAD_THRESHOLD };
}

export function useTimelineWheelReload({
  rootRef,
  reloadInFlightRef,
  onReload,
  enabled = true,
}: Readonly<{
  rootRef: RefObject<HTMLElement | null>;
  reloadInFlightRef: RefObject<boolean>;
  onReload: () => void;
  enabled?: boolean;
}>): void {
  const wheelStateRef = useRef(IDLE_DESKTOP_WHEEL_RELOAD_STATE);
  const gestureLockedRef = useRef(false);
  const unlockTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;
    const unlockLater = () => {
      if (unlockTimerRef.current !== null) window.clearTimeout(unlockTimerRef.current);
      unlockTimerRef.current = window.setTimeout(() => {
        gestureLockedRef.current = false;
        unlockTimerRef.current = null;
      }, WHEEL_UNLOCK_MS);
    };
    const handleWheel = (event: WheelEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.ctrlKey || event.metaKey || event.altKey) {
        wheelStateRef.current = IDLE_DESKTOP_WHEEL_RELOAD_STATE;
        return;
      }
      const blocked = pageScrollTop() > 0
        || isTimelineModalOpen()
        || hasTimelineScrollableAncestor(target, root)
        || isTimelineInteractiveTarget(target);
      if (blocked) {
        wheelStateRef.current = IDLE_DESKTOP_WHEEL_RELOAD_STATE;
        return;
      }
      if (gestureLockedRef.current && event.deltaY < 0) {
        event.preventDefault();
        unlockLater();
        return;
      }
      const attempt = continueDesktopWheelReload(wheelStateRef.current, {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        now: performance.now(),
        isAtScrollTop: true,
        isModalOpen: false,
        isNestedScroll: false,
        isInteractive: false,
        isLocked: reloadInFlightRef.current,
      });
      wheelStateRef.current = attempt.state;
      if (attempt.state.distance > 0) event.preventDefault();
      if (!attempt.shouldReload) return;
      gestureLockedRef.current = true;
      wheelStateRef.current = IDLE_DESKTOP_WHEEL_RELOAD_STATE;
      unlockLater();
      onReload();
    };
    root.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      root.removeEventListener("wheel", handleWheel);
      if (unlockTimerRef.current !== null) window.clearTimeout(unlockTimerRef.current);
    };
  }, [enabled, onReload, reloadInFlightRef, rootRef]);
}

export function isTimelineInteractiveTarget(target: Element | null): boolean {
  return Boolean(target?.closest(INTERACTIVE_TARGET_SELECTOR));
}

export function isTimelineModalOpen(): boolean {
  return document.querySelector(MODAL_SELECTOR) !== null;
}

export function hasTimelineScrollableAncestor(target: Element | null, boundary: Element): boolean {
  let element = target;
  while (element && element !== boundary && element !== document.body && element !== document.documentElement) {
    const { overflowY } = window.getComputedStyle(element);
    if (/^(auto|overlay|scroll)$/.test(overflowY) && element.scrollHeight > element.clientHeight) return true;
    element = element.parentElement;
  }
  return false;
}

function pageScrollTop(): number {
  return Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop);
}
