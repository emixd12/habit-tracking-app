"""Secret-free request contracts for the fixed-count local operator process.

The Node supervisor owns process-secret creation and request headers. This
module intentionally defines only bounded paths, stable metric names, and
privacy-safe response assertions so ordinary Locust workers never need an
operator credential.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from types import MappingProxyType
from typing import Mapping

from cadence_load.assertions import ResponseLike, SemanticAssertionError


@dataclass(frozen=True)
class OperatorRequest:
    key: str
    method: str
    path: str
    name: str
    default_limit: int
    max_limit: int
    result_fields: tuple[str, ...]


OPERATOR_REQUESTS = (
    OperatorRequest(
        key="occurrence_sync",
        method="POST",
        path="/api/occurrences/sync",
        name="SYS-OCCURRENCE-001 POST /api/occurrences/sync operator",
        default_limit=25,
        max_limit=100,
        result_fields=("checked", "synced", "skipped", "failed"),
    ),
    OperatorRequest(
        key="reminder_process",
        method="POST",
        path="/api/reminders/process",
        name="SYS-REMINDER-001 POST /api/reminders/process operator",
        default_limit=25,
        max_limit=100,
        result_fields=(
            "checked",
            "claimed",
            "skipped",
            "sent",
            "failed",
            "cancelled",
        ),
    ),
)

REQUEST_BY_KEY: Mapping[str, OperatorRequest] = MappingProxyType(
    {request.key: request for request in OPERATOR_REQUESTS}
)


def build_operator_path(
    request: OperatorRequest,
    *,
    limit: int | None = None,
) -> str:
    """Build one route-bounded operator path without credentials or IDs."""

    selected_limit = request.default_limit if limit is None else limit
    if (
        isinstance(selected_limit, bool)
        or not isinstance(selected_limit, int)
        or selected_limit < 1
        or selected_limit > request.max_limit
    ):
        raise ValueError(
            "Operator limit must be an integer within the route bound."
        )

    return f"{request.path}?limit={selected_limit}"


def assert_operator_response(
    response: ResponseLike,
    request: OperatorRequest,
) -> dict[str, int]:
    """Validate aggregate operator results without echoing private payloads."""

    if response.status_code < 200 or response.status_code >= 300:
        raise SemanticAssertionError(
            "Operator request returned an unexpected HTTP status "
            f"{response.status_code}."
        )
    if "application/json" not in _header(response, "content-type").lower():
        raise SemanticAssertionError(
            "Operator request returned an unexpected content type."
        )

    try:
        payload = json.loads(response.content)
    except (TypeError, ValueError) as error:
        raise SemanticAssertionError(
            "Operator request did not return valid JSON."
        ) from error

    if (
        not isinstance(payload, dict)
        or payload.get("ok") is not True
        or not isinstance(payload.get("result"), dict)
    ):
        raise SemanticAssertionError(
            "Operator request did not return a successful aggregate result."
        )

    raw_result = payload["result"]
    result: dict[str, int] = {}
    for field in request.result_fields:
        value = raw_result.get(field)
        if (
            isinstance(value, bool)
            or not isinstance(value, int)
            or value < 0
        ):
            raise SemanticAssertionError(
                "Operator aggregate result contained an invalid count."
            )
        result[field] = value

    if request.key == "occurrence_sync":
        if (
            result["synced"] + result["skipped"] + result["failed"]
            != result["checked"]
        ):
            raise SemanticAssertionError(
                "Occurrence-sync aggregate counts did not reconcile."
            )
    elif request.key == "reminder_process":
        if (
            result["claimed"] + result["skipped"] != result["checked"]
            or result["sent"] + result["failed"] + result["cancelled"]
            != result["claimed"]
        ):
            raise SemanticAssertionError(
                "Reminder-process aggregate counts did not reconcile."
            )
    else:
        raise SemanticAssertionError(
            "Operator request contract is unsupported."
        )

    return result


def _header(response: ResponseLike, name: str) -> str:
    for header_name, value in response.headers.items():
        if header_name.lower() == name:
            return value
    return ""
