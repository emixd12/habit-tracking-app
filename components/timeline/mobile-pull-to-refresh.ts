export const MOBILE_TIMELINE_MAX_WIDTH = 639;
export const PULL_TO_REFRESH_THRESHOLD = 72;

const DIRECTION_LOCK_DISTANCE = 8;
const MAX_PULL_DISTANCE = 104;

export type PullToRefreshState =
  | Readonly<{ phase: "idle" }>
  | Readonly<{
      phase: "tracking" | "pulling";
      startX: number;
      startY: number;
      distance: number;
    }>;

export const IDLE_PULL_TO_REFRESH_STATE: PullToRefreshState = { phase: "idle" };

export function beginPullToRefresh({
  isMobile,
  isAtScrollTop,
  isModalOpen,
  startedOnInteractiveElement,
  x,
  y,
}: Readonly<{
  isMobile: boolean;
  isAtScrollTop: boolean;
  isModalOpen: boolean;
  startedOnInteractiveElement: boolean;
  x: number;
  y: number;
}>): PullToRefreshState {
  if (!isMobile || !isAtScrollTop || isModalOpen || startedOnInteractiveElement) {
    return IDLE_PULL_TO_REFRESH_STATE;
  }

  return { phase: "tracking", startX: x, startY: y, distance: 0 };
}

export function continuePullToRefresh(
  state: PullToRefreshState,
  point: Readonly<{ x: number; y: number }>,
): PullToRefreshState {
  if (state.phase === "idle") {
    return state;
  }

  const deltaX = point.x - state.startX;
  const deltaY = point.y - state.startY;

  if (Math.abs(deltaX) > DIRECTION_LOCK_DISTANCE && Math.abs(deltaX) >= Math.abs(deltaY)) {
    return IDLE_PULL_TO_REFRESH_STATE;
  }

  if (deltaY <= DIRECTION_LOCK_DISTANCE) {
    return deltaY < 0 ? IDLE_PULL_TO_REFRESH_STATE : state;
  }

  return {
    ...state,
    phase: "pulling",
    distance: Math.min(deltaY, MAX_PULL_DISTANCE),
  };
}

export function releasePullToRefresh(state: PullToRefreshState): Readonly<{
  shouldRefresh: boolean;
}> {
  return {
    shouldRefresh:
      state.phase === "pulling" && state.distance >= PULL_TO_REFRESH_THRESHOLD,
  };
}

export function claimPullToRefreshRequest(
  state: PullToRefreshState,
  isRefreshInFlight: boolean,
): Readonly<{
  shouldRefresh: boolean;
  isRefreshInFlight: boolean;
}> {
  const { shouldRefresh } = releasePullToRefresh(state);

  if (!shouldRefresh || isRefreshInFlight) {
    return { shouldRefresh: false, isRefreshInFlight };
  }

  return { shouldRefresh: true, isRefreshInFlight: true };
}
