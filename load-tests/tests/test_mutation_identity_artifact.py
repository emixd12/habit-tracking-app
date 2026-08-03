import json
import tempfile
import unittest
from pathlib import Path

from cadence_load.auth import (
    ContentionSessionPool,
    IdentityArtifactError,
    load_identity_artifact,
)


OWNER = "cadence-owner-aaaaaaaaaaaaaaaaaaaa"
FORBIDDEN = "cadence-owner-bbbbbbbbbbbbbbbbbbbb"
PAIR_ID = "contention-aaaaaaaaaaaa"


class MutationIdentityArtifactTests(unittest.TestCase):
    def test_parses_typed_mutation_selectors_and_exclusive_contention_pair(self):
        path = self._write_artifact(self._mutation_artifact())

        artifact = load_identity_artifact(path)
        identity = artifact.identities[0]
        pool = ContentionSessionPool(artifact.contention_sessions)
        lease = pool.acquire()

        self.assertEqual(
            identity.selectors.mutation_occurrence_status,
            "unresolved",
        )
        self.assertEqual(
            identity.selectors.schedule_only_start_time,
            "10:17",
        )
        self.assertEqual(
            identity.selectors.due_past_clear_behavior_id,
            "00000018-0018-4018-8018-000000000018",
        )
        self.assertEqual(
            identity.selectors.due_past_clear_local_date,
            "2026-07-27",
        )
        self.assertEqual(
            lease.session.selectors.behavior_id,
            identity.selectors.contention_behavior_id,
        )
        self.assertEqual(
            lease.session.selectors.local_date,
            identity.selectors.contention_local_date,
        )
        self.assertEqual(pool.capacity, 1)
        self.assertNotEqual(
            lease.session.primary_cookies,
            lease.session.secondary_cookies,
        )
        self.assertNotIn("primary-cookie", repr(lease))
        self.assertNotIn("secondary-cookie", repr(lease))
        pool.release(lease)
        self.assertEqual(pool.leased_count, 0)

    def test_rejects_missing_mutation_selector_without_leaking_payload(self):
        payload = self._mutation_artifact()
        payload["identities"][0]["selectors"].pop("review_occurrence_id")
        path = self._write_artifact(payload)

        with self.assertRaises(IdentityArtifactError) as raised:
            load_identity_artifact(path)

        self.assertIn("missing required selector", str(raised.exception))
        self.assertNotIn("primary-cookie", str(raised.exception))

    def test_rejects_invalid_due_past_review_selectors(self):
        invalid_values = {
            "due_past_clear_behavior_id": "not-a-uuid",
            "due_past_clear_local_date": "07/27/2026",
            "contention_behavior_id": "not-a-uuid",
            "contention_local_date": "07/28/2026",
        }
        for selector, value in invalid_values.items():
            with self.subTest(selector=selector):
                payload = self._mutation_artifact()
                payload["identities"][0]["selectors"][selector] = value
                path = self._write_artifact(payload)

                with self.assertRaisesRegex(
                    IdentityArtifactError,
                    "invalid (UUID|date) selector",
                ):
                    load_identity_artifact(path)

    def test_rejects_shared_primary_and_secondary_contention_cookie_jar(self):
        payload = self._mutation_artifact()
        payload["contention_sessions"][0]["secondary_cookies"] = {
            "sb-session": "primary-cookie"
        }
        path = self._write_artifact(payload)

        with self.assertRaisesRegex(
            IdentityArtifactError,
            "independent cookie jars",
        ):
            load_identity_artifact(path)

    def test_read_artifact_cannot_smuggle_contention_sessions(self):
        payload = self._mutation_artifact()
        payload["workload_classification"] = "read"
        path = self._write_artifact(payload)

        with self.assertRaisesRegex(
            IdentityArtifactError,
            "Read identity artifacts",
        ):
            load_identity_artifact(path)

    def _write_artifact(self, payload):
        directory = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: directory.rmdir())
        self.addCleanup(
            lambda: [
                child.unlink(missing_ok=True)
                for child in directory.iterdir()
                if child.is_file()
            ]
        )
        path = directory / "session.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        path.chmod(0o600)
        return path

    @staticmethod
    def _mutation_artifact():
        selectors = {
            "owner_marker": OWNER,
            "forbidden_marker": FORBIDDEN,
            "behavior_id": "00000001-0001-4001-8001-000000000001",
            "local_date": "2026-07-29",
            "profile_timezone": "America/New_York",
            "horizon_start_local_date": "2026-07-29",
            "horizon_end_local_date": "2026-09-27",
            "category_id": "00000002-0002-4002-8002-000000000002",
            "mutation_occurrence_id": "00000003-0003-4003-8003-000000000003",
            "mutation_occurrence_status": "unresolved",
            "mutation_occurrence_local_date": "2026-07-29",
            "review_behavior_id": "00000004-0004-4004-8004-000000000004",
            "review_local_date": "2026-07-28",
            "review_occurrence_id": "00000005-0005-4005-8005-000000000005",
            "review_occurrence_status": "completed",
            "maintainer_behavior_id": "00000006-0006-4006-8006-000000000006",
            "maintainer_behavior_title": f"{OWNER} maintainer",
            "maintainer_schedule_id": "00000007-0007-4007-8007-000000000007",
            "maintainer_slot_id": "00000008-0008-4008-8008-000000000008",
            "maintainer_start_time": "09:00",
            "schedule_only_behavior_id": "00000009-0009-4009-8009-000000000009",
            "schedule_only_behavior_title": f"{OWNER} schedule",
            "schedule_only_schedule_id": "0000000a-000a-400a-800a-00000000000a",
            "schedule_only_slot_id": "0000000b-000b-400b-800b-00000000000b",
            "schedule_only_start_time": "10:17",
            "archived_behavior_id": "0000000c-000c-400c-800c-00000000000c",
            "archived_behavior_title": f"{OWNER} archived",
            "stale_horizon_behavior_id": "0000000d-000d-400d-800d-00000000000d",
            "fresh_horizon_behavior_id": "0000000e-000e-400e-800e-00000000000e",
            "past_preservation_occurrence_id": "0000000f-000f-400f-800f-00000000000f",
            "resolved_preservation_occurrence_id": "00000010-0010-4010-8010-000000000010",
            "due_reminder_occurrence_id": "00000011-0011-4011-8011-000000000011",
            "due_reminder_delivery_id": "00000012-0012-4012-8012-000000000012",
            "due_past_clear_occurrence_id": "00000016-0016-4016-8016-000000000016",
            "due_past_clear_delivery_id": "00000017-0017-4017-8017-000000000017",
            "due_past_clear_behavior_id": "00000018-0018-4018-8018-000000000018",
            "due_past_clear_local_date": "2026-07-27",
            "future_reminder_occurrence_id": "00000013-0013-4013-8013-000000000013",
            "future_reminder_delivery_id": "00000014-0014-4014-8014-000000000014",
            "contention_behavior_id": "00000019-0019-4019-8019-000000000019",
            "contention_local_date": "2026-07-28",
            "contention_occurrence_id": "00000015-0015-4015-8015-000000000015",
            "contention_occurrence_status": "unresolved",
            "contention_pair_id": PAIR_ID,
        }
        return {
            "schema_version": "1.0.0",
            "target_classification": "local",
            "workload_classification": "mutation",
            "base_url": "http://127.0.0.1:3100",
            "identities": [
                {
                    "cohort": "typical_daily",
                    "cookies": {"sb-session": "primary-cookie"},
                    "selectors": selectors,
                }
            ],
            "contention_sessions": [
                {
                    "pair_id": PAIR_ID,
                    "cohort": "typical_daily",
                    "primary_cookies": {"sb-session": "primary-cookie"},
                    "secondary_cookies": {"sb-session": "secondary-cookie"},
                    "selectors": {
                        "behavior_id": selectors["contention_behavior_id"],
                        "local_date": selectors["contention_local_date"],
                        "occurrence_id": selectors["contention_occurrence_id"],
                        "expected_status": "unresolved",
                        "owner_marker": OWNER,
                        "forbidden_marker": FORBIDDEN,
                    },
                }
            ],
        }


if __name__ == "__main__":
    unittest.main()
