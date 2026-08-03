"""Locust entrypoint for bounded, local-only Cadence mutation profiles."""

from __future__ import annotations

import os
from pathlib import Path
from time import monotonic

from gevent import spawn
from locust import events

from cadence_load.auth import (
    IdentityArtifactError,
    assert_locust_host,
    get_shared_contention_runtime,
    get_shared_identity_runtime,
)
from cadence_load.data import ProfileConfigError
from cadence_load.integrity import (
    MutationRuntimeGuard,
    RuntimeCeilings,
    RuntimeGuardConfig,
)
from cadence_load.mutation_shapes import (
    CadenceMutationLoadShape,
    load_mutation_profile_catalog,
    resolve_profile_runtime_ceiling,
    resolve_selected_mutation_shape,
    select_mutation_profile,
)
from cadence_load.semantic_evidence import (
    SemanticEvidenceError,
    reset_semantic_evidence,
    resolve_semantic_evidence_path,
    write_final_stats_csv,
    write_semantic_evidence,
)


PROFILE_CATALOG = load_mutation_profile_catalog()
SELECTED_PROFILE = select_mutation_profile(PROFILE_CATALOG)
SELECTED_SHAPE = resolve_selected_mutation_shape(PROFILE_CATALOG)

ALLOWED_MUTATION_POST_NAMES = frozenset(
    {
        "INT-TIMELINE-005 POST /timeline server-action",
        "INT-TIMELINE-006 POST /timeline server-action",
        "INT-TIMELINE-007 POST /timeline server-action",
        "INT-TIMELINE-008 POST /timeline server-action",
        "INT-BEHAVIOR-019 POST /behaviors server-action",
        "INT-BEHAVIOR-020 POST /behaviors server-action",
        "INT-BEHAVIOR-022 POST /behaviors server-action",
        "INT-BEHAVIOR-023 POST /behaviors server-action",
        "INT-SETTINGS-003 POST /settings server-action",
    }
)

_runtime_guard: MutationRuntimeGuard | None = None
_runtime_environment = None
_runtime_abort_reason: str | None = None
_semantic_evidence_path: Path | None = None

_RUNTIME_ABORT_REASONS = frozenset(
    {
        "A mutation runtime ceiling was reached.",
        "The mutation workload attempted an undeclared HTTP method.",
        "The mutation workload attempted an undeclared write interaction.",
        "maximum active-user ceiling exceeded",
        "maximum request count reached",
        "maximum requests-per-second ceiling reached",
        "maximum runtime reached",
        "repeated database connection refusal",
        "sustained unexpected 5xx ratio exceeded",
    }
)
_RUNTIME_ABORT_FALLBACK_REASON = "mutation startup validation failed"
_RUNTIME_ABORT_TRACEBACK = (
    "Cadence mutation runtime guard initiated an orderly stage stop."
)


def _declared_integer_ceiling(name: str, expected: int) -> int:
    raw = os.environ.get(name, "").strip()
    try:
        parsed = int(raw)
    except ValueError as error:
        raise IdentityArtifactError(
            f"{name} must declare the checked-in mutation ceiling."
        ) from error
    if parsed != expected:
        raise IdentityArtifactError(
            f"{name} does not match the checked-in mutation ceiling."
        )
    return parsed


def _declared_float_ceiling(name: str, expected: float) -> float:
    raw = os.environ.get(name, "").strip()
    try:
        parsed = float(raw)
    except ValueError as error:
        raise IdentityArtifactError(
            f"{name} must declare the checked-in mutation ceiling."
        ) from error
    if parsed != expected:
        raise IdentityArtifactError(
            f"{name} does not match the checked-in mutation ceiling."
        )
    return parsed


def _sanitized_runtime_abort_reason(reason: str) -> str:
    normalized = " ".join(str(reason).split())
    if normalized in _RUNTIME_ABORT_REASONS:
        return normalized
    return _RUNTIME_ABORT_FALLBACK_REASON


def _abort(environment, reason: str) -> None:
    global _runtime_abort_reason
    global _runtime_environment
    global _runtime_guard

    if _runtime_abort_reason is not None:
        return

    sanitized_reason = _sanitized_runtime_abort_reason(reason)
    _runtime_abort_reason = sanitized_reason
    _runtime_environment = None
    _runtime_guard = None
    environment.process_exit_code = 2
    runner = environment.runner
    if runner is not None:
        runner.log_exception(
            "local",
            f"Cadence mutation runtime abort: {sanitized_reason}",
            _RUNTIME_ABORT_TRACEBACK,
        )
        spawn(runner.quit)


@events.test_start.add_listener
def validate_mutation_workload_start(environment, **_kwargs) -> None:
    global _runtime_abort_reason
    global _runtime_environment
    global _runtime_guard
    global _semantic_evidence_path

    _runtime_abort_reason = None
    try:
        reset_semantic_evidence()
        _semantic_evidence_path = resolve_semantic_evidence_path(
            os.environ.get("CADENCE_LOAD_SEMANTIC_EVIDENCE_FILE")
        )
        runner = environment.runner
        if runner is not None and runner.__class__.__name__ in {
            "MasterRunner",
            "WorkerRunner",
        }:
            raise IdentityArtifactError(
                "Distributed workers are outside the bounded local mutation profile."
            )

        if SELECTED_PROFILE.workload == "contention":
            runtime = get_shared_contention_runtime()
        else:
            runtime = get_shared_identity_runtime()
        if runtime.artifact.workload_classification != "mutation":
            raise IdentityArtifactError(
                "The mutation workload requires a mutation fixture artifact."
            )
        assert_locust_host(environment.host, runtime.artifact.base_url)
        if runtime.pool.capacity < SELECTED_SHAPE.max_users:
            raise IdentityArtifactError(
                "The selected mutation profile exceeds its exclusive session pool."
            )

        ceilings = PROFILE_CATALOG.ceilings
        maximum_requests = _declared_integer_ceiling(
            "CADENCE_LOAD_MAXIMUM_REQUESTS",
            ceilings.maximum_requests,
        )
        maximum_rps = _declared_float_ceiling(
            "CADENCE_LOAD_MAXIMUM_RPS",
            ceilings.maximum_requests_per_second,
        )
        _runtime_environment = environment
        _runtime_guard = MutationRuntimeGuard(
            RuntimeGuardConfig(
                ceilings=RuntimeCeilings(
                    maximum_requests=maximum_requests,
                    maximum_requests_per_second=maximum_rps,
                    maximum_runtime_seconds=resolve_profile_runtime_ceiling(
                        PROFILE_CATALOG,
                        SELECTED_PROFILE,
                    ),
                    maximum_users=ceilings.maximum_users,
                ),
                unexpected_5xx_ratio=ceilings.unexpected_5xx_ratio,
                unexpected_5xx_window_seconds=(
                    ceilings.unexpected_5xx_window_seconds
                ),
                unexpected_5xx_consecutive_windows=(
                    ceilings.unexpected_5xx_consecutive_windows
                ),
            ),
            started_at_seconds=monotonic(),
        )
    except (
        IdentityArtifactError,
        ProfileConfigError,
        SemanticEvidenceError,
    ) as error:
        _abort(environment, str(error))


@events.request.add_listener
def enforce_mutation_runtime_gates(
    request_type,
    name,
    response=None,
    exception=None,
    **_kwargs,
) -> None:
    guard = _runtime_guard
    environment = _runtime_environment
    if guard is None or environment is None:
        return

    method = str(request_type).upper()
    if method not in {"GET", "POST"}:
        _abort(
            environment,
            "The mutation workload attempted an undeclared HTTP method.",
        )
        return
    if method == "POST" and name not in ALLOWED_MUTATION_POST_NAMES:
        _abort(
            environment,
            "The mutation workload attempted an undeclared write interaction.",
        )
        return

    runner = environment.runner
    active_users = int(getattr(runner, "user_count", 0) or 0)
    current_rps = float(
        getattr(environment.stats.total, "current_rps", 0.0) or 0.0
    )
    status_code = getattr(response, "status_code", None)
    decision = guard.observe_request(
        now_seconds=monotonic(),
        status_code=(
            int(status_code)
            if isinstance(status_code, int)
            else None
        ),
        error=getattr(response, "error", None) or exception,
        active_users=active_users,
        current_requests_per_second=current_rps,
    )
    if decision.abort:
        _abort(
            environment,
            decision.reason or "A mutation runtime ceiling was reached.",
        )


@events.test_stop.add_listener
def finalize_mutation_runtime_guard(environment, **_kwargs) -> None:
    global _runtime_environment
    global _runtime_guard
    global _semantic_evidence_path

    try:
        if _semantic_evidence_path is None:
            raise SemanticEvidenceError(
                "The mutation semantic evidence destination was unavailable."
            )
        write_semantic_evidence(_semantic_evidence_path)
    except (OSError, SemanticEvidenceError) as error:
        environment.process_exit_code = 2
        raise RuntimeError(
            "Unable to retain mutation semantic verification evidence."
        ) from error
    finally:
        _runtime_environment = None
        _runtime_guard = None


@events.quitting.add_listener
def finalize_mutation_stats_accounting(environment, **_kwargs) -> None:
    global _semantic_evidence_path

    if _semantic_evidence_path is None:
        return
    try:
        write_final_stats_csv(
            environment,
            _semantic_evidence_path,
        )
    except Exception as error:
        environment.process_exit_code = 2
        raise RuntimeError(
            "Unable to retain final mutation request accounting."
        ) from error
    finally:
        _semantic_evidence_path = None


if SELECTED_PROFILE.workload == "contention":
    from cadence_load.users.contention import CadenceContentionUser
elif SELECTED_PROFILE.workload == "timezone_changed":
    from cadence_load.users.timezone import CadenceChangedTimezoneUser
elif SELECTED_PROFILE.name == "smoke":
    from cadence_load.users.daily import CadenceDailyTrackerUser
elif SELECTED_PROFILE.name == "mixed_calibration":
    from cadence_load.users.calibration import CadenceMixedCalibrationUser
else:
    from cadence_load.users.daily import CadenceDailyTrackerUser
    from cadence_load.users.exporter import CadenceExporterUser
    from cadence_load.users.maintainer import CadenceBehaviorMaintainerUser
    from cadence_load.users.reviewer import CadenceReflectiveReviewerUser


__all__ = ["CadenceMutationLoadShape"]
