import unittest

from cadence_load.actions import (
    ActionProtocolError,
    OccurrenceActionSurface,
    RenderedActionForm,
)
from cadence_load.users.reviewer import (
    BehaviorReviewSurface,
    ReviewStatusCounts,
    assert_review_note_preserves_counts,
    assert_review_status_count_transition,
    discover_behavior_review_surface,
)


BEHAVIOR_ID = "11111111-1111-4111-8111-111111111111"
OCCURRENCE_ID = "22222222-2222-4222-8222-222222222222"
LOCAL_DATE = "2026-07-29"
DOCUMENT_URL = (
    "http://127.0.0.1:3100/behaviors"
    f"?range=30&behavior={BEHAVIOR_ID}&day={LOCAL_DATE}"
)


def rendered_review_html(
    *,
    status: str,
    completed: int,
    not_completed: int,
    unresolved: int,
) -> str:
    count_label = (
        f"{completed} Completed, {not_completed} Not Completed, "
        f"{unresolved} Unresolved"
    )
    return f"""
    <a
      href="/behaviors?range=7&amp;behavior={BEHAVIOR_ID}&amp;day={LOCAL_DATE}"
      aria-label="7 days"
    >7 days</a>
    <a
      href="/behaviors?range=30&amp;behavior={BEHAVIOR_ID}&amp;day={LOCAL_DATE}"
      aria-label="July 29, 2026: Full; {count_label}; open day review"
    >29</a>
    <form action="/behaviors" method="post">
      <input type="hidden" name="$ACTION_REF_1" value="">
      <input type="hidden" name="occurrence_id" value="{OCCURRENCE_ID}">
      <input type="hidden" name="expected_status" value="{status}">
      <input type="hidden" name="status" value="completed">
    </form>
    <form action="/behaviors" method="post">
      <input type="hidden" name="$ACTION_REF_2" value="">
      <input type="hidden" name="occurrence_id" value="{OCCURRENCE_ID}">
      <input type="hidden" name="expected_status" value="{status}">
      <input type="hidden" name="status" value="not_completed">
    </form>
    <form action="/behaviors" method="post">
      <input type="hidden" name="$ACTION_REF_3" value="">
      <input type="hidden" name="occurrence_id" value="{OCCURRENCE_ID}">
      <textarea name="note"></textarea>
    </form>
    """


def review_surface(
    status: str,
    counts: ReviewStatusCounts,
) -> BehaviorReviewSurface:
    form = RenderedActionForm(
        action=DOCUMENT_URL,
        fields=(("$ACTION_REF_1", ""),),
    )
    return BehaviorReviewSurface(
        occurrence=OccurrenceActionSurface(
            current_status=status,
            status_forms={
                "completed": form,
                "not_completed": form,
                "unresolved": form,
            },
            note_form=form,
        ),
        day_counts=counts,
    )


class ReviewerSemanticEvidenceTests(unittest.TestCase):
    def test_discovers_selected_row_and_matching_heatmap_counts(self):
        surface = discover_behavior_review_surface(
            rendered_review_html(
                status="unresolved",
                completed=1,
                not_completed=2,
                unresolved=1,
            ),
            document_url=DOCUMENT_URL,
            behavior_id=BEHAVIOR_ID,
            local_date=LOCAL_DATE,
            occurrence_id=OCCURRENCE_ID,
        )

        self.assertEqual(surface.occurrence.current_status, "unresolved")
        self.assertEqual(
            surface.day_counts,
            ReviewStatusCounts(
                completed=1,
                not_completed=2,
                unresolved=1,
            ),
        )

    def test_rejects_review_row_missing_from_analytics_counts(self):
        with self.assertRaisesRegex(
            ActionProtocolError,
            "did not reconcile",
        ):
            discover_behavior_review_surface(
                rendered_review_html(
                    status="unresolved",
                    completed=1,
                    not_completed=1,
                    unresolved=0,
                ),
                document_url=DOCUMENT_URL,
                behavior_id=BEHAVIOR_ID,
                local_date=LOCAL_DATE,
                occurrence_id=OCCURRENCE_ID,
            )

    def test_status_transition_requires_exact_count_delta(self):
        before = review_surface(
            "unresolved",
            ReviewStatusCounts(
                completed=1,
                not_completed=1,
                unresolved=2,
            ),
        )
        after = review_surface(
            "completed",
            ReviewStatusCounts(
                completed=2,
                not_completed=1,
                unresolved=1,
            ),
        )

        assert_review_status_count_transition(before, after)

        invalid = review_surface(
            "completed",
            ReviewStatusCounts(
                completed=2,
                not_completed=0,
                unresolved=2,
            ),
        )
        with self.assertRaisesRegex(
            ActionProtocolError,
            "count transition",
        ):
            assert_review_status_count_transition(before, invalid)

    def test_note_mutation_requires_counts_to_stay_unchanged(self):
        before = review_surface(
            "completed",
            ReviewStatusCounts(
                completed=2,
                not_completed=1,
                unresolved=1,
            ),
        )
        unchanged = review_surface("completed", before.day_counts)

        assert_review_note_preserves_counts(before, unchanged)

        changed = review_surface(
            "completed",
            ReviewStatusCounts(
                completed=1,
                not_completed=2,
                unresolved=1,
            ),
        )
        with self.assertRaisesRegex(
            ActionProtocolError,
            "note changed analytics",
        ):
            assert_review_note_preserves_counts(before, changed)


if __name__ == "__main__":
    unittest.main()
