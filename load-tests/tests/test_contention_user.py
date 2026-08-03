import inspect
import unittest
from dataclasses import dataclass

from cadence_load.actions import (
    ActionProtocolError,
    OccurrenceActionSurface,
    RenderedActionForm,
)
from cadence_load.users.contention import (
    CLEAR_REQUEST_NAME,
    COMPLETED_REQUEST_NAME,
    NOT_COMPLETED_REQUEST_NAME,
    CadenceContentionUser,
    ContentionSubmissionOutcome,
    assert_competing_status_outcomes,
    assert_converged_status_surfaces,
    classify_contention_response,
    prepare_competing_status_forms,
)
from cadence_load.semantic_evidence import (
    record_successful_submission,
    reset_semantic_evidence,
    semantic_evidence_snapshot,
)


@dataclass
class FakeResponse:
    status_code: int
    url: str
    headers: dict[str, str]
    content: bytes

    @property
    def text(self):
        return self.content.decode("utf-8")


class ContentionUserTests(unittest.TestCase):
    def setUp(self):
        reset_semantic_evidence()

    def test_classifies_success_and_documented_stale_response(self):
        success = self._response("Occurrence updated.")
        stale = self._response(
            "Occurrence status changed. Review the latest status and try again."
        )

        self.assertEqual(
            classify_contention_response(
                success,
                requested_status="completed",
            ),
            ContentionSubmissionOutcome("completed", "success"),
        )
        self.assertEqual(
            classify_contention_response(
                stale,
                requested_status="not_completed",
            ),
            ContentionSubmissionOutcome("not_completed", "stale"),
        )

    def test_accepts_html_and_rejects_ambiguous_or_non_action_response(self):
        ambiguous = self._response(
            "Occurrence updated. Occurrence status changed. "
            "Review the latest status and try again."
        )
        html = self._response(
            "Occurrence updated.",
            content_type="text/html",
        )
        plain = self._response(
            "Occurrence updated.",
            content_type="text/plain",
        )

        with self.assertRaisesRegex(ActionProtocolError, "ambiguous"):
            classify_contention_response(
                ambiguous,
                requested_status="completed",
            )
        self.assertEqual(
            classify_contention_response(
                html,
                requested_status="completed",
            ).result,
            "success",
        )
        with self.assertRaisesRegex(ActionProtocolError, "content type"):
            classify_contention_response(
                plain,
                requested_status="completed",
            )

    def test_requires_one_success_and_one_stale_for_opposite_statuses(self):
        outcomes = (
            ContentionSubmissionOutcome("completed", "stale"),
            ContentionSubmissionOutcome("not_completed", "success"),
        )

        self.assertEqual(
            assert_competing_status_outcomes(outcomes),
            "not_completed",
        )
        with self.assertRaisesRegex(ActionProtocolError, "one success"):
            assert_competing_status_outcomes(
                (
                    ContentionSubmissionOutcome("completed", "success"),
                    ContentionSubmissionOutcome(
                        "not_completed",
                        "success",
                    ),
                )
            )

    def test_prepares_opposite_forms_only_from_two_unresolved_snapshots(self):
        primary = self._surface("unresolved")
        secondary = self._surface("unresolved")

        forms = prepare_competing_status_forms(primary, secondary)

        self.assertIs(
            forms.completed,
            primary.status_forms["completed"],
        )
        self.assertIs(
            forms.not_completed,
            secondary.status_forms["not_completed"],
        )
        with self.assertRaisesRegex(ActionProtocolError, "Unresolved"):
            prepare_competing_status_forms(
                self._surface("completed"),
                secondary,
            )

    def test_both_refreshed_sessions_must_converge_on_winner(self):
        assert_converged_status_surfaces(
            self._surface("completed"),
            self._surface("completed"),
            expected_status="completed",
        )

        with self.assertRaisesRegex(
            ActionProtocolError,
            "submitted status",
        ):
            assert_converged_status_surfaces(
                self._surface("completed"),
                self._surface("not_completed"),
                expected_status="completed",
            )

    def test_reset_uses_current_clear_form_before_the_next_round(self):
        clear = self._form("unresolved")

        class FakeUser:
            client = object()

            def __init__(self):
                self.submissions = []

            def _submit_expected_success(
                self,
                client,
                form,
                *,
                requested_status,
            ):
                self.submissions.append(
                    (client, form, requested_status)
                )
                return object()

        user = FakeUser()
        surface = self._surface("completed")
        surface = OccurrenceActionSurface(
            current_status=surface.current_status,
            status_forms={**surface.status_forms, "unresolved": clear},
            note_form=surface.note_form,
        )

        CadenceContentionUser._reset_to_unresolved(user, surface)

        self.assertEqual(
            user.submissions,
            [(user.client, clear, "unresolved")],
        )

    def test_task_resets_before_preparing_and_verifying_a_collision(self):
        resolved = (
            self._surface("completed"),
            self._surface("completed"),
        )
        unresolved = (
            self._surface("unresolved"),
            self._surface("unresolved"),
        )
        completed = (
            self._surface("completed"),
            self._surface("completed"),
        )

        class FakeUser:
            def __init__(self):
                self.pairs = iter((resolved, unresolved, completed))
                self.resets = []
                self.submissions = []

            def _load_pair(self):
                return next(self.pairs)

            def _reset_to_unresolved(self, surface):
                self.resets.append(surface.current_status)
                return record_successful_submission(
                    CLEAR_REQUEST_NAME
                )

            def _submit_competing_pair(self, forms):
                self.submissions.append(forms)
                return (
                    "completed",
                    (
                        record_successful_submission(
                            COMPLETED_REQUEST_NAME
                        ),
                        record_successful_submission(
                            NOT_COMPLETED_REQUEST_NAME
                        ),
                    ),
                )

            def _abort_task(self, error):
                raise AssertionError(str(error))

        user = FakeUser()

        CadenceContentionUser.task_same_account_contention(user)

        self.assertEqual(user.resets, ["completed"])
        self.assertEqual(len(user.submissions), 1)
        self.assertIs(
            user.submissions[0].completed,
            unresolved[0].status_forms["completed"],
        )
        self.assertIs(
            user.submissions[0].not_completed,
            unresolved[1].status_forms["not_completed"],
        )
        evidence = semantic_evidence_snapshot()
        self.assertEqual(
            evidence["successful_submissions"],
            {
                CLEAR_REQUEST_NAME: 1,
                COMPLETED_REQUEST_NAME: 1,
                NOT_COMPLETED_REQUEST_NAME: 1,
            },
        )
        self.assertEqual(
            evidence["semantic_verifications"],
            evidence["successful_submissions"],
        )
        self.assertEqual(evidence["pending_verifications"], {})

    def test_request_names_are_stable_interaction_ids_without_selectors(self):
        names = {
            COMPLETED_REQUEST_NAME,
            NOT_COMPLETED_REQUEST_NAME,
            CLEAR_REQUEST_NAME,
        }

        self.assertEqual(
            names,
            {
                "INT-TIMELINE-005 POST /timeline server-action",
                "INT-TIMELINE-006 POST /timeline server-action",
                "INT-TIMELINE-007 POST /timeline server-action",
            },
        )
        source = inspect.getsource(CadenceContentionUser)
        self.assertNotIn("pair_id", source)
        self.assertNotIn("contention_occurrence_id", source)
        self.assertNotIn("print(", source)
        self.assertIn('REQUEST_BY_KEY["behaviors_selected_day"]', source)
        self.assertNotIn('REQUEST_BY_KEY["timeline"]', source)

    @staticmethod
    def _response(
        body,
        *,
        content_type="text/x-component",
    ):
        return FakeResponse(
            status_code=200,
            url="http://127.0.0.1:3100/timeline",
            headers={"Content-Type": content_type},
            content=body.encode("utf-8"),
        )

    @staticmethod
    def _form(status):
        return RenderedActionForm(
            action="http://127.0.0.1:3100/timeline",
            fields=(
                ("$ACTION_REF_1", ""),
                ("occurrence_id", "private-selector"),
                ("expected_status", "unresolved"),
                ("status", status),
            ),
        )

    @classmethod
    def _surface(cls, current_status):
        return OccurrenceActionSurface(
            current_status=current_status,
            status_forms={
                "unresolved": cls._form("unresolved"),
                "completed": cls._form("completed"),
                "not_completed": cls._form("not_completed"),
            },
            note_form=RenderedActionForm(
                action="http://127.0.0.1:3100/timeline",
                fields=(
                    ("$ACTION_REF_2", ""),
                    ("occurrence_id", "private-selector"),
                    ("note", ""),
                ),
            ),
        )


if __name__ == "__main__":
    unittest.main()
