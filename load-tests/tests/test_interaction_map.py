import copy
import json
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REGISTRY_PATH = ROOT / "interaction-registry.json"
MANIFEST_PATH = ROOT / "load-tests/scenarios/interaction-map.json"
CHECK_PATH = ROOT / "scripts/check-load-test-interactions.mjs"


class InteractionMapTests(unittest.TestCase):
    def test_current_manifest_passes(self):
        result = self._run_check(
            json.loads(REGISTRY_PATH.read_text()),
            json.loads(MANIFEST_PATH.read_text()),
        )

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_missing_entry_fails(self):
        registry = json.loads(REGISTRY_PATH.read_text())
        manifest = json.loads(MANIFEST_PATH.read_text())
        manifest["entries"] = manifest["entries"][:-1]

        result = self._run_check(registry, manifest)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("is missing", result.stderr)

    def test_duplicate_entry_fails(self):
        registry = json.loads(REGISTRY_PATH.read_text())
        manifest = json.loads(MANIFEST_PATH.read_text())
        manifest["entries"].append(copy.deepcopy(manifest["entries"][0]))

        result = self._run_check(registry, manifest)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("duplicate id", result.stderr)

    def test_destructive_misclassification_fails(self):
        registry = json.loads(REGISTRY_PATH.read_text())
        manifest = json.loads(MANIFEST_PATH.read_text())
        entry = next(
            item
            for item in manifest["entries"]
            if item["id"] == "INT-SETTINGS-009"
        )
        entry.clear()
        entry.update(
            {
                "id": "INT-SETTINGS-009",
                "classification": "loadable_http",
                "requests": [
                    {
                        "name": "INT-SETTINGS-009 POST /settings server-action",
                        "route": "/settings",
                        "method": "POST",
                        "expected_result": "server_action_success",
                        "environments": ["local"],
                        "data_preconditions": ["synthetic account"],
                        "cleanup_owner": "synthetic_account_cascade",
                        "profiles": ["ordinary_mixed"],
                    }
                ],
            }
        )

        result = self._run_check(registry, manifest)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must be destructive_serial_only", result.stderr)

    def _run_check(self, registry, manifest):
        with tempfile.TemporaryDirectory() as directory:
            fixture_root = Path(directory)
            registry_path = fixture_root / "registry.json"
            manifest_path = fixture_root / "manifest.json"
            registry_path.write_text(json.dumps(registry))
            manifest_path.write_text(json.dumps(manifest))

            return subprocess.run(
                [
                    "node",
                    str(CHECK_PATH),
                    "--registry",
                    str(registry_path),
                    "--manifest",
                    str(manifest_path),
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=False,
            )


if __name__ == "__main__":
    unittest.main()
