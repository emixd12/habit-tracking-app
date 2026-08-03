"""Semantic HTTP assertions that avoid leaking response or fixture payloads."""

import json
from pathlib import PurePosixPath
from typing import Protocol
from urllib.parse import urlparse


class ResponseLike(Protocol):
    status_code: int
    url: str
    headers: dict[str, str]
    content: bytes
    text: str


class SemanticAssertionError(AssertionError):
    """A privacy-safe response assertion failure."""


class CriticalSemanticAssertionError(SemanticAssertionError):
    """A boundary failure that must stop the active load stage immediately."""


def assert_public_document(response: ResponseLike, *, marker: str) -> None:
    _assert_success(response, "public document")
    _assert_content_type(response, "text/html", "public document")
    if marker not in response.text:
        raise SemanticAssertionError(
            "Public document did not contain its semantic marker."
        )


def assert_protected_document(response: ResponseLike, *, marker: str) -> None:
    _assert_success(response, "protected document")
    final_path = PurePosixPath(urlparse(response.url).path)
    if str(final_path) == "/login":
        raise SemanticAssertionError(
            "Protected document resolved to the login route."
        )
    _assert_content_type(response, "text/html", "protected document")
    if "Continue with Google" in response.text:
        raise SemanticAssertionError(
            "Protected document returned login content."
        )
    if marker not in response.text:
        raise SemanticAssertionError(
            "Protected document did not contain its semantic marker."
        )


def assert_structured_export(
    response: ResponseLike,
    *,
    export_format: str,
) -> None:
    _assert_success(response, "structured export")
    content_disposition = _header(response, "content-disposition").lower()
    if "attachment" not in content_disposition:
        raise SemanticAssertionError(
            "Structured export was not returned as an attachment."
        )
    if len(response.content) < 2:
        raise SemanticAssertionError("Structured export body was empty.")

    if export_format == "json":
        _assert_content_type(response, "application/json", "structured export")
        try:
            payload = json.loads(response.content)
        except (TypeError, ValueError) as error:
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
        if ".json" not in content_disposition:
            raise SemanticAssertionError(
                "Structured JSON export filename did not use .json."
            )
        return

    raise SemanticAssertionError("Unsupported structured export assertion.")


def assert_server_action_success(response: ResponseLike) -> None:
    _assert_success(response, "Server Action")
    if "Occurrence updated." not in response.text:
        raise SemanticAssertionError(
            "Server Action response lacked the success result."
        )


def assert_server_action_rejection(response: ResponseLike) -> None:
    _assert_success(response, "rejected Server Action")
    if (
        "Occurrence status changed. Review the latest status and try again."
        not in response.text
    ):
        raise SemanticAssertionError(
            "Stale Server Action response lacked the expected rejection."
        )


def _assert_success(response: ResponseLike, label: str) -> None:
    if response.status_code < 200 or response.status_code >= 400:
        raise SemanticAssertionError(
            f"{label.capitalize()} returned unexpected HTTP status "
            f"{response.status_code}."
        )


def _assert_content_type(
    response: ResponseLike,
    expected: str,
    label: str,
) -> None:
    if expected not in _header(response, "content-type").lower():
        raise SemanticAssertionError(
            f"{label.capitalize()} returned an unexpected content type."
        )


def _header(response: ResponseLike, name: str) -> str:
    for header_name, value in response.headers.items():
        if header_name.lower() == name:
            return value
    return ""
