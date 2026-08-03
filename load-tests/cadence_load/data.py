"""Read-workload routes, semantic assertions, and bounded profile data."""

from __future__ import annotations

import csv
import html
import io
import json
import os
import re
import zipfile
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path, PurePosixPath
from types import MappingProxyType
from typing import Mapping

from cadence_load.assertions import (
    CriticalSemanticAssertionError,
    ResponseLike,
    SemanticAssertionError,
    assert_protected_document,
    assert_public_document,
)
from cadence_load.auth import LoadIdentity


@dataclass(frozen=True)
class ReadRequest:
    key: str
    method: str
    path: str
    name: str
    heading: str | None = None
    marker: str | None = None
    export_format: str | None = None
    requires_owned_behavior_marker: bool = False


PUBLIC_DOCUMENT_REQUESTS = (
    ReadRequest(
        key="public_login",
        method="GET",
        path="/login",
        name="INT-AUTH-003 GET /login public-document",
        heading="Cadence",
        marker="Continue with Google",
    ),
    ReadRequest(
        key="public_terms",
        method="GET",
        path="/terms",
        name="INT-LEGAL-001 GET /terms public-document",
        heading="Terms",
        marker="Terms",
    ),
    ReadRequest(
        key="public_privacy",
        method="GET",
        path="/privacy",
        name="INT-LEGAL-001 GET /privacy public-document",
        heading="Privacy",
        marker="Privacy",
    ),
    ReadRequest(
        key="public_trust",
        method="GET",
        path="/trust",
        name="INT-LEGAL-001 GET /trust public-document",
        heading="Trust",
        marker="Trust",
    ),
)

PROTECTED_DOCUMENT_REQUESTS = (
    ReadRequest(
        key="timeline",
        method="GET",
        path="/timeline",
        name="INT-SHELL-001 GET /timeline protected-document",
        heading="Timeline",
        marker="Open Needs decision",
        requires_owned_behavior_marker=True,
    ),
    ReadRequest(
        key="behaviors",
        method="GET",
        path="/behaviors",
        name="INT-SHELL-001 GET /behaviors protected-document",
        heading="Behaviors",
        marker="Create behavior",
        requires_owned_behavior_marker=True,
    ),
    ReadRequest(
        key="export_page",
        method="GET",
        path="/export",
        name="INT-SHELL-001 GET /export protected-document",
        heading="Export & Import",
        marker="Downloads",
    ),
    ReadRequest(
        key="settings",
        method="GET",
        path="/settings",
        name="INT-SHELL-001 GET /settings protected-document",
        heading="Settings",
        marker="Profile",
    ),
    ReadRequest(
        key="timeline_future",
        method="GET",
        path="/timeline?days=30",
        name="INT-TIMELINE-001 GET /timeline future-query",
        heading="Timeline",
        marker="Open Needs decision",
        requires_owned_behavior_marker=True,
    ),
    ReadRequest(
        key="behaviors_range",
        method="GET",
        path="/behaviors?range=30",
        name="INT-BEHAVIOR-001 GET /behaviors range-query",
        heading="Behaviors",
        marker="Create behavior",
        requires_owned_behavior_marker=True,
    ),
    ReadRequest(
        key="behaviors_selected_day",
        method="GET",
        path=(
            "/behaviors?range=30&behavior=:behavior_id&day=:local_date"
        ),
        name="INT-BEHAVIOR-002 GET /behaviors selected-day-query",
        heading="Behaviors",
        marker="Review selected day",
        requires_owned_behavior_marker=True,
    ),
)

EXPORT_REQUESTS = (
    ReadRequest(
        key="export_jsonl",
        method="GET",
        path="/api/export/jsonl?range=30&include_archived=0&include_notes=0",
        name="INT-EXPORT-005 GET /api/export/jsonl structured-export",
        export_format="jsonl",
    ),
    ReadRequest(
        key="export_csv",
        method="GET",
        path="/api/export/csv?range=30&include_archived=0&include_notes=0",
        name="INT-EXPORT-005 GET /api/export/csv structured-export",
        export_format="csv",
    ),
    ReadRequest(
        key="export_json",
        method="GET",
        path="/api/export/json?range=30&include_archived=0&include_notes=0",
        name="INT-EXPORT-005 GET /api/export/json structured-export",
        export_format="json",
    ),
    ReadRequest(
        key="export_behaviorlog",
        method="GET",
        path=(
            "/api/export/behaviorlog?"
            "range=30&include_archived=0&include_notes=0"
        ),
        name="INT-EXPORT-005 GET /api/export/behaviorlog structured-export",
        export_format="behaviorlog",
    ),
)

ALL_READ_REQUESTS = (
    *PUBLIC_DOCUMENT_REQUESTS,
    *PROTECTED_DOCUMENT_REQUESTS,
    *EXPORT_REQUESTS,
)
REQUEST_BY_KEY: Mapping[str, ReadRequest] = MappingProxyType(
    {request.key: request for request in ALL_READ_REQUESTS}
)
FUTURE_DAY_OPTIONS = (14, 30)
BEHAVIOR_RANGE_OPTIONS = (7, 30, 90)
EXPECTED_CSV_HEADER = (
    "local_date",
    "scheduled_for",
    "schedule",
    "behavior_title",
    "category",
    "status",
    "status_marked_at",
    "note",
)
MAX_BEHAVIORLOG_UNCOMPRESSED_BYTES = 128 * 1024 * 1024
OWNER_MARKER_PATTERN = re.compile(r"cadence-owner-[a-f0-9]{20}")
SEMANTIC_ERROR_MARKERS = (
    "Application error:",
    "Internal Server Error",
    "This page could not be loaded",
)


def assert_public_read_response(
    response: ResponseLike,
    request: ReadRequest,
) -> None:
    _assert_not_5xx(response, "Public document")
    assert_public_document(response, marker=request.marker or "")
    _assert_document_heading(response.text, request.heading)
    _assert_no_semantic_error(response.text, "Public document")


def assert_protected_read_response(
    response: ResponseLike,
    request: ReadRequest,
    *,
    identity: LoadIdentity,
) -> None:
    _assert_not_5xx(response, "Protected document")
    assert_protected_document(response, marker=request.marker or "")
    _assert_document_heading(response.text, request.heading)
    _assert_no_semantic_error(response.text, "Protected document")
    _assert_protected_ownership(
        response.text,
        identity=identity,
        require_owner_marker=request.requires_owned_behavior_marker,
    )


def assert_export_response(
    response: ResponseLike,
    request: ReadRequest,
    *,
    owner_marker: str,
    forbidden_marker: str,
    require_owner_marker: bool,
) -> None:
    export_format = request.export_format
    if export_format not in {"jsonl", "csv", "json", "behaviorlog"}:
        raise SemanticAssertionError(
            "Unsupported structured export assertion."
        )

    _assert_2xx(response, "Structured export")
    disposition = _header(response, "content-disposition").lower()
    if "attachment" not in disposition:
        raise SemanticAssertionError(
            "Structured export was not returned as an attachment."
        )
    if not response.content:
        raise SemanticAssertionError("Structured export body was empty.")

    if export_format == "jsonl":
        _assert_content_type(
            response,
            "application/x-ndjson",
            "Structured JSONL export",
        )
        _assert_disposition_suffix(disposition, ".jsonl")
        searchable = _assert_jsonl(response.content)
    elif export_format == "csv":
        _assert_content_type(response, "text/csv", "Structured CSV export")
        _assert_disposition_suffix(disposition, ".csv")
        searchable = _assert_csv(response.content)
    elif export_format == "json":
        _assert_content_type(
            response,
            "application/json",
            "Structured JSON export",
        )
        _assert_disposition_suffix(disposition, ".json")
        searchable = _assert_json(response.content)
    else:
        _assert_content_type(
            response,
            "application/zip",
            "BehaviorLog export",
        )
        _assert_disposition_suffix(disposition, ".behaviorlog.zip")
        searchable = _assert_behaviorlog(response.content)

    _assert_export_ownership(
        searchable,
        owner_marker=owner_marker,
        forbidden_marker=forbidden_marker,
        require_owner_marker=require_owner_marker,
    )


def export_path_for_cohort(request: ReadRequest, cohort: str) -> str:
    if request.export_format is None:
        raise ValueError("Only structured export requests have cohort paths.")
    if cohort != "export_heavy":
        return request.path

    base_path = request.path.split("?", maxsplit=1)[0]
    return (
        f"{base_path}?range=all&include_archived=1&include_notes=1"
    )


def _assert_document_heading(body: str, heading: str | None) -> None:
    if not heading:
        raise SemanticAssertionError(
            "Document assertion is missing its semantic heading."
        )
    normalized = html.unescape(body)
    pattern = re.compile(
        rf"<h1\b[^>]*>.*?{re.escape(heading)}.*?</h1>",
        re.IGNORECASE | re.DOTALL,
    )
    if not pattern.search(normalized):
        raise SemanticAssertionError(
            "Document did not contain its semantic page heading."
        )


def _assert_no_semantic_error(body: str, label: str) -> None:
    if any(marker in body for marker in SEMANTIC_ERROR_MARKERS):
        raise SemanticAssertionError(
            f"{label} returned an application error surface."
        )


def _assert_jsonl(content: bytes) -> str:
    body = _decode_utf8(content, "Structured JSONL export")
    lines = [line for line in body.splitlines() if line.strip()]
    if not lines:
        raise SemanticAssertionError(
            "Structured JSONL export contained no records."
        )
    allowed_types = {"category", "behavior", "occurrence"}
    for line in lines[:10]:
        try:
            record = json.loads(line)
        except ValueError as error:
            raise SemanticAssertionError(
                "Structured JSONL export contained invalid JSON."
            ) from error
        if (
            not isinstance(record, dict)
            or record.get("type") not in allowed_types
        ):
            raise SemanticAssertionError(
                "Structured JSONL export lacked a recognized record type."
            )
    return body


def _assert_csv(content: bytes) -> str:
    body = _decode_utf8(content, "Structured CSV export")
    try:
        rows = csv.reader(io.StringIO(body))
        header = tuple(next(rows))
    except (csv.Error, StopIteration) as error:
        raise SemanticAssertionError(
            "Structured CSV export lacked its header."
        ) from error
    if header != EXPECTED_CSV_HEADER:
        raise SemanticAssertionError(
            "Structured CSV export had an unexpected header."
        )
    return body


def _assert_json(content: bytes) -> str:
    body = _decode_utf8(content, "Structured JSON export")
    try:
        payload = json.loads(body)
    except ValueError as error:
        raise SemanticAssertionError(
            "Structured JSON export was not valid JSON."
        ) from error
    required_keys = {
        "profile",
        "categories",
        "behaviors",
        "occurrences",
        "status_events",
    }
    if not isinstance(payload, dict) or not required_keys.issubset(payload):
        raise SemanticAssertionError(
            "Structured JSON export lacked required semantic keys."
        )
    return body


def _assert_behaviorlog(content: bytes) -> str:
    try:
        archive = zipfile.ZipFile(io.BytesIO(content))
    except (OSError, zipfile.BadZipFile) as error:
        raise SemanticAssertionError(
            "BehaviorLog export was not a valid ZIP bundle."
        ) from error

    with archive:
        infos = archive.infolist()
        names = {info.filename for info in infos}
        if not {"manifest.json", "data/behaviors.jsonl"}.issubset(names):
            raise SemanticAssertionError(
                "BehaviorLog export lacked required bundle files."
            )
        if (
            sum(info.file_size for info in infos)
            > MAX_BEHAVIORLOG_UNCOMPRESSED_BYTES
        ):
            raise SemanticAssertionError(
                "BehaviorLog export exceeded the bounded assertion size."
            )
        for info in infos:
            path = PurePosixPath(info.filename)
            if (
                info.flag_bits & 0x1
                or path.is_absolute()
                or ".." in path.parts
            ):
                raise SemanticAssertionError(
                    "BehaviorLog export contained an unsafe bundle entry."
                )

        try:
            manifest = json.loads(archive.read("manifest.json"))
        except (KeyError, UnicodeError, ValueError) as error:
            raise SemanticAssertionError(
                "BehaviorLog export manifest was invalid."
            ) from error
        if (
            not isinstance(manifest, dict)
            or manifest.get("format") != "behaviorlog.bundle"
            or not isinstance(manifest.get("schema_version"), str)
        ):
            raise SemanticAssertionError(
                "BehaviorLog export manifest lacked required semantics."
            )

        searchable_parts: list[str] = []
        for info in infos:
            if info.is_dir():
                continue
            try:
                searchable_parts.append(
                    archive.read(info).decode("utf-8")
                )
            except UnicodeError as error:
                raise SemanticAssertionError(
                    "BehaviorLog export contained invalid text data."
                ) from error
        return "\n".join(searchable_parts)


def _assert_export_ownership(
    body: str,
    *,
    owner_marker: str,
    forbidden_marker: str,
    require_owner_marker: bool,
) -> None:
    discovered_markers = set(OWNER_MARKER_PATTERN.findall(body))
    if forbidden_marker in body:
        raise CriticalSemanticAssertionError(
            "Structured export contained data from another synthetic account."
        )
    if not require_owner_marker and discovered_markers:
        raise CriticalSemanticAssertionError(
            "Structured export contained data for an empty synthetic account."
        )
    if require_owner_marker and owner_marker not in discovered_markers:
        raise CriticalSemanticAssertionError(
            "Structured export lacked the assigned account marker."
        )
    if require_owner_marker and discovered_markers != {owner_marker}:
        raise CriticalSemanticAssertionError(
            "Structured export contained data from another synthetic account."
        )


def _assert_protected_ownership(
    body: str,
    *,
    identity: LoadIdentity,
    require_owner_marker: bool,
) -> None:
    discovered_markers = set(OWNER_MARKER_PATTERN.findall(body))
    owner_marker = identity.selectors.owner_marker

    if not identity.requires_owner_marker:
        if discovered_markers:
            raise CriticalSemanticAssertionError(
                "Protected document contained data for an empty synthetic account."
            )
        return

    if discovered_markers - {owner_marker}:
        raise CriticalSemanticAssertionError(
            "Protected document contained data from another synthetic account."
        )
    if require_owner_marker and owner_marker not in discovered_markers:
        raise CriticalSemanticAssertionError(
            "Protected document lacked the assigned account marker."
        )


def _assert_2xx(response: ResponseLike, label: str) -> None:
    _assert_not_5xx(response, label)
    if response.status_code < 200 or response.status_code >= 300:
        raise SemanticAssertionError(
            f"{label} returned unexpected HTTP status "
            f"{response.status_code}."
        )


def _assert_not_5xx(response: ResponseLike, label: str) -> None:
    if response.status_code >= 500:
        raise CriticalSemanticAssertionError(
            f"{label} returned an unexpected 5xx response."
        )


def _assert_content_type(
    response: ResponseLike,
    expected: str,
    label: str,
) -> None:
    if expected not in _header(response, "content-type").lower():
        raise SemanticAssertionError(
            f"{label} returned an unexpected content type."
        )


def _assert_disposition_suffix(disposition: str, suffix: str) -> None:
    if suffix not in disposition:
        raise SemanticAssertionError(
            "Structured export filename had an unexpected extension."
        )


def _header(response: ResponseLike, name: str) -> str:
    for header_name, value in response.headers.items():
        if header_name.lower() == name:
            return value
    return ""


def _decode_utf8(content: bytes, label: str) -> str:
    try:
        return content.decode("utf-8")
    except UnicodeError as error:
        raise SemanticAssertionError(
            f"{label} was not valid UTF-8."
        ) from error


class ProfileConfigError(RuntimeError):
    """A bounded, privacy-safe workload-profile configuration failure."""


@dataclass(frozen=True)
class LoadStage:
    duration_seconds: int
    users: int
    spawn_rate: float


@dataclass(frozen=True)
class ShapeDefinition:
    name: str
    stages: tuple[LoadStage, ...]

    @property
    def max_users(self) -> int:
        return max(stage.users for stage in self.stages)

    @property
    def total_duration_seconds(self) -> int:
        return sum(stage.duration_seconds for stage in self.stages)


@dataclass(frozen=True)
class ReadProfile:
    name: str
    shape: str
    cohort_filter: str | None


@dataclass(frozen=True)
class ProfileCatalog:
    assumption_basis: str
    default_profile: str
    think_time_seconds: tuple[float, float]
    task_weights: Mapping[str, int]
    default_cohort_mix_percent: Mapping[str, int]
    profiles: Mapping[str, ReadProfile]
    shapes: Mapping[str, ShapeDefinition]


@lru_cache(maxsize=1)
def load_profile_catalog() -> ProfileCatalog:
    path = Path(__file__).resolve().parents[1] / "scenarios" / "profiles.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError) as error:
        raise ProfileConfigError(
            "The read workload profile manifest is unavailable or invalid."
        ) from error
    return _parse_profile_catalog(payload)


def select_read_profile(
    catalog: ProfileCatalog | None = None,
) -> ReadProfile:
    resolved_catalog = catalog or load_profile_catalog()
    selected_name = os.environ.get(
        "CADENCE_LOAD_PROFILE",
        resolved_catalog.default_profile,
    ).strip()
    profile = resolved_catalog.profiles.get(selected_name)
    if profile is None:
        raise ProfileConfigError(
            "CADENCE_LOAD_PROFILE does not name a supported bounded profile."
        )

    raw_filter = os.environ.get("CADENCE_LOAD_COHORT_FILTER", "").strip()
    selected_filter = raw_filter or None
    if selected_filter != profile.cohort_filter:
        raise ProfileConfigError(
            "CADENCE_LOAD_COHORT_FILTER does not match the selected profile."
        )
    return profile


def _parse_profile_catalog(payload: object) -> ProfileCatalog:
    if not isinstance(payload, dict) or payload.get("schema_version") != "1.0.0":
        raise ProfileConfigError(
            "The read workload profile manifest has an unsupported schema."
        )

    assumption_basis = payload.get("assumption_basis")
    if assumption_basis != "initial_product_assumptions_not_observed_analytics":
        raise ProfileConfigError(
            "The read workload weights must be labeled as initial assumptions."
        )

    raw_think_time = payload.get("think_time_seconds")
    if not isinstance(raw_think_time, dict):
        raise ProfileConfigError("The read workload think time is invalid.")
    minimum = raw_think_time.get("minimum")
    maximum = raw_think_time.get("maximum")
    if (
        not isinstance(minimum, (int, float))
        or isinstance(minimum, bool)
        or not isinstance(maximum, (int, float))
        or isinstance(maximum, bool)
        or minimum < 0
        or maximum <= minimum
        or maximum > 60
    ):
        raise ProfileConfigError("The read workload think time is invalid.")

    raw_task_weights = payload.get("task_weights")
    required_task_keys = set(REQUEST_BY_KEY)
    if (
        not isinstance(raw_task_weights, dict)
        or set(raw_task_weights) != required_task_keys
        or any(
            not isinstance(weight, int) or isinstance(weight, bool) or weight <= 0
            for weight in raw_task_weights.values()
        )
        or sum(raw_task_weights.values()) != 100
    ):
        raise ProfileConfigError(
            "The read workload task weights are incomplete or unbounded."
        )
    public_keys = {request.key for request in PUBLIC_DOCUMENT_REQUESTS}
    if sum(raw_task_weights[key] for key in public_keys) != 15:
        raise ProfileConfigError(
            "The public read share must remain the initial 15 percent assumption."
        )

    raw_cohort_mix = payload.get("default_cohort_mix_percent")
    expected_cohorts = {
        "empty",
        "typical_daily",
        "review_heavy",
        "export_heavy",
        "heavy_schedule",
    }
    if (
        not isinstance(raw_cohort_mix, dict)
        or set(raw_cohort_mix) != expected_cohorts
        or any(
            not isinstance(weight, int) or isinstance(weight, bool) or weight < 0
            for weight in raw_cohort_mix.values()
        )
        or sum(raw_cohort_mix.values()) != 100
        or raw_cohort_mix["heavy_schedule"] != 0
    ):
        raise ProfileConfigError(
            "The default synthetic cohort mix is invalid."
        )

    raw_shapes = payload.get("shapes")
    required_profiles = {"smoke", "baseline", "ramp", "recovery", "heavy"}
    if not isinstance(raw_shapes, dict) or set(raw_shapes) != required_profiles:
        raise ProfileConfigError(
            "The read workload shape inventory is incomplete."
        )
    shapes = {
        name: _parse_shape(name, raw_shape)
        for name, raw_shape in raw_shapes.items()
    }

    raw_profiles = payload.get("profiles")
    if not isinstance(raw_profiles, dict) or set(raw_profiles) != required_profiles:
        raise ProfileConfigError(
            "The selectable read workload profiles are incomplete."
        )
    profiles: dict[str, ReadProfile] = {}
    for name, raw_profile in raw_profiles.items():
        if not isinstance(raw_profile, dict):
            raise ProfileConfigError(
                "A selectable read workload profile is invalid."
            )
        shape = raw_profile.get("shape")
        cohort_filter = raw_profile.get("cohort_filter")
        if shape not in shapes or cohort_filter not in {None, "heavy_schedule"}:
            raise ProfileConfigError(
                "A selectable read workload profile is invalid."
            )
        if (name == "heavy") != (cohort_filter == "heavy_schedule"):
            raise ProfileConfigError(
                "Only the tagged heavy profile may select heavy identities."
            )
        profiles[name] = ReadProfile(
            name=name,
            shape=shape,
            cohort_filter=cohort_filter,
        )

    default_profile = payload.get("default_profile")
    if default_profile != "smoke" or default_profile not in profiles:
        raise ProfileConfigError(
            "The read workload default must be the bounded smoke profile."
        )

    if [stage.users for stage in shapes["baseline"].stages] != [5, 10]:
        raise ProfileConfigError(
            "The baseline shape must use the 5- and 10-user plateaus."
        )
    if [stage.users for stage in shapes["ramp"].stages] != [10, 25, 50, 100]:
        raise ProfileConfigError(
            "The ramp shape must use the bounded read plateaus."
        )
    recovery_users = [stage.users for stage in shapes["recovery"].stages]
    if (
        len(recovery_users) < 3
        or recovery_users[0] != recovery_users[-1]
        or max(recovery_users) <= recovery_users[0]
    ):
        raise ProfileConfigError(
            "The recovery shape must return to its initial user count."
        )
    if shapes["heavy"].max_users != 5:
        raise ProfileConfigError(
            "The heavy schedule profile must remain bounded to five users."
        )

    return ProfileCatalog(
        assumption_basis=assumption_basis,
        default_profile=default_profile,
        think_time_seconds=(float(minimum), float(maximum)),
        task_weights=MappingProxyType(dict(raw_task_weights)),
        default_cohort_mix_percent=MappingProxyType(dict(raw_cohort_mix)),
        profiles=MappingProxyType(profiles),
        shapes=MappingProxyType(shapes),
    )


def _parse_shape(name: str, value: object) -> ShapeDefinition:
    if not isinstance(value, dict) or not isinstance(value.get("stages"), list):
        raise ProfileConfigError("A read workload shape is invalid.")
    stages: list[LoadStage] = []
    for raw_stage in value["stages"]:
        if not isinstance(raw_stage, dict):
            raise ProfileConfigError("A read workload stage is invalid.")
        duration = raw_stage.get("duration_seconds")
        users = raw_stage.get("users")
        spawn_rate = raw_stage.get("spawn_rate")
        if (
            not isinstance(duration, int)
            or isinstance(duration, bool)
            or duration <= 0
            or duration > 600
            or not isinstance(users, int)
            or isinstance(users, bool)
            or users <= 0
            or users > 100
            or not isinstance(spawn_rate, (int, float))
            or isinstance(spawn_rate, bool)
            or spawn_rate <= 0
            or spawn_rate > users
        ):
            raise ProfileConfigError("A read workload stage is invalid.")
        stages.append(
            LoadStage(
                duration_seconds=duration,
                users=users,
                spawn_rate=float(spawn_rate),
            )
        )
    if not stages or sum(stage.duration_seconds for stage in stages) > 1_200:
        raise ProfileConfigError(
            "A read workload shape exceeds its bounded duration."
        )
    return ShapeDefinition(name=name, stages=tuple(stages))
