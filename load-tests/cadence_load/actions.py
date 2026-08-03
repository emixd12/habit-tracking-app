"""Safe, dynamic protocol helpers for Cadence mutation load users.

The module deliberately learns Next.js Server Action identifiers from the
authenticated document returned to the current user. Runtime identifiers are
kept only in private, non-repr objects and are never used as Locust request
names.
"""

from __future__ import annotations

import html as html_module
import json
import re
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Callable, Mapping, Sequence, TypeVar
from urllib.parse import urljoin, urlparse

from locust import HttpUser, between
from locust.exception import RescheduleTask, StopUser

from cadence_load.assertions import (
    CriticalSemanticAssertionError,
    ResponseLike,
    SemanticAssertionError,
)
from cadence_load.auth import (
    IdentityArtifactError,
    IdentityLease,
    LoadIdentity,
    assert_locust_host,
    get_shared_identity_runtime,
)
from cadence_load.data import (
    ReadRequest,
    assert_export_response,
    assert_protected_read_response,
)
from cadence_load.semantic_evidence import (
    MutationReceipt,
    SemanticEvidenceError,
    record_semantic_verification,
    record_successful_submission,
)


STATUS_VALUES = frozenset({"unresolved", "completed", "not_completed"})
ACTION_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{16,128}$")
UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-"
    r"[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
LOCAL_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_SYNTHETIC_NOTE_LENGTH = 96
MAX_BEHAVIOR_TITLE_LENGTH = 160
MAX_BEHAVIOR_DESCRIPTION_LENGTH = 1_000
MAX_BEHAVIOR_SCHEDULES = 6
MAX_TIME_ENTRIES_PER_SCHEDULE = 8
ALLOWED_REMINDER_OFFSETS = frozenset({"0", "15", "60", "1440", "4320"})
TIMEZONE_REQUEST_NAME = (
    "INT-SETTINGS-003 POST /settings server-action"
)
ALLOWED_WEEKDAYS = frozenset(
    {
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
    }
)
MUTATION_PROFILE_PATH = (
    Path(__file__).resolve().parents[1]
    / "scenarios"
    / "mutation-profiles.json"
)
EXPECTED_MUTATION_TASK_KEYS = frozenset(
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
EXPECTED_READ_TASK_KEYS = frozenset(
    {
        "timeline_read",
        "timeline_future_read",
        "behaviors_read",
        "behaviors_selected_read",
        "export_jsonl",
        "export_json",
        "export_behaviorlog",
    }
)


class ActionProtocolError(CriticalSemanticAssertionError):
    """A privacy-safe protocol mismatch that must stop the load stage."""


@dataclass(frozen=True, repr=False)
class RenderedActionForm:
    """A rendered or RSC-derived action payload kept out of diagnostics."""

    action: str
    fields: tuple[tuple[str, str], ...]


@dataclass(frozen=True, repr=False)
class RenderedServerActionReference:
    """A server-reference identifier discovered from the current response."""

    action_id: str


@dataclass(frozen=True)
class MutationProfileContract:
    task_weights: Mapping[str, int]
    think_time_seconds: tuple[float, float]


@dataclass(frozen=True)
class OccurrenceActionSurface:
    current_status: str
    status_forms: Mapping[str, RenderedActionForm]
    note_form: RenderedActionForm


@dataclass(frozen=True, repr=False)
class TimezoneActionSurface:
    form: RenderedActionForm
    timezone: str


@dataclass(frozen=True)
class BehaviorSnapshot:
    id: str
    title: str
    description: str
    category_id: str
    schedules: tuple[Mapping[str, object], ...]
    browser_reminder_enabled: bool
    email_reminder_enabled: bool
    reminder_offset_minutes: int
    active: bool


@dataclass
class _ParsedForm:
    action: str
    method: str
    fields: list[tuple[str, str]]
    submit_fields: list[tuple[str, str]]


class _DocumentParser(HTMLParser):
    """Parse successful form controls and Next flight script bodies."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.forms: list[_ParsedForm] = []
        self.scripts: list[str] = []
        self._current_form: _ParsedForm | None = None
        self._textarea_name: str | None = None
        self._textarea_parts: list[str] = []
        self._select_name: str | None = None
        self._select_options: list[tuple[str, bool]] = []
        self._option_value: str | None = None
        self._option_selected = False
        self._option_parts: list[str] = []
        self._in_script = False
        self._script_parts: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        attributes = dict(attrs)

        if tag == "script":
            self._in_script = True
            self._script_parts = []
            return

        if tag == "form":
            self._current_form = _ParsedForm(
                action=attributes.get("action") or "",
                method=(attributes.get("method") or "get").upper(),
                fields=[],
                submit_fields=[],
            )
            return

        form = self._current_form
        if form is None or "disabled" in attributes:
            return

        if tag == "input":
            name = attributes.get("name")
            input_type = (attributes.get("type") or "text").lower()
            if not name or input_type in {"button", "image", "reset", "submit"}:
                return
            if input_type in {"checkbox", "radio"} and "checked" not in attributes:
                return
            value = attributes.get("value")
            form.fields.append(
                (
                    name,
                    (value or "on")
                    if input_type in {"checkbox", "radio"}
                    else (value or ""),
                )
            )
            return

        if tag == "textarea":
            name = attributes.get("name")
            if name:
                self._textarea_name = name
                self._textarea_parts = []
            return

        if tag == "select":
            name = attributes.get("name")
            if name:
                self._select_name = name
                self._select_options = []
            return

        if tag == "option" and self._select_name is not None:
            self._option_value = attributes.get("value")
            self._option_selected = "selected" in attributes
            self._option_parts = []
            return

        if tag == "button":
            name = attributes.get("name")
            button_type = (attributes.get("type") or "submit").lower()
            if name and button_type == "submit":
                form.submit_fields.append(
                    (name, attributes.get("value") or "")
                )

    def handle_data(self, data: str) -> None:
        if self._in_script:
            self._script_parts.append(data)
        if self._textarea_name is not None:
            self._textarea_parts.append(data)
        if self._option_value is not None:
            self._option_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._in_script:
            self.scripts.append("".join(self._script_parts))
            self._in_script = False
            self._script_parts = []
            return

        if tag == "textarea" and self._textarea_name is not None:
            if self._current_form is not None:
                self._current_form.fields.append(
                    (
                        self._textarea_name,
                        "".join(self._textarea_parts),
                    )
                )
            self._textarea_name = None
            self._textarea_parts = []
            return

        if tag == "option" and self._select_name is not None:
            value = (
                self._option_value
                if self._option_value is not None
                else "".join(self._option_parts)
            )
            self._select_options.append((value, self._option_selected))
            self._option_value = None
            self._option_selected = False
            self._option_parts = []
            return

        if tag == "select" and self._select_name is not None:
            selected = next(
                (
                    value
                    for value, is_selected in self._select_options
                    if is_selected
                ),
                self._select_options[0][0]
                if self._select_options
                else "",
            )
            if self._current_form is not None:
                self._current_form.fields.append(
                    (self._select_name, selected)
                )
            self._select_name = None
            self._select_options = []
            return

        if tag == "form" and self._current_form is not None:
            self.forms.append(self._current_form)
            self._current_form = None


def load_mutation_profile_contract(
    path: str | Path | None = None,
) -> MutationProfileContract:
    profile_path = Path(path) if path is not None else MUTATION_PROFILE_PATH
    try:
        payload = json.loads(profile_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError) as error:
        raise ActionProtocolError(
            "The mutation profile contract is unavailable or invalid."
        ) from error

    if not isinstance(payload, dict) or payload.get("schema_version") != "1.0.0":
        raise ActionProtocolError(
            "The mutation profile contract has an unsupported schema."
        )
    raw_weights = payload.get("task_weights")
    raw_think_time = payload.get("think_time_seconds")
    raw_read_keys = payload.get("read_task_keys")
    if (
        not isinstance(raw_weights, dict)
        or set(raw_weights) != EXPECTED_MUTATION_TASK_KEYS
        or not isinstance(raw_think_time, dict)
        or not isinstance(raw_read_keys, list)
        or set(raw_read_keys) != EXPECTED_READ_TASK_KEYS
    ):
        raise ActionProtocolError(
            "The mutation profile contract has invalid task metadata."
        )

    weights: dict[str, int] = {}
    for name, value in raw_weights.items():
        if (
            not isinstance(name, str)
            or not isinstance(value, int)
            or isinstance(value, bool)
            or value <= 0
        ):
            raise ActionProtocolError(
                "The mutation profile contract has an invalid task weight."
            )
        weights[name] = value
    if sum(weights.values()) != 100:
        raise ActionProtocolError(
            "The mutation task weights must total 100."
        )
    if sum(weights[name] for name in raw_read_keys) != 65:
        raise ActionProtocolError(
            "The mutation workload must keep declared reads dominant."
        )

    minimum = raw_think_time.get("minimum")
    maximum = raw_think_time.get("maximum")
    if (
        not isinstance(minimum, (int, float))
        or isinstance(minimum, bool)
        or not isinstance(maximum, (int, float))
        or isinstance(maximum, bool)
        or minimum <= 0
        or maximum < minimum
        or maximum > 30
    ):
        raise ActionProtocolError(
            "The mutation profile contract has invalid think-time bounds."
        )

    return MutationProfileContract(
        task_weights=weights,
        think_time_seconds=(float(minimum), float(maximum)),
    )


MUTATION_PROFILE = load_mutation_profile_contract()
MUTATION_TASK_WEIGHTS = MUTATION_PROFILE.task_weights


def discover_action_form(
    html: str,
    *,
    document_url: str,
    required_fields: Mapping[str, str | None],
    required_submit: tuple[str, str] | None = None,
    absent_fields: Sequence[str] = (),
) -> RenderedActionForm:
    """Find one exact POST form by stable product field names and values."""

    if any(name.startswith("$ACTION_") for name in required_fields):
        raise ActionProtocolError(
            "Generated action metadata cannot be used as a stable selector."
        )

    parser = _parse_document(html)
    matches: list[_ParsedForm] = []
    for form in parser.forms:
        fields_by_name = _fields_by_name(form.fields)
        if any(name in fields_by_name for name in absent_fields):
            continue
        if not all(
            name in fields_by_name
            and (
                expected is None
                or expected in fields_by_name[name]
            )
            for name, expected in required_fields.items()
        ):
            continue
        if required_submit is not None and required_submit not in form.submit_fields:
            continue
        matches.append(form)

    if len(matches) != 1:
        raise ActionProtocolError(
            "The rendered document did not expose one unambiguous matching "
            "Server Action form."
        )

    matched = matches[0]
    if matched.method != "POST":
        raise ActionProtocolError(
            "The rendered Server Action form did not use POST."
        )
    if not any(name.startswith("$ACTION_") for name, _ in matched.fields):
        raise ActionProtocolError(
            "The rendered form lacked generated Server Action metadata."
        )

    action = urljoin(document_url, matched.action or document_url)
    _assert_same_origin_action(document_url, action)
    fields = list(matched.fields)
    if required_submit is not None:
        fields.append(required_submit)
    return RenderedActionForm(action=action, fields=tuple(fields))


def replace_action_fields(
    form: RenderedActionForm,
    updates: Mapping[str, str],
) -> RenderedActionForm:
    """Replace stable fields without inspecting or changing action metadata."""

    if not updates or any(name.startswith("$ACTION_") for name in updates):
        raise ActionProtocolError(
            "Only stable rendered product fields may be replaced."
        )

    remaining = set(updates)
    fields: list[tuple[str, str]] = []
    for name, value in form.fields:
        if name in updates:
            fields.append((name, updates[name]))
            remaining.discard(name)
        else:
            fields.append((name, value))
    if remaining:
        raise ActionProtocolError(
            "A required stable field was absent from the rendered form."
        )
    return RenderedActionForm(action=form.action, fields=tuple(fields))


def discover_timezone_action_surface(
    html: str,
    *,
    document_url: str,
) -> TimezoneActionSurface:
    """Find the Settings timezone action and its one rendered current value."""

    form = discover_action_form(
        html,
        document_url=document_url,
        required_fields={"timezone": None},
    )
    timezone_values = [
        value
        for name, value in form.fields
        if name == "timezone"
    ]
    if len(timezone_values) != 1 or not timezone_values[0]:
        raise ActionProtocolError(
            "The Settings form lacked one selected timezone."
        )
    return TimezoneActionSurface(
        form=replace_action_fields(
            form,
            {"timezone": timezone_values[0]},
        ),
        timezone=timezone_values[0],
    )


def discover_occurrence_action_surface(
    html: str,
    *,
    document_url: str,
    occurrence_id: str,
) -> OccurrenceActionSurface:
    if not UUID_PATTERN.fullmatch(occurrence_id):
        raise ActionProtocolError(
            "The occurrence selector is invalid."
        )

    parser = _parse_document(html)
    statuses: dict[str, RenderedActionForm] = {}
    expected_statuses: set[str] = set()
    note_forms: list[RenderedActionForm] = []
    for parsed in parser.forms:
        fields = _fields_by_name(parsed.fields)
        if occurrence_id not in fields.get("occurrence_id", ()):
            continue
        if not any(name.startswith("$ACTION_") for name, _ in parsed.fields):
            raise ActionProtocolError(
                "An owned occurrence form lacked generated action metadata."
            )
        action = urljoin(document_url, parsed.action or document_url)
        _assert_same_origin_action(document_url, action)
        if "note" in fields:
            note_forms.append(
                RenderedActionForm(action=action, fields=tuple(parsed.fields))
            )
        if "status" not in fields or "expected_status" not in fields:
            continue
        status = fields["status"][0]
        expected_status = fields["expected_status"][0]
        if status not in STATUS_VALUES or expected_status not in STATUS_VALUES:
            raise ActionProtocolError(
                "The occurrence form exposed an invalid status vocabulary."
            )
        expected_statuses.add(expected_status)
        statuses[status] = RenderedActionForm(
            action=action,
            fields=tuple(parsed.fields),
        )

    if len(note_forms) != 1 or not statuses or len(expected_statuses) != 1:
        raise ActionProtocolError(
            "The owned occurrence action surface was incomplete or ambiguous."
        )
    current_status = next(iter(expected_statuses))
    required_targets = {"completed", "not_completed"}
    if current_status != "unresolved":
        required_targets.add("unresolved")
    if not required_targets.issubset(statuses):
        raise ActionProtocolError(
            "The occurrence action surface lacked a required status control."
        )

    return OccurrenceActionSurface(
        current_status=current_status,
        status_forms=statuses,
        note_form=note_forms[0],
    )


def discover_server_action_reference(
    html: str,
    *,
    prop_name: str,
    exported_name: str,
) -> RenderedServerActionReference:
    """Resolve a named RSC prop to its runtime server-reference identifier."""

    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9]*", prop_name):
        raise ActionProtocolError("The action prop selector is invalid.")
    if not re.fullmatch(r"[A-Za-z_$][A-Za-z0-9_$]*", exported_name):
        raise ActionProtocolError("The action export selector is invalid.")

    payload = decode_next_flight_payload(html)
    prop_pattern = re.compile(
        rf'"{re.escape(prop_name)}"\s*:\s*"\$[A-Za-z]([0-9a-f]+)"'
    )
    references = set(prop_pattern.findall(payload))
    if len(references) != 1:
        raise ActionProtocolError(
            "The rendered RSC payload did not expose one action prop reference."
        )
    reference = next(iter(references))

    definition_pattern = re.compile(
        rf"(?:^|\n){re.escape(reference)}:",
    )
    definition_match = definition_pattern.search(payload)
    if definition_match is None:
        raise ActionProtocolError(
            "The rendered action prop reference lacked a server definition."
        )
    object_start = definition_match.end()
    try:
        definition, _ = json.JSONDecoder().raw_decode(
            payload,
            object_start,
        )
    except (TypeError, ValueError) as error:
        raise ActionProtocolError(
            "The rendered server action definition was invalid."
        ) from error

    if not isinstance(definition, dict):
        raise ActionProtocolError(
            "The rendered server action definition was not an object."
        )
    has_export_metadata = (
        "name" in definition or "env" in definition
    )
    if (
        definition.get("bound") is not None
        or (
            has_export_metadata
            and (
                definition.get("name") != exported_name
                or definition.get("env") != "Server"
            )
        )
    ):
        raise ActionProtocolError(
            "The rendered server action definition did not match its "
            "expected unbound export."
        )
    action_id = definition.get("id")
    if not isinstance(action_id, str) or not ACTION_ID_PATTERN.fullmatch(action_id):
        raise ActionProtocolError(
            "The rendered server action identifier was invalid."
        )
    return RenderedServerActionReference(action_id=action_id)


def synthesize_action_form(
    reference: RenderedServerActionReference,
    *,
    document_url: str,
    stable_fields: Sequence[tuple[str, str]],
) -> RenderedActionForm:
    """Create the progressive-enhancement payload for a rendered RSC action."""

    if not stable_fields:
        raise ActionProtocolError(
            "A synthesized action requires stable product fields."
        )
    if any(name.startswith("$ACTION_") or not name for name, _ in stable_fields):
        raise ActionProtocolError(
            "Synthesized fields must use stable product names."
        )
    parsed = urlparse(document_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ActionProtocolError(
            "The rendered document URL was invalid."
        )
    binding_index = "1"
    reference_payload = json.dumps(
        {
            "id": reference.action_id,
            "bound": f"$@{binding_index}",
        },
        separators=(",", ":"),
    )
    initial_state_payload = json.dumps(
        [{"status": "idle", "message": ""}],
        separators=(",", ":"),
    )
    return RenderedActionForm(
        action=document_url,
        fields=(
            (f"$ACTION_REF_{binding_index}", ""),
            (f"$ACTION_{binding_index}:0", reference_payload),
            (f"$ACTION_{binding_index}:1", initial_state_payload),
            *tuple(stable_fields),
        ),
    )


def decode_next_flight_payload(html: str) -> str:
    parser = _parse_document(html)
    chunks: list[str] = []
    push_pattern = re.compile(
        r"self\.__next_f\.push\((\[.*\])\)\s*;?",
        re.DOTALL,
    )
    for script in parser.scripts:
        match = push_pattern.search(script)
        if match is None:
            continue
        try:
            value = json.loads(match.group(1))
        except ValueError as error:
            raise ActionProtocolError(
                "A rendered Next flight chunk was invalid."
            ) from error
        if (
            isinstance(value, list)
            and len(value) >= 2
            and value[0] == 1
            and isinstance(value[1], str)
        ):
            chunks.append(value[1])
    if not chunks:
        raise ActionProtocolError(
            "The rendered document lacked a Next flight payload."
        )
    return "\n".join(chunks)


def discover_behavior_snapshot(
    html: str,
    *,
    behavior_id: str,
) -> BehaviorSnapshot:
    if not UUID_PATTERN.fullmatch(behavior_id):
        raise ActionProtocolError("The behavior selector is invalid.")
    payload = decode_next_flight_payload(html)
    marker = re.compile(
        rf'"id"\s*:\s*"{re.escape(behavior_id)}"'
    )
    for match in marker.finditer(payload):
        start = payload.rfind("{", 0, match.start() + 1)
        if start < 0:
            continue
        candidate = _read_balanced_json_object(payload, start)
        if candidate is None:
            continue
        try:
            value = json.loads(candidate)
        except ValueError:
            continue
        if (
            isinstance(value, dict)
            and value.get("id") == behavior_id
            and isinstance(value.get("schedules"), list)
            and isinstance(value.get("active"), bool)
        ):
            return _parse_behavior_snapshot(value)
    raise ActionProtocolError(
        "The rendered RSC payload lacked the selected behavior snapshot."
    )


def build_behavior_update_fields(
    snapshot: BehaviorSnapshot,
    *,
    title: str | None = None,
    first_exact_time: str | None = None,
) -> tuple[tuple[str, str], ...]:
    resolved_title = snapshot.title if title is None else title.strip()
    if not resolved_title or len(resolved_title) > MAX_BEHAVIOR_TITLE_LENGTH:
        raise ActionProtocolError(
            "The bounded behavior title is invalid."
        )
    if len(snapshot.description) > MAX_BEHAVIOR_DESCRIPTION_LENGTH:
        raise ActionProtocolError(
            "The rendered behavior description exceeded the product bound."
        )
    if not snapshot.schedules or len(snapshot.schedules) > MAX_BEHAVIOR_SCHEDULES:
        raise ActionProtocolError(
            "The rendered behavior schedule graph was invalid."
        )
    if first_exact_time is not None and not _is_clock_time(first_exact_time):
        raise ActionProtocolError(
            "The requested bounded schedule time was invalid."
        )

    fields: list[tuple[str, str]] = [
        ("behavior_id", snapshot.id),
        ("title", resolved_title),
        ("category_id", snapshot.category_id),
        ("description", snapshot.description),
        ("behavior_schedule_count", str(len(snapshot.schedules))),
    ]
    replaced_exact_time = False
    for schedule_index, schedule in enumerate(snapshot.schedules):
        schedule_id = _required_uuid_value(schedule, "id", "schedule")
        recurrence = schedule.get("recurrenceRule")
        time_entries = schedule.get("timeEntries")
        if (
            not isinstance(recurrence, dict)
            or not isinstance(time_entries, list)
            or not time_entries
            or len(time_entries) > MAX_TIME_ENTRIES_PER_SCHEDULE
        ):
            raise ActionProtocolError(
                "The rendered behavior schedule graph was invalid."
            )
        fields.append(
            (f"behavior_schedule_id_{schedule_index}", schedule_id)
        )
        fields.extend(
            _recurrence_fields(schedule_index, recurrence)
        )
        fields.append(
            (
                f"schedule_{schedule_index}_time_entry_count",
                str(len(time_entries)),
            )
        )
        for entry_index, entry in enumerate(time_entries):
            if not isinstance(entry, dict):
                raise ActionProtocolError(
                    "The rendered schedule time entry was invalid."
                )
            entry_id = _required_uuid_value(entry, "id", "time entry")
            kind = entry.get("kind")
            prefix = f"schedule_{schedule_index}_time_entry"
            fields.extend(
                (
                    (f"{prefix}_id_{entry_index}", entry_id),
                    (f"{prefix}_kind_{entry_index}", _schedule_kind(kind)),
                )
            )
            if kind == "exact":
                start_time = _required_clock_value(entry, "startTime")
                if first_exact_time is not None and not replaced_exact_time:
                    start_time = first_exact_time
                    replaced_exact_time = True
                fields.append(
                    (f"{prefix}_exact_time_{entry_index}", start_time)
                )
            else:
                preset = entry.get("preset")
                if preset in {"morning", "afternoon", "evening", "night"}:
                    fields.append(
                        (f"{prefix}_range_preset_{entry_index}", str(preset))
                    )
                else:
                    fields.extend(
                        (
                            (
                                f"{prefix}_range_preset_{entry_index}",
                                "custom",
                            ),
                            (
                                f"{prefix}_range_start_{entry_index}",
                                _required_clock_value(entry, "startTime"),
                            ),
                            (
                                f"{prefix}_range_end_{entry_index}",
                                _required_clock_value(entry, "endTime"),
                            ),
                        )
                    )

    if first_exact_time is not None and not replaced_exact_time:
        raise ActionProtocolError(
            "The selected behavior lacked an exact-time slot to mutate."
        )
    if snapshot.browser_reminder_enabled:
        fields.append(("browser_reminder", "on"))
    if snapshot.email_reminder_enabled:
        fields.append(("email_reminder", "on"))
    offset = str(snapshot.reminder_offset_minutes)
    if offset not in ALLOWED_REMINDER_OFFSETS:
        raise ActionProtocolError(
            "The rendered reminder offset was invalid."
        )
    fields.append(("reminder_offset", offset))
    if snapshot.active:
        fields.append(("active", "on"))
    return tuple(fields)


def build_minimal_create_form(
    form: RenderedActionForm,
    *,
    title: str,
    description: str,
) -> RenderedActionForm:
    title = title.strip()
    description = description.strip()
    if not title or len(title) > MAX_BEHAVIOR_TITLE_LENGTH:
        raise ActionProtocolError(
            "The bounded synthetic behavior title is invalid."
        )
    if len(description) > MAX_BEHAVIOR_DESCRIPTION_LENGTH:
        raise ActionProtocolError(
            "The bounded synthetic behavior description is invalid."
        )
    return replace_action_fields(
        form,
        {
            "title": title,
            "category_id": "",
            "description": description,
            "behavior_schedule_count": "1",
            "behavior_schedule_id_0": "",
            "schedule_0_recurrence_kind": "daily",
            "schedule_0_daily_interval": "1",
            "schedule_0_time_entry_count": "1",
            "schedule_0_time_entry_id_0": "",
            "schedule_0_time_entry_kind_0": "exact",
            "schedule_0_time_entry_exact_time_0": "11:37",
            "reminder_offset": "0",
        },
    )


def bounded_synthetic_note(owner_marker: str, sequence: int) -> str:
    if not re.fullmatch(r"cadence-owner-[a-f0-9]{20}", owner_marker):
        raise ActionProtocolError(
            "The synthetic note ownership marker was invalid."
        )
    if sequence < 0:
        raise ActionProtocolError(
            "The synthetic note sequence was invalid."
        )
    note = f"{owner_marker} bounded-note-{sequence % 8}"
    if len(note) > MAX_SYNTHETIC_NOTE_LENGTH:
        raise ActionProtocolError(
            "The synthetic note exceeded its load-test bound."
        )
    return note


def multipart_action_fields(
    form: RenderedActionForm,
) -> list[tuple[str, tuple[None, str]]]:
    return [(name, (None, value)) for name, value in form.fields]


def action_headers(base_url: str, referer: str) -> dict[str, str]:
    _assert_same_origin_action(base_url, referer)
    return {
        "Accept": "text/html,application/xhtml+xml",
        "Origin": base_url,
        "Referer": referer,
        "Sec-Fetch-Site": "same-origin",
    }


def assert_action_success(
    response: ResponseLike,
    *,
    marker: str | None,
) -> None:
    if response.status_code < 200 or response.status_code >= 400:
        raise ActionProtocolError(
            "Server Action returned an unexpected HTTP status."
        )
    content_type = _response_header(response, "content-type").lower()
    allowed_content_type = (
        "text/x-component" in content_type
        or "text/html" in content_type
    )
    if not allowed_content_type:
        raise ActionProtocolError(
            "Server Action returned an unexpected content type."
        )
    if marker is not None and marker not in response.text:
        raise ActionProtocolError(
            "Server Action response lacked its semantic success result."
        )
    if "Continue with Google" in response.text:
        raise ActionProtocolError(
            "Server Action resolved to login content."
        )


def assert_occurrence_surface_state(
    surface: OccurrenceActionSurface,
    *,
    expected_status: str,
    expected_note: str | None = None,
) -> None:
    if expected_status not in STATUS_VALUES:
        raise ActionProtocolError(
            "The expected verification status was invalid."
        )
    if surface.current_status != expected_status:
        raise ActionProtocolError(
            "The refreshed occurrence did not expose the submitted status."
        )
    if expected_note is None:
        return
    note_values = _fields_by_name(surface.note_form.fields).get("note", ())
    if note_values != (expected_note,):
        raise ActionProtocolError(
            "The refreshed occurrence did not expose the submitted note."
        )


def assert_behavior_state(
    snapshot: BehaviorSnapshot,
    *,
    owner_marker: str,
    active: bool | None = None,
    title: str | None = None,
    first_exact_time: str | None = None,
) -> None:
    if owner_marker not in snapshot.title:
        raise ActionProtocolError(
            "The selected behavior snapshot lacked its ownership marker."
        )
    if active is not None and snapshot.active is not active:
        raise ActionProtocolError(
            "The refreshed behavior did not expose its submitted lifecycle state."
        )
    if title is not None and snapshot.title != title:
        raise ActionProtocolError(
            "The refreshed behavior did not expose its submitted title."
        )
    if first_exact_time is not None:
        first_entry = _first_time_entry(snapshot)
        if first_entry.get("kind") != "exact":
            raise ActionProtocolError(
                "The refreshed behavior changed the selected schedule kind."
            )
        if first_entry.get("startTime") != first_exact_time:
            raise ActionProtocolError(
                "The refreshed behavior did not expose its submitted schedule time."
            )


def selector_value(
    identity: LoadIdentity,
    name: str,
    *,
    fallback: str | None = None,
    kind: str = "text",
) -> str:
    value = getattr(identity.selectors, name, None)
    if value is None:
        value = fallback
    if not isinstance(value, str) or not value:
        raise ActionProtocolError(
            "The identity artifact lacked required mutation selector metadata."
        )
    if kind == "uuid" and not UUID_PATTERN.fullmatch(value):
        raise ActionProtocolError(
            "The identity artifact contained an invalid mutation selector."
        )
    if kind == "date" and not LOCAL_DATE_PATTERN.fullmatch(value):
        raise ActionProtocolError(
            "The identity artifact contained an invalid date selector."
        )
    if kind == "status" and value not in STATUS_VALUES:
        raise ActionProtocolError(
            "The identity artifact contained an invalid status selector."
        )
    return value


ResultT = TypeVar("ResultT")


class AuthenticatedActionUser(HttpUser):
    """Base class that leases exactly one ordinary authenticated identity."""

    abstract = True
    wait_time = between(*MUTATION_PROFILE.think_time_seconds)

    def on_start(self) -> None:
        self._lease: IdentityLease | None = None
        self._identity: LoadIdentity | None = None
        try:
            runtime = get_shared_identity_runtime()
            configured_host = self.host or getattr(
                self.environment,
                "host",
                None,
            )
            assert_locust_host(configured_host, runtime.artifact.base_url)
            lease = runtime.pool.acquire()
            self._lease = lease
            self._identity = lease.identity
            self.client.cookies.clear()
            for name, value in lease.identity.cookies.items():
                self.client.cookies.set(name, value)
            self.on_identity_ready()
        except (IdentityArtifactError, ActionProtocolError) as error:
            self._abort_run(error)

    def on_identity_ready(self) -> None:
        """Allow concrete roles to validate their required selector subset."""

    def on_stop(self) -> None:
        lease = self._lease
        self._lease = None
        self._identity = None
        self.client.cookies.clear()
        if lease is not None:
            runtime = get_shared_identity_runtime()
            runtime.pool.release(lease)

    def protected_document(
        self,
        request: ReadRequest,
        *,
        path: str | None = None,
        params: Mapping[str, object] | None = None,
        transform: Callable[[str, str], ResultT] | None = None,
    ) -> ResultT | None:
        identity = self.required_identity()
        with self.client.get(
            path or request.path,
            params=dict(params) if params is not None else None,
            name=request.name,
            catch_response=True,
        ) as response:
            try:
                assert_protected_read_response(
                    response,
                    request,
                    identity=identity,
                )
                result = (
                    transform(response.text, response.url)
                    if transform is not None
                    else None
                )
            except SemanticAssertionError as error:
                if _is_transport_failure(response):
                    self._fail_and_reschedule(response, error)
                self._fail_and_stop(response, error)
            response.success()
            return result

    def submit_action(
        self,
        form: RenderedActionForm,
        *,
        referer: str,
        name: str,
        success_marker: str | None,
    ) -> MutationReceipt:
        with self.client.post(
            form.action,
            files=multipart_action_fields(form),
            headers=action_headers(self.base_url, referer),
            name=name,
            catch_response=True,
        ) as response:
            try:
                assert_action_success(response, marker=success_marker)
            except SemanticAssertionError as error:
                self._fail_and_stop(response, error)
            response.success()
        try:
            return record_successful_submission(name)
        except SemanticEvidenceError as error:
            self._abort_run(error)

    def verify_action(self, receipt: MutationReceipt) -> None:
        """Record one successful refreshed-state assertion for a POST receipt."""

        try:
            record_semantic_verification(receipt)
        except SemanticEvidenceError as error:
            self._abort_run(error)

    def structured_export(self, request: ReadRequest) -> None:
        identity = self.required_identity()
        with self.client.get(
            request.path,
            name=request.name,
            catch_response=True,
        ) as response:
            try:
                assert_export_response(
                    response,
                    request,
                    owner_marker=identity.selectors.owner_marker,
                    forbidden_marker=identity.selectors.forbidden_marker,
                    require_owner_marker=identity.requires_owner_marker,
                )
            except SemanticAssertionError as error:
                if _is_transport_failure(response):
                    self._fail_and_reschedule(response, error)
                self._fail_and_stop(response, error)
            response.success()

    @property
    def base_url(self) -> str:
        runtime = get_shared_identity_runtime()
        return runtime.artifact.base_url

    def required_identity(self) -> LoadIdentity:
        if self._identity is None:
            raise ActionProtocolError(
                "The mutation user has no authenticated identity lease."
            )
        return self._identity

    def _fail_and_stop(self, response, error: SemanticAssertionError) -> None:
        response.failure(str(error))
        self.environment.process_exit_code = 2
        runner = self.environment.runner
        if runner is not None:
            runner.quit()
        raise StopUser()

    def _fail_and_reschedule(
        self,
        response,
        error: SemanticAssertionError,
    ) -> None:
        response.failure(getattr(response, "error", None) or str(error))
        raise RescheduleTask()

    def _abort_run(self, error: Exception) -> None:
        self.environment.process_exit_code = 2
        runner = self.environment.runner
        if runner is not None:
            runner.quit()
        raise RuntimeError(str(error)) from error


def _parse_document(html: str) -> _DocumentParser:
    parser = _DocumentParser()
    try:
        parser.feed(html)
    except (ValueError, AssertionError) as error:
        raise ActionProtocolError(
            "The rendered document could not be parsed safely."
        ) from error
    return parser


def _is_transport_failure(response: object) -> bool:
    return (
        getattr(response, "status_code", None) == 0
        or getattr(response, "error", None) is not None
    )


def _fields_by_name(
    fields: Sequence[tuple[str, str]],
) -> dict[str, tuple[str, ...]]:
    values: dict[str, list[str]] = {}
    for name, value in fields:
        values.setdefault(name, []).append(value)
    return {name: tuple(items) for name, items in values.items()}


def _assert_same_origin_action(document_url: str, action_url: str) -> None:
    document = urlparse(document_url)
    action = urlparse(action_url)
    if (
        document.scheme not in {"http", "https"}
        or not document.netloc
        or action.scheme != document.scheme
        or action.netloc != document.netloc
    ):
        raise ActionProtocolError(
            "The rendered Server Action target was not same-origin."
        )


def _read_balanced_json_object(value: str, start: int) -> str | None:
    if start < 0 or start >= len(value) or value[start] != "{":
        return None
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(value)):
        character = value[index]
        if in_string:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == '"':
                in_string = False
            continue
        if character == '"':
            in_string = True
        elif character == "{":
            depth += 1
        elif character == "}":
            depth -= 1
            if depth == 0:
                return value[start : index + 1]
            if depth < 0:
                return None
    return None


def _parse_behavior_snapshot(value: Mapping[str, object]) -> BehaviorSnapshot:
    behavior_id = value.get("id")
    title = value.get("title")
    description = value.get("description")
    category_id = value.get("categoryId")
    schedules = value.get("schedules")
    browser = value.get("browserReminderEnabled")
    email = value.get("emailReminderEnabled")
    offset = value.get("reminderOffsetMinutes")
    active = value.get("active")
    if (
        not isinstance(behavior_id, str)
        or not UUID_PATTERN.fullmatch(behavior_id)
        or not isinstance(title, str)
        or not title
        or not isinstance(description, str)
        or not isinstance(category_id, str)
        or (
            category_id
            and not UUID_PATTERN.fullmatch(category_id)
        )
        or not isinstance(schedules, list)
        or not all(isinstance(schedule, dict) for schedule in schedules)
        or not isinstance(browser, bool)
        or not isinstance(email, bool)
        or not isinstance(offset, int)
        or isinstance(offset, bool)
        or not isinstance(active, bool)
    ):
        raise ActionProtocolError(
            "The rendered behavior snapshot was invalid."
        )
    return BehaviorSnapshot(
        id=behavior_id,
        title=html_module.unescape(title),
        description=html_module.unescape(description),
        category_id=category_id,
        schedules=tuple(schedules),
        browser_reminder_enabled=browser,
        email_reminder_enabled=email,
        reminder_offset_minutes=offset,
        active=active,
    )


def _recurrence_fields(
    index: int,
    recurrence: Mapping[str, object],
) -> tuple[tuple[str, str], ...]:
    prefix = f"schedule_{index}"
    frequency = recurrence.get("frequency")
    if frequency == "daily":
        interval = _positive_integer(recurrence.get("interval"))
        return (
            (f"{prefix}_recurrence_kind", "daily"),
            (f"{prefix}_daily_interval", interval),
        )
    if frequency == "interval_days":
        interval = _positive_integer(recurrence.get("intervalDays"))
        return (
            (f"{prefix}_recurrence_kind", "every_days"),
            (f"{prefix}_every_days", interval),
        )
    if frequency == "weekly":
        interval = _positive_integer(recurrence.get("interval"))
        days = recurrence.get("daysOfWeek")
        if (
            not isinstance(days, list)
            or not days
            or any(day not in ALLOWED_WEEKDAYS for day in days)
        ):
            raise ActionProtocolError(
                "The rendered weekly recurrence was invalid."
            )
        return (
            (f"{prefix}_recurrence_kind", "weekly"),
            (f"{prefix}_weekly_interval", interval),
            *tuple((f"{prefix}_weekly_days", str(day)) for day in days),
        )
    if frequency == "monthly":
        interval = _positive_integer(recurrence.get("interval"))
        day = recurrence.get("dayOfMonth")
        if (
            not isinstance(day, int)
            or isinstance(day, bool)
            or day < 1
            or day > 31
        ):
            raise ActionProtocolError(
                "The rendered monthly recurrence was invalid."
            )
        return (
            (f"{prefix}_recurrence_kind", "monthly"),
            (f"{prefix}_monthly_interval", interval),
            (f"{prefix}_monthly_day", str(day)),
        )
    raise ActionProtocolError(
        "The rendered recurrence kind was invalid."
    )


def _positive_integer(value: object) -> str:
    if (
        not isinstance(value, int)
        or isinstance(value, bool)
        or value <= 0
        or value > 999
    ):
        raise ActionProtocolError(
            "The rendered recurrence interval was invalid."
        )
    return str(value)


def _required_uuid_value(
    value: Mapping[str, object],
    key: str,
    label: str,
) -> str:
    raw = value.get(key)
    if not isinstance(raw, str) or not UUID_PATTERN.fullmatch(raw):
        raise ActionProtocolError(
            f"The rendered {label} selector was invalid."
        )
    return raw


def _required_clock_value(
    value: Mapping[str, object],
    key: str,
) -> str:
    raw = value.get(key)
    if not isinstance(raw, str) or not _is_clock_time(raw):
        raise ActionProtocolError(
            "The rendered schedule time was invalid."
        )
    return raw


def _is_clock_time(value: str) -> bool:
    match = re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", value)
    return match is not None


def _schedule_kind(value: object) -> str:
    if value in {"exact", "range"}:
        return str(value)
    raise ActionProtocolError(
        "The rendered schedule time kind was invalid."
    )


def _first_time_entry(snapshot: BehaviorSnapshot) -> Mapping[str, object]:
    schedule = snapshot.schedules[0]
    entries = schedule.get("timeEntries")
    if not isinstance(entries, list) or not entries or not isinstance(entries[0], dict):
        raise ActionProtocolError(
            "The rendered behavior lacked a first schedule time."
        )
    return entries[0]


def _response_header(response: ResponseLike, name: str) -> str:
    for header_name, value in response.headers.items():
        if header_name.lower() == name:
            return value
    return ""
