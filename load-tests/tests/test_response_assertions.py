import json
import sys
import unittest
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from cadence_load.assertions import (  # noqa: E402
    SemanticAssertionError,
    assert_protected_document,
    assert_public_document,
    assert_server_action_rejection,
    assert_server_action_success,
    assert_structured_export,
)


@dataclass
class FakeResponse:
    status_code: int
    url: str
    headers: dict[str, str]
    content: bytes

    @property
    def text(self) -> str:
        return self.content.decode("utf-8")


class ResponseAssertionTests(unittest.TestCase):
    def test_accepts_semantic_public_document(self):
        response = FakeResponse(
            200,
            "http://127.0.0.1:3100/terms",
            {"content-type": "text/html; charset=utf-8"},
            b"<main><h1>Terms</h1></main>",
        )

        assert_public_document(response, marker="Terms")

    def test_rejects_login_document_after_redirect_for_protected_page(self):
        response = FakeResponse(
            200,
            "http://127.0.0.1:3100/login?next=%2Ftimeline",
            {"content-type": "text/html; charset=utf-8"},
            b"<button>Continue with Google</button>",
        )

        with self.assertRaisesRegex(
            SemanticAssertionError,
            "login route",
        ):
            assert_protected_document(response, marker="Needs decision")

    def test_accepts_semantic_full_json_export(self):
        body = json.dumps(
            {
                "profile": {},
                "categories": [],
                "behaviors": [],
                "occurrences": [],
                "status_events": [],
            }
        ).encode()
        response = FakeResponse(
            200,
            "http://127.0.0.1:3100/api/export/json",
            {
                "content-type": "application/json",
                "content-disposition": 'attachment; filename="cadence.json"',
            },
            body,
        )

        assert_structured_export(response, export_format="json")

    def test_rejects_status_only_export_success(self):
        response = FakeResponse(
            200,
            "http://127.0.0.1:3100/api/export/json",
            {"content-type": "application/json"},
            b"{}",
        )

        with self.assertRaises(SemanticAssertionError):
            assert_structured_export(response, export_format="json")

    def test_checks_action_success_and_stale_rejection_markers(self):
        success = FakeResponse(
            200,
            "http://127.0.0.1:3100/timeline",
            {"content-type": "text/x-component"},
            b'1:{"message":"Occurrence updated."}',
        )
        rejected = FakeResponse(
            200,
            "http://127.0.0.1:3100/timeline",
            {"content-type": "text/x-component"},
            b'1:{"message":"Occurrence status changed. Review the latest status and try again."}',
        )

        assert_server_action_success(success)
        assert_server_action_rejection(rejected)


if __name__ == "__main__":
    unittest.main()
