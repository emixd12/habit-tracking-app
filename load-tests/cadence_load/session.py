"""Run-specific session artifact loading with strict target and mode checks."""

import json
import os
import stat
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse


class SessionArtifactError(RuntimeError):
    """Raised with no session values or identifiers in the message."""


@dataclass(frozen=True)
class ProtocolSession:
    base_url: str
    cookies: dict[str, str]
    occurrence_id: str


def load_protocol_session() -> ProtocolSession:
    raw_path = os.environ.get("CADENCE_LOAD_SESSION_FILE", "").strip()
    if not raw_path:
        raise SessionArtifactError("CADENCE_LOAD_SESSION_FILE is required.")

    path = Path(raw_path).resolve()
    try:
        mode = stat.S_IMODE(path.stat().st_mode)
    except OSError as error:
        raise SessionArtifactError(
            "The run-specific session artifact is unavailable."
        ) from error

    if mode & 0o077:
        raise SessionArtifactError(
            "The run-specific session artifact must be owner-only."
        )

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise SessionArtifactError(
            "The run-specific session artifact is invalid."
        ) from error

    if payload.get("target_classification") != "local":
        raise SessionArtifactError(
            "The protocol smoke accepts local targets only."
        )

    base_url = payload.get("base_url")
    parsed_url = urlparse(base_url) if isinstance(base_url, str) else None
    if (
        parsed_url is None
        or parsed_url.scheme != "http"
        or parsed_url.hostname not in {"127.0.0.1", "localhost"}
    ):
        raise SessionArtifactError(
            "The protocol smoke base URL must be local HTTP."
        )

    cookies = payload.get("cookies")
    occurrence_id = payload.get("occurrence_id")
    if (
        not isinstance(cookies, dict)
        or not cookies
        or not all(
            isinstance(name, str) and isinstance(value, str)
            for name, value in cookies.items()
        )
        or not isinstance(occurrence_id, str)
    ):
        raise SessionArtifactError(
            "The protocol session artifact is missing required fields."
        )

    return ProtocolSession(
        base_url=base_url.rstrip("/"),
        cookies=cookies,
        occurrence_id=occurrence_id,
    )
