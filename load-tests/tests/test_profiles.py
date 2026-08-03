import os
import unittest
from unittest.mock import patch

from cadence_load.data import ProfileConfigError, load_profile_catalog
from cadence_load.shapes import resolve_selected_shape, stage_at_elapsed


class ReadProfileTests(unittest.TestCase):
    def setUp(self):
        self.catalog = load_profile_catalog()

    def test_profiles_are_initial_assumptions_with_bounded_task_weights(self):
        self.assertEqual(
            self.catalog.assumption_basis,
            "initial_product_assumptions_not_observed_analytics",
        )
        self.assertEqual(sum(self.catalog.task_weights.values()), 100)
        self.assertEqual(
            sum(
                self.catalog.task_weights[key]
                for key in (
                    "public_login",
                    "public_terms",
                    "public_privacy",
                    "public_trust",
                )
            ),
            15,
        )
        self.assertEqual(
            self.catalog.think_time_seconds,
            (2.0, 6.0),
        )

    def test_default_cohort_mix_excludes_heavy_schedule(self):
        self.assertEqual(
            self.catalog.default_cohort_mix_percent,
            {
                "empty": 10,
                "typical_daily": 60,
                "review_heavy": 20,
                "export_heavy": 10,
                "heavy_schedule": 0,
            },
        )

    def test_required_profiles_are_selectable_and_bounded(self):
        self.assertEqual(
            set(self.catalog.profiles),
            {"smoke", "baseline", "ramp", "recovery", "heavy"},
        )
        for profile in self.catalog.profiles.values():
            shape = self.catalog.shapes[profile.shape]
            self.assertLessEqual(shape.max_users, 100)
            self.assertLessEqual(shape.total_duration_seconds, 1_200)

        self.assertEqual(
            [stage.users for stage in self.catalog.shapes["baseline"].stages],
            [5, 10],
        )
        self.assertEqual(
            [stage.users for stage in self.catalog.shapes["ramp"].stages],
            [10, 25, 50, 100],
        )
        self.assertEqual(
            [stage.users for stage in self.catalog.shapes["recovery"].stages],
            [10, 50, 10],
        )
        self.assertEqual(
            self.catalog.profiles["heavy"].cohort_filter,
            "heavy_schedule",
        )
        self.assertEqual(self.catalog.shapes["heavy"].max_users, 5)

    def test_stage_selection_uses_cumulative_bounded_durations(self):
        baseline = self.catalog.shapes["baseline"]

        self.assertEqual(stage_at_elapsed(baseline, 0).users, 5)
        self.assertEqual(stage_at_elapsed(baseline, 599.9).users, 5)
        self.assertEqual(stage_at_elapsed(baseline, 600).users, 10)
        self.assertEqual(stage_at_elapsed(baseline, 1_199.9).users, 10)
        self.assertIsNone(stage_at_elapsed(baseline, 1_200))

    def test_supervisor_can_select_one_bounded_fixed_plateau(self):
        with patch.dict(
            os.environ,
            {
                "CADENCE_LOAD_PROFILE": "ramp",
                "CADENCE_LOAD_COHORT_FILTER": "",
                "CADENCE_LOAD_USERS": "25",
                "CADENCE_LOAD_DURATION_SECONDS": "180",
            },
            clear=False,
        ):
            shape = resolve_selected_shape(self.catalog)

        self.assertEqual(shape.name, "ramp-fixed")
        self.assertEqual(len(shape.stages), 1)
        self.assertEqual(shape.stages[0].users, 25)
        self.assertEqual(shape.stages[0].duration_seconds, 180)

    def test_supervisor_fixed_plateau_overrides_fail_closed(self):
        with patch.dict(
            os.environ,
            {
                "CADENCE_LOAD_PROFILE": "ramp",
                "CADENCE_LOAD_COHORT_FILTER": "",
                "CADENCE_LOAD_USERS": "101",
                "CADENCE_LOAD_DURATION_SECONDS": "180",
            },
            clear=False,
        ):
            with self.assertRaises(ProfileConfigError):
                resolve_selected_shape(self.catalog)

        with patch.dict(
            os.environ,
            {
                "CADENCE_LOAD_PROFILE": "ramp",
                "CADENCE_LOAD_COHORT_FILTER": "",
                "CADENCE_LOAD_USERS": "25",
                "CADENCE_LOAD_DURATION_SECONDS": "961",
            },
            clear=False,
        ):
            with self.assertRaises(ProfileConfigError):
                resolve_selected_shape(self.catalog)

        with patch.dict(
            os.environ,
            {
                "CADENCE_LOAD_PROFILE": "ramp",
                "CADENCE_LOAD_COHORT_FILTER": "",
                "CADENCE_LOAD_USERS": "25",
                "CADENCE_LOAD_DURATION_SECONDS": "",
            },
            clear=False,
        ):
            with self.assertRaises(ProfileConfigError):
                resolve_selected_shape(self.catalog)


if __name__ == "__main__":
    unittest.main()
