"""Coordinated same-account status contention with independent sessions."""

from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import Literal

from gevent import joinall, spawn
from gevent.event import Event
from locust import HttpUser, between, task
from locust.clients import HttpSession
from locust.exception import StopUser

from cadence_load.actions import (
    ActionProtocolError,
    OccurrenceActionSurface,
    RenderedActionForm,
    action_headers,
    assert_action_success,
    assert_occurrence_surface_state,
    discover_occurrence_action_surface,
    multipart_action_fields,
)
from cadence_load.assertions import (
    ResponseLike,
    SemanticAssertionError,
    assert_server_action_rejection,
    assert_server_action_success,
)
from cadence_load.auth import (
    ContentionLease,
    ContentionRuntime,
    IdentityArtifactError,
    IdentitySelectors,
    LoadIdentity,
    assert_locust_host,
    get_shared_contention_runtime,
)
from cadence_load.data import REQUEST_BY_KEY, assert_protected_read_response
from cadence_load.semantic_evidence import (
    MutationReceipt,
    SemanticEvidenceError,
    record_semantic_verification,
    record_successful_submission,
)


COMPLETED_REQUEST_NAME = (
    "INT-TIMELINE-005 POST /timeline server-action"
)
NOT_COMPLETED_REQUEST_NAME = (
    "INT-TIMELINE-006 POST /timeline server-action"
)
CLEAR_REQUEST_NAME = "INT-TIMELINE-007 POST /timeline server-action"
SUCCESS_MARKER = "Occurrence updated."
STALE_MARKER = (
    "Occurrence status changed. Review the latest status and try again."
)
_REQUEST_NAME_BY_STATUS = MappingProxyType(
    {
        "completed": COMPLETED_REQUEST_NAME,
        "not_completed": NOT_COMPLETED_REQUEST_NAME,
        "unresolved": CLEAR_REQUEST_NAME,
    }
)


@dataclass(frozen=True)
class ContentionSubmissionOutcome:
    """Privacy-safe semantic result for one competing status submission."""

    requested_status: str
    result: Literal["success", "stale"]


@dataclass(frozen=True, repr=False)
class CompetingStatusForms:
    """Two rendered forms that share one stale expected-status snapshot."""

    completed: RenderedActionForm
    not_completed: RenderedActionForm


def classify_contention_response(
    response: ResponseLike,
    *,
    requested_status: str,
) -> ContentionSubmissionOutcome:
    """Accept exactly one documented Server Action result vocabulary."""

    if requested_status not in {"completed", "not_completed"}:
        raise ActionProtocolError(
            "A competing status submission used an invalid stored status."
        )
    content_type = _response_header(response, "content-type").lower()
    if (
        "text/x-component" not in content_type
        and "text/html" not in content_type
    ):
        raise ActionProtocolError(
            "Competing Server Action returned an unexpected content type."
        )
    if "Continue with Google" in response.text:
        raise ActionProtocolError(
            "Competing Server Action resolved to login content."
        )

    has_success = SUCCESS_MARKER in response.text
    has_stale = STALE_MARKER in response.text
    if has_success == has_stale:
        raise ActionProtocolError(
            "Competing Server Action returned an ambiguous semantic result."
        )
    if has_success:
        assert_server_action_success(response)
        return ContentionSubmissionOutcome(
            requested_status=requested_status,
            result="success",
        )

    assert_server_action_rejection(response)
    return ContentionSubmissionOutcome(
        requested_status=requested_status,
        result="stale",
    )


def prepare_competing_status_forms(
    primary: OccurrenceActionSurface,
    secondary: OccurrenceActionSurface,
) -> CompetingStatusForms:
    """Require two independently rendered Unresolved action surfaces."""

    if (
        primary.current_status != "unresolved"
        or secondary.current_status != "unresolved"
    ):
        raise ActionProtocolError(
            "Competing status forms were not prepared from Unresolved."
        )
    completed = primary.status_forms.get("completed")
    not_completed = secondary.status_forms.get("not_completed")
    if completed is None or not_completed is None:
        raise ActionProtocolError(
            "A contention session lacked a required status action."
        )
    return CompetingStatusForms(
        completed=completed,
        not_completed=not_completed,
    )


def assert_competing_status_outcomes(
    outcomes: tuple[ContentionSubmissionOutcome, ...],
) -> str:
    """Require one transaction winner and one documented stale loser."""

    if (
        len(outcomes) != 2
        or {outcome.requested_status for outcome in outcomes}
        != {"completed", "not_completed"}
        or [outcome.result for outcome in outcomes].count("success") != 1
        or [outcome.result for outcome in outcomes].count("stale") != 1
    ):
        raise ActionProtocolError(
            "Competing writes did not produce one success and one stale result."
        )
    return next(
        outcome.requested_status
        for outcome in outcomes
        if outcome.result == "success"
    )


def assert_converged_status_surfaces(
    primary: OccurrenceActionSurface,
    secondary: OccurrenceActionSurface,
    *,
    expected_status: str,
) -> None:
    """Require both independent sessions to read the same stored result."""

    assert_occurrence_surface_state(
        primary,
        expected_status=expected_status,
    )
    assert_occurrence_surface_state(
        secondary,
        expected_status=expected_status,
    )


class CadenceContentionUser(HttpUser):
    """Lease one account's exact cookie pair and race guarded status writes."""

    wait_time = between(2.0, 5.0)

    def on_start(self) -> None:
        self._runtime: ContentionRuntime | None = None
        self._lease: ContentionLease | None = None
        self._secondary_client: HttpSession | None = None
        self._assertion_identity: LoadIdentity | None = None
        try:
            runtime = get_shared_contention_runtime()
            configured_host = self.host or getattr(
                self.environment,
                "host",
                None,
            )
            assert_locust_host(configured_host, runtime.artifact.base_url)
            lease = runtime.pool.acquire()
            self._runtime = runtime
            self._lease = lease

            self.client.cookies.clear()
            _set_cookies(self.client, lease.session.primary_cookies)
            secondary = HttpSession(
                base_url=runtime.artifact.base_url,
                request_event=self.environment.events.request,
                user=self,
                pool_manager=self.pool_manager,
            )
            secondary.trust_env = False
            _set_cookies(secondary, lease.session.secondary_cookies)
            self._secondary_client = secondary
            self._assertion_identity = LoadIdentity(
                cookies=lease.session.primary_cookies,
                cohort=lease.session.cohort,
                selectors=IdentitySelectors(
                    behavior_id=None,
                    local_date=None,
                    owner_marker=lease.session.selectors.owner_marker,
                    forbidden_marker=lease.session.selectors.forbidden_marker,
                ),
            )
        except (IdentityArtifactError, ActionProtocolError) as error:
            self._release_resources()
            self._abort_start(error)

    def on_stop(self) -> None:
        self._release_resources()

    @task
    def task_same_account_contention(self) -> None:
        try:
            primary, secondary = self._load_pair()
            if primary.current_status != secondary.current_status:
                raise ActionProtocolError(
                    "Contention sessions observed different stored statuses."
                )
            if primary.current_status != "unresolved":
                receipt = self._reset_to_unresolved(primary)
                primary, secondary = self._load_pair()
                assert_converged_status_surfaces(
                    primary,
                    secondary,
                    expected_status="unresolved",
                )
                record_semantic_verification(receipt)

            forms = prepare_competing_status_forms(primary, secondary)
            winner, receipts = self._submit_competing_pair(forms)
            refreshed_primary, refreshed_secondary = self._load_pair()
            assert_converged_status_surfaces(
                refreshed_primary,
                refreshed_secondary,
                expected_status=winner,
            )
            for receipt in receipts:
                record_semantic_verification(receipt)
        except (ActionProtocolError, SemanticEvidenceError) as error:
            self._abort_task(error)

    def _load_pair(
        self,
    ) -> tuple[OccurrenceActionSurface, OccurrenceActionSurface]:
        secondary = self._required_secondary_client()
        return (
            self._load_surface(self.client),
            self._load_surface(secondary),
        )

    def _load_surface(self, client: HttpSession) -> OccurrenceActionSurface:
        lease = self._required_lease()
        identity = self._required_assertion_identity()
        request = REQUEST_BY_KEY["behaviors_selected_day"]
        with client.get(
            "/behaviors",
            params={
                "range": 30,
                "behavior": lease.session.selectors.behavior_id,
                "day": lease.session.selectors.local_date,
            },
            name=request.name,
            catch_response=True,
        ) as response:
            try:
                assert_protected_read_response(
                    response,
                    request,
                    identity=identity,
                )
                surface = discover_occurrence_action_surface(
                    response.text,
                    document_url=response.url,
                    occurrence_id=lease.session.selectors.occurrence_id,
                )
            except SemanticAssertionError as error:
                response.failure(str(error))
                self._abort_task(error)
            response.success()
            return surface

    def _reset_to_unresolved(
        self,
        surface: OccurrenceActionSurface,
    ) -> MutationReceipt:
        form = surface.status_forms.get("unresolved")
        if form is None:
            raise ActionProtocolError(
                "Resolved contention state lacked Clear decision."
            )
        return self._submit_expected_success(
            self.client,
            form,
            requested_status="unresolved",
        )

    def _submit_expected_success(
        self,
        client: HttpSession,
        form: RenderedActionForm,
        *,
        requested_status: str,
    ) -> MutationReceipt:
        request_name = _REQUEST_NAME_BY_STATUS.get(requested_status)
        if request_name is None:
            raise ActionProtocolError(
                "A status submission used an invalid stored status."
            )
        with client.post(
            form.action,
            files=multipart_action_fields(form),
            headers=action_headers(self.base_url, self._contention_url),
            name=request_name,
            catch_response=True,
        ) as response:
            try:
                assert_action_success(
                    response,
                    marker=SUCCESS_MARKER,
                )
            except SemanticAssertionError as error:
                response.failure(str(error))
                self._abort_task(error)
            response.success()
        return record_successful_submission(request_name)

    @property
    def _contention_url(self) -> str:
        selectors = self._required_lease().session.selectors
        return (
            f"{self.base_url}/behaviors?range=30"
            f"&behavior={selectors.behavior_id}"
            f"&day={selectors.local_date}"
        )

    def _submit_competing_pair(
        self,
        forms: CompetingStatusForms,
    ) -> tuple[str, tuple[MutationReceipt, ...]]:
        secondary = self._required_secondary_client()
        gate = Event()
        submissions = (
            spawn(
                self._submit_after_gate,
                gate,
                self.client,
                forms.completed,
                "completed",
            ),
            spawn(
                self._submit_after_gate,
                gate,
                secondary,
                forms.not_completed,
                "not_completed",
            ),
        )
        gate.set()
        joinall(submissions)
        if any(submission.exception is not None for submission in submissions):
            raise ActionProtocolError(
                "A competing status submission failed semantic validation."
            )
        results = tuple(submission.value for submission in submissions)
        if not all(
            isinstance(result, tuple)
            and len(result) == 2
            and isinstance(result[0], ContentionSubmissionOutcome)
            and isinstance(result[1], MutationReceipt)
            for result in results
        ):
            raise ActionProtocolError(
                "A competing status submission returned an invalid result."
            )
        outcomes = tuple(result[0] for result in results)
        receipts = tuple(result[1] for result in results)
        return assert_competing_status_outcomes(outcomes), receipts

    def _submit_after_gate(
        self,
        gate: Event,
        client: HttpSession,
        form: RenderedActionForm,
        requested_status: str,
    ) -> tuple[ContentionSubmissionOutcome, MutationReceipt]:
        gate.wait()
        request_name = _REQUEST_NAME_BY_STATUS[requested_status]
        with client.post(
            form.action,
            files=multipart_action_fields(form),
            headers=action_headers(self.base_url, self.timeline_url),
            name=request_name,
            catch_response=True,
        ) as response:
            try:
                outcome = classify_contention_response(
                    response,
                    requested_status=requested_status,
                )
            except SemanticAssertionError as error:
                response.failure(str(error))
                raise
            response.success()
        return outcome, record_successful_submission(request_name)

    @property
    def base_url(self) -> str:
        runtime = self._runtime
        if runtime is None:
            raise ActionProtocolError(
                "The contention user has no authenticated runtime."
            )
        return runtime.artifact.base_url

    @property
    def timeline_url(self) -> str:
        return f"{self.base_url}/timeline"

    def _required_lease(self) -> ContentionLease:
        if self._lease is None:
            raise ActionProtocolError(
                "The contention user has no authenticated session pair."
            )
        return self._lease

    def _required_secondary_client(self) -> HttpSession:
        if self._secondary_client is None:
            raise ActionProtocolError(
                "The contention user lacks its independent secondary session."
            )
        return self._secondary_client

    def _required_assertion_identity(self) -> LoadIdentity:
        if self._assertion_identity is None:
            raise ActionProtocolError(
                "The contention user lacks its ownership assertion contract."
            )
        return self._assertion_identity

    def _release_resources(self) -> None:
        secondary = self._secondary_client
        self._secondary_client = None
        if secondary is not None:
            secondary.cookies.clear()
            secondary.close()
        self.client.cookies.clear()
        lease = self._lease
        runtime = self._runtime
        self._lease = None
        self._runtime = None
        self._assertion_identity = None
        if lease is not None and runtime is not None:
            runtime.pool.release(lease)

    def _abort_task(self, error: Exception) -> None:
        self.environment.process_exit_code = 2
        runner = self.environment.runner
        if runner is not None:
            runner.quit()
        raise StopUser() from error

    def _abort_start(self, error: Exception) -> None:
        self.environment.process_exit_code = 2
        runner = self.environment.runner
        if runner is not None:
            runner.quit()
        raise RuntimeError(str(error)) from error


def _set_cookies(
    client: HttpSession,
    cookies,
) -> None:
    client.cookies.clear()
    for name, value in cookies.items():
        client.cookies.set(name, value)


def _response_header(response: ResponseLike, name: str) -> str:
    for header_name, value in response.headers.items():
        if header_name.lower() == name:
            return value
    return ""
