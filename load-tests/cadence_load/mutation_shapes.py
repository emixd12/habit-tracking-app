"""Validated, bounded load shapes for Cadence mutation workloads."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from types import MappingProxyType
from typing import Mapping

from locust import LoadTestShape

from cadence_load.data import LoadStage, ProfileConfigError, ShapeDefinition


MUTATION_TASK_KEYS = frozenset(
    {
        "timeline_read",
        "timeline_future_read",
        "status_completed",
        "status_not_completed",
        "status_clear",
        "timeline_note",
        "behaviors_read",
        "behaviors_selected_read",
        "behavior_create",
        "behavior_update",
        "behavior_archive",
        "behavior_restore",
        "review_status",
        "review_note",
        "timezone_unchanged",
        "export_jsonl",
        "export_json",
        "export_behaviorlog",
    }
)
REQUIRED_MUTATION_PROFILES = frozenset(
    {
        "smoke",
        "mixed_calibration",
        "mixed_baseline",
        "ramp",
        "spike",
        "soak",
        "breakpoint",
        "timezone_changed",
        "contention",
        "operator_overlap",
    }
)
ALLOWED_WORKLOADS = frozenset({"mixed", "timezone_changed", "contention"})


@dataclass(frozen=True)
class MutationCeilings:
    maximum_users: int
    maximum_profile_runtime_seconds: int
    maximum_soak_runtime_seconds: int
    maximum_suite_runtime_seconds: int
    maximum_requests: int
    maximum_requests_per_second: float
    unexpected_5xx_ratio: float
    unexpected_5xx_window_seconds: int
    unexpected_5xx_consecutive_windows: int


@dataclass(frozen=True)
class MutationProfile:
    name: str
    shape: str
    workload: str


@dataclass(frozen=True)
class MutationProfileCatalog:
    assumption_basis: str
    default_profile: str
    think_time_seconds: tuple[float, float]
    task_weights: Mapping[str, int]
    read_task_keys: frozenset[str]
    ceilings: MutationCeilings
    profiles: Mapping[str, MutationProfile]
    shapes: Mapping[str, ShapeDefinition]

    @property
    def read_weight_percent(self) -> int:
        return sum(self.task_weights[key] for key in self.read_task_keys)


@lru_cache(maxsize=1)
def load_mutation_profile_catalog() -> MutationProfileCatalog:
    path = (
        Path(__file__).resolve().parents[1]
        / "scenarios"
        / "mutation-profiles.json"
    )
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError) as error:
        raise ProfileConfigError(
            "The mutation workload profile manifest is unavailable or invalid."
        ) from error
    return parse_mutation_profile_catalog(payload)


def select_mutation_profile(
    catalog: MutationProfileCatalog | None = None,
) -> MutationProfile:
    resolved = catalog or load_mutation_profile_catalog()
    selected_name = os.environ.get(
        "CADENCE_LOAD_PROFILE",
        resolved.default_profile,
    ).strip()
    profile = resolved.profiles.get(selected_name)
    if profile is None:
        raise ProfileConfigError(
            "CADENCE_LOAD_PROFILE does not name a bounded mutation profile."
        )

    raw_workload = os.environ.get("CADENCE_LOAD_WORKLOAD", "").strip()
    if raw_workload and raw_workload != profile.workload:
        raise ProfileConfigError(
            "CADENCE_LOAD_WORKLOAD does not match the selected mutation profile."
        )
    return profile


def resolve_selected_mutation_shape(
    catalog: MutationProfileCatalog | None = None,
) -> ShapeDefinition:
    resolved = catalog or load_mutation_profile_catalog()
    profile = select_mutation_profile(resolved)
    shape = resolved.shapes[profile.shape]

    raw_users = os.environ.get("CADENCE_LOAD_USERS", "").strip()
    raw_duration = os.environ.get(
        "CADENCE_LOAD_DURATION_SECONDS",
        "",
    ).strip()
    if bool(raw_users) != bool(raw_duration):
        raise ProfileConfigError(
            "Fixed mutation user and duration overrides must be provided together."
        )
    if not raw_users:
        return shape

    users = _parse_positive_integer(raw_users, "user")
    duration = _parse_positive_integer(raw_duration, "duration")
    if users > shape.max_users:
        raise ProfileConfigError(
            "The fixed mutation user override exceeds the selected profile."
        )
    if duration > resolved.ceilings.maximum_profile_runtime_seconds:
        raise ProfileConfigError(
            "The fixed mutation duration exceeds the declared ceiling."
        )
    if profile.workload == "contention" and users != 1:
        raise ProfileConfigError(
            "The contention profile requires one paired two-session user."
        )

    source_stage = next(
        (stage for stage in shape.stages if stage.users >= users),
        shape.stages[-1],
    )
    return ShapeDefinition(
        name=f"{shape.name}-fixed",
        stages=(
            LoadStage(
                duration_seconds=duration,
                users=users,
                spawn_rate=min(float(users), source_stage.spawn_rate),
            ),
        ),
    )


def resolve_profile_runtime_ceiling(
    catalog: MutationProfileCatalog,
    profile: MutationProfile,
) -> int:
    """Give only the one-hour soak a bounded shutdown grace window."""

    if profile.name == "soak":
        return catalog.ceilings.maximum_soak_runtime_seconds
    return catalog.ceilings.maximum_profile_runtime_seconds


def stage_at_elapsed(
    shape: ShapeDefinition,
    elapsed_seconds: float,
) -> LoadStage | None:
    if elapsed_seconds < 0:
        raise ProfileConfigError(
            "Mutation load-shape elapsed time cannot be negative."
        )

    stage_end = 0
    for stage in shape.stages:
        stage_end += stage.duration_seconds
        if elapsed_seconds < stage_end:
            return stage
    return None


class CadenceMutationLoadShape(LoadTestShape):
    """Locust entrypoint for one selected mutation profile or plateau."""

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.definition = resolve_selected_mutation_shape()

    def tick(self):
        stage = stage_at_elapsed(self.definition, self.get_run_time())
        if stage is None:
            return None
        return stage.users, stage.spawn_rate


def parse_mutation_profile_catalog(
    payload: object,
) -> MutationProfileCatalog:
    if (
        not isinstance(payload, dict)
        or payload.get("schema_version") != "1.0.0"
    ):
        raise ProfileConfigError(
            "The mutation workload profile manifest has an unsupported schema."
        )
    if (
        payload.get("assumption_basis")
        != "initial_product_assumptions_not_observed_analytics"
    ):
        raise ProfileConfigError(
            "Mutation weights must be labeled as initial assumptions."
        )

    raw_think_time = payload.get("think_time_seconds")
    if not isinstance(raw_think_time, dict):
        raise ProfileConfigError("The mutation workload think time is invalid.")
    minimum = raw_think_time.get("minimum")
    maximum = raw_think_time.get("maximum")
    if (
        not _is_number(minimum)
        or not _is_number(maximum)
        or minimum < 0
        or maximum <= minimum
        or maximum > 60
    ):
        raise ProfileConfigError("The mutation workload think time is invalid.")

    raw_weights = payload.get("task_weights")
    if (
        not isinstance(raw_weights, dict)
        or set(raw_weights) != MUTATION_TASK_KEYS
        or any(
            not isinstance(weight, int)
            or isinstance(weight, bool)
            or weight <= 0
            for weight in raw_weights.values()
        )
        or sum(raw_weights.values()) != 100
    ):
        raise ProfileConfigError(
            "The mutation workload task weights are incomplete or unbounded."
        )
    raw_read_keys = payload.get("read_task_keys")
    if (
        not isinstance(raw_read_keys, list)
        or not raw_read_keys
        or any(not isinstance(key, str) for key in raw_read_keys)
        or not set(raw_read_keys).issubset(MUTATION_TASK_KEYS)
    ):
        raise ProfileConfigError(
            "The mutation workload read-task inventory is invalid."
        )
    read_keys = frozenset(raw_read_keys)
    read_weight = sum(raw_weights[key] for key in read_keys)
    if read_weight <= 50:
        raise ProfileConfigError(
            "Normal mutation profiles must remain read dominant."
        )

    ceilings = _parse_ceilings(payload.get("ceilings"))
    raw_shapes = payload.get("shapes")
    if (
        not isinstance(raw_shapes, dict)
        or set(raw_shapes) != REQUIRED_MUTATION_PROFILES
    ):
        raise ProfileConfigError(
            "The mutation workload shape inventory is incomplete."
        )
    shapes = {
        name: _parse_mutation_shape(name, value, ceilings)
        for name, value in raw_shapes.items()
    }

    raw_profiles = payload.get("profiles")
    if (
        not isinstance(raw_profiles, dict)
        or set(raw_profiles) != REQUIRED_MUTATION_PROFILES
    ):
        raise ProfileConfigError(
            "The selectable mutation workload profiles are incomplete."
        )
    profiles: dict[str, MutationProfile] = {}
    for name, raw_profile in raw_profiles.items():
        if not isinstance(raw_profile, dict):
            raise ProfileConfigError(
                "A selectable mutation workload profile is invalid."
            )
        shape = raw_profile.get("shape")
        workload = raw_profile.get("workload")
        if shape not in shapes or workload not in ALLOWED_WORKLOADS:
            raise ProfileConfigError(
                "A selectable mutation workload profile is invalid."
            )
        profiles[name] = MutationProfile(
            name=name,
            shape=shape,
            workload=workload,
        )

    if payload.get("default_profile") != "smoke":
        raise ProfileConfigError(
            "The mutation workload default must be the bounded smoke profile."
        )
    _assert_ticketed_shapes(shapes)

    total_declared_runtime = sum(
        shape.total_duration_seconds for shape in shapes.values()
    )
    if total_declared_runtime > ceilings.maximum_suite_runtime_seconds:
        raise ProfileConfigError(
            "The declared mutation suite exceeds its runtime ceiling."
        )

    return MutationProfileCatalog(
        assumption_basis=payload["assumption_basis"],
        default_profile="smoke",
        think_time_seconds=(float(minimum), float(maximum)),
        task_weights=MappingProxyType(dict(raw_weights)),
        read_task_keys=read_keys,
        ceilings=ceilings,
        profiles=MappingProxyType(profiles),
        shapes=MappingProxyType(shapes),
    )


def _parse_ceilings(value: object) -> MutationCeilings:
    if not isinstance(value, dict):
        raise ProfileConfigError("Mutation load ceilings are invalid.")
    required = {
        "maximum_users",
        "maximum_profile_runtime_seconds",
        "maximum_soak_runtime_seconds",
        "maximum_suite_runtime_seconds",
        "maximum_requests",
        "maximum_requests_per_second",
        "unexpected_5xx_ratio",
        "unexpected_5xx_window_seconds",
        "unexpected_5xx_consecutive_windows",
    }
    if set(value) != required:
        raise ProfileConfigError("Mutation load ceilings are incomplete.")
    if (
        not _is_positive_integer(value["maximum_users"])
        or value["maximum_users"] > 100
        or not _is_positive_integer(
            value["maximum_profile_runtime_seconds"]
        )
        or value["maximum_profile_runtime_seconds"] > 7200
        or not _is_positive_integer(value["maximum_soak_runtime_seconds"])
        or value["maximum_soak_runtime_seconds"]
        <= value["maximum_profile_runtime_seconds"]
        or value["maximum_soak_runtime_seconds"] > 4200
        or not _is_positive_integer(value["maximum_suite_runtime_seconds"])
        or value["maximum_suite_runtime_seconds"] > 14400
        or not _is_positive_integer(value["maximum_requests"])
        or value["maximum_requests"] > 1000000
        or not _is_number(value["maximum_requests_per_second"])
        or value["maximum_requests_per_second"] <= 0
        or value["maximum_requests_per_second"] > 100
        or not _is_number(value["unexpected_5xx_ratio"])
        or value["unexpected_5xx_ratio"] <= 0
        or value["unexpected_5xx_ratio"] >= 0.05
        or not _is_positive_integer(value["unexpected_5xx_window_seconds"])
        or value["unexpected_5xx_window_seconds"] > 300
        or not _is_positive_integer(
            value["unexpected_5xx_consecutive_windows"]
        )
        or value["unexpected_5xx_consecutive_windows"] > 10
    ):
        raise ProfileConfigError("Mutation load ceilings are invalid.")
    return MutationCeilings(**value)


def _parse_mutation_shape(
    name: str,
    value: object,
    ceilings: MutationCeilings,
) -> ShapeDefinition:
    if not isinstance(value, dict) or not isinstance(value.get("stages"), list):
        raise ProfileConfigError("A mutation workload shape is invalid.")
    stages: list[LoadStage] = []
    for raw_stage in value["stages"]:
        if not isinstance(raw_stage, dict):
            raise ProfileConfigError("A mutation workload stage is invalid.")
        duration = raw_stage.get("duration_seconds")
        users = raw_stage.get("users")
        spawn_rate = raw_stage.get("spawn_rate")
        if (
            not _is_positive_integer(duration)
            or duration > ceilings.maximum_profile_runtime_seconds
            or not _is_positive_integer(users)
            or users > ceilings.maximum_users
            or not _is_number(spawn_rate)
            or spawn_rate <= 0
            or spawn_rate > users
        ):
            raise ProfileConfigError("A mutation workload stage is invalid.")
        stages.append(
            LoadStage(
                duration_seconds=duration,
                users=users,
                spawn_rate=float(spawn_rate),
            )
        )
    shape = ShapeDefinition(name=name, stages=tuple(stages))
    if (
        not stages
        or shape.total_duration_seconds
        > ceilings.maximum_profile_runtime_seconds
    ):
        raise ProfileConfigError(
            "A mutation workload shape exceeds its bounded duration."
        )
    return shape


def _assert_ticketed_shapes(
    shapes: Mapping[str, ShapeDefinition],
) -> None:
    if [stage.users for stage in shapes["mixed_baseline"].stages] != [5, 10]:
        raise ProfileConfigError(
            "The mixed baseline must use 5- and 10-user plateaus."
        )
    if [stage.users for stage in shapes["ramp"].stages] != [10, 25, 50, 100]:
        raise ProfileConfigError(
            "The mutation ramp must use 10, 25, 50, and 100 users."
        )
    spike = shapes["spike"].stages
    if (
        len(spike) != 3
        or spike[1].users != spike[0].users * 10
        or spike[2].users != spike[0].users
        or spike[1].spawn_rate < spike[1].users
    ):
        raise ProfileConfigError(
            "The spike must use a rapid 10x increase and recovery."
        )
    soak = shapes["soak"]
    if (
        soak.total_duration_seconds != 3600
        or soak.max_users != 25
    ):
        raise ProfileConfigError(
            "The soak must run exactly 25 users for one hour."
        )
    if [stage.users for stage in shapes["contention"].stages] != [1]:
        raise ProfileConfigError(
            "The contention profile requires one paired two-session user."
        )
    if shapes["timezone_changed"].max_users > 5:
        raise ProfileConfigError(
            "Changed-timezone load must remain separately tagged and small."
        )


def _parse_positive_integer(value: str, label: str) -> int:
    if not value.isascii() or not value.isdigit():
        raise ProfileConfigError(
            f"The fixed mutation {label} override must be a positive integer."
        )
    parsed = int(value)
    if parsed <= 0:
        raise ProfileConfigError(
            f"The fixed mutation {label} override must be a positive integer."
        )
    return parsed


def _is_positive_integer(value: object) -> bool:
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and value > 0
    )


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)
