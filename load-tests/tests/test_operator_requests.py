import json
import unittest

from cadence_load.assertions import SemanticAssertionError
from cadence_load.users.operator import (
    OPERATOR_REQUESTS,
    REQUEST_BY_KEY,
    assert_operator_response,
    build_operator_path,
)


class FakeResponse:
    def __init__(self, payload, *, status_code=200):
        self.status_code = status_code
        self.url = "http://127.0.0.1:3100/api/occurrences/sync"
        self.headers = {"content-type": "application/json"}
        self.content = json.dumps(payload).encode("utf-8")
        self.text = self.content.decode("utf-8")


class OperatorRequestTests(unittest.TestCase):
    def test_definitions_are_post_only_bounded_and_stably_named(self):
        self.assertEqual(
            {request.key for request in OPERATOR_REQUESTS},
            {"occurrence_sync", "reminder_process"},
        )
        for request in OPERATOR_REQUESTS:
            self.assertEqual(request.method, "POST")
            self.assertTrue(request.name.startswith("SYS-"))
            self.assertNotIn("?", request.name)
            self.assertLessEqual(request.default_limit, request.max_limit)
            self.assertNotIn("secret", repr(request).lower())

    def test_paths_apply_only_integer_limits_within_route_bounds(self):
        request = REQUEST_BY_KEY["occurrence_sync"]

        self.assertEqual(
            build_operator_path(request),
            "/api/occurrences/sync?limit=25",
        )
        self.assertEqual(
            build_operator_path(request, limit=100),
            "/api/occurrences/sync?limit=100",
        )
        for value in (0, 101, 1.5, True):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    build_operator_path(request, limit=value)

    def test_occurrence_sync_response_requires_a_reconciled_count(self):
        response = FakeResponse(
            {
                "ok": True,
                "result": {
                    "checked": 4,
                    "synced": 2,
                    "skipped": 1,
                    "failed": 1,
                },
            }
        )

        self.assertEqual(
            assert_operator_response(
                response,
                REQUEST_BY_KEY["occurrence_sync"],
            ),
            {
                "checked": 4,
                "synced": 2,
                "skipped": 1,
                "failed": 1,
            },
        )

        response = FakeResponse(
            {
                "ok": True,
                "result": {
                    "checked": 4,
                    "synced": 2,
                    "skipped": 1,
                    "failed": 0,
                },
            }
        )
        with self.assertRaises(SemanticAssertionError):
            assert_operator_response(
                response,
                REQUEST_BY_KEY["occurrence_sync"],
            )

    def test_reminder_response_requires_claim_and_outcome_reconciliation(self):
        request = REQUEST_BY_KEY["reminder_process"]
        valid = FakeResponse(
            {
                "ok": True,
                "result": {
                    "checked": 3,
                    "claimed": 2,
                    "skipped": 1,
                    "sent": 1,
                    "failed": 0,
                    "cancelled": 1,
                },
            }
        )
        self.assertEqual(
            assert_operator_response(valid, request)["sent"],
            1,
        )

        invalid = FakeResponse(
            {
                "ok": True,
                "result": {
                    "checked": 3,
                    "claimed": 2,
                    "skipped": 1,
                    "sent": 2,
                    "failed": 1,
                    "cancelled": 0,
                },
            }
        )
        with self.assertRaises(SemanticAssertionError):
            assert_operator_response(invalid, request)

    def test_operator_errors_do_not_echo_response_payloads(self):
        private_marker = "cadence-owner-aaaaaaaaaaaaaaaaaaaa"
        response = FakeResponse(
            {"ok": False, "error": private_marker},
            status_code=500,
        )

        with self.assertRaises(SemanticAssertionError) as raised:
            assert_operator_response(
                response,
                REQUEST_BY_KEY["reminder_process"],
            )

        self.assertNotIn(private_marker, str(raised.exception))


if __name__ == "__main__":
    unittest.main()
