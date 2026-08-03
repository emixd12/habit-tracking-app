import inspect
import unittest
from collections import Counter
from types import SimpleNamespace
from unittest.mock import patch

from cadence_load.actions import (
    MUTATION_TASK_WEIGHTS,
    ActionProtocolError,
    OccurrenceActionSurface,
    RenderedActionForm,
)
from cadence_load.data import REQUEST_BY_KEY
from cadence_load.users.calibration import CadenceMixedCalibrationUser
from cadence_load.users.daily import (
    NOTE_REQUEST_NAME,
    STATUS_REQUEST_NAMES,
    CadenceDailyTrackerUser,
    due_past_clear_transition_targets,
)
from cadence_load.users.exporter import CadenceExporterUser
from cadence_load.users.maintainer import (
    ARCHIVE_REQUEST_NAME,
    CREATE_REQUEST_NAME,
    RESTORE_REQUEST_NAME,
    TIMEZONE_REQUEST_NAME,
    UPDATE_REQUEST_NAME,
    CadenceBehaviorMaintainerUser,
    _discover_create_surface,
)
from cadence_load.users.reviewer import (
    REVIEW_NOTE_REQUEST_NAME,
    REVIEW_STATUS_REQUEST_NAMES,
    CadenceReflectiveReviewerUser,
)


class MutationUserContractTests(unittest.TestCase):
    def test_role_weights_preserve_the_normalized_100_point_mix(self):
        classes = (
            CadenceDailyTrackerUser,
            CadenceBehaviorMaintainerUser,
            CadenceReflectiveReviewerUser,
            CadenceExporterUser,
        )

        self.assertEqual(sum(user.weight for user in classes), 100)
        self.assertEqual(CadenceDailyTrackerUser.weight, 55)
        self.assertEqual(CadenceBehaviorMaintainerUser.weight, 25)
        self.assertEqual(CadenceReflectiveReviewerUser.weight, 12)
        self.assertEqual(CadenceExporterUser.weight, 8)

    def test_composite_calibration_user_exposes_the_exact_100_point_mix(self):
        ordinary_roles = (
            CadenceDailyTrackerUser,
            CadenceBehaviorMaintainerUser,
            CadenceReflectiveReviewerUser,
            CadenceExporterUser,
        )
        expected = Counter(
            task.__name__
            for user_class in ordinary_roles
            for task in user_class.tasks
        )
        actual = Counter(
            task.__name__ for task in CadenceMixedCalibrationUser.tasks
        )

        self.assertEqual(
            CadenceMixedCalibrationUser.__bases__,
            ordinary_roles,
        )
        self.assertEqual(CadenceMixedCalibrationUser.weight, 100)
        self.assertEqual(actual, expected)
        self.assertEqual(actual.total(), 100)
        self.assertEqual(len(actual), len(MUTATION_TASK_WEIGHTS))

    def test_composite_calibration_initializes_each_stateful_role(self):
        identity_owner = SimpleNamespace()

        with (
            patch.object(
                CadenceDailyTrackerUser,
                "on_identity_ready",
            ) as daily_ready,
            patch.object(
                CadenceBehaviorMaintainerUser,
                "on_identity_ready",
            ) as maintainer_ready,
            patch.object(
                CadenceReflectiveReviewerUser,
                "on_identity_ready",
            ) as reviewer_ready,
        ):
            CadenceMixedCalibrationUser.on_identity_ready(identity_owner)

        daily_ready.assert_called_once_with(identity_owner)
        maintainer_ready.assert_called_once_with(identity_owner)
        reviewer_ready.assert_called_once_with(identity_owner)

    def test_each_role_task_decorator_matches_the_shared_weight_manifest(self):
        expected = {
            CadenceDailyTrackerUser: {
                "task_timeline_read": "timeline_read",
                "task_timeline_future_read": "timeline_future_read",
                "task_status_completed": "status_completed",
                "task_status_not_completed": "status_not_completed",
                "task_status_clear": "status_clear",
                "task_timeline_note": "timeline_note",
            },
            CadenceBehaviorMaintainerUser: {
                "task_behaviors_read": "behaviors_read",
                "task_behavior_create": "behavior_create",
                "task_behavior_update": "behavior_update",
                "task_behavior_archive": "behavior_archive",
                "task_behavior_restore": "behavior_restore",
                "task_timezone_unchanged": "timezone_unchanged",
            },
            CadenceReflectiveReviewerUser: {
                "task_behaviors_selected_read": "behaviors_selected_read",
                "task_review_status": "review_status",
                "task_review_note": "review_note",
            },
            CadenceExporterUser: {
                "task_export_jsonl": "export_jsonl",
                "task_export_json": "export_json",
                "task_export_behaviorlog": "export_behaviorlog",
            },
        }

        for user_class, tasks in expected.items():
            actual = Counter(task.__name__ for task in user_class.tasks)
            with self.subTest(user=user_class.__name__):
                self.assertEqual(
                    actual,
                    {
                        method_name: MUTATION_TASK_WEIGHTS[weight_key]
                        for method_name, weight_key in tasks.items()
                    },
                )

    def test_mutation_request_names_are_stable_interaction_names_without_ids(self):
        names = {
            *STATUS_REQUEST_NAMES.values(),
            NOTE_REQUEST_NAME,
            CREATE_REQUEST_NAME,
            UPDATE_REQUEST_NAME,
            ARCHIVE_REQUEST_NAME,
            RESTORE_REQUEST_NAME,
            TIMEZONE_REQUEST_NAME,
            *REVIEW_STATUS_REQUEST_NAMES.values(),
            REVIEW_NOTE_REQUEST_NAME,
        }
        expected = {
            "INT-TIMELINE-005 POST /timeline server-action",
            "INT-TIMELINE-006 POST /timeline server-action",
            "INT-TIMELINE-007 POST /timeline server-action",
            "INT-TIMELINE-008 POST /timeline server-action",
            "INT-BEHAVIOR-019 POST /behaviors server-action",
            "INT-BEHAVIOR-020 POST /behaviors server-action",
            "INT-BEHAVIOR-022 POST /behaviors server-action",
            "INT-BEHAVIOR-023 POST /behaviors server-action",
            "INT-SETTINGS-003 POST /settings server-action",
        }

        self.assertEqual(names, expected)
        self.assertTrue(all(name.startswith("INT-") for name in names))
        self.assertTrue(all(":behavior" not in name for name in names))
        self.assertTrue(all(":occurrence" not in name for name in names))

    def test_completed_create_slot_degrades_to_read_without_another_create(self):
        class FakeMaintainer:
            _maintainer_created_once = True

            def __init__(self):
                self.reads = 0
                self.submits = 0

            def protected_document(self, request):
                self.reads += 1

            def submit_action(self, *args, **kwargs):
                self.submits += 1

        user = FakeMaintainer()
        CadenceBehaviorMaintainerUser.task_behavior_create(user)

        self.assertEqual(user.reads, 1)
        self.assertEqual(user.submits, 0)

    def test_daily_status_task_submits_only_a_real_status_transition(self):
        class FakeDaily:
            def __init__(self, current_status):
                self.current_status = current_status
                self.submissions = []

            def _load_daily_surface(self):
                return SimpleNamespace(current_status=self.current_status)

            def _submit_status(self, surface, next_status):
                self.submissions.append((surface.current_status, next_status))
                self.current_status = next_status
                return object()

            def verify_action(self, receipt):
                if receipt is None:
                    raise AssertionError("Missing mutation receipt.")

        unchanged = FakeDaily("completed")
        CadenceDailyTrackerUser._transition_to(unchanged, "completed")
        self.assertEqual(unchanged.submissions, [])

        changed = FakeDaily("unresolved")
        CadenceDailyTrackerUser._transition_to(changed, "completed")
        self.assertEqual(
            changed.submissions,
            [("unresolved", "completed")],
        )

    def test_due_past_clear_path_always_finishes_with_a_resolved_to_unresolved_transition(
        self,
    ):
        self.assertEqual(
            due_past_clear_transition_targets("completed"),
            ("unresolved",),
        )
        self.assertEqual(
            due_past_clear_transition_targets("unresolved"),
            ("completed", "unresolved"),
        )
        self.assertEqual(
            due_past_clear_transition_targets("not_completed"),
            ("completed", "unresolved"),
        )
        with self.assertRaises(ActionProtocolError):
            due_past_clear_transition_targets("needs_decision")

    def test_due_past_clear_loads_the_selected_day_behavior_surface(self):
        occurrence_id = "11111111-1111-4111-8111-111111111111"
        behavior_id = "22222222-2222-4222-8222-222222222222"
        local_date = "2026-07-27"
        form = RenderedActionForm(
            action="http://127.0.0.1:3100/behaviors",
            fields=(),
        )
        surface = OccurrenceActionSurface(
            current_status="unresolved",
            status_forms={},
            note_form=form,
        )

        class FakeDaily:
            base_url = "http://127.0.0.1:3100"
            _due_past_clear_occurrence_id = occurrence_id
            _due_past_clear_behavior_id = behavior_id
            _due_past_clear_local_date = local_date

            def __init__(self):
                self.request = None
                self.path = None
                self.params = None

            def protected_document(
                self,
                request,
                *,
                path=None,
                params=None,
                transform=None,
            ):
                self.request = request
                self.path = path
                self.params = params
                return transform(
                    "<html></html>",
                    (
                        f"{self.base_url}/behaviors?range=90"
                        f"&behavior={behavior_id}&day={local_date}"
                    ),
                )

        user = FakeDaily()
        with patch(
            "cadence_load.users.daily.discover_occurrence_action_surface",
            return_value=surface,
        ) as discover:
            result = CadenceDailyTrackerUser._load_due_past_clear_surface(user)

        self.assertIs(result, surface)
        self.assertIs(
            user.request,
            REQUEST_BY_KEY["behaviors_selected_day"],
        )
        self.assertEqual(user.path, "/behaviors")
        self.assertEqual(
            user.params,
            {
                "range": 90,
                "behavior": behavior_id,
                "day": local_date,
            },
        )
        discover.assert_called_once_with(
            "<html></html>",
            document_url=(
                f"{user.base_url}/behaviors?range=90"
                f"&behavior={behavior_id}&day={local_date}"
            ),
            occurrence_id=occurrence_id,
        )

    def test_due_past_clear_submits_with_the_selected_day_referer(self):
        referer = (
            "http://127.0.0.1:3100/behaviors?range=30"
            "&behavior=22222222-2222-4222-8222-222222222222"
            "&day=2026-07-27"
        )
        form = RenderedActionForm(
            action="http://127.0.0.1:3100/behaviors",
            fields=(),
        )

        class FakeDaily:
            _due_past_clear_url = referer

            def __init__(self):
                self.current_status = "unresolved"
                self.submissions = []
                self.verified = []

            def _load_due_past_clear_surface(self):
                return OccurrenceActionSurface(
                    current_status=self.current_status,
                    status_forms={},
                    note_form=form,
                )

            def _submit_status(self, surface, next_status, *, referer=None):
                self.submissions.append(
                    (surface.current_status, next_status, referer)
                )
                self.current_status = next_status
                return next_status

            def verify_action(self, receipt):
                self.verified.append(receipt)

        user = FakeDaily()
        CadenceDailyTrackerUser._exercise_due_past_clear(user)

        self.assertEqual(
            user.submissions,
            [
                ("unresolved", "completed", referer),
                ("completed", "unresolved", referer),
            ],
        )
        self.assertEqual(user.verified, ["completed", "unresolved"])

    def test_rendered_created_title_makes_create_idempotent_across_processes(self):
        title = "cadence-owner-aaaaaaaaaaaaaaaaaaaa load-created"

        surface = _discover_create_surface(
            f"<html><body>{title}</body></html>",
            "http://127.0.0.1:3100/behaviors",
            title,
        )

        self.assertTrue(surface.already_exists)
        self.assertIsNone(surface.form)

    def test_converged_title_update_uses_schedule_only_path(self):
        marker = "cadence-owner-aaaaaaaaaaaaaaaaaaaa"

        class FakeMaintainer:
            _maintainer_behavior_id = (
                "11111111-1111-4111-8111-111111111111"
            )

            def __init__(self):
                self.schedule_updates = 0

            def _ensure_active(self, behavior_id):
                return SimpleNamespace(
                    snapshot=SimpleNamespace(
                        title=f"{marker} maintainer-a",
                    )
                )

            def required_identity(self):
                return SimpleNamespace(
                    selectors=SimpleNamespace(
                        owner_marker=marker,
                        maintainer_behavior_title=f"{marker} maintainer",
                    )
                )

            def _update_schedule_time(self):
                self.schedule_updates += 1

        user = FakeMaintainer()
        CadenceBehaviorMaintainerUser._update_title(user)

        self.assertEqual(user.schedule_updates, 1)

    def test_archive_task_archives_then_restores_the_fixture_to_active(self):
        marker = "cadence-owner-aaaaaaaaaaaaaaaaaaaa"
        behavior_id = "11111111-1111-4111-8111-111111111111"

        class FakeMaintainer:
            _maintainer_behavior_id = behavior_id

            def __init__(self):
                self.active = True
                self.lifecycle = []

            def _load_behavior_surface(self, requested_behavior_id):
                self.assert_owned_behavior(requested_behavior_id)
                self.lifecycle.append(
                    "read-active" if self.active else "read-archived"
                )
                return SimpleNamespace(
                    snapshot=SimpleNamespace(
                        id=behavior_id,
                        title=f"{marker} maintainer",
                        active=self.active,
                    )
                )

            def _archive(self, surface):
                self.assert_owned_behavior(surface.snapshot.id)
                self.assert_active(surface.snapshot.active)
                self.lifecycle.append("archive")
                self.active = False
                return object()

            def _restore(self, surface):
                self.assert_owned_behavior(surface.snapshot.id)
                self.assert_archived(surface.snapshot.active)
                self.lifecycle.append("restore")
                self.active = True
                return object()

            def verify_action(self, receipt):
                if receipt is None:
                    raise AssertionError("Missing mutation receipt.")

            def required_identity(self):
                return SimpleNamespace(
                    selectors=SimpleNamespace(owner_marker=marker)
                )

            def assert_owned_behavior(self, requested_behavior_id):
                if requested_behavior_id != behavior_id:
                    raise AssertionError("Unexpected Behavior selector.")

            def assert_active(self, active):
                if active is not True:
                    raise AssertionError("Archive did not start active.")

            def assert_archived(self, active):
                if active is not False:
                    raise AssertionError("Restore did not start archived.")

        user = FakeMaintainer()
        CadenceBehaviorMaintainerUser.task_behavior_archive(user)

        self.assertEqual(
            user.lifecycle,
            [
                "read-active",
                "archive",
                "read-archived",
                "restore",
                "read-active",
            ],
        )
        self.assertTrue(user.active)

    def test_restore_task_archives_then_restores_the_fixture_to_active(self):
        marker = "cadence-owner-aaaaaaaaaaaaaaaaaaaa"
        behavior_id = "11111111-1111-4111-8111-111111111111"

        class FakeMaintainer:
            _maintainer_behavior_id = behavior_id

            def __init__(self):
                self.active = True
                self.lifecycle = []

            def _load_behavior_surface(self, requested_behavior_id):
                if requested_behavior_id != behavior_id:
                    raise AssertionError("Unexpected Behavior selector.")
                self.lifecycle.append(
                    "read-active" if self.active else "read-archived"
                )
                return SimpleNamespace(
                    snapshot=SimpleNamespace(
                        id=behavior_id,
                        title=f"{marker} maintainer",
                        active=self.active,
                    )
                )

            def _archive(self, surface):
                if surface.snapshot.active is not True:
                    raise AssertionError("Archive did not start active.")
                self.lifecycle.append("archive")
                self.active = False
                return object()

            def _restore(self, surface):
                if surface.snapshot.active is not False:
                    raise AssertionError("Restore did not start archived.")
                self.lifecycle.append("restore")
                self.active = True
                return object()

            def verify_action(self, receipt):
                if receipt is None:
                    raise AssertionError("Missing mutation receipt.")

            def required_identity(self):
                return SimpleNamespace(
                    selectors=SimpleNamespace(owner_marker=marker)
                )

        user = FakeMaintainer()
        CadenceBehaviorMaintainerUser.task_behavior_restore(user)

        self.assertEqual(
            user.lifecycle,
            [
                "read-active",
                "archive",
                "read-archived",
                "restore",
                "read-active",
            ],
        )
        self.assertTrue(user.active)

    def test_title_update_rejects_state_outside_bounded_baseline(self):
        marker = "cadence-owner-aaaaaaaaaaaaaaaaaaaa"

        class FakeMaintainer:
            _maintainer_behavior_id = (
                "11111111-1111-4111-8111-111111111111"
            )

            def _ensure_active(self, behavior_id):
                return SimpleNamespace(
                    snapshot=SimpleNamespace(
                        title=f"{marker} unexpected",
                    )
                )

            def required_identity(self):
                return SimpleNamespace(
                    selectors=SimpleNamespace(
                        owner_marker=marker,
                        maintainer_behavior_title=f"{marker} maintainer",
                    )
                )

        with self.assertRaisesRegex(
            ActionProtocolError,
            "bounded baseline",
        ):
            CadenceBehaviorMaintainerUser._update_title(FakeMaintainer())

    def test_ordinary_role_sources_exclude_destructive_and_real_provider_routes(self):
        source = "\n".join(
            inspect.getsource(user_class)
            for user_class in (
                CadenceDailyTrackerUser,
                CadenceBehaviorMaintainerUser,
                CadenceReflectiveReviewerUser,
                CadenceExporterUser,
            )
        )

        for forbidden in (
            "deleteAccount",
            "restore_apply",
            "import_apply",
            "/api/push",
            "sequenzy",
        ):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, source.lower())


if __name__ == "__main__":
    unittest.main()
