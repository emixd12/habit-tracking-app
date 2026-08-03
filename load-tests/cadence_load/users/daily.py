"""Daily tracker mutation user with a bounded occurrence state machine."""

from __future__ import annotations

from locust import task

from cadence_load.actions import (
    MUTATION_TASK_WEIGHTS,
    ActionProtocolError,
    AuthenticatedActionUser,
    OccurrenceActionSurface,
    assert_occurrence_surface_state,
    bounded_synthetic_note,
    discover_occurrence_action_surface,
    replace_action_fields,
    selector_value,
)
from cadence_load.data import REQUEST_BY_KEY
from cadence_load.semantic_evidence import MutationReceipt


STATUS_REQUEST_NAMES = {
    "completed": "INT-TIMELINE-005 POST /timeline server-action",
    "not_completed": "INT-TIMELINE-006 POST /timeline server-action",
    "unresolved": "INT-TIMELINE-007 POST /timeline server-action",
}
NOTE_REQUEST_NAME = "INT-TIMELINE-008 POST /timeline server-action"


def due_past_clear_transition_targets(current_status: str) -> tuple[str, ...]:
    """Return a bounded path that always proves resolved-to-Unresolved."""

    if current_status == "completed":
        return ("unresolved",)
    if current_status in {"unresolved", "not_completed"}:
        return ("completed", "unresolved")
    raise ActionProtocolError(
        "The due/past reminder occurrence exposed an invalid status."
    )


class CadenceDailyTrackerUser(AuthenticatedActionUser):
    """Reads dominate while one owned occurrence and note remain bounded."""

    weight = sum(
        MUTATION_TASK_WEIGHTS[key]
        for key in (
            "timeline_read",
            "timeline_future_read",
            "status_completed",
            "status_not_completed",
            "status_clear",
            "timeline_note",
        )
    )

    def on_identity_ready(self) -> None:
        identity = self.required_identity()
        self._daily_occurrence_id = selector_value(
            identity,
            "mutation_occurrence_id",
            kind="uuid",
        )
        selector_value(
            identity,
            "mutation_occurrence_status",
            kind="status",
        )
        self._due_past_clear_occurrence_id = selector_value(
            identity,
            "due_past_clear_occurrence_id",
            kind="uuid",
        )
        self._due_past_clear_behavior_id = selector_value(
            identity,
            "due_past_clear_behavior_id",
            kind="uuid",
        )
        self._due_past_clear_local_date = selector_value(
            identity,
            "due_past_clear_local_date",
            kind="date",
        )
        self._daily_note_sequence = 0
        self._exercise_due_past_clear()

    @task(MUTATION_TASK_WEIGHTS["timeline_read"])
    def task_timeline_read(self) -> None:
        self.protected_document(REQUEST_BY_KEY["timeline"])

    @task(MUTATION_TASK_WEIGHTS["timeline_future_read"])
    def task_timeline_future_read(self) -> None:
        self.protected_document(
            REQUEST_BY_KEY["timeline_future"],
            path="/timeline",
            params={"days": 30},
        )

    @task(MUTATION_TASK_WEIGHTS["status_completed"])
    def task_status_completed(self) -> None:
        self._transition_to("completed")

    @task(MUTATION_TASK_WEIGHTS["status_not_completed"])
    def task_status_not_completed(self) -> None:
        self._transition_to("not_completed")

    @task(MUTATION_TASK_WEIGHTS["status_clear"])
    def task_status_clear(self) -> None:
        surface = self._load_daily_surface()
        if surface.current_status == "unresolved":
            receipt = self._submit_status(surface, "completed")
            surface = self._load_daily_surface()
            assert_occurrence_surface_state(
                surface,
                expected_status="completed",
            )
            self.verify_action(receipt)
        receipt = self._submit_status(surface, "unresolved")
        assert_occurrence_surface_state(
            self._load_daily_surface(),
            expected_status="unresolved",
        )
        self.verify_action(receipt)

    @task(MUTATION_TASK_WEIGHTS["timeline_note"])
    def task_timeline_note(self) -> None:
        identity = self.required_identity()
        surface = self._load_daily_surface()
        note = bounded_synthetic_note(
            identity.selectors.owner_marker,
            self._daily_note_sequence,
        )
        self._daily_note_sequence = (self._daily_note_sequence + 1) % 8
        note_form = replace_action_fields(
            surface.note_form,
            {"note": note},
        )
        receipt = self.submit_action(
            note_form,
            referer=f"{self.base_url}/timeline",
            name=NOTE_REQUEST_NAME,
            success_marker="Note saved.",
        )
        assert_occurrence_surface_state(
            self._load_daily_surface(),
            expected_status=surface.current_status,
            expected_note=note,
        )
        self.verify_action(receipt)

    def _transition_to(self, next_status: str) -> None:
        surface = self._load_daily_surface()
        if surface.current_status == next_status:
            return
        receipt = self._submit_status(surface, next_status)
        assert_occurrence_surface_state(
            self._load_daily_surface(),
            expected_status=next_status,
        )
        self.verify_action(receipt)

    def _submit_status(
        self,
        surface: OccurrenceActionSurface,
        next_status: str,
        *,
        referer: str | None = None,
    ) -> MutationReceipt:
        form = surface.status_forms.get(next_status)
        if form is None:
            raise ActionProtocolError(
                "The owned occurrence did not expose the requested transition."
            )
        return self.submit_action(
            form,
            referer=referer or f"{self.base_url}/timeline",
            name=STATUS_REQUEST_NAMES[next_status],
            success_marker="Occurrence updated.",
        )

    def _load_daily_surface(self) -> OccurrenceActionSurface:
        return self._load_occurrence_surface(self._daily_occurrence_id)

    def _exercise_due_past_clear(self) -> None:
        surface = self._load_due_past_clear_surface()
        for next_status in due_past_clear_transition_targets(
            surface.current_status
        ):
            receipt = self._submit_status(
                surface,
                next_status,
                referer=self._due_past_clear_url,
            )
            surface = self._load_due_past_clear_surface()
            assert_occurrence_surface_state(
                surface,
                expected_status=next_status,
            )
            self.verify_action(receipt)

    @property
    def _due_past_clear_url(self) -> str:
        return (
            f"{self.base_url}/behaviors?range=90"
            f"&behavior={self._due_past_clear_behavior_id}"
            f"&day={self._due_past_clear_local_date}"
        )

    def _load_due_past_clear_surface(self) -> OccurrenceActionSurface:
        result = self.protected_document(
            REQUEST_BY_KEY["behaviors_selected_day"],
            path="/behaviors",
            params={
                "range": 90,
                "behavior": self._due_past_clear_behavior_id,
                "day": self._due_past_clear_local_date,
            },
            transform=lambda body, url: discover_occurrence_action_surface(
                body,
                document_url=url,
                occurrence_id=self._due_past_clear_occurrence_id,
            ),
        )
        if not isinstance(result, OccurrenceActionSurface):
            raise ActionProtocolError(
                "The due/past selected-day action surface was unavailable."
            )
        return result

    def _load_occurrence_surface(
        self,
        occurrence_id: str,
    ) -> OccurrenceActionSurface:
        result = self.protected_document(
            REQUEST_BY_KEY["timeline"],
            transform=lambda body, url: discover_occurrence_action_surface(
                body,
                document_url=url,
                occurrence_id=occurrence_id,
            ),
        )
        if not isinstance(result, OccurrenceActionSurface):
            raise ActionProtocolError(
                "The Timeline occurrence action surface was unavailable."
            )
        return result
