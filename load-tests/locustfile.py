"""Locust entrypoint for the bounded Ticket 063 authenticated protocol proof."""

from locust import HttpUser, between, task
from locust.exception import StopUser

from cadence_load.assertions import (
    SemanticAssertionError,
    assert_protected_document,
    assert_public_document,
    assert_server_action_rejection,
    assert_server_action_success,
    assert_structured_export,
)
from cadence_load.forms import (
    FormDiscoveryError,
    discover_occurrence_status_form,
)
from cadence_load.session import SessionArtifactError, load_protocol_session


class ProtocolSpikeUser(HttpUser):
    """One disposable authenticated user; setup and cleanup remain outside Locust."""

    fixed_count = 1
    wait_time = between(0.05, 0.15)

    def on_start(self) -> None:
        try:
            self.protocol_session = load_protocol_session()
        except SessionArtifactError as error:
            raise RuntimeError(str(error)) from error

        if self.host.rstrip("/") != self.protocol_session.base_url:
            raise RuntimeError(
                "Locust host does not match the local session artifact."
            )

        for name, value in self.protocol_session.cookies.items():
            self.client.cookies.set(name, value)

    @task
    def prove_authenticated_protocol(self) -> None:
        with self.client.get(
            "/terms",
            name="INT-AUTH-003 GET /terms public-document",
            catch_response=True,
        ) as public_response:
            if not self._assert_response(
                public_response,
                lambda: assert_public_document(public_response, marker="Terms"),
            ):
                self._stop()

        with self.client.get(
            "/timeline",
            name="INT-SHELL-001 GET /timeline protected-document",
            catch_response=True,
        ) as timeline_response:
            if not self._assert_response(
                timeline_response,
                lambda: assert_protected_document(
                    timeline_response,
                    marker="Timeline",
                ),
            ):
                self._stop()

            try:
                status_form = discover_occurrence_status_form(
                    timeline_response.text,
                    document_url=timeline_response.url,
                    occurrence_id=self.protocol_session.occurrence_id,
                    expected_status="unresolved",
                    status="completed",
                )
            except FormDiscoveryError as error:
                timeline_response.failure(str(error))
                self._stop()

            timeline_url = timeline_response.url

        with self.client.get(
            "/api/export/json?range=30&include_archived=0&include_notes=0",
            name="INT-EXPORT-005 GET /api/export/json structured-export",
            catch_response=True,
        ) as export_response:
            if not self._assert_response(
                export_response,
                lambda: assert_structured_export(
                    export_response,
                    export_format="json",
                ),
            ):
                self._stop()

        with self.client.post(
            status_form.action,
            files=self._multipart_fields(status_form.fields),
            headers=self._action_headers(timeline_url),
            name="INT-TIMELINE-005 POST /timeline server-action",
            catch_response=True,
        ) as action_response:
            if not self._assert_response(
                action_response,
                lambda: assert_server_action_success(action_response),
            ):
                self._stop()

        with self.client.post(
            status_form.action,
            files=self._multipart_fields(status_form.fields),
            headers=self._action_headers(timeline_url),
            name="INT-TIMELINE-005 POST /timeline stale-rejection",
            catch_response=True,
        ) as stale_response:
            if not self._assert_response(
                stale_response,
                lambda: assert_server_action_rejection(stale_response),
            ):
                self._stop()

        self._stop()

    def _assert_response(self, response, assertion) -> bool:
        try:
            assertion()
        except SemanticAssertionError as error:
            response.failure(str(error))
            return False

        response.success()
        return True

    def _action_headers(self, referer: str) -> dict[str, str]:
        return {
            "Accept": "text/html,application/xhtml+xml",
            "Origin": self.protocol_session.base_url,
            "Referer": referer,
            "Sec-Fetch-Site": "same-origin",
        }

    @staticmethod
    def _multipart_fields(
        fields: tuple[tuple[str, str], ...],
    ) -> list[tuple[str, tuple[None, str]]]:
        return [(name, (None, value)) for name, value in fields]

    def _stop(self) -> None:
        runner = self.environment.runner
        if runner is not None:
            runner.quit()
        raise StopUser()
