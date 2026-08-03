"""Local-only authenticated identity artifacts and exclusive VU leases."""

from __future__ import annotations

import json
import os
import re
import stat
import threading
from collections import deque
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from types import MappingProxyType
from typing import Mapping, Sequence
from urllib.parse import urlparse


ALLOWED_COHORTS = frozenset(
    {
        "empty",
        "typical_daily",
        "review_heavy",
        "export_heavy",
        "heavy_schedule",
    }
)
HEAVY_COHORT = "heavy_schedule"
MAX_ARTIFACT_IDENTITIES = 105
MAX_CONTENTION_SESSIONS = 8
MAX_ARTIFACT_BYTES = 4 * 1024 * 1024
UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-"
    r"[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
OWNER_MARKER_PATTERN = re.compile(r"^cadence-owner-[a-f0-9]{20}$")
CONTENTION_PAIR_PATTERN = re.compile(r"^contention-[a-f0-9]{12}$")
CLOCK_TIME_PATTERN = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
TIMEZONE_PATTERN = re.compile(
    r"^[A-Za-z_+-]+(?:/[A-Za-z0-9_+-]+)+$"
)
FORBIDDEN_WORKER_ENVIRONMENT = frozenset(
    {
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_SECRET_KEY",
        "SERVICE_ROLE_KEY",
        "SUPABASE_DB_PASSWORD",
        "DATABASE_URL",
        "DB_URL",
        "SEQUENZY_API_KEY",
        "VAPID_PRIVATE_KEY",
        "REMINDER_PROCESS_SECRET",
        "CRON_SECRET",
    }
)


class IdentityArtifactError(RuntimeError):
    """A privacy-safe identity artifact or lease contract failure."""


class IdentityPoolExhausted(IdentityArtifactError):
    """Raised instead of silently sharing a session between active VUs."""


@dataclass(frozen=True, repr=False)
class IdentitySelectors:
    behavior_id: str | None
    local_date: str | None
    owner_marker: str
    forbidden_marker: str
    profile_timezone: str | None = None
    horizon_start_local_date: str | None = None
    horizon_end_local_date: str | None = None
    category_id: str | None = None
    mutation_occurrence_id: str | None = None
    mutation_occurrence_status: str | None = None
    mutation_occurrence_local_date: str | None = None
    review_behavior_id: str | None = None
    review_local_date: str | None = None
    review_occurrence_id: str | None = None
    review_occurrence_status: str | None = None
    maintainer_behavior_id: str | None = None
    maintainer_behavior_title: str | None = None
    maintainer_schedule_id: str | None = None
    maintainer_slot_id: str | None = None
    maintainer_start_time: str | None = None
    schedule_only_behavior_id: str | None = None
    schedule_only_behavior_title: str | None = None
    schedule_only_schedule_id: str | None = None
    schedule_only_slot_id: str | None = None
    schedule_only_start_time: str | None = None
    archived_behavior_id: str | None = None
    archived_behavior_title: str | None = None
    stale_horizon_behavior_id: str | None = None
    fresh_horizon_behavior_id: str | None = None
    past_preservation_occurrence_id: str | None = None
    resolved_preservation_occurrence_id: str | None = None
    due_reminder_occurrence_id: str | None = None
    due_reminder_delivery_id: str | None = None
    due_past_clear_behavior_id: str | None = None
    due_past_clear_local_date: str | None = None
    due_past_clear_occurrence_id: str | None = None
    due_past_clear_delivery_id: str | None = None
    future_reminder_occurrence_id: str | None = None
    future_reminder_delivery_id: str | None = None
    contention_behavior_id: str | None = None
    contention_local_date: str | None = None
    contention_occurrence_id: str | None = None
    contention_occurrence_status: str | None = None
    contention_pair_id: str | None = None


@dataclass(frozen=True, repr=False)
class LoadIdentity:
    cookies: Mapping[str, str]
    cohort: str
    selectors: IdentitySelectors

    @property
    def requires_owner_marker(self) -> bool:
        return self.cohort != "empty"


@dataclass(frozen=True, repr=False)
class ContentionSelectors:
    behavior_id: str
    local_date: str
    occurrence_id: str
    expected_status: str
    owner_marker: str
    forbidden_marker: str


@dataclass(frozen=True, repr=False)
class ContentionSession:
    pair_id: str
    cohort: str
    primary_cookies: Mapping[str, str]
    secondary_cookies: Mapping[str, str]
    selectors: ContentionSelectors


@dataclass(frozen=True)
class IdentityArtifact:
    base_url: str
    workload_classification: str
    identities: tuple[LoadIdentity, ...]
    contention_sessions: tuple[ContentionSession, ...] = ()


@dataclass(frozen=True, repr=False)
class IdentityLease:
    identity: LoadIdentity
    _pool_token: object
    _slot: int


@dataclass(frozen=True, repr=False)
class IdentityRuntime:
    artifact: IdentityArtifact
    pool: "IdentityPool"


@dataclass(frozen=True, repr=False)
class ContentionLease:
    session: ContentionSession
    _pool_token: object
    _slot: int


@dataclass(frozen=True, repr=False)
class ContentionRuntime:
    artifact: IdentityArtifact
    pool: "ContentionSessionPool"


class IdentityPool:
    """Preserves provisioned order and gives each active VU one exclusive slot."""

    def __init__(
        self,
        identities: Sequence[LoadIdentity],
        *,
        cohort_filter: str | None = None,
        identity_offset: int | None = None,
    ) -> None:
        if cohort_filter not in {None, HEAVY_COHORT}:
            raise IdentityArtifactError(
                "The requested load identity cohort filter is unsupported."
            )

        if cohort_filter is None:
            eligible = tuple(
                identity
                for identity in identities
                if identity.cohort != HEAVY_COHORT
            )
        else:
            eligible = tuple(
                identity
                for identity in identities
                if identity.cohort == cohort_filter
            )

        if not eligible:
            raise IdentityArtifactError(
                "The session artifact has no identities for the selected profile."
            )

        if identity_offset is None:
            raw_identity_offset = os.environ.get(
                "CADENCE_LOAD_IDENTITY_OFFSET",
                "0",
            ).strip()
            try:
                identity_offset = int(raw_identity_offset)
            except ValueError as error:
                raise IdentityArtifactError(
                    "The load identity offset is invalid."
                ) from error
        if (
            isinstance(identity_offset, bool)
            or not isinstance(identity_offset, int)
            or identity_offset < 0
            or identity_offset >= len(eligible)
        ):
            raise IdentityArtifactError(
                "The load identity offset is invalid."
            )

        eligible = eligible[identity_offset:] + eligible[:identity_offset]
        self._identities = eligible
        self._available: deque[int] = deque(range(len(eligible)))
        self._active: dict[int, IdentityLease] = {}
        self._lock = threading.Lock()
        self._token = object()

    @property
    def capacity(self) -> int:
        return len(self._identities)

    @property
    def leased_count(self) -> int:
        with self._lock:
            return len(self._active)

    def acquire(self) -> IdentityLease:
        with self._lock:
            if not self._available:
                raise IdentityPoolExhausted(
                    "No unique authenticated load identity remains; "
                    "the run has been stopped."
                )

            slot = self._available.popleft()
            lease = IdentityLease(
                identity=self._identities[slot],
                _pool_token=self._token,
                _slot=slot,
            )
            self._active[slot] = lease
            return lease

    def release(self, lease: IdentityLease) -> None:
        with self._lock:
            if (
                lease._pool_token is not self._token
                or self._active.get(lease._slot) is not lease
            ):
                raise IdentityArtifactError(
                    "The authenticated load identity lease is not active."
                )

            del self._active[lease._slot]
            self._available.append(lease._slot)


class ContentionSessionPool:
    """Leases one exact pair of independent sessions to a contention user."""

    def __init__(self, sessions: Sequence[ContentionSession]) -> None:
        if not sessions:
            raise IdentityArtifactError(
                "The mutation artifact has no contention session pairs."
            )
        self._sessions = tuple(sessions)
        self._available: deque[int] = deque(range(len(sessions)))
        self._active: dict[int, ContentionLease] = {}
        self._lock = threading.Lock()
        self._token = object()

    @property
    def capacity(self) -> int:
        return len(self._sessions)

    @property
    def leased_count(self) -> int:
        with self._lock:
            return len(self._active)

    def acquire(self) -> ContentionLease:
        with self._lock:
            if not self._available:
                raise IdentityPoolExhausted(
                    "No unique contention session pair remains; "
                    "the run has been stopped."
                )
            slot = self._available.popleft()
            lease = ContentionLease(
                session=self._sessions[slot],
                _pool_token=self._token,
                _slot=slot,
            )
            self._active[slot] = lease
            return lease

    def release(self, lease: ContentionLease) -> None:
        with self._lock:
            if (
                lease._pool_token is not self._token
                or self._active.get(lease._slot) is not lease
            ):
                raise IdentityArtifactError(
                    "The contention session pair lease is not active."
                )
            del self._active[lease._slot]
            self._available.append(lease._slot)


_runtime_lock = threading.Lock()
_shared_runtime: IdentityRuntime | None = None
_shared_runtime_filter: str | None = None
_contention_runtime_lock = threading.Lock()
_shared_contention_runtime: ContentionRuntime | None = None


def assert_safe_worker_environment() -> None:
    if any(
        os.environ.get(name, "").strip()
        for name in FORBIDDEN_WORKER_ENVIRONMENT
    ):
        raise IdentityArtifactError(
            "Administrative, provider, or process credentials must not be "
            "available to Locust workers."
        )


def load_identity_artifact(
    path: str | os.PathLike[str] | None = None,
) -> IdentityArtifact:
    raw_path = (
        os.fspath(path)
        if path is not None
        else os.environ.get("CADENCE_LOAD_SESSION_FILE", "").strip()
    )
    if not raw_path:
        raise IdentityArtifactError("CADENCE_LOAD_SESSION_FILE is required.")

    artifact_path = Path(raw_path).resolve()
    try:
        file_stat = artifact_path.stat()
    except OSError as error:
        raise IdentityArtifactError(
            "The run-specific identity artifact is unavailable."
        ) from error

    if not stat.S_ISREG(file_stat.st_mode):
        raise IdentityArtifactError(
            "The run-specific identity artifact must be a regular file."
        )
    if hasattr(os, "geteuid") and file_stat.st_uid != os.geteuid():
        raise IdentityArtifactError(
            "The run-specific identity artifact must belong to the worker owner."
        )
    if stat.S_IMODE(file_stat.st_mode) & 0o077:
        raise IdentityArtifactError(
            "The run-specific identity artifact must be owner-only."
        )
    if file_stat.st_size <= 0 or file_stat.st_size > MAX_ARTIFACT_BYTES:
        raise IdentityArtifactError(
            "The run-specific identity artifact has an invalid size."
        )

    try:
        payload = json.loads(artifact_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError) as error:
        raise IdentityArtifactError(
            "The run-specific identity artifact is invalid."
        ) from error

    if not isinstance(payload, dict):
        raise IdentityArtifactError(
            "The run-specific identity artifact is invalid."
        )
    if payload.get("target_classification") != "local":
        raise IdentityArtifactError(
            "The read workload accepts local targets only."
        )

    base_url = _normalize_local_base_url(payload.get("base_url"))
    raw_identities = payload.get("identities")
    if (
        not isinstance(raw_identities, list)
        or not raw_identities
        or len(raw_identities) > MAX_ARTIFACT_IDENTITIES
    ):
        raise IdentityArtifactError(
            "The identity artifact contains an invalid identity count."
        )

    workload_classification = payload.get("workload_classification", "read")
    if workload_classification not in {"read", "mutation"}:
        raise IdentityArtifactError(
            "The identity artifact has an invalid workload classification."
        )
    require_mutation = workload_classification == "mutation"
    identities = tuple(
        _parse_identity(value, require_mutation=require_mutation)
        for value in raw_identities
    )
    cookie_signatures = {
        tuple(sorted(identity.cookies.items())) for identity in identities
    }
    if len(cookie_signatures) != len(identities):
        raise IdentityArtifactError(
            "The identity artifact contains duplicate authenticated sessions."
        )
    owner_markers = {
        identity.selectors.owner_marker for identity in identities
    }
    if len(owner_markers) != len(identities):
        raise IdentityArtifactError(
            "The identity artifact contains duplicate ownership markers."
        )

    contention_sessions = _parse_contention_sessions(
        payload.get("contention_sessions"),
        identities=identities,
        require_mutation=require_mutation,
    )

    return IdentityArtifact(
        base_url=base_url,
        workload_classification=workload_classification,
        identities=identities,
        contention_sessions=contention_sessions,
    )


def get_shared_identity_runtime(
    *,
    cohort_filter: str | None = None,
) -> IdentityRuntime:
    global _shared_runtime
    global _shared_runtime_filter

    assert_safe_worker_environment()
    with _runtime_lock:
        if _shared_runtime is None:
            artifact = load_identity_artifact()
            _shared_runtime = IdentityRuntime(
                artifact=artifact,
                pool=IdentityPool(
                    artifact.identities,
                    cohort_filter=cohort_filter,
                ),
            )
            _shared_runtime_filter = cohort_filter
        elif _shared_runtime_filter != cohort_filter:
            raise IdentityArtifactError(
                "One Locust worker cannot mix incompatible identity pools."
            )

        return _shared_runtime


def get_shared_contention_runtime() -> ContentionRuntime:
    global _shared_contention_runtime

    assert_safe_worker_environment()
    with _contention_runtime_lock:
        if _shared_contention_runtime is None:
            artifact = load_identity_artifact()
            _shared_contention_runtime = ContentionRuntime(
                artifact=artifact,
                pool=ContentionSessionPool(artifact.contention_sessions),
            )
        return _shared_contention_runtime


def assert_locust_host(configured_host: str | None, expected_base_url: str) -> None:
    if not configured_host:
        raise IdentityArtifactError(
            "Locust must receive the session artifact's local base URL as its host."
        )
    if _normalize_local_base_url(configured_host) != expected_base_url:
        raise IdentityArtifactError(
            "Locust host does not match the local identity artifact."
        )


def _parse_identity(
    value: object,
    *,
    require_mutation: bool,
) -> LoadIdentity:
    if not isinstance(value, dict):
        raise IdentityArtifactError(
            "The identity artifact contains invalid identity metadata."
        )

    raw_cookies = value.get("cookies")
    cohort = value.get("cohort")
    raw_selectors = value.get("selectors")
    if (
        not isinstance(raw_cookies, dict)
        or not raw_cookies
        or len(raw_cookies) > 16
        or not isinstance(cohort, str)
        or cohort not in ALLOWED_COHORTS
        or not isinstance(raw_selectors, dict)
    ):
        raise IdentityArtifactError(
            "The identity artifact contains invalid identity metadata."
        )

    cookies = _parse_cookie_jar(raw_cookies)

    owner_marker = raw_selectors.get("owner_marker")
    forbidden_marker = raw_selectors.get("forbidden_marker")
    behavior_id = raw_selectors.get("behavior_id")
    local_date = raw_selectors.get("local_date")
    if (
        not _is_private_marker(owner_marker)
        or not _is_private_marker(forbidden_marker)
        or owner_marker == forbidden_marker
    ):
        raise IdentityArtifactError(
            "The identity artifact is missing required ownership markers."
        )

    has_behavior_id = isinstance(behavior_id, str) and bool(behavior_id)
    has_local_date = isinstance(local_date, str) and bool(local_date)
    if has_behavior_id != has_local_date:
        raise IdentityArtifactError(
            "The identity artifact is missing required selector metadata."
        )
    if cohort == "empty" and (has_behavior_id or has_local_date):
        raise IdentityArtifactError(
            "The empty cohort cannot contain behavior review selectors."
        )
    if cohort != "empty" and not (has_behavior_id and has_local_date):
        raise IdentityArtifactError(
            "The identity artifact is missing required selector metadata."
        )

    normalized_behavior_id: str | None = None
    normalized_local_date: str | None = None
    if has_behavior_id and has_local_date:
        if not UUID_PATTERN.fullmatch(behavior_id):
            raise IdentityArtifactError(
                "The identity artifact contains an invalid behavior selector."
            )
        try:
            parsed_date = date.fromisoformat(local_date)
        except ValueError as error:
            raise IdentityArtifactError(
                "The identity artifact contains an invalid date selector."
            ) from error
        if parsed_date.isoformat() != local_date:
            raise IdentityArtifactError(
                "The identity artifact contains an invalid date selector."
            )
        normalized_behavior_id = behavior_id
        normalized_local_date = local_date

    mutation = _parse_mutation_selectors(
        raw_selectors,
        owner_marker=owner_marker,
        required=require_mutation,
    )

    return LoadIdentity(
        cookies=MappingProxyType(cookies),
        cohort=cohort,
        selectors=IdentitySelectors(
            behavior_id=normalized_behavior_id,
            local_date=normalized_local_date,
            owner_marker=owner_marker,
            forbidden_marker=forbidden_marker,
            **mutation,
        ),
    )


def _parse_cookie_jar(value: object) -> dict[str, str]:
    if not isinstance(value, dict) or not value or len(value) > 16:
        raise IdentityArtifactError(
            "The identity artifact contains invalid cookie metadata."
        )
    cookies: dict[str, str] = {}
    for name, cookie_value in value.items():
        if (
            not isinstance(name, str)
            or not name
            or len(name) > 256
            or not isinstance(cookie_value, str)
            or not cookie_value
            or len(cookie_value) > 16_384
            or "\r" in name
            or "\n" in name
            or "\r" in cookie_value
            or "\n" in cookie_value
        ):
            raise IdentityArtifactError(
                "The identity artifact contains invalid cookie metadata."
            )
        cookies[name] = cookie_value
    return cookies


def _parse_mutation_selectors(
    value: Mapping[str, object],
    *,
    owner_marker: str,
    required: bool,
) -> dict[str, str | None]:
    uuid_names = (
        "category_id",
        "mutation_occurrence_id",
        "review_behavior_id",
        "review_occurrence_id",
        "maintainer_behavior_id",
        "maintainer_schedule_id",
        "maintainer_slot_id",
        "schedule_only_behavior_id",
        "schedule_only_schedule_id",
        "schedule_only_slot_id",
        "archived_behavior_id",
        "stale_horizon_behavior_id",
        "fresh_horizon_behavior_id",
        "past_preservation_occurrence_id",
        "resolved_preservation_occurrence_id",
        "due_reminder_occurrence_id",
        "due_reminder_delivery_id",
        "due_past_clear_behavior_id",
        "due_past_clear_occurrence_id",
        "due_past_clear_delivery_id",
        "future_reminder_occurrence_id",
        "future_reminder_delivery_id",
        "contention_behavior_id",
        "contention_occurrence_id",
    )
    date_names = (
        "horizon_start_local_date",
        "horizon_end_local_date",
        "mutation_occurrence_local_date",
        "review_local_date",
        "due_past_clear_local_date",
        "contention_local_date",
    )
    status_names = (
        "mutation_occurrence_status",
        "review_occurrence_status",
        "contention_occurrence_status",
    )
    title_names = (
        "maintainer_behavior_title",
        "schedule_only_behavior_title",
        "archived_behavior_title",
    )
    time_names = (
        "maintainer_start_time",
        "schedule_only_start_time",
    )
    all_names = (
        "profile_timezone",
        *uuid_names,
        *date_names,
        *status_names,
        *title_names,
        *time_names,
        "contention_pair_id",
    )
    parsed: dict[str, str | None] = {}
    for name in all_names:
        raw = value.get(name)
        if raw is None and not required:
            parsed[name] = None
            continue
        if not isinstance(raw, str) or not raw:
            raise IdentityArtifactError(
                "The mutation identity is missing required selector metadata."
            )
        parsed[name] = raw

    if not required:
        present = [item for item in parsed.values() if item is not None]
        if not present:
            return parsed

    for name in uuid_names:
        raw = parsed[name]
        if raw is not None and not UUID_PATTERN.fullmatch(raw):
            raise IdentityArtifactError(
                "The mutation identity contains an invalid UUID selector."
            )
    for name in date_names:
        raw = parsed[name]
        if raw is not None:
            try:
                parsed_date = date.fromisoformat(raw)
            except ValueError as error:
                raise IdentityArtifactError(
                    "The mutation identity contains an invalid date selector."
                ) from error
            if parsed_date.isoformat() != raw:
                raise IdentityArtifactError(
                    "The mutation identity contains an invalid date selector."
                )
    for name in status_names:
        raw = parsed[name]
        if raw is not None and raw not in {
            "unresolved",
            "completed",
            "not_completed",
        }:
            raise IdentityArtifactError(
                "The mutation identity contains an invalid status selector."
            )
    for name in title_names:
        raw = parsed[name]
        if (
            raw is not None
            and (
                owner_marker not in raw
                or len(raw) > 160
                or "\r" in raw
                or "\n" in raw
            )
        ):
            raise IdentityArtifactError(
                "The mutation identity contains an invalid behavior title."
            )
    for name in time_names:
        raw = parsed[name]
        if raw is not None and not CLOCK_TIME_PATTERN.fullmatch(raw):
            raise IdentityArtifactError(
                "The mutation identity contains an invalid schedule time."
            )

    timezone = parsed["profile_timezone"]
    if (
        timezone is not None
        and (
            len(timezone) > 128
            or not TIMEZONE_PATTERN.fullmatch(timezone)
        )
    ):
        raise IdentityArtifactError(
            "The mutation identity contains an invalid timezone selector."
        )
    pair_id = parsed["contention_pair_id"]
    if (
        pair_id is not None
        and not CONTENTION_PAIR_PATTERN.fullmatch(pair_id)
    ):
        raise IdentityArtifactError(
            "The mutation identity contains an invalid contention pair selector."
        )
    start_date = parsed["horizon_start_local_date"]
    end_date = parsed["horizon_end_local_date"]
    if (
        start_date is not None
        and end_date is not None
        and start_date > end_date
    ):
        raise IdentityArtifactError(
            "The mutation identity contains an invalid horizon range."
        )
    behavior_ids = (
        parsed["maintainer_behavior_id"],
        parsed["schedule_only_behavior_id"],
        parsed["archived_behavior_id"],
    )
    if required and len(set(behavior_ids)) != len(behavior_ids):
        raise IdentityArtifactError(
            "The mutation identity must use distinct fixed Behavior slots."
        )
    return parsed


def _parse_contention_sessions(
    value: object,
    *,
    identities: Sequence[LoadIdentity],
    require_mutation: bool,
) -> tuple[ContentionSession, ...]:
    if not require_mutation:
        if value is not None and value != () and value != []:
            raise IdentityArtifactError(
                "Read identity artifacts cannot contain contention sessions."
            )
        return ()
    if (
        not isinstance(value, list)
        or not value
        or len(value) > MAX_CONTENTION_SESSIONS
    ):
        raise IdentityArtifactError(
            "The mutation artifact contains an invalid contention pair count."
        )

    identity_by_marker = {
        identity.selectors.owner_marker: identity
        for identity in identities
    }
    ordinary_signatures = {
        tuple(sorted(identity.cookies.items()))
        for identity in identities
    }
    pair_ids: set[str] = set()
    secondary_signatures: set[tuple[tuple[str, str], ...]] = set()
    sessions: list[ContentionSession] = []
    for raw in value:
        if not isinstance(raw, dict):
            raise IdentityArtifactError(
                "The mutation artifact contains invalid contention metadata."
            )
        pair_id = raw.get("pair_id")
        cohort = raw.get("cohort")
        selectors = raw.get("selectors")
        if (
            not isinstance(pair_id, str)
            or not CONTENTION_PAIR_PATTERN.fullmatch(pair_id)
            or pair_id in pair_ids
            or not isinstance(cohort, str)
            or cohort not in ALLOWED_COHORTS
            or cohort == "empty"
            or not isinstance(selectors, dict)
        ):
            raise IdentityArtifactError(
                "The mutation artifact contains invalid contention metadata."
            )
        primary = MappingProxyType(
            _parse_cookie_jar(raw.get("primary_cookies"))
        )
        secondary = MappingProxyType(
            _parse_cookie_jar(raw.get("secondary_cookies"))
        )
        primary_signature = tuple(sorted(primary.items()))
        secondary_signature = tuple(sorted(secondary.items()))
        if (
            primary_signature == secondary_signature
            or secondary_signature in ordinary_signatures
            or secondary_signature in secondary_signatures
        ):
            raise IdentityArtifactError(
                "Contention session pairs must use independent cookie jars."
            )

        behavior_id = selectors.get("behavior_id")
        local_date = selectors.get("local_date")
        occurrence_id = selectors.get("occurrence_id")
        expected_status = selectors.get("expected_status")
        owner_marker = selectors.get("owner_marker")
        forbidden_marker = selectors.get("forbidden_marker")
        identity = (
            identity_by_marker.get(owner_marker)
            if isinstance(owner_marker, str)
            else None
        )
        if (
            not isinstance(behavior_id, str)
            or not UUID_PATTERN.fullmatch(behavior_id)
            or not isinstance(local_date, str)
            or not _is_iso_local_date(local_date)
            or not isinstance(occurrence_id, str)
            or not UUID_PATTERN.fullmatch(occurrence_id)
            or expected_status not in {
                "unresolved",
                "completed",
                "not_completed",
            }
            or not _is_private_marker(owner_marker)
            or not _is_private_marker(forbidden_marker)
            or owner_marker == forbidden_marker
            or identity is None
            or identity.cohort != cohort
            or tuple(sorted(identity.cookies.items())) != primary_signature
            or identity.selectors.contention_pair_id != pair_id
            or identity.selectors.contention_behavior_id != behavior_id
            or identity.selectors.contention_local_date != local_date
            or identity.selectors.contention_occurrence_id != occurrence_id
            or identity.selectors.contention_occurrence_status
            != expected_status
            or identity.selectors.forbidden_marker != forbidden_marker
        ):
            raise IdentityArtifactError(
                "A contention pair did not match its owned identity selectors."
            )

        pair_ids.add(pair_id)
        secondary_signatures.add(secondary_signature)
        sessions.append(
            ContentionSession(
                pair_id=pair_id,
                cohort=cohort,
                primary_cookies=primary,
                secondary_cookies=secondary,
                selectors=ContentionSelectors(
                    behavior_id=behavior_id,
                    local_date=local_date,
                    occurrence_id=occurrence_id,
                    expected_status=expected_status,
                    owner_marker=owner_marker,
                    forbidden_marker=forbidden_marker,
                ),
            )
        )
    return tuple(sessions)


def _normalize_local_base_url(value: object) -> str:
    if not isinstance(value, str) or not value:
        raise IdentityArtifactError(
            "The read workload base URL must be local HTTP."
        )
    try:
        parsed = urlparse(value)
        port = parsed.port
    except ValueError as error:
        raise IdentityArtifactError(
            "The read workload base URL must be local HTTP."
        ) from error

    if (
        parsed.scheme != "http"
        or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise IdentityArtifactError(
            "The read workload base URL must be local HTTP."
        )

    host = parsed.hostname
    if host == "::1":
        host = "[::1]"
    authority = host if port is None else f"{host}:{port}"
    return f"http://{authority}"


def _is_private_marker(value: object) -> bool:
    return isinstance(value, str) and bool(OWNER_MARKER_PATTERN.fullmatch(value))


def _is_iso_local_date(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        return date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False
