import csv
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from locust.env import Environment

import mutation_locustfile
from cadence_load.semantic_evidence import (
    SemanticEvidenceError,
    record_semantic_verification,
    record_successful_submission,
    reset_semantic_evidence,
    resolve_semantic_evidence_path,
    semantic_evidence_snapshot,
    write_final_stats_csv,
    write_semantic_evidence,
)


STATUS_NAME = "INT-TIMELINE-005 POST /timeline server-action"
NOTE_NAME = "INT-TIMELINE-008 POST /timeline server-action"
EXPORT_NAME = "INT-EXPORT-005 GET /api/export/json structured-export"


class MutationSemanticEvidenceTests(unittest.TestCase):
    def setUp(self):
        reset_semantic_evidence()

    def test_receipts_are_one_time_and_pending_until_semantic_readback(self):
        status_receipt = record_successful_submission(STATUS_NAME)
        note_receipt = record_successful_submission(NOTE_NAME)
        record_semantic_verification(status_receipt)

        self.assertEqual(
            semantic_evidence_snapshot(),
            {
                "schema_version": "1.0.0",
                "successful_submissions": {
                    NOTE_NAME: 1,
                    STATUS_NAME: 1,
                },
                "semantic_verifications": {STATUS_NAME: 1},
                "pending_verifications": {NOTE_NAME: 1},
            },
        )
        with self.assertRaisesRegex(
            SemanticEvidenceError,
            "stale, unknown, or reused",
        ):
            record_semantic_verification(status_receipt)

        reset_semantic_evidence()
        with self.assertRaisesRegex(
            SemanticEvidenceError,
            "stale, unknown, or reused",
        ):
            record_semantic_verification(note_receipt)

    def test_writes_owner_only_aggregate_evidence_to_validated_run_path(self):
        receipt = record_successful_submission(STATUS_NAME)
        record_semantic_verification(receipt)

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "stage_semantic-verifications.json"
            resolved = resolve_semantic_evidence_path(str(path))
            write_semantic_evidence(resolved)

            self.assertEqual(
                json.loads(path.read_text(encoding="utf-8")),
                semantic_evidence_snapshot(),
            )
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)

        with self.assertRaisesRegex(
            SemanticEvidenceError,
            "required",
        ):
            resolve_semantic_evidence_path(None)

    def test_atomically_replaces_stale_locust_stats_with_final_request_counts(
        self,
    ):
        environment = Environment()
        environment.stats.log_request("POST", STATUS_NAME, 100, 1_024)
        environment.stats.log_request("POST", STATUS_NAME, 125, 2_048)

        with tempfile.TemporaryDirectory() as directory:
            evidence_path = (
                Path(directory) / "ramp-100_semantic-verifications.json"
            )
            stats_path = Path(directory) / "ramp-100_stats.csv"
            stale_handle = stats_path.open(
                "w+",
                encoding="utf-8",
            )
            try:
                stale_handle.write(
                    "Type,Name,Request Count\n"
                    f"POST,{STATUS_NAME},1\n"
                )
                stale_handle.flush()

                resolved = resolve_semantic_evidence_path(
                    str(evidence_path)
                )
                written_path = write_final_stats_csv(
                    environment,
                    resolved,
                )

                # Locust still owns its sampled CSV descriptor. A later flush
                # through that descriptor must not clobber the final snapshot.
                stale_handle.seek(0)
                stale_handle.write(
                    "Type,Name,Request Count\n"
                    f"POST,{STATUS_NAME},1\n"
                )
                stale_handle.truncate()
                stale_handle.flush()
            finally:
                stale_handle.close()

            self.assertEqual(written_path, stats_path)
            with stats_path.open(
                "r",
                encoding="utf-8",
                newline="",
            ) as handle:
                rows = list(csv.DictReader(handle))
            status_row = next(
                row for row in rows if row["Name"] == STATUS_NAME
            )
            aggregate_row = next(
                row for row in rows if row["Name"] == "Aggregated"
            )
            self.assertEqual(status_row["Request Count"], "2")
            self.assertEqual(status_row["Failure Count"], "0")
            self.assertEqual(aggregate_row["Request Count"], "2")
            self.assertEqual(stats_path.stat().st_mode & 0o777, 0o600)
            self.assertTrue(
                (Path(directory) / "ramp-100_failures.csv").is_file()
            )
            self.assertTrue(
                (Path(directory) / "ramp-100_exceptions.csv").is_file()
            )
            self.assertEqual(
                tuple(Path(directory).glob(".*.tmp")),
                (),
            )

    def test_atomically_replaces_stale_late_failure_and_exception_csvs(self):
        environment = Environment()
        environment.stats.log_error(
            "GET",
            EXPORT_NAME,
            "Structured export returned unexpected HTTP status 401.",
        )

        with tempfile.TemporaryDirectory() as directory:
            evidence_path = (
                Path(directory) / "soak-25_semantic-verifications.json"
            )
            failures_path = Path(directory) / "soak-25_failures.csv"
            exceptions_path = Path(directory) / "soak-25_exceptions.csv"
            failures_path.write_text(
                "Method,Name,Error,Occurrences,First Seen,Last Seen\n",
                encoding="utf-8",
            )
            exceptions_path.write_text(
                "Count,Message,Traceback,Nodes\n",
                encoding="utf-8",
            )

            write_final_stats_csv(
                environment,
                resolve_semantic_evidence_path(str(evidence_path)),
            )

            with failures_path.open(
                "r",
                encoding="utf-8",
                newline="",
            ) as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["Method"], "GET")
            self.assertEqual(rows[0]["Name"], EXPORT_NAME)
            self.assertEqual(rows[0]["Occurrences"], "1")
            with exceptions_path.open(
                "r",
                encoding="utf-8",
                newline="",
            ) as handle:
                self.assertEqual(
                    list(csv.DictReader(handle)),
                    [],
                )
            self.assertEqual(failures_path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(exceptions_path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(
                tuple(Path(directory).glob(".*.tmp")),
                (),
            )

    def test_test_stop_retains_destination_until_final_stats_snapshot(
        self,
    ):
        destination = Path(
            "/tmp/ramp-100_semantic-verifications.json"
        )
        previous_environment = mutation_locustfile._runtime_environment
        previous_guard = mutation_locustfile._runtime_guard
        previous_path = mutation_locustfile._semantic_evidence_path
        try:
            mutation_locustfile._runtime_environment = object()
            mutation_locustfile._runtime_guard = object()
            mutation_locustfile._semantic_evidence_path = destination
            with patch.object(
                mutation_locustfile,
                "write_semantic_evidence",
            ) as write_evidence:
                mutation_locustfile.finalize_mutation_runtime_guard(
                    SimpleNamespace(process_exit_code=0)
                )

            write_evidence.assert_called_once_with(destination)
            self.assertIsNone(
                mutation_locustfile._runtime_environment
            )
            self.assertIsNone(mutation_locustfile._runtime_guard)
            self.assertEqual(
                mutation_locustfile._semantic_evidence_path,
                destination,
            )
        finally:
            mutation_locustfile._runtime_environment = previous_environment
            mutation_locustfile._runtime_guard = previous_guard
            mutation_locustfile._semantic_evidence_path = previous_path

    def test_final_stats_snapshot_failure_sets_critical_exit_code(self):
        destination = Path(
            "/tmp/ramp-100_semantic-verifications.json"
        )
        environment = SimpleNamespace(process_exit_code=0)
        previous_path = mutation_locustfile._semantic_evidence_path
        try:
            mutation_locustfile._semantic_evidence_path = destination
            with patch.object(
                mutation_locustfile,
                "write_final_stats_csv",
                side_effect=OSError("synthetic write failure"),
            ):
                with self.assertRaisesRegex(
                    RuntimeError,
                    "final mutation request accounting",
                ):
                    mutation_locustfile.finalize_mutation_stats_accounting(
                        environment
                    )

            self.assertEqual(environment.process_exit_code, 2)
            self.assertIsNone(
                mutation_locustfile._semantic_evidence_path
            )
        finally:
            mutation_locustfile._semantic_evidence_path = previous_path
