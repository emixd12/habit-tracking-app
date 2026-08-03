import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cadence_load.auth import (
    IdentityArtifactError,
    IdentityPool,
    IdentityPoolExhausted,
    assert_safe_worker_environment,
    load_identity_artifact,
)


class IdentityPoolTests(unittest.TestCase):
    def test_artifact_preserves_order_and_default_pool_excludes_heavy(self):
        path = self._write_artifact(
            [
                self._identity("cookie-a", "typical_daily", with_review=True),
                self._identity("cookie-b", "empty"),
                self._identity("cookie-c", "heavy_schedule", with_review=True),
            ]
        )

        artifact = load_identity_artifact(path)
        pool = IdentityPool(artifact.identities)
        first = pool.acquire()
        second = pool.acquire()

        self.assertEqual(first.identity.cohort, "typical_daily")
        self.assertEqual(second.identity.cohort, "empty")
        self.assertEqual(pool.capacity, 2)
        with self.assertRaisesRegex(
            IdentityPoolExhausted,
            "No unique authenticated load identity remains",
        ):
            pool.acquire()

    def test_heavy_filter_selects_only_reserved_heavy_identities(self):
        path = self._write_artifact(
            [
                self._identity("cookie-a", "typical_daily", with_review=True),
                self._identity("cookie-b", "heavy_schedule", with_review=True),
            ]
        )

        artifact = load_identity_artifact(path)
        pool = IdentityPool(
            artifact.identities,
            cohort_filter="heavy_schedule",
        )
        lease = pool.acquire()

        self.assertEqual(pool.capacity, 1)
        self.assertEqual(lease.identity.cohort, "heavy_schedule")

    def test_pool_never_shares_active_identity_and_reuses_only_after_release(self):
        path = self._write_artifact(
            [
                self._identity("cookie-a", "typical_daily", with_review=True),
                self._identity("cookie-b", "review_heavy", with_review=True),
            ]
        )
        pool = IdentityPool(load_identity_artifact(path).identities)

        first = pool.acquire()
        second = pool.acquire()

        self.assertIsNot(first.identity, second.identity)
        self.assertEqual(pool.leased_count, 2)
        pool.release(first)
        replacement = pool.acquire()
        self.assertIs(replacement.identity, first.identity)
        with self.assertRaisesRegex(
            IdentityArtifactError,
            "lease is not active",
        ):
            pool.release(first)

    def test_pool_starts_at_the_declared_disjoint_identity_offset(self):
        path = self._write_artifact(
            [
                self._identity("cookie-a", "typical_daily", with_review=True),
                self._identity("cookie-b", "review_heavy", with_review=True),
                self._identity("cookie-c", "export_heavy", with_review=True),
            ]
        )
        artifact = load_identity_artifact(path)

        with patch.dict(
            os.environ,
            {"CADENCE_LOAD_IDENTITY_OFFSET": "2"},
        ):
            pool = IdentityPool(artifact.identities)

        self.assertEqual(pool.acquire().identity.cohort, "export_heavy")
        self.assertEqual(pool.acquire().identity.cohort, "typical_daily")

    def test_pool_rejects_an_out_of_range_identity_offset(self):
        path = self._write_artifact(
            [self._identity("cookie-a", "empty")]
        )

        with (
            patch.dict(
                os.environ,
                {"CADENCE_LOAD_IDENTITY_OFFSET": "1"},
            ),
            self.assertRaisesRegex(
                IdentityArtifactError,
                "identity offset is invalid",
            ),
        ):
            IdentityPool(load_identity_artifact(path).identities)

    def test_artifact_rejects_duplicate_cookie_jars_without_disclosing_values(self):
        path = self._write_artifact(
            [
                self._identity("private-cookie", "empty"),
                self._identity("private-cookie", "empty"),
            ]
        )

        with self.assertRaises(IdentityArtifactError) as raised:
            load_identity_artifact(path)

        self.assertNotIn("private-cookie", str(raised.exception))

    def test_artifact_rejects_non_owner_only_mode_and_nonlocal_target(self):
        path = self._write_artifact([self._identity("cookie-a", "empty")])
        path.chmod(0o644)

        with self.assertRaisesRegex(IdentityArtifactError, "owner-only"):
            load_identity_artifact(path)

        path = self._write_artifact(
            [self._identity("cookie-b", "empty")],
            base_url="https://example.com",
        )
        with self.assertRaisesRegex(IdentityArtifactError, "local HTTP"):
            load_identity_artifact(path)

    def test_nonempty_identity_requires_review_selectors_and_private_markers(self):
        identity = self._identity(
            "cookie-a",
            "typical_daily",
            with_review=False,
        )
        path = self._write_artifact([identity])

        with self.assertRaisesRegex(
            IdentityArtifactError,
            "missing required selector metadata",
        ):
            load_identity_artifact(path)

    def test_worker_rejects_administrative_or_provider_credentials(self):
        with patch.dict(
            os.environ,
            {"SUPABASE_SERVICE_ROLE_KEY": "private-value"},
            clear=True,
        ):
            with self.assertRaises(IdentityArtifactError) as raised:
                assert_safe_worker_environment()

        self.assertNotIn("private-value", str(raised.exception))

    def _write_artifact(
        self,
        identities,
        *,
        base_url="http://127.0.0.1:3000",
    ):
        directory = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: directory.rmdir())
        self.addCleanup(
            lambda: [
                child.unlink(missing_ok=True)
                for child in directory.iterdir()
                if child.is_file()
            ]
        )
        path = directory / "sessions.json"
        path.write_text(
            json.dumps(
                {
                    "target_classification": "local",
                    "base_url": base_url,
                    "identities": identities,
                }
            ),
            encoding="utf-8",
        )
        path.chmod(0o600)
        return path

    @staticmethod
    def _identity(cookie, cohort, *, with_review=False):
        owner_suffix = hashlib.sha256(cookie.encode()).hexdigest()[:20]
        forbidden_suffix = hashlib.sha256(
            f"forbidden:{cookie}".encode()
        ).hexdigest()[:20]
        selectors = {
            "owner_marker": f"cadence-owner-{owner_suffix}",
            "forbidden_marker": f"cadence-owner-{forbidden_suffix}",
        }
        if with_review:
            selectors.update(
                {
                    "behavior_id": "11111111-1111-4111-8111-111111111111",
                    "local_date": "2026-07-29",
                }
            )
        return {
            "cookies": {"sb-session": cookie},
            "cohort": cohort,
            "selectors": selectors,
        }


if __name__ == "__main__":
    unittest.main()
