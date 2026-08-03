import os
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LOAD_ROOT = ROOT / "load-tests"


class MutationEntrypointTests(unittest.TestCase):
    def test_profile_entrypoints_expose_only_the_selected_user_classes(self):
        cases = (
            ("smoke", "mixed", {"CadenceDailyTrackerUser"}),
            (
                "mixed_calibration",
                "mixed",
                {"CadenceMixedCalibrationUser"},
            ),
            (
                "mixed_baseline",
                "mixed",
                {
                    "CadenceDailyTrackerUser",
                    "CadenceBehaviorMaintainerUser",
                    "CadenceReflectiveReviewerUser",
                    "CadenceExporterUser",
                },
            ),
            (
                "timezone_changed",
                "timezone_changed",
                {"CadenceChangedTimezoneUser"},
            ),
            ("contention", "contention", {"CadenceContentionUser"}),
        )
        known_users = {
            "CadenceDailyTrackerUser",
            "CadenceBehaviorMaintainerUser",
            "CadenceReflectiveReviewerUser",
            "CadenceExporterUser",
            "CadenceMixedCalibrationUser",
            "CadenceChangedTimezoneUser",
            "CadenceContentionUser",
        }

        for profile, workload, expected_users in cases:
            with self.subTest(profile=profile):
                environment = {
                    **os.environ,
                    "PYTHONPATH": str(LOAD_ROOT),
                    "CADENCE_LOAD_PROFILE": profile,
                    "CADENCE_LOAD_WORKLOAD": workload,
                }
                if profile == "contention":
                    environment.update(
                        {
                            "CADENCE_LOAD_USERS": "1",
                            "CADENCE_LOAD_DURATION_SECONDS": "60",
                        }
                    )
                result = subprocess.run(
                    [
                        sys.executable,
                        "-m",
                        "locust",
                        "-f",
                        str(LOAD_ROOT / "mutation_locustfile.py"),
                        "--list",
                    ],
                    cwd=ROOT,
                    env=environment,
                    capture_output=True,
                    text=True,
                    check=False,
                )

                self.assertEqual(result.returncode, 0, result.stderr)
                for expected_user in expected_users:
                    self.assertIn(expected_user, result.stdout)
                for absent_user in known_users - expected_users:
                    self.assertNotIn(absent_user, result.stdout)
                self.assertNotIn("CadenceReadUser", result.stdout)


if __name__ == "__main__":
    unittest.main()
