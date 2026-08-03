import io
import json
import unittest
import zipfile
from collections import Counter
from pathlib import Path

from cadence_load.assertions import (
    CriticalSemanticAssertionError,
    SemanticAssertionError,
)
from cadence_load.auth import IdentitySelectors, LoadIdentity
from cadence_load.data import (
    ALL_READ_REQUESTS,
    EXPORT_REQUESTS,
    PROTECTED_DOCUMENT_REQUESTS,
    PUBLIC_DOCUMENT_REQUESTS,
    assert_export_response,
    assert_protected_read_response,
    assert_public_read_response,
    export_path_for_cohort,
    load_profile_catalog,
)
from cadence_load.users.public import anonymous_cookie_jar
from cadence_load.users.reader import CadenceReadUser


class FakeResponse:
    def __init__(
        self,
        *,
        body=b"",
        content_type="text/html; charset=utf-8",
        disposition="",
        status_code=200,
        url="http://127.0.0.1:3000/timeline",
    ):
        self.status_code = status_code
        self.url = url
        self.headers = {
            "content-type": content_type,
            "content-disposition": disposition,
        }
        self.content = body
        self.text = body.decode("utf-8", errors="replace")
        self.failure_message = None
        self.success_calls = 0

    def failure(self, message):
        self.failure_message = message

    def success(self):
        self.success_calls += 1


class FakeCookieJar(dict):
    def copy(self):
        return FakeCookieJar(self)


class FakeRunner:
    def __init__(self):
        self.quit_calls = 0

    def quit(self):
        self.quit_calls += 1


class FakeEnvironment:
    def __init__(self, runner):
        self.process_exit_code = 0
        self.runner = runner


class FakeReadUser:
    def __init__(self, environment):
        self.environment = environment


class ReadWorkloadTests(unittest.TestCase):
    OWNER_MARKER = "cadence-owner-aaaaaaaaaaaaaaaaaaaa"
    FORBIDDEN_MARKER = "cadence-owner-bbbbbbbbbbbbbbbbbbbb"
    UNLISTED_MARKER = "cadence-owner-cccccccccccccccccccc"

    def test_every_read_request_is_get_only_and_has_stable_private_names(self):
        self.assertTrue(ALL_READ_REQUESTS)
        for request in ALL_READ_REQUESTS:
            self.assertEqual(request.method, "GET")
            self.assertTrue(request.name.startswith("INT-"))
            self.assertNotIn(":behavior_id", request.name)
            self.assertNotIn(":local_date", request.name)
            self.assertFalse(request.path.startswith("/api/reminders/"))
            self.assertFalse(request.path.startswith("/api/push/"))
            self.assertFalse(request.path.startswith("/api/occurrences/"))

        self.assertEqual(len(PUBLIC_DOCUMENT_REQUESTS), 4)
        self.assertEqual(len(PROTECTED_DOCUMENT_REQUESTS), 7)
        self.assertEqual(len(EXPORT_REQUESTS), 4)

    def test_read_specs_match_the_companion_manifest(self):
        manifest_path = (
            Path(__file__).resolve().parents[1]
            / "scenarios"
            / "interaction-map.json"
        )
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest_requests = {
            (request["name"], request["route"], request["method"])
            for entry in manifest["entries"]
            for request in entry.get("requests", [])
        }

        for request in ALL_READ_REQUESTS:
            self.assertIn(
                (request.name, request.path, request.method),
                manifest_requests,
            )

    def test_user_task_weights_match_profile_and_every_vu_is_identity_owning(self):
        catalog = load_profile_catalog()
        actual_weights = Counter(
            task.__name__ for task in CadenceReadUser.tasks
        )
        expected_weights = {
            f"task_{key}": weight
            for key, weight in catalog.task_weights.items()
        }

        self.assertEqual(actual_weights, expected_weights)
        self.assertTrue(hasattr(CadenceReadUser, "on_start"))
        self.assertTrue(hasattr(CadenceReadUser, "on_stop"))

    def test_public_and_protected_documents_require_semantic_headings(self):
        terms = next(
            request
            for request in PUBLIC_DOCUMENT_REQUESTS
            if request.key == "public_terms"
        )
        timeline = next(
            request
            for request in PROTECTED_DOCUMENT_REQUESTS
            if request.key == "timeline"
        )

        assert_public_read_response(
            FakeResponse(
                body=b"<html><h1>Terms</h1></html>",
                url="http://127.0.0.1:3000/terms",
            ),
            terms,
        )
        assert_protected_read_response(
            FakeResponse(
                body=(
                    b"<html><h1>Timeline</h1>"
                    b"Open Needs decision "
                    + self.OWNER_MARKER.encode()
                    + b"</html>"
                )
            ),
            timeline,
            identity=self._identity(),
        )

        with self.assertRaises(SemanticAssertionError):
            assert_protected_read_response(
                FakeResponse(
                    body=b"<html><h1>Timeline</h1>Continue with Google</html>",
                    url="http://127.0.0.1:3000/login",
                ),
                timeline,
                identity=self._identity(),
            )
        with self.assertRaises(SemanticAssertionError):
            assert_protected_read_response(
                FakeResponse(body=b"<html>Timeline</html>"),
                timeline,
                identity=self._identity(),
            )

    def test_protected_behavior_pages_enforce_exact_owner_markers(self):
        identity = self._identity()
        owned_behavior_keys = {
            "timeline",
            "timeline_future",
            "behaviors",
            "behaviors_range",
            "behaviors_selected_day",
        }

        for request in PROTECTED_DOCUMENT_REQUESTS:
            if request.key not in owned_behavior_keys:
                continue
            valid_body = (
                f"<html><h1>{request.heading}</h1>"
                f"{request.marker} {self.OWNER_MARKER}</html>"
            ).encode()
            with self.subTest(request=request.key, case="assigned"):
                assert_protected_read_response(
                    FakeResponse(body=valid_body),
                    request,
                    identity=identity,
                )
            with self.subTest(request=request.key, case="foreign"):
                with self.assertRaises(
                    CriticalSemanticAssertionError
                ) as raised:
                    assert_protected_read_response(
                        FakeResponse(
                            body=(
                                valid_body
                                + b" "
                                + self.UNLISTED_MARKER.encode()
                            )
                        ),
                        request,
                        identity=identity,
                    )
                self.assertNotIn(
                    self.UNLISTED_MARKER,
                    str(raised.exception),
                )
            with self.subTest(request=request.key, case="missing"):
                with self.assertRaises(SemanticAssertionError):
                    assert_protected_read_response(
                        FakeResponse(
                            body=(
                                f"<html><h1>{request.heading}</h1>"
                                f"{request.marker}</html>"
                            ).encode()
                        ),
                        request,
                        identity=identity,
                    )

    def test_empty_protected_pages_reject_every_owner_marker(self):
        timeline = next(
            request
            for request in PROTECTED_DOCUMENT_REQUESTS
            if request.key == "timeline"
        )
        identity = self._identity(cohort="empty")
        body = b"<html><h1>Timeline</h1>Open Needs decision</html>"

        assert_protected_read_response(
            FakeResponse(body=body),
            timeline,
            identity=identity,
        )
        with self.assertRaises(CriticalSemanticAssertionError):
            assert_protected_read_response(
                FakeResponse(body=body + self.OWNER_MARKER.encode()),
                timeline,
                identity=identity,
            )

    def test_marker_free_protected_pages_reject_foreign_but_not_missing_owner(self):
        identity = self._identity()
        for request_key in ("export_page", "settings"):
            request = next(
                request
                for request in PROTECTED_DOCUMENT_REQUESTS
                if request.key == request_key
            )
            body = (
                f"<html><h1>{request.heading}</h1>{request.marker}</html>"
            ).encode()

            with self.subTest(request=request.key, case="missing-allowed"):
                assert_protected_read_response(
                    FakeResponse(body=body),
                    request,
                    identity=identity,
                )
            with self.subTest(request=request.key, case="foreign-rejected"):
                with self.assertRaises(CriticalSemanticAssertionError):
                    assert_protected_read_response(
                        FakeResponse(
                            body=body + self.UNLISTED_MARKER.encode()
                        ),
                        request,
                        identity=identity,
                    )

    def test_public_protected_and_export_5xx_failures_are_distinct(self):
        terms = next(
            request
            for request in PUBLIC_DOCUMENT_REQUESTS
            if request.key == "public_terms"
        )
        timeline = next(
            request
            for request in PROTECTED_DOCUMENT_REQUESTS
            if request.key == "timeline"
        )
        csv_export = next(
            request
            for request in EXPORT_REQUESTS
            if request.export_format == "csv"
        )
        assertions = (
            lambda: assert_public_read_response(
                FakeResponse(status_code=500),
                terms,
            ),
            lambda: assert_protected_read_response(
                FakeResponse(status_code=500),
                timeline,
                identity=self._identity(),
            ),
            lambda: assert_export_response(
                FakeResponse(status_code=500),
                csv_export,
                owner_marker=self.OWNER_MARKER,
                forbidden_marker=self.FORBIDDEN_MARKER,
                require_owner_marker=True,
            ),
        )

        for assertion in assertions:
            with self.subTest(assertion=assertion):
                with self.assertRaises(SemanticAssertionError) as raised:
                    assertion()
                self.assertIn("5xx", str(raised.exception))

    def test_non_5xx_status_failure_records_the_safe_status_code(self):
        timeline = next(
            request
            for request in PROTECTED_DOCUMENT_REQUESTS
            if request.key == "timeline"
        )

        with self.assertRaisesRegex(
            SemanticAssertionError,
            r"status 429",
        ):
            assert_protected_read_response(
                FakeResponse(status_code=429),
                timeline,
                identity=self._identity(),
            )

    def test_noncritical_semantic_failure_is_left_to_the_ratio_gate(self):
        response = FakeResponse()
        runner = FakeRunner()
        environment = FakeEnvironment(runner)
        user = FakeReadUser(environment)

        CadenceReadUser._apply_assertion(
            user,
            response,
            lambda: self._raise_noncritical_semantic_failure(),
        )

        self.assertEqual(
            response.failure_message,
            "Protected document returned unexpected HTTP status 429.",
        )
        self.assertEqual(response.success_calls, 0)
        self.assertEqual(environment.process_exit_code, 0)
        self.assertEqual(runner.quit_calls, 0)

    def test_critical_semantic_failure_marks_request_and_stops_the_runner(self):
        response = FakeResponse()
        runner = FakeRunner()
        environment = FakeEnvironment(runner)
        user = FakeReadUser(environment)

        CadenceReadUser._apply_assertion(
            user,
            response,
            lambda: self._raise_critical_semantic_failure(),
        )

        self.assertEqual(
            response.failure_message,
            "Protected document returned an unexpected 5xx response.",
        )
        self.assertEqual(response.success_calls, 0)
        self.assertEqual(environment.process_exit_code, 2)
        self.assertEqual(runner.quit_calls, 1)

    def test_successful_semantic_assertion_does_not_stop_the_runner(self):
        response = FakeResponse()
        runner = FakeRunner()
        environment = FakeEnvironment(runner)
        user = FakeReadUser(environment)

        CadenceReadUser._apply_assertion(user, response, lambda: None)

        self.assertIsNone(response.failure_message)
        self.assertEqual(response.success_calls, 1)
        self.assertEqual(environment.process_exit_code, 0)
        self.assertEqual(runner.quit_calls, 0)

    def test_anonymous_cookie_helper_restores_identity_even_after_failure(self):
        cookies = FakeCookieJar({"sb-session": "private-cookie"})

        with self.assertRaisesRegex(RuntimeError, "request failed"):
            with anonymous_cookie_jar(cookies):
                self.assertEqual(cookies, {})
                cookies["public-cookie"] = "discard-me"
                raise RuntimeError("request failed")

        self.assertEqual(cookies, {"sb-session": "private-cookie"})

    def test_all_export_formats_check_semantics_and_owner_isolation(self):
        payloads = {
            "jsonl": (
                (
                    json.dumps({"type": "behavior", "title": self.OWNER_MARKER})
                    + "\n"
                ).encode(),
                "application/x-ndjson; charset=utf-8",
                'attachment; filename="cadence.jsonl"',
            ),
            "csv": (
                (
                    "local_date,scheduled_for,schedule,behavior_title,category,"
                    "status,status_marked_at,note\n"
                    f"2026-07-29,now,9:00 AM,{self.OWNER_MARKER},General,"
                    "completed,now,\n"
                ).encode(),
                "text/csv; charset=utf-8",
                'attachment; filename="cadence.csv"',
            ),
            "json": (
                json.dumps(
                    {
                        "profile": {},
                        "categories": [],
                        "behaviors": [{"title": self.OWNER_MARKER}],
                        "occurrences": [],
                        "status_events": [],
                    }
                ).encode(),
                "application/json; charset=utf-8",
                'attachment; filename="cadence.json"',
            ),
            "behaviorlog": (
                self._behaviorlog_zip(self.OWNER_MARKER),
                "application/zip",
                'attachment; filename="cadence.behaviorlog.zip"',
            ),
        }

        for export_format, (body, content_type, disposition) in payloads.items():
            with self.subTest(export_format=export_format):
                spec = next(
                    request
                    for request in EXPORT_REQUESTS
                    if request.export_format == export_format
                )
                assert_export_response(
                    FakeResponse(
                        body=body,
                        content_type=content_type,
                        disposition=disposition,
                    ),
                    spec,
                    owner_marker=self.OWNER_MARKER,
                    forbidden_marker=self.FORBIDDEN_MARKER,
                    require_owner_marker=True,
                )

    def test_export_rejects_adjacent_owner_marker_without_disclosing_it(self):
        spec = next(
            request
            for request in EXPORT_REQUESTS
            if request.export_format == "json"
        )
        response = FakeResponse(
            body=json.dumps(
                {
                    "profile": {},
                    "categories": [],
                    "behaviors": [{"title": self.FORBIDDEN_MARKER}],
                    "occurrences": [],
                    "status_events": [],
                }
            ).encode(),
            content_type="application/json",
            disposition='attachment; filename="cadence.json"',
        )

        with self.assertRaises(CriticalSemanticAssertionError) as raised:
            assert_export_response(
                response,
                spec,
                owner_marker=self.OWNER_MARKER,
                forbidden_marker=self.FORBIDDEN_MARKER,
                require_owner_marker=True,
            )

        self.assertNotIn(self.FORBIDDEN_MARKER, str(raised.exception))
        self.assertNotIn(self.OWNER_MARKER, str(raised.exception))

    def test_export_rejects_any_unassigned_owner_marker(self):
        spec = next(
            request
            for request in EXPORT_REQUESTS
            if request.export_format == "jsonl"
        )
        response = FakeResponse(
            body=(
                json.dumps(
                    {
                        "type": "behavior",
                        "title": (
                            f"{self.OWNER_MARKER} {self.UNLISTED_MARKER}"
                        ),
                    }
                )
                + "\n"
            ).encode(),
            content_type="application/x-ndjson",
            disposition='attachment; filename="cadence.jsonl"',
        )

        with self.assertRaises(CriticalSemanticAssertionError) as raised:
            assert_export_response(
                response,
                spec,
                owner_marker=self.OWNER_MARKER,
                forbidden_marker=self.FORBIDDEN_MARKER,
                require_owner_marker=True,
            )

        self.assertNotIn(self.UNLISTED_MARKER, str(raised.exception))

    def test_export_heavy_uses_full_scope_with_stable_request_names(self):
        for request in EXPORT_REQUESTS:
            with self.subTest(export_format=request.export_format):
                self.assertEqual(
                    export_path_for_cohort(request, "export_heavy"),
                    (
                        request.path.split("?", maxsplit=1)[0]
                        + "?range=all&include_archived=1&include_notes=1"
                    ),
                )
                self.assertEqual(
                    export_path_for_cohort(request, "typical_daily"),
                    request.path,
                )
                self.assertNotIn("range=all", request.name)

    def test_empty_cohort_can_use_format_only_export_assertion(self):
        spec = next(
            request
            for request in EXPORT_REQUESTS
            if request.export_format == "csv"
        )
        assert_export_response(
            FakeResponse(
                body=(
                    b"local_date,scheduled_for,schedule,behavior_title,category,"
                    b"status,status_marked_at,note\n"
                ),
                content_type="text/csv",
                disposition='attachment; filename="cadence.csv"',
            ),
            spec,
            owner_marker=self.OWNER_MARKER,
            forbidden_marker=self.FORBIDDEN_MARKER,
            require_owner_marker=False,
        )

        with self.assertRaises(SemanticAssertionError):
            assert_export_response(
                FakeResponse(
                    body=(
                        b"local_date,scheduled_for,schedule,behavior_title,"
                        b"category,status,status_marked_at,note\n"
                        + self.OWNER_MARKER.encode()
                    ),
                    content_type="text/csv",
                    disposition='attachment; filename="cadence.csv"',
                ),
                spec,
                owner_marker=self.OWNER_MARKER,
                forbidden_marker=self.FORBIDDEN_MARKER,
                require_owner_marker=False,
            )

    @staticmethod
    def _behaviorlog_zip(marker):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", zipfile.ZIP_STORED) as archive:
            archive.writestr(
                "manifest.json",
                json.dumps(
                    {
                        "format": "behaviorlog.bundle",
                        "schema_version": "0.1.0-draft",
                    }
                ),
            )
            archive.writestr(
                "data/behaviors.jsonl",
                json.dumps({"record_type": "behavior", "name": marker}),
            )
        return output.getvalue()

    def _identity(self, *, cohort="typical_daily"):
        return LoadIdentity(
            cookies={},
            cohort=cohort,
            selectors=IdentitySelectors(
                behavior_id=None,
                local_date=None,
                owner_marker=self.OWNER_MARKER,
                forbidden_marker=self.FORBIDDEN_MARKER,
            ),
        )

    @staticmethod
    def _raise_noncritical_semantic_failure():
        raise SemanticAssertionError(
            "Protected document returned unexpected HTTP status 429."
        )

    @staticmethod
    def _raise_critical_semantic_failure():
        raise CriticalSemanticAssertionError(
            "Protected document returned an unexpected 5xx response."
        )


if __name__ == "__main__":
    unittest.main()
