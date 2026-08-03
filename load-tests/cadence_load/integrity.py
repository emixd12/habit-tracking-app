"""Privacy-safe automatic abort gates for local mutation workloads."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass


@dataclass(frozen=True)
class RuntimeCeilings:
    maximum_requests: int
    maximum_requests_per_second: float
    maximum_runtime_seconds: int
    maximum_users: int


@dataclass(frozen=True)
class RuntimeObservation:
    total_requests: int
    current_requests_per_second: float
    elapsed_seconds: float
    active_users: int


@dataclass(frozen=True)
class AbortDecision:
    abort: bool
    reason: str | None


@dataclass(frozen=True)
class RuntimeGuardConfig:
    ceilings: RuntimeCeilings
    unexpected_5xx_ratio: float
    unexpected_5xx_window_seconds: int
    unexpected_5xx_consecutive_windows: int
    repeated_database_refusals: int = 3


class RepeatedFailureGate:
    """Trips after a bounded number of matching consecutive failures."""

    def __init__(self, *, required_consecutive_failures: int = 3) -> None:
        if (
            isinstance(required_consecutive_failures, bool)
            or not isinstance(required_consecutive_failures, int)
            or required_consecutive_failures < 1
            or required_consecutive_failures > 10
        ):
            raise ValueError(
                "Repeated-failure count must be an integer from 1 to 10."
            )
        self._required = required_consecutive_failures
        self._recent: deque[bool] = deque(
            maxlen=required_consecutive_failures
        )

    def observe(self, matched_failure: bool) -> bool:
        self._recent.append(bool(matched_failure))
        return (
            len(self._recent) == self._required
            and all(self._recent)
        )


class SustainedRatioGate:
    """Trips when each completed window exceeds one declared ratio."""

    def __init__(
        self,
        *,
        threshold: float,
        consecutive_windows: int,
    ) -> None:
        if (
            isinstance(threshold, bool)
            or not isinstance(threshold, (int, float))
            or threshold <= 0
            or threshold >= 1
        ):
            raise ValueError("Ratio threshold must be between zero and one.")
        if (
            isinstance(consecutive_windows, bool)
            or not isinstance(consecutive_windows, int)
            or consecutive_windows < 1
            or consecutive_windows > 10
        ):
            raise ValueError(
                "Consecutive-window count must be an integer from 1 to 10."
            )
        self._threshold = float(threshold)
        self._required = consecutive_windows
        self._ratios: deque[float] = deque(maxlen=consecutive_windows)

    def observe_window(self, *, failures: int, requests: int) -> bool:
        if (
            isinstance(failures, bool)
            or not isinstance(failures, int)
            or failures < 0
            or isinstance(requests, bool)
            or not isinstance(requests, int)
            or requests < 0
            or failures > requests
        ):
            raise ValueError("Window counts are invalid.")
        ratio = 0 if requests == 0 else failures / requests
        self._ratios.append(ratio)
        return (
            len(self._ratios) == self._required
            and all(ratio > self._threshold for ratio in self._ratios)
        )


def evaluate_runtime_ceilings(
    observation: RuntimeObservation,
    ceilings: RuntimeCeilings,
) -> AbortDecision:
    """Treat reaching any configured ceiling as an immediate abort."""

    if observation.total_requests >= ceilings.maximum_requests:
        return AbortDecision(True, "maximum request count reached")
    if (
        observation.current_requests_per_second
        >= ceilings.maximum_requests_per_second
    ):
        return AbortDecision(
            True,
            "maximum requests-per-second ceiling reached",
        )
    if observation.elapsed_seconds >= ceilings.maximum_runtime_seconds:
        return AbortDecision(True, "maximum runtime reached")
    if observation.active_users > ceilings.maximum_users:
        return AbortDecision(True, "maximum active-user ceiling exceeded")
    return AbortDecision(False, None)


def looks_like_database_refusal(value: object) -> bool:
    """Classify explicit database refusals without treating HTTP loss as DB loss."""

    message = str(value).lower()
    database_context_markers = (
        "database",
        "postgres",
        "postgresql",
        "postgrest",
        "supabase",
        "pgbouncer",
        "psycopg",
        "sqlstate",
    )
    connection_failure_markers = (
        "connection refused",
        "connection reset",
        "connection terminated unexpectedly",
        "could not connect to server",
        "server closed the connection unexpectedly",
        "database is unavailable",
    )
    unambiguous_database_capacity_markers = (
        "too many connections",
        "too many clients already",
        "remaining connection slots are reserved",
        "max_client_conn",
        "sqlstate 53300",
    )

    if any(
        marker in message
        for marker in unambiguous_database_capacity_markers
    ):
        return True

    return (
        any(marker in message for marker in database_context_markers)
        and any(marker in message for marker in connection_failure_markers)
    )


class MutationRuntimeGuard:
    """Stateful request guard used by the local mutation Locust entrypoint."""

    def __init__(
        self,
        config: RuntimeGuardConfig,
        *,
        started_at_seconds: float,
    ) -> None:
        if started_at_seconds < 0:
            raise ValueError("Runtime guard start time cannot be negative.")
        if (
            isinstance(config.unexpected_5xx_window_seconds, bool)
            or not isinstance(config.unexpected_5xx_window_seconds, int)
            or config.unexpected_5xx_window_seconds < 1
        ):
            raise ValueError("Runtime guard window must be positive.")

        self._config = config
        self._started_at = float(started_at_seconds)
        self._window_started_at = float(started_at_seconds)
        self._window_requests = 0
        self._window_5xx = 0
        self._total_requests = 0
        self._ratio_gate = SustainedRatioGate(
            threshold=config.unexpected_5xx_ratio,
            consecutive_windows=config.unexpected_5xx_consecutive_windows,
        )
        self._database_gate = RepeatedFailureGate(
            required_consecutive_failures=config.repeated_database_refusals,
        )
        self._aborted: AbortDecision | None = None

    @property
    def total_requests(self) -> int:
        return self._total_requests

    def observe_request(
        self,
        *,
        now_seconds: float,
        status_code: int | None,
        error: object | None,
        active_users: int,
        current_requests_per_second: float,
    ) -> AbortDecision:
        if self._aborted is not None:
            return self._aborted
        if now_seconds < self._window_started_at:
            raise ValueError("Runtime guard observations must be ordered.")

        ratio_abort = self._advance_windows(float(now_seconds))
        if ratio_abort is not None:
            return self._remember(ratio_abort)

        self._total_requests += 1
        self._window_requests += 1
        if status_code is not None and 500 <= status_code <= 599:
            self._window_5xx += 1

        if self._database_gate.observe(
            looks_like_database_refusal(error) if error is not None else False
        ):
            return self._remember(
                AbortDecision(
                    True,
                    "repeated database connection refusal",
                )
            )

        decision = evaluate_runtime_ceilings(
            RuntimeObservation(
                total_requests=self._total_requests,
                current_requests_per_second=current_requests_per_second,
                elapsed_seconds=float(now_seconds) - self._started_at,
                active_users=active_users,
            ),
            self._config.ceilings,
        )
        if decision.abort:
            return self._remember(decision)
        return decision

    def _advance_windows(
        self,
        now_seconds: float,
    ) -> AbortDecision | None:
        window = self._config.unexpected_5xx_window_seconds
        while now_seconds - self._window_started_at >= window:
            tripped = self._ratio_gate.observe_window(
                failures=self._window_5xx,
                requests=self._window_requests,
            )
            self._window_started_at += window
            self._window_requests = 0
            self._window_5xx = 0
            if tripped:
                return AbortDecision(
                    True,
                    "sustained unexpected 5xx ratio exceeded",
                )
        return None

    def _remember(self, decision: AbortDecision) -> AbortDecision:
        self._aborted = decision
        return decision
