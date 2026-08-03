"""Aggregate one-to-one mutation readback evidence for a Locust stage."""

from __future__ import annotations

import csv
import json
import os
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from threading import Lock

from locust.stats import PERCENTILES_TO_REPORT, StatsCSV


SEMANTIC_EVIDENCE_SCHEMA_VERSION = "1.0.0"
SEMANTIC_EVIDENCE_FILE_SUFFIX = "_semantic-verifications.json"
LOCUST_STATS_FILE_SUFFIX = "_stats.csv"
LOCUST_FAILURES_FILE_SUFFIX = "_failures.csv"
LOCUST_EXCEPTIONS_FILE_SUFFIX = "_exceptions.csv"


class SemanticEvidenceError(RuntimeError):
    """Raised when mutation verification evidence is missing or inconsistent."""


@dataclass(frozen=True)
class MutationReceipt:
    """Opaque proof that one Server Action POST completed successfully."""

    request_name: str
    generation: int
    sequence: int


class _SemanticEvidenceLedger:
    def __init__(self) -> None:
        self._lock = Lock()
        self._generation = 0
        self._sequence = 0
        self._submissions: Counter[str] = Counter()
        self._verifications: Counter[str] = Counter()
        self._pending: dict[tuple[int, int], str] = {}

    def reset(self) -> None:
        with self._lock:
            self._generation += 1
            self._sequence = 0
            self._submissions.clear()
            self._verifications.clear()
            self._pending.clear()

    def record_submission(self, request_name: str) -> MutationReceipt:
        if not isinstance(request_name, str) or not request_name.strip():
            raise SemanticEvidenceError(
                "A successful mutation lacked its stable request name."
            )
        with self._lock:
            self._sequence += 1
            receipt = MutationReceipt(
                request_name=request_name,
                generation=self._generation,
                sequence=self._sequence,
            )
            key = (receipt.generation, receipt.sequence)
            self._submissions[request_name] += 1
            self._pending[key] = request_name
            return receipt

    def record_verification(self, receipt: MutationReceipt) -> None:
        if not isinstance(receipt, MutationReceipt):
            raise SemanticEvidenceError(
                "Mutation readback requires a valid successful-POST receipt."
            )
        key = (receipt.generation, receipt.sequence)
        with self._lock:
            request_name = self._pending.get(key)
            if (
                receipt.generation != self._generation
                or request_name != receipt.request_name
            ):
                raise SemanticEvidenceError(
                    "Mutation readback receipt was stale, unknown, or reused."
                )
            del self._pending[key]
            self._verifications[request_name] += 1

    def snapshot(self) -> dict[str, object]:
        with self._lock:
            pending = Counter(self._pending.values())
            return {
                "schema_version": SEMANTIC_EVIDENCE_SCHEMA_VERSION,
                "successful_submissions": dict(
                    sorted(self._submissions.items())
                ),
                "semantic_verifications": dict(
                    sorted(self._verifications.items())
                ),
                "pending_verifications": dict(sorted(pending.items())),
            }


_LEDGER = _SemanticEvidenceLedger()


def reset_semantic_evidence() -> None:
    """Start a fresh evidence ledger for one Locust process."""

    _LEDGER.reset()


def record_successful_submission(request_name: str) -> MutationReceipt:
    """Return a receipt after one Server Action response is reported successful."""

    return _LEDGER.record_submission(request_name)


def record_semantic_verification(receipt: MutationReceipt) -> None:
    """Consume one receipt after the corresponding refreshed-state assertion."""

    _LEDGER.record_verification(receipt)


def semantic_evidence_snapshot() -> dict[str, object]:
    """Return only aggregate stable names and counts."""

    return _LEDGER.snapshot()


def resolve_semantic_evidence_path(value: str | None) -> Path:
    """Validate the supervisor-owned aggregate evidence destination."""

    if not isinstance(value, str) or not value.strip():
        raise SemanticEvidenceError(
            "CADENCE_LOAD_SEMANTIC_EVIDENCE_FILE is required."
        )
    path = Path(value)
    if (
        not path.is_absolute()
        or not path.name.endswith(SEMANTIC_EVIDENCE_FILE_SUFFIX)
        or not path.parent.is_dir()
    ):
        raise SemanticEvidenceError(
            "The semantic evidence destination is not a valid absolute run file."
        )
    return path


def write_semantic_evidence(path: Path) -> None:
    """Atomically write owner-only aggregate evidence for the supervisor."""

    payload = semantic_evidence_snapshot()
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        descriptor = os.open(
            temporary,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL,
            0o600,
        )
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
            handle.write("\n")
        os.replace(temporary, path)
        path.chmod(0o600)
    finally:
        if temporary.exists():
            temporary.unlink()


def write_final_stats_csv(environment, evidence_path: Path) -> Path:
    """Atomically retain Locust's final request, failure, and exception CSVs."""

    if (
        not isinstance(evidence_path, Path)
        or not evidence_path.is_absolute()
        or not evidence_path.name.endswith(
            SEMANTIC_EVIDENCE_FILE_SUFFIX
        )
        or not evidence_path.parent.is_dir()
        or getattr(environment, "stats", None) is None
    ):
        raise SemanticEvidenceError(
            "Final Locust accounting requires a valid run destination and stats."
        )

    prefix = evidence_path.name.removesuffix(
        SEMANTIC_EVIDENCE_FILE_SUFFIX
    )
    if not prefix:
        raise SemanticEvidenceError(
            "Final Locust accounting lacked its stage prefix."
        )
    stats_csv = StatsCSV(environment, PERCENTILES_TO_REPORT)
    outputs = (
        (LOCUST_STATS_FILE_SUFFIX, stats_csv.requests_csv),
        (LOCUST_FAILURES_FILE_SUFFIX, stats_csv.failures_csv),
        (LOCUST_EXCEPTIONS_FILE_SUFFIX, stats_csv.exceptions_csv),
    )
    written_paths: list[Path] = []
    for suffix, write_csv in outputs:
        path = evidence_path.with_name(f"{prefix}{suffix}")
        temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
        try:
            descriptor = os.open(
                temporary,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                0o600,
            )
            with os.fdopen(
                descriptor,
                "w",
                encoding="utf-8",
                newline="",
            ) as handle:
                write_csv(csv.writer(handle))
            # Locust's sampler still owns the old descriptor. Replacing the
            # path prevents a later flush through that descriptor from
            # restoring stale final accounting.
            os.replace(temporary, path)
            path.chmod(0o600)
            written_paths.append(path)
        finally:
            if temporary.exists():
                temporary.unlink()
    return written_paths[0]
