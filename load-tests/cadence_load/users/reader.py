"""One identity-owning Locust user for all public and protected read tasks."""

from __future__ import annotations

import random

from locust import HttpUser, between, task

from cadence_load.assertions import (
    CriticalSemanticAssertionError,
    SemanticAssertionError,
)
from cadence_load.auth import (
    IdentityArtifactError,
    IdentityLease,
    LoadIdentity,
    assert_locust_host,
    get_shared_identity_runtime,
)
from cadence_load.data import (
    BEHAVIOR_RANGE_OPTIONS,
    FUTURE_DAY_OPTIONS,
    REQUEST_BY_KEY,
    ReadRequest,
    assert_export_response,
    assert_protected_read_response,
    assert_public_read_response,
    export_path_for_cohort,
    load_profile_catalog,
    select_read_profile,
)
from cadence_load.users.public import anonymous_cookie_jar


PROFILE_CATALOG = load_profile_catalog()
SELECTED_PROFILE = select_read_profile(PROFILE_CATALOG)
TASK_WEIGHTS = PROFILE_CATALOG.task_weights


class CadenceReadUser(HttpUser):
    """Every active VU owns one ordinary authenticated cookie jar."""

    wait_time = between(*PROFILE_CATALOG.think_time_seconds)

    def on_start(self) -> None:
        self._lease: IdentityLease | None = None
        self._identity: LoadIdentity | None = None
        try:
            runtime = get_shared_identity_runtime(
                cohort_filter=SELECTED_PROFILE.cohort_filter,
            )
            configured_host = self.host or getattr(
                self.environment,
                "host",
                None,
            )
            assert_locust_host(configured_host, runtime.artifact.base_url)
            lease = runtime.pool.acquire()
            self._lease = lease
            self._identity = lease.identity
            self.client.cookies.clear()
            for name, value in lease.identity.cookies.items():
                self.client.cookies.set(name, value)
        except IdentityArtifactError as error:
            self._abort_run(error)

    def on_stop(self) -> None:
        lease = self._lease
        self._lease = None
        self._identity = None
        self.client.cookies.clear()
        if lease is not None:
            runtime = get_shared_identity_runtime(
                cohort_filter=SELECTED_PROFILE.cohort_filter,
            )
            runtime.pool.release(lease)

    @task(TASK_WEIGHTS["public_login"])
    def task_public_login(self) -> None:
        self._request_public(REQUEST_BY_KEY["public_login"])

    @task(TASK_WEIGHTS["public_terms"])
    def task_public_terms(self) -> None:
        self._request_public(REQUEST_BY_KEY["public_terms"])

    @task(TASK_WEIGHTS["public_privacy"])
    def task_public_privacy(self) -> None:
        self._request_public(REQUEST_BY_KEY["public_privacy"])

    @task(TASK_WEIGHTS["public_trust"])
    def task_public_trust(self) -> None:
        self._request_public(REQUEST_BY_KEY["public_trust"])

    @task(TASK_WEIGHTS["timeline"])
    def task_timeline(self) -> None:
        self._request_protected(REQUEST_BY_KEY["timeline"])

    @task(TASK_WEIGHTS["timeline_future"])
    def task_timeline_future(self) -> None:
        self._request_protected(
            REQUEST_BY_KEY["timeline_future"],
            path="/timeline",
            params={"days": random.choice(FUTURE_DAY_OPTIONS)},
        )

    @task(TASK_WEIGHTS["behaviors"])
    def task_behaviors(self) -> None:
        self._request_protected(REQUEST_BY_KEY["behaviors"])

    @task(TASK_WEIGHTS["behaviors_range"])
    def task_behaviors_range(self) -> None:
        self._request_behavior_range()

    @task(TASK_WEIGHTS["behaviors_selected_day"])
    def task_behaviors_selected_day(self) -> None:
        identity = self._required_identity()
        selectors = identity.selectors
        if selectors.behavior_id is None or selectors.local_date is None:
            self._request_behavior_range()
            return

        self._request_protected(
            REQUEST_BY_KEY["behaviors_selected_day"],
            path="/behaviors",
            params={
                "range": 30,
                "behavior": selectors.behavior_id,
                "day": selectors.local_date,
            },
        )

    @task(TASK_WEIGHTS["export_page"])
    def task_export_page(self) -> None:
        self._request_protected(REQUEST_BY_KEY["export_page"])

    @task(TASK_WEIGHTS["settings"])
    def task_settings(self) -> None:
        self._request_protected(REQUEST_BY_KEY["settings"])

    @task(TASK_WEIGHTS["export_jsonl"])
    def task_export_jsonl(self) -> None:
        self._request_export(REQUEST_BY_KEY["export_jsonl"])

    @task(TASK_WEIGHTS["export_csv"])
    def task_export_csv(self) -> None:
        self._request_export(REQUEST_BY_KEY["export_csv"])

    @task(TASK_WEIGHTS["export_json"])
    def task_export_json(self) -> None:
        self._request_export(REQUEST_BY_KEY["export_json"])

    @task(TASK_WEIGHTS["export_behaviorlog"])
    def task_export_behaviorlog(self) -> None:
        self._request_export(REQUEST_BY_KEY["export_behaviorlog"])

    def _request_public(self, request: ReadRequest) -> None:
        with anonymous_cookie_jar(self.client.cookies):
            with self.client.get(
                request.path,
                name=request.name,
                catch_response=True,
            ) as response:
                self._apply_assertion(
                    response,
                    lambda: assert_public_read_response(response, request),
                )

    def _request_protected(
        self,
        request: ReadRequest,
        *,
        path: str | None = None,
        params: dict[str, object] | None = None,
    ) -> None:
        identity = self._required_identity()
        with self.client.get(
            path or request.path,
            params=params,
            name=request.name,
            catch_response=True,
        ) as response:
            self._apply_assertion(
                response,
                lambda: assert_protected_read_response(
                    response,
                    request,
                    identity=identity,
                ),
            )

    def _request_behavior_range(self) -> None:
        self._request_protected(
            REQUEST_BY_KEY["behaviors_range"],
            path="/behaviors",
            params={"range": random.choice(BEHAVIOR_RANGE_OPTIONS)},
        )

    def _request_export(self, request: ReadRequest) -> None:
        identity = self._required_identity()
        with self.client.get(
            export_path_for_cohort(request, identity.cohort),
            name=request.name,
            catch_response=True,
        ) as response:
            self._apply_assertion(
                response,
                lambda: assert_export_response(
                    response,
                    request,
                    owner_marker=identity.selectors.owner_marker,
                    forbidden_marker=identity.selectors.forbidden_marker,
                    require_owner_marker=identity.requires_owner_marker,
                ),
            )

    def _apply_assertion(self, response, assertion) -> None:
        try:
            assertion()
        except SemanticAssertionError as error:
            response.failure(str(error))
            if isinstance(error, CriticalSemanticAssertionError):
                self.environment.process_exit_code = 2
                runner = self.environment.runner
                if runner is not None:
                    runner.quit()
            return
        response.success()

    def _required_identity(self) -> LoadIdentity:
        if self._identity is None:
            raise RuntimeError(
                "The read workload user has no authenticated identity lease."
            )
        return self._identity

    def _abort_run(self, error: IdentityArtifactError) -> None:
        self.environment.process_exit_code = 2
        runner = self.environment.runner
        if runner is not None:
            runner.quit()
        raise RuntimeError(str(error)) from error
