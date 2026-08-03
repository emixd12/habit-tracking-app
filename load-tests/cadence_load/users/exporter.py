"""Low-rate structured export role mixed with authenticated activity."""

from locust import task

from cadence_load.actions import (
    MUTATION_TASK_WEIGHTS,
    AuthenticatedActionUser,
)
from cadence_load.data import REQUEST_BY_KEY


class CadenceExporterUser(AuthenticatedActionUser):
    """Exercises bounded synthetic export scopes only."""

    weight = sum(
        MUTATION_TASK_WEIGHTS[key]
        for key in (
            "export_jsonl",
            "export_json",
            "export_behaviorlog",
        )
    )

    @task(MUTATION_TASK_WEIGHTS["export_jsonl"])
    def task_export_jsonl(self) -> None:
        self.structured_export(REQUEST_BY_KEY["export_jsonl"])

    @task(MUTATION_TASK_WEIGHTS["export_json"])
    def task_export_json(self) -> None:
        self.structured_export(REQUEST_BY_KEY["export_json"])

    @task(MUTATION_TASK_WEIGHTS["export_behaviorlog"])
    def task_export_behaviorlog(self) -> None:
        self.structured_export(REQUEST_BY_KEY["export_behaviorlog"])
