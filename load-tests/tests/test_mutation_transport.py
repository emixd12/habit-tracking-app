import unittest
from types import SimpleNamespace

from locust.clients import CatchResponseError
from locust.exception import RescheduleTask, StopUser
from requests.exceptions import ConnectionError

import mutation_locustfile
from cadence_load.actions import (
    AuthenticatedActionUser,
    RenderedActionForm,
)
from cadence_load.auth import IdentitySelectors, LoadIdentity
from cadence_load.data import REQUEST_BY_KEY


OWNER_MARKER = "cadence-owner-aaaaaaaaaaaaaaaaaaaa"
FORBIDDEN_MARKER = "cadence-owner-bbbbbbbbbbbbbbbbbbbb"
BASE_URL = "http://127.0.0.1:3100"


class FakeResponse:
    def __init__(
        self,
        *,
        status_code: int,
        url: str,
        body: bytes = b"",
        content_type: str = "text/html; charset=utf-8",
        disposition: str = "",
        error: Exception | None = None,
    ) -> None:
        self.status_code = status_code
        self.url = url
        self.content = body
        self.text = body.decode("utf-8", errors="replace")
        self.headers = {
            "content-type": content_type,
            "content-disposition": disposition,
        }
        self.failure_message: object | None = None
        self.success_calls = 0
        if error is not None:
            self.error = error

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def failure(self, message: object) -> None:
        self.failure_message = message

    def success(self) -> None:
        self.success_calls += 1


class FakeClient:
    def __init__(self, response: FakeResponse) -> None:
        self.response = response
        self.get_calls = 0
        self.post_calls = 0

    def get(self, *args, **kwargs) -> FakeResponse:
        self.get_calls += 1
        return self.response

    def post(self, *args, **kwargs) -> FakeResponse:
        self.post_calls += 1
        return self.response


class FakeRunner:
    def __init__(self) -> None:
        self.quit_calls = 0

    def quit(self) -> None:
        self.quit_calls += 1


class ActionUserHarness:
    _fail_and_stop = AuthenticatedActionUser._fail_and_stop
    _fail_and_reschedule = AuthenticatedActionUser._fail_and_reschedule

    def __init__(self, response: FakeResponse) -> None:
        self.client = FakeClient(response)
        self.environment = SimpleNamespace(
            process_exit_code=0,
            runner=FakeRunner(),
        )
        self.base_url = BASE_URL
        self._identity = LoadIdentity(
            cookies={},
            cohort="typical_daily",
            selectors=IdentitySelectors(
                behavior_id=None,
                local_date=None,
                owner_marker=OWNER_MARKER,
                forbidden_marker=FORBIDDEN_MARKER,
            ),
        )

    def required_identity(self) -> LoadIdentity:
        return self._identity


class MutationTransportToleranceTests(unittest.TestCase):
    def test_protected_get_transport_failure_reschedules_without_quitting(self):
        response = FakeResponse(
            status_code=0,
            url=f"{BASE_URL}/timeline",
        )
        user = ActionUserHarness(response)

        with self.assertRaises(RescheduleTask):
            AuthenticatedActionUser.protected_document(
                user,
                REQUEST_BY_KEY["timeline"],
            )

        self._assert_rescheduled_failure(user, response)
        self.assertEqual(user.client.get_calls, 1)

    def test_structured_export_get_transport_failure_reschedules_without_quitting(
        self,
    ):
        response = FakeResponse(
            status_code=200,
            url=f"{BASE_URL}/api/export/json",
            error=ConnectionError("synthetic transport failure"),
        )
        user = ActionUserHarness(response)

        with self.assertRaises(RescheduleTask):
            AuthenticatedActionUser.structured_export(
                user,
                REQUEST_BY_KEY["export_json"],
            )

        self._assert_rescheduled_failure(user, response)
        self.assertEqual(user.client.get_calls, 1)
        self.assertIs(response.failure_message, response.error)

    def test_protected_get_semantic_failures_still_abort_the_stage(self):
        cases = {
            "unauthorized": FakeResponse(
                status_code=401,
                url=f"{BASE_URL}/timeline",
            ),
            "rate_limited": FakeResponse(
                status_code=429,
                url=f"{BASE_URL}/timeline",
            ),
            "invalid_content": FakeResponse(
                status_code=200,
                url=f"{BASE_URL}/timeline",
                body=b"<html><h1>Timeline</h1></html>",
            ),
            "owner_mismatch": FakeResponse(
                status_code=200,
                url=f"{BASE_URL}/timeline",
                body=(
                    "<html><h1>Timeline</h1>"
                    "Open Needs decision "
                    f"{FORBIDDEN_MARKER}</html>"
                ).encode(),
            ),
        }

        for name, response in cases.items():
            with self.subTest(name=name):
                user = ActionUserHarness(response)

                with self.assertRaises(StopUser):
                    AuthenticatedActionUser.protected_document(
                        user,
                        REQUEST_BY_KEY["timeline"],
                    )

                self._assert_aborted_failure(user, response)

    def test_structured_export_semantic_failure_still_aborts_the_stage(self):
        response = FakeResponse(
            status_code=200,
            url=f"{BASE_URL}/api/export/json",
            body=b"{}",
            content_type="application/json",
            disposition='attachment; filename="cadence.json"',
        )
        user = ActionUserHarness(response)

        with self.assertRaises(StopUser):
            AuthenticatedActionUser.structured_export(
                user,
                REQUEST_BY_KEY["export_json"],
            )

        self._assert_aborted_failure(user, response)

    def test_server_action_post_transport_failure_still_aborts_the_stage(self):
        response = self._transport_response("/timeline")
        user = ActionUserHarness(response)
        form = RenderedActionForm(
            action=f"{BASE_URL}/timeline",
            fields=(("$ACTION_REF_1", ""),),
        )

        with self.assertRaises(StopUser):
            AuthenticatedActionUser.submit_action(
                user,
                form,
                referer=f"{BASE_URL}/timeline",
                name="INT-TIMELINE-005 POST /timeline server-action",
                success_marker="Occurrence updated.",
            )

        self._assert_aborted_failure(user, response)
        self.assertEqual(user.client.post_calls, 1)

    def test_runtime_guard_receives_underlying_transport_exception(self):
        transport_error = ConnectionError(
            "connection refused by synthetic database"
        )
        response = SimpleNamespace(
            status_code=0,
            error=transport_error,
        )

        class RecordingGuard:
            def __init__(self):
                self.error = None

            def observe_request(self, **observation):
                self.error = observation["error"]
                return SimpleNamespace(abort=False, reason=None)

        guard = RecordingGuard()
        environment = SimpleNamespace(
            runner=SimpleNamespace(user_count=1),
            stats=SimpleNamespace(
                total=SimpleNamespace(current_rps=1.0)
            ),
        )
        previous_guard = mutation_locustfile._runtime_guard
        previous_environment = mutation_locustfile._runtime_environment
        try:
            mutation_locustfile._runtime_guard = guard
            mutation_locustfile._runtime_environment = environment
            mutation_locustfile.enforce_mutation_runtime_gates(
                "GET",
                "INT-SHELL-001 GET /timeline protected-document",
                response=response,
                exception=CatchResponseError(
                    "Protected document returned unexpected HTTP status 0."
                ),
            )
        finally:
            mutation_locustfile._runtime_guard = previous_guard
            mutation_locustfile._runtime_environment = previous_environment

        self.assertIs(guard.error, transport_error)

    def _transport_response(self, path: str) -> FakeResponse:
        return FakeResponse(
            status_code=0,
            url=f"{BASE_URL}{path}",
            error=ConnectionError("synthetic transport failure"),
        )

    def _assert_rescheduled_failure(
        self,
        user: ActionUserHarness,
        response: FakeResponse,
    ) -> None:
        self.assertIsNotNone(response.failure_message)
        self.assertEqual(response.success_calls, 0)
        self.assertEqual(user.environment.process_exit_code, 0)
        self.assertEqual(user.environment.runner.quit_calls, 0)

    def _assert_aborted_failure(
        self,
        user: ActionUserHarness,
        response: FakeResponse,
    ) -> None:
        self.assertIsNotNone(response.failure_message)
        self.assertEqual(response.success_calls, 0)
        self.assertEqual(user.environment.process_exit_code, 2)
        self.assertEqual(user.environment.runner.quit_calls, 1)


if __name__ == "__main__":
    unittest.main()
