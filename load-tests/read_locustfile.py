"""Locust entrypoint for bounded local Cadence read profiles."""

from locust import events

from cadence_load.auth import (
    IdentityArtifactError,
    assert_locust_host,
    get_shared_identity_runtime,
)
from cadence_load.data import load_profile_catalog, select_read_profile
from cadence_load.shapes import CadenceReadLoadShape, resolve_selected_shape
from cadence_load.users import CadenceReadUser


PROFILE_CATALOG = load_profile_catalog()
SELECTED_PROFILE = select_read_profile(PROFILE_CATALOG)


@events.test_start.add_listener
def validate_read_workload_start(environment, **_kwargs) -> None:
    try:
        runner = environment.runner
        if runner is not None and runner.__class__.__name__ in {
            "MasterRunner",
            "WorkerRunner",
        }:
            raise IdentityArtifactError(
                "Distributed workers are outside the bounded local read profile."
            )

        runtime = get_shared_identity_runtime(
            cohort_filter=SELECTED_PROFILE.cohort_filter,
        )
        assert_locust_host(environment.host, runtime.artifact.base_url)
        selected_shape = resolve_selected_shape(PROFILE_CATALOG)
        if runtime.pool.capacity < selected_shape.max_users:
            raise IdentityArtifactError(
                "The selected profile exceeds the unique identity pool."
            )
    except IdentityArtifactError as error:
        environment.process_exit_code = 2
        if environment.runner is not None:
            environment.runner.quit()
        raise RuntimeError(str(error)) from error


__all__ = [
    "CadenceReadLoadShape",
    "CadenceReadUser",
]
