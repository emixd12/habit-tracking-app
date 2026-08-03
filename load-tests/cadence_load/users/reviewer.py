"""Selected behavior/date reviewer using the real Behaviors actions."""

from __future__ import annotations

import re
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import parse_qs, urljoin, urlparse

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


REVIEW_STATUS_REQUEST_NAMES = {
    "completed": "INT-TIMELINE-005 POST /timeline server-action",
    "not_completed": "INT-TIMELINE-006 POST /timeline server-action",
    "unresolved": "INT-TIMELINE-007 POST /timeline server-action",
}
REVIEW_NOTE_REQUEST_NAME = "INT-TIMELINE-008 POST /timeline server-action"
REVIEW_COUNTS_PATTERN = re.compile(
    r"(?P<completed>\d+) Completed, "
    r"(?P<not_completed>\d+) Not Completed, "
    r"(?P<unresolved>\d+) Unresolved"
)


@dataclass(frozen=True)
class ReviewStatusCounts:
    completed: int
    not_completed: int
    unresolved: int

    @property
    def total(self) -> int:
        return self.completed + self.not_completed + self.unresolved


@dataclass(frozen=True, repr=False)
class BehaviorReviewSurface:
    occurrence: OccurrenceActionSurface
    day_counts: ReviewStatusCounts


class _ReviewLinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str]] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        if tag != "a":
            return
        attributes = dict(attrs)
        href = attributes.get("href")
        label = attributes.get("aria-label")
        if href and label:
            self.links.append((href, label))


def discover_behavior_review_surface(
    html: str,
    *,
    document_url: str,
    behavior_id: str,
    local_date: str,
    occurrence_id: str,
) -> BehaviorReviewSurface:
    """Read one selected review row and its matching heatmap-day counts."""

    occurrence = discover_occurrence_action_surface(
        html,
        document_url=document_url,
        occurrence_id=occurrence_id,
    )
    counts = discover_review_day_counts(
        html,
        document_url=document_url,
        behavior_id=behavior_id,
        local_date=local_date,
    )
    assert_occurrence_reconciles_with_day_counts(occurrence, counts)
    return BehaviorReviewSurface(
        occurrence=occurrence,
        day_counts=counts,
    )


def discover_review_day_counts(
    html: str,
    *,
    document_url: str,
    behavior_id: str,
    local_date: str,
) -> ReviewStatusCounts:
    """Find one selected behavior/day heatmap link and parse its count label."""

    parser = _ReviewLinkParser()
    try:
        parser.feed(html)
    except (AssertionError, ValueError) as error:
        raise ActionProtocolError(
            "The selected-day analytics links could not be parsed."
        ) from error

    source = urlparse(document_url)
    matches: list[ReviewStatusCounts] = []
    for href, label in parser.links:
        target = urlparse(urljoin(document_url, href))
        query = parse_qs(target.query, keep_blank_values=True)
        if (
            target.scheme != source.scheme
            or target.netloc != source.netloc
            or target.path != "/behaviors"
            or query.get("behavior") != [behavior_id]
            or query.get("day") != [local_date]
        ):
            continue
        count_match = REVIEW_COUNTS_PATTERN.search(label)
        if count_match is None:
            continue
        matches.append(
            ReviewStatusCounts(
                completed=int(count_match.group("completed")),
                not_completed=int(count_match.group("not_completed")),
                unresolved=int(count_match.group("unresolved")),
            )
        )

    if len(matches) != 1 or matches[0].total < 1:
        raise ActionProtocolError(
            "The selected-day review lacked one matching analytics count."
        )
    return matches[0]


def assert_occurrence_reconciles_with_day_counts(
    occurrence: OccurrenceActionSurface,
    counts: ReviewStatusCounts,
) -> None:
    """Require the selected occurrence status to be represented in its day."""

    if _count_for_status(counts, occurrence.current_status) < 1:
        raise ActionProtocolError(
            "The selected review row did not reconcile with its analytics "
            "count."
        )


def assert_review_status_count_transition(
    before: BehaviorReviewSurface,
    after: BehaviorReviewSurface,
) -> None:
    """Require one selected status change and its exact analytics count delta."""

    previous_status = before.occurrence.current_status
    current_status = after.occurrence.current_status
    if previous_status == current_status:
        raise ActionProtocolError(
            "The selected review status did not change after submission."
        )
    if before.day_counts.total != after.day_counts.total:
        raise ActionProtocolError(
            "The selected review status changed the analytics day total."
        )

    for status in ("completed", "not_completed", "unresolved"):
        expected_delta = (
            -1
            if status == previous_status
            else 1
            if status == current_status
            else 0
        )
        actual_delta = _count_for_status(
            after.day_counts,
            status,
        ) - _count_for_status(before.day_counts, status)
        if actual_delta != expected_delta:
            raise ActionProtocolError(
                "The selected review status did not reconcile with the "
                "analytics count transition."
            )


def assert_review_note_preserves_counts(
    before: BehaviorReviewSurface,
    after: BehaviorReviewSurface,
) -> None:
    if before.day_counts != after.day_counts:
        raise ActionProtocolError(
            "The selected review note changed analytics status counts."
        )


def _count_for_status(counts: ReviewStatusCounts, status: str) -> int:
    if status == "completed":
        return counts.completed
    if status == "not_completed":
        return counts.not_completed
    if status == "unresolved":
        return counts.unresolved
    raise ActionProtocolError(
        "The selected review exposed an invalid status vocabulary."
    )


class CadenceReflectiveReviewerUser(AuthenticatedActionUser):
    """Mutates one selected-day occurrence and verifies the refreshed review."""

    weight = sum(
        MUTATION_TASK_WEIGHTS[key]
        for key in (
            "behaviors_selected_read",
            "review_status",
            "review_note",
        )
    )

    def on_identity_ready(self) -> None:
        identity = self.required_identity()
        self._review_behavior_id = selector_value(
            identity,
            "review_behavior_id",
            fallback=identity.selectors.behavior_id,
            kind="uuid",
        )
        self._review_local_date = selector_value(
            identity,
            "review_local_date",
            fallback=identity.selectors.local_date,
            kind="date",
        )
        self._review_occurrence_id = selector_value(
            identity,
            "review_occurrence_id",
            fallback=getattr(
                identity.selectors,
                "mutation_occurrence_id",
                None,
            ),
            kind="uuid",
        )
        self._review_note_sequence = 0

    @task(MUTATION_TASK_WEIGHTS["behaviors_selected_read"])
    def task_behaviors_selected_read(self) -> None:
        self._load_review_surface()

    @task(MUTATION_TASK_WEIGHTS["review_status"])
    def task_review_status(self) -> None:
        surface = self._load_review_surface()
        next_status = (
            "not_completed"
            if surface.occurrence.current_status == "completed"
            else "completed"
        )
        form = surface.occurrence.status_forms.get(next_status)
        if form is None:
            raise ActionProtocolError(
                "The selected-day review lacked the requested status action."
            )
        receipt = self.submit_action(
            form,
            referer=self._review_url,
            name=REVIEW_STATUS_REQUEST_NAMES[next_status],
            success_marker="Occurrence updated.",
        )
        refreshed = self._load_review_surface()
        assert_occurrence_surface_state(
            refreshed.occurrence,
            expected_status=next_status,
        )
        assert_review_status_count_transition(surface, refreshed)
        self.verify_action(receipt)

    @task(MUTATION_TASK_WEIGHTS["review_note"])
    def task_review_note(self) -> None:
        identity = self.required_identity()
        surface = self._load_review_surface()
        note = bounded_synthetic_note(
            identity.selectors.owner_marker,
            self._review_note_sequence + 4,
        )
        self._review_note_sequence = (
            self._review_note_sequence + 1
        ) % 4
        form = replace_action_fields(
            surface.occurrence.note_form,
            {"note": note},
        )
        receipt = self.submit_action(
            form,
            referer=self._review_url,
            name=REVIEW_NOTE_REQUEST_NAME,
            success_marker="Note saved.",
        )
        refreshed = self._load_review_surface()
        assert_occurrence_surface_state(
            refreshed.occurrence,
            expected_status=surface.occurrence.current_status,
            expected_note=note,
        )
        assert_review_note_preserves_counts(surface, refreshed)
        self.verify_action(receipt)

    @property
    def _review_url(self) -> str:
        return (
            f"{self.base_url}/behaviors?range=30"
            f"&behavior={self._review_behavior_id}"
            f"&day={self._review_local_date}"
        )

    def _load_review_surface(self) -> BehaviorReviewSurface:
        result = self.protected_document(
            REQUEST_BY_KEY["behaviors_selected_day"],
            path="/behaviors",
            params={
                "range": 30,
                "behavior": self._review_behavior_id,
                "day": self._review_local_date,
            },
            transform=lambda body, url: discover_behavior_review_surface(
                body,
                document_url=url,
                behavior_id=self._review_behavior_id,
                local_date=self._review_local_date,
                occurrence_id=self._review_occurrence_id,
            ),
        )
        if not isinstance(result, BehaviorReviewSurface):
            raise ActionProtocolError(
                "The selected-day occurrence action surface was unavailable."
            )
        return result
