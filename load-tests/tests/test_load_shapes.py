import copy
import os
import unittest
from unittest.mock import patch

from cadence_load.data import ProfileConfigError
from cadence_load.integrity import (
    MutationRuntimeGuard,
    RepeatedFailureGate,
    RuntimeGuardConfig,
    RuntimeCeilings,
    RuntimeObservation,
    SustainedRatioGate,
    evaluate_runtime_ceilings,
    looks_like_database_refusal,
)
from cadence_load.mutation_shapes import (
    load_mutation_profile_catalog,
    parse_mutation_profile_catalog,
    resolve_profile_runtime_ceiling,
    resolve_selected_mutation_shape,
    stage_at_elapsed,
)
from requests.exceptions import ConnectionError as RequestsConnectionError


class MutationLoadShapeTests(unittest.TestCase):
    def setUp(self):
        self.catalog = load_mutation_profile_catalog()

    def test_declares_read_dominant_weights_and_hard_ceilings(self):
        self.assertEqual(sum(self.catalog.task_weights.values()), 100)
        self.assertEqual(self.catalog.read_weight_percent, 65)
        self.assertLessEqual(self.catalog.ceilings.maximum_users, 100)
        self.assertEqual(
            self.catalog.ceilings.maximum_profile_runtime_seconds,
            3600,
        )
        self.assertEqual(
            self.catalog.ceilings.maximum_soak_runtime_seconds,
            3900,
        )
        self.assertEqual(self.catalog.ceilings.maximum_requests, 200000)
        self.assertEqual(
            self.catalog.ceilings.maximum_requests_per_second,
            60,
        )

    def test_ticketed_shapes_are_exact_and_bounded(self):
        calibration = self.catalog.shapes["mixed_calibration"].stages
        self.assertEqual(len(calibration), 1)
        self.assertEqual(calibration[0].duration_seconds, 180)
        self.assertEqual(calibration[0].users, 1)
        self.assertEqual(calibration[0].spawn_rate, 1)
        self.assertEqual(
            [stage.users for stage in self.catalog.shapes["mixed_baseline"].stages],
            [5, 10],
        )
        self.assertEqual(
            [stage.users for stage in self.catalog.shapes["ramp"].stages],
            [10, 25, 50, 100],
        )
        self.assertEqual(
            [stage.users for stage in self.catalog.shapes["spike"].stages],
            [10, 100, 10],
        )
        self.assertEqual(
            self.catalog.shapes["soak"].total_duration_seconds,
            3600,
        )
        self.assertEqual(
            self.catalog.shapes["soak"].max_users,
            25,
        )
        self.assertEqual(
            self.catalog.shapes["contention"].max_users,
            1,
        )
        for shape in self.catalog.shapes.values():
            self.assertLessEqual(
                shape.total_duration_seconds,
                self.catalog.ceilings.maximum_profile_runtime_seconds,
            )

    def test_only_soak_receives_bounded_runtime_grace(self):
        soak = self.catalog.profiles["soak"]
        smoke = self.catalog.profiles["smoke"]

        self.assertEqual(
            resolve_profile_runtime_ceiling(self.catalog, soak),
            3900,
        )
        self.assertEqual(
            resolve_profile_runtime_ceiling(self.catalog, smoke),
            3600,
        )
        self.assertEqual(
            self.catalog.shapes["soak"].total_duration_seconds,
            3600,
        )

    def test_stage_selection_uses_cumulative_durations(self):
        spike = self.catalog.shapes["spike"]
        self.assertEqual(stage_at_elapsed(spike, 0).users, 10)
        self.assertEqual(stage_at_elapsed(spike, 299.9).users, 10)
        self.assertEqual(stage_at_elapsed(spike, 300).users, 100)
        self.assertEqual(stage_at_elapsed(spike, 600).users, 10)
        self.assertIsNone(stage_at_elapsed(spike, 900))

    def test_fixed_stage_override_remains_within_selected_profile(self):
        with patch.dict(
            os.environ,
            {
                "CADENCE_LOAD_PROFILE": "ramp",
                "CADENCE_LOAD_WORKLOAD": "mixed",
                "CADENCE_LOAD_USERS": "50",
                "CADENCE_LOAD_DURATION_SECONDS": "240",
            },
            clear=False,
        ):
            shape = resolve_selected_mutation_shape(self.catalog)

        self.assertEqual(shape.name, "ramp-fixed")
        self.assertEqual(shape.stages[0].users, 50)
        self.assertEqual(shape.stages[0].duration_seconds, 240)

    def test_contention_rejects_any_user_override_other_than_one_pair(self):
        with patch.dict(
            os.environ,
            {
                "CADENCE_LOAD_PROFILE": "contention",
                "CADENCE_LOAD_WORKLOAD": "contention",
                "CADENCE_LOAD_USERS": "2",
                "CADENCE_LOAD_DURATION_SECONDS": "60",
            },
            clear=False,
        ):
            with self.assertRaises(ProfileConfigError):
                resolve_selected_mutation_shape(self.catalog)

    def test_profile_parser_rejects_non_dominant_read_weights(self):
        import json
        from pathlib import Path

        path = (
            Path(__file__).resolve().parents[1]
            / "scenarios"
            / "mutation-profiles.json"
        )
        payload = json.loads(path.read_text(encoding="utf-8"))
        modified = copy.deepcopy(payload)
        modified["read_task_keys"] = ["timeline_read"]

        with self.assertRaises(ProfileConfigError):
            parse_mutation_profile_catalog(modified)

    def test_profile_parser_rejects_a_short_soak(self):
        import json
        from pathlib import Path

        path = (
            Path(__file__).resolve().parents[1]
            / "scenarios"
            / "mutation-profiles.json"
        )
        payload = json.loads(path.read_text(encoding="utf-8"))
        modified = copy.deepcopy(payload)
        modified["shapes"]["soak"]["stages"][0][
            "duration_seconds"
        ] = 3599

        with self.assertRaises(ProfileConfigError):
            parse_mutation_profile_catalog(modified)

    def test_profile_parser_rejects_an_unbounded_soak_grace(self):
        import json
        from pathlib import Path

        path = (
            Path(__file__).resolve().parents[1]
            / "scenarios"
            / "mutation-profiles.json"
        )
        payload = json.loads(path.read_text(encoding="utf-8"))
        modified = copy.deepcopy(payload)
        modified["ceilings"]["maximum_soak_runtime_seconds"] = 4201

        with self.assertRaises(ProfileConfigError):
            parse_mutation_profile_catalog(modified)

    def test_runtime_ceilings_abort_when_reached(self):
        ceilings = RuntimeCeilings(
            maximum_requests=100,
            maximum_requests_per_second=10,
            maximum_runtime_seconds=60,
            maximum_users=25,
        )
        safe = RuntimeObservation(
            total_requests=99,
            current_requests_per_second=9.9,
            elapsed_seconds=59.9,
            active_users=25,
        )
        reached = RuntimeObservation(
            total_requests=100,
            current_requests_per_second=9.9,
            elapsed_seconds=59.9,
            active_users=25,
        )

        self.assertFalse(evaluate_runtime_ceilings(safe, ceilings).abort)
        self.assertTrue(evaluate_runtime_ceilings(reached, ceilings).abort)

    def test_sustained_and_repeated_failure_gates_are_consecutive(self):
        sustained = SustainedRatioGate(
            threshold=0.005,
            consecutive_windows=3,
        )
        self.assertFalse(
            sustained.observe_window(failures=1, requests=100)
        )
        self.assertFalse(
            sustained.observe_window(failures=0, requests=100)
        )
        self.assertFalse(
            sustained.observe_window(failures=1, requests=100)
        )
        self.assertFalse(
            sustained.observe_window(failures=1, requests=100)
        )
        self.assertTrue(
            sustained.observe_window(failures=1, requests=100)
        )

        repeated = RepeatedFailureGate(
            required_consecutive_failures=3
        )
        self.assertFalse(repeated.observe(True))
        self.assertFalse(repeated.observe(False))
        self.assertFalse(repeated.observe(True))
        self.assertFalse(repeated.observe(True))
        self.assertTrue(repeated.observe(True))

    def test_database_refusal_classifier_requires_database_context(self):
        self.assertFalse(looks_like_database_refusal("Connection refused"))
        self.assertFalse(
            looks_like_database_refusal(
                RequestsConnectionError(
                    "HTTPConnectionPool(host='127.0.0.1', port=3100): "
                    "Max retries exceeded with url: /timeline "
                    "(Caused by NewConnectionError: Connection refused)"
                )
            )
        )
        self.assertFalse(
            looks_like_database_refusal(
                ConnectionResetError(54, "Connection reset by peer")
            )
        )
        self.assertFalse(
            looks_like_database_refusal(
                "Connection refused while contacting the local app"
            )
        )
        self.assertTrue(
            looks_like_database_refusal(
                "Postgres database connection refused"
            )
        )
        self.assertTrue(
            looks_like_database_refusal(
                "psycopg OperationalError: connection reset by peer"
            )
        )
        self.assertTrue(looks_like_database_refusal("too many connections"))
        self.assertTrue(
            looks_like_database_refusal(
                "remaining connection slots are reserved"
            )
        )
        self.assertFalse(
            looks_like_database_refusal("Occurrence status was stale.")
        )

    def test_runtime_guard_aborts_repeated_database_refusals(self):
        guard = self._runtime_guard()

        for observed_at in (1, 2):
            decision = guard.observe_request(
                now_seconds=observed_at,
                status_code=None,
                error="Supabase Postgres connection refused",
                active_users=2,
                current_requests_per_second=1,
            )
            self.assertFalse(decision.abort)

        decision = guard.observe_request(
            now_seconds=3,
            status_code=None,
            error="Supabase Postgres connection refused",
            active_users=2,
            current_requests_per_second=1,
        )
        self.assertTrue(decision.abort)
        self.assertEqual(
            decision.reason,
            "repeated database connection refusal",
        )

    def test_http_transport_failures_do_not_trip_database_refusal_gate(self):
        guard = self._runtime_guard()
        errors = (
            RequestsConnectionError(
                "HTTPConnectionPool(host='127.0.0.1', port=3100): "
                "Connection refused"
            ),
            ConnectionResetError(54, "Connection reset by peer"),
            RequestsConnectionError(
                "HTTPConnectionPool(host='127.0.0.1', port=3100): "
                "Connection refused"
            ),
        )

        for observed_at, error in enumerate(errors, start=1):
            decision = guard.observe_request(
                now_seconds=observed_at,
                status_code=None,
                error=error,
                active_users=2,
                current_requests_per_second=1,
            )
            self.assertFalse(decision.abort)

    def test_http_transport_failure_resets_database_refusal_sequence(self):
        guard = self._runtime_guard()
        explicit_database_refusal = "Postgres database connection refused"

        for observed_at, error in enumerate(
            (
                explicit_database_refusal,
                explicit_database_refusal,
                RequestsConnectionError(
                    "Connection refused while contacting the local app"
                ),
                explicit_database_refusal,
                explicit_database_refusal,
            ),
            start=1,
        ):
            decision = guard.observe_request(
                now_seconds=observed_at,
                status_code=None,
                error=error,
                active_users=2,
                current_requests_per_second=1,
            )
            self.assertFalse(decision.abort)

        decision = guard.observe_request(
            now_seconds=6,
            status_code=None,
            error=explicit_database_refusal,
            active_users=2,
            current_requests_per_second=1,
        )
        self.assertTrue(decision.abort)
        self.assertEqual(
            decision.reason,
            "repeated database connection refusal",
        )

    def test_runtime_guard_aborts_three_sustained_5xx_windows(self):
        guard = self._runtime_guard()

        for window in range(3):
            start = window * 30
            guard.observe_request(
                now_seconds=start + 1,
                status_code=503,
                error=None,
                active_users=2,
                current_requests_per_second=1,
            )
            decision = guard.observe_request(
                now_seconds=start + 30,
                status_code=200,
                error=None,
                active_users=2,
                current_requests_per_second=1,
            )

        self.assertTrue(decision.abort)
        self.assertEqual(
            decision.reason,
            "sustained unexpected 5xx ratio exceeded",
        )

    @staticmethod
    def _runtime_guard():
        return MutationRuntimeGuard(
            RuntimeGuardConfig(
                ceilings=RuntimeCeilings(
                    maximum_requests=100,
                    maximum_requests_per_second=10,
                    maximum_runtime_seconds=120,
                    maximum_users=10,
                ),
                unexpected_5xx_ratio=0.005,
                unexpected_5xx_window_seconds=30,
                unexpected_5xx_consecutive_windows=3,
            ),
            started_at_seconds=0,
        )


if __name__ == "__main__":
    unittest.main()
