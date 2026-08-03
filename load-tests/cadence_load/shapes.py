"""Selectable, bounded Locust shapes for Cadence read workloads."""

from __future__ import annotations

import os

from locust import LoadTestShape

from cadence_load.data import (
    LoadStage,
    ProfileCatalog,
    ProfileConfigError,
    ShapeDefinition,
    load_profile_catalog,
    select_read_profile,
)


def stage_at_elapsed(
    shape: ShapeDefinition,
    elapsed_seconds: float,
) -> LoadStage | None:
    if elapsed_seconds < 0:
        raise ProfileConfigError("Load-shape elapsed time cannot be negative.")

    stage_end = 0
    for stage in shape.stages:
        stage_end += stage.duration_seconds
        if elapsed_seconds < stage_end:
            return stage
    return None


def resolve_selected_shape(
    catalog: ProfileCatalog | None = None,
) -> ShapeDefinition:
    resolved_catalog = catalog or load_profile_catalog()
    profile = select_read_profile(resolved_catalog)
    shape = resolved_catalog.shapes[profile.shape]

    raw_users = os.environ.get("CADENCE_LOAD_USERS", "").strip()
    raw_duration = os.environ.get(
        "CADENCE_LOAD_DURATION_SECONDS",
        "",
    ).strip()
    if bool(raw_users) != bool(raw_duration):
        raise ProfileConfigError(
            "Fixed-stage user and duration overrides must be provided together."
        )
    if not raw_users:
        return shape

    users = _parse_positive_integer(raw_users, "user")
    duration = _parse_positive_integer(raw_duration, "duration")
    if users > shape.max_users:
        raise ProfileConfigError(
            "The fixed-stage user override exceeds the selected profile."
        )
    if duration > shape.total_duration_seconds:
        raise ProfileConfigError(
            "The fixed-stage duration override exceeds the selected profile."
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


class CadenceReadLoadShape(LoadTestShape):
    """Locust entrypoint using one selected bounded profile or fixed plateau."""

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.definition = resolve_selected_shape()

    def tick(self):
        stage = stage_at_elapsed(self.definition, self.get_run_time())
        if stage is None:
            return None
        return stage.users, stage.spawn_rate


def _parse_positive_integer(value: str, label: str) -> int:
    if not value.isascii() or not value.isdigit():
        raise ProfileConfigError(
            f"The fixed-stage {label} override must be a positive integer."
        )
    parsed = int(value)
    if parsed <= 0:
        raise ProfileConfigError(
            f"The fixed-stage {label} override must be a positive integer."
        )
    return parsed
