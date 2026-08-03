import unittest
from types import SimpleNamespace
from unittest.mock import patch

import mutation_locustfile


class AbortingGuard:
    def __init__(self, reason: str) -> None:
        self.reason = reason
        self.observations = 0

    def observe_request(self, **_observation):
        self.observations += 1
        return SimpleNamespace(abort=True, reason=self.reason)


class ReentrantRunner:
    def __init__(self) -> None:
        self.user_count = 1
        self.quit_calls = 0
        self.exception_rows: list[dict[str, object]] = []
        self.globals_disabled_during_quit = False

    def log_exception(
        self,
        node_id: str,
        message: str,
        formatted_traceback: str,
    ) -> None:
        self.exception_rows.append(
            {
                "count": 1,
                "message": message,
                "traceback": formatted_traceback,
                "nodes": {node_id},
            }
        )

    def quit(self) -> None:
        self.quit_calls += 1
        self.globals_disabled_during_quit = (
            mutation_locustfile._runtime_guard is None
            and mutation_locustfile._runtime_environment is None
        )
        mutation_locustfile.enforce_mutation_runtime_gates(
            "GET",
            "INT-SHELL-001 GET /timeline protected-document",
            response=SimpleNamespace(status_code=200),
        )


class MutationRuntimeAbortTests(unittest.TestCase):
    def setUp(self) -> None:
        self.previous_guard = mutation_locustfile._runtime_guard
        self.previous_environment = mutation_locustfile._runtime_environment
        self.previous_reason = mutation_locustfile._runtime_abort_reason

    def tearDown(self) -> None:
        mutation_locustfile._runtime_guard = self.previous_guard
        mutation_locustfile._runtime_environment = self.previous_environment
        mutation_locustfile._runtime_abort_reason = self.previous_reason

    def test_abort_is_one_shot_before_runner_quit_can_reenter(self):
        reason = "repeated database connection refusal"
        guard = AbortingGuard(reason)
        runner = ReentrantRunner()
        environment = SimpleNamespace(
            process_exit_code=0,
            runner=runner,
            stats=SimpleNamespace(
                total=SimpleNamespace(current_rps=1.0)
            ),
        )
        mutation_locustfile._runtime_guard = guard
        mutation_locustfile._runtime_environment = environment
        mutation_locustfile._runtime_abort_reason = None

        scheduled: list[object] = []
        with patch.object(
            mutation_locustfile,
            "spawn",
            side_effect=lambda callback: scheduled.append(callback),
        ):
            mutation_locustfile.enforce_mutation_runtime_gates(
                "GET",
                "INT-SHELL-001 GET /timeline protected-document",
                response=SimpleNamespace(status_code=503),
            )

            mutation_locustfile.enforce_mutation_runtime_gates(
                "GET",
                "INT-SHELL-001 GET /timeline protected-document",
                response=SimpleNamespace(status_code=503),
            )
            mutation_locustfile._abort(
                environment,
                "later callback must not replace the initiating reason",
            )

        self.assertEqual(environment.process_exit_code, 2)
        self.assertEqual(len(scheduled), 1)
        self.assertEqual(runner.quit_calls, 0)
        self.assertEqual(guard.observations, 1)
        self.assertEqual(len(runner.exception_rows), 1)
        scheduled[0]()
        self.assertTrue(runner.globals_disabled_during_quit)
        self.assertEqual(runner.quit_calls, 1)
        row = runner.exception_rows[0]
        self.assertEqual(row["count"], 1)
        self.assertEqual(row["nodes"], {"local"})
        retained_reason = str(row["message"])
        self.assertEqual(
            retained_reason,
            (
                "Cadence mutation runtime abort: "
                "repeated database connection refusal"
            ),
        )
        self.assertNotIn(
            "later callback must not replace",
            retained_reason,
        )
        self.assertEqual(
            row["traceback"],
            (
                "Cadence mutation runtime guard initiated an orderly "
                "stage stop."
            ),
        )

    def test_unknown_abort_reason_is_replaced_by_closed_vocabulary_fallback(
        self,
    ):
        private_reason = (
            "synthetic failure for cadence-load-private@example.invalid "
            "at /Users/example/private/session.json"
        )

        sanitized = mutation_locustfile._sanitized_runtime_abort_reason(
            private_reason
        )

        self.assertEqual(
            sanitized,
            "mutation startup validation failed",
        )
        self.assertNotIn("cadence-load-private", sanitized)
        self.assertNotIn("/Users/example", sanitized)


if __name__ == "__main__":
    unittest.main()
