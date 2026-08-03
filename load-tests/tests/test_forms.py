import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from cadence_load.forms import (  # noqa: E402
    FormDiscoveryError,
    discover_occurrence_status_form,
    replace_form_field,
)


class ServerActionFormTests(unittest.TestCase):
    def test_discovers_generated_action_fields_for_exact_occurrence_and_status(self):
        html = """
        <form action="/timeline" method="POST">
          <input type="hidden" name="$ACTION_REF_1" value="">
          <input type="hidden" name="$ACTION_1:0" value='{"id":"generated"}'>
          <input type="hidden" name="occurrence_id" value="occurrence-a">
          <input type="hidden" name="expected_status" value="unresolved">
          <input type="hidden" name="status" value="completed">
          <button type="submit">Completed</button>
        </form>
        """

        form = discover_occurrence_status_form(
            html,
            document_url="http://127.0.0.1:3100/timeline",
            occurrence_id="occurrence-a",
            expected_status="unresolved",
            status="completed",
        )

        self.assertEqual(form.action, "http://127.0.0.1:3100/timeline")
        self.assertIn(("$ACTION_REF_1", ""), form.fields)
        self.assertIn(("status", "completed"), form.fields)

    def test_replaces_only_the_selected_payload_field(self):
        html = """
        <form method="post">
          <input type="hidden" name="$ACTION_ID_generated" value="">
          <input type="hidden" name="occurrence_id" value="occurrence-a">
          <input type="hidden" name="expected_status" value="unresolved">
          <input type="hidden" name="status" value="completed">
        </form>
        """
        form = discover_occurrence_status_form(
            html,
            document_url="http://127.0.0.1:3100/timeline",
            occurrence_id="occurrence-a",
            expected_status="unresolved",
            status="completed",
        )

        replaced = replace_form_field(
            form,
            name="occurrence_id",
            value="stale-occurrence",
        )

        self.assertIn(("occurrence_id", "stale-occurrence"), replaced.fields)
        self.assertIn(("$ACTION_ID_generated", ""), replaced.fields)

    def test_rejects_a_form_without_generated_action_metadata(self):
        html = """
        <form method="post">
          <input type="hidden" name="occurrence_id" value="occurrence-a">
          <input type="hidden" name="expected_status" value="unresolved">
          <input type="hidden" name="status" value="completed">
        </form>
        """

        with self.assertRaisesRegex(
            FormDiscoveryError,
            "generated Server Action fields",
        ):
            discover_occurrence_status_form(
                html,
                document_url="http://127.0.0.1:3100/timeline",
                occurrence_id="occurrence-a",
                expected_status="unresolved",
                status="completed",
            )


if __name__ == "__main__":
    unittest.main()
