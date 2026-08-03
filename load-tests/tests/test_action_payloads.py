import json
import tempfile
import unittest
from dataclasses import dataclass
from pathlib import Path

from cadence_load.actions import (
    ACTION_ID_PATTERN,
    MAX_SYNTHETIC_NOTE_LENGTH,
    ActionProtocolError,
    BehaviorSnapshot,
    RenderedActionForm,
    RenderedServerActionReference,
    assert_action_success,
    assert_behavior_state,
    assert_occurrence_surface_state,
    bounded_synthetic_note,
    build_behavior_update_fields,
    build_minimal_create_form,
    decode_next_flight_payload,
    discover_action_form,
    discover_behavior_snapshot,
    discover_occurrence_action_surface,
    discover_server_action_reference,
    load_mutation_profile_contract,
    multipart_action_fields,
    replace_action_fields,
    synthesize_action_form,
)


OWNER_MARKER = "cadence-owner-aaaaaaaaaaaaaaaaaaaa"
BEHAVIOR_ID = "11111111-1111-4111-8111-111111111111"
SCHEDULE_ID = "22222222-2222-4222-8222-222222222222"
SLOT_ID = "33333333-3333-4333-8333-333333333333"
OCCURRENCE_ID = "44444444-4444-4444-8444-444444444444"
ACTION_ID = "60" + ("a" * 40)
DOCUMENT_URL = "http://127.0.0.1:3100/behaviors"


@dataclass
class FakeResponse:
    status_code: int
    url: str
    headers: dict[str, str]
    content: bytes

    @property
    def text(self):
        return self.content.decode("utf-8")


class MutationActionPayloadTests(unittest.TestCase):
    def test_profile_contract_totals_100_and_declares_65_percent_reads(self):
        contract = load_mutation_profile_contract()

        self.assertEqual(sum(contract.task_weights.values()), 100)
        self.assertEqual(
            sum(
                contract.task_weights[key]
                for key in (
                    "timeline_read",
                    "timeline_future_read",
                    "behaviors_read",
                    "behaviors_selected_read",
                    "export_jsonl",
                    "export_json",
                    "export_behaviorlog",
                )
            ),
            65,
        )
        self.assertEqual(contract.think_time_seconds, (2.0, 5.0))

    def test_profile_contract_rejects_non_dominant_read_declaration(self):
        source = json.loads(
            (
                Path(__file__).resolve().parents[1]
                / "scenarios"
                / "mutation-profiles.json"
            ).read_text(encoding="utf-8")
        )
        source["read_task_keys"] = ["timeline_read"]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "profile.json"
            path.write_text(json.dumps(source), encoding="utf-8")

            with self.assertRaisesRegex(
                ActionProtocolError,
                "invalid task metadata",
            ):
                load_mutation_profile_contract(path)

    def test_discovers_exact_status_and_note_forms_with_dynamic_metadata(self):
        html = f"""
        <form action="/timeline" method="POST">
          <input type="hidden" name="$ACTION_REF_1" value="">
          <input type="hidden" name="$ACTION_1:0" value='{{"id":"runtime"}}'>
          <input type="hidden" name="occurrence_id" value="{OCCURRENCE_ID}">
          <input type="hidden" name="expected_status" value="completed">
          <input type="hidden" name="status" value="not_completed">
        </form>
        <form action="/timeline" method="POST">
          <input type="hidden" name="$ACTION_REF_2" value="">
          <input type="hidden" name="occurrence_id" value="{OCCURRENCE_ID}">
          <textarea name="note">{OWNER_MARKER} &amp; current</textarea>
        </form>
        """

        status = discover_action_form(
            html,
            document_url="http://127.0.0.1:3100/timeline",
            required_fields={
                "occurrence_id": OCCURRENCE_ID,
                "expected_status": "completed",
                "status": "not_completed",
            },
        )
        note = discover_action_form(
            html,
            document_url="http://127.0.0.1:3100/timeline",
            required_fields={
                "occurrence_id": OCCURRENCE_ID,
                "note": None,
            },
        )

        self.assertIn(("$ACTION_REF_1", ""), status.fields)
        self.assertIn(
            ("note", f"{OWNER_MARKER} & current"),
            note.fields,
        )
        self.assertNotIn("runtime", repr(status))

    def test_form_discovery_handles_selected_and_checked_controls(self):
        html = """
        <form method="post">
          <input type="hidden" name="$ACTION_REF_1">
          <select name="timezone">
            <option value="America/Chicago">America/Chicago</option>
            <option value="America/New_York" selected>America/New_York</option>
          </select>
          <input type="checkbox" name="active" checked>
          <input type="checkbox" name="email_reminder" value="on">
        </form>
        """

        form = discover_action_form(
            html,
            document_url="http://127.0.0.1:3100/settings",
            required_fields={"timezone": "America/New_York"},
        )

        self.assertIn(("timezone", "America/New_York"), form.fields)
        self.assertIn(("active", "on"), form.fields)
        self.assertNotIn(("email_reminder", "on"), form.fields)

    def test_form_discovery_rejects_ambiguity_and_cross_origin_targets(self):
        duplicate = """
        <form method="post"><input name="$ACTION_ID_a"><input name="title"></form>
        <form method="post"><input name="$ACTION_ID_b"><input name="title"></form>
        """
        with self.assertRaisesRegex(ActionProtocolError, "unambiguous"):
            discover_action_form(
                duplicate,
                document_url=DOCUMENT_URL,
                required_fields={"title": None},
            )

        external = """
        <form method="post" action="https://example.com/steal">
          <input name="$ACTION_ID_a"><input name="title">
        </form>
        """
        with self.assertRaisesRegex(ActionProtocolError, "same-origin"):
            discover_action_form(
                external,
                document_url=DOCUMENT_URL,
                required_fields={"title": None},
            )

    def test_discovers_occurrence_state_and_preserves_status_vocabulary(self):
        html = self._occurrence_html("completed", "saved note")

        surface = discover_occurrence_action_surface(
            html,
            document_url="http://127.0.0.1:3100/timeline",
            occurrence_id=OCCURRENCE_ID,
        )

        self.assertEqual(surface.current_status, "completed")
        self.assertEqual(
            set(surface.status_forms),
            {"unresolved", "completed", "not_completed"},
        )
        assert_occurrence_surface_state(
            surface,
            expected_status="completed",
            expected_note="saved note",
        )
        with self.assertRaisesRegex(ActionProtocolError, "verification status"):
            assert_occurrence_surface_state(
                surface,
                expected_status="needs_decision",
            )

    def test_next_flight_decoder_maps_named_prop_to_runtime_action_id(self):
        html = self._flight_html(self._flight_payload())

        reference = discover_server_action_reference(
            html,
            prop_name="updateAction",
            exported_name="updateBehaviorAction",
        )

        self.assertTrue(ACTION_ID_PATTERN.fullmatch(reference.action_id))
        self.assertNotIn(ACTION_ID, repr(reference))
        self.assertIn('"updateAction":"$h10"', decode_next_flight_payload(html))

    def test_accepts_production_action_metadata_stripped_by_next(self):
        payload = self._flight_payload()
        payload = payload.replace(
            '"bound":null,"name":"updateBehaviorAction","env":"Server"',
            '"bound":null',
        )

        reference = discover_server_action_reference(
            self._flight_html(payload),
            prop_name="updateAction",
            exported_name="updateBehaviorAction",
        )

        self.assertTrue(ACTION_ID_PATTERN.fullmatch(reference.action_id))
        self.assertNotIn(ACTION_ID, repr(reference))

    def test_action_reference_rejects_name_mismatch_and_hard_to_spoof_id(self):
        html = self._flight_html(self._flight_payload())
        with self.assertRaisesRegex(
            ActionProtocolError,
            "did not match",
        ):
            discover_server_action_reference(
                html,
                prop_name="updateAction",
                exported_name="archiveBehaviorAction",
            )

        invalid_payload = self._flight_payload().replace(
            ACTION_ID,
            "../unsafe",
        )
        with self.assertRaisesRegex(ActionProtocolError, "identifier"):
            discover_server_action_reference(
                self._flight_html(invalid_payload),
                prop_name="updateAction",
                exported_name="updateBehaviorAction",
            )

    def test_synthesizes_bound_action_state_without_exposing_id_in_repr(self):
        form = synthesize_action_form(
            RenderedServerActionReference(action_id=ACTION_ID),
            document_url=DOCUMENT_URL,
            stable_fields=(("behavior_id", BEHAVIOR_ID),),
        )
        fields = dict(form.fields)

        self.assertEqual(fields["$ACTION_REF_1"], "")
        self.assertEqual(
            json.loads(fields["$ACTION_1:0"]),
            {"id": ACTION_ID, "bound": "$@1"},
        )
        self.assertEqual(
            json.loads(fields["$ACTION_1:1"]),
            [{"status": "idle", "message": ""}],
        )
        self.assertEqual(fields["behavior_id"], BEHAVIOR_ID)
        self.assertNotIn(ACTION_ID, repr(form))
        self.assertEqual(
            multipart_action_fields(form)[-1],
            ("behavior_id", (None, BEHAVIOR_ID)),
        )

    def test_extracts_owned_behavior_snapshot_and_builds_guarded_update_graph(self):
        html = self._flight_html(self._flight_payload())
        snapshot = discover_behavior_snapshot(
            html,
            behavior_id=BEHAVIOR_ID,
        )
        fields = build_behavior_update_fields(
            snapshot,
            title=f"{OWNER_MARKER} updated",
            first_exact_time="10:43",
        )
        values = dict(fields)

        self.assertEqual(values["behavior_id"], BEHAVIOR_ID)
        self.assertEqual(values["behavior_schedule_id_0"], SCHEDULE_ID)
        self.assertEqual(values["schedule_0_time_entry_id_0"], SLOT_ID)
        self.assertEqual(
            values["schedule_0_time_entry_exact_time_0"],
            "10:43",
        )
        self.assertEqual(values["active"], "on")
        self.assertEqual(values["browser_reminder"], "on")
        self.assertNotIn("email_reminder", values)
        assert_behavior_state(
            snapshot,
            owner_marker=OWNER_MARKER,
            active=True,
        )

    def test_schedule_only_update_keeps_definition_fields_exact(self):
        snapshot = discover_behavior_snapshot(
            self._flight_html(self._flight_payload()),
            behavior_id=BEHAVIOR_ID,
        )

        fields = dict(
            build_behavior_update_fields(
                snapshot,
                first_exact_time="10:17",
            )
        )

        self.assertEqual(fields["title"], snapshot.title)
        self.assertEqual(fields["description"], snapshot.description)
        self.assertEqual(fields["category_id"], snapshot.category_id)

    def test_create_payload_is_one_minimal_schedule_and_keeps_action_metadata(self):
        form = RenderedActionForm(
            action=DOCUMENT_URL,
            fields=(
                ("$ACTION_REF_1", ""),
                ("title", ""),
                ("category_id", "category"),
                ("description", ""),
                ("behavior_schedule_count", "2"),
                ("behavior_schedule_id_0", "old"),
                ("schedule_0_recurrence_kind", "monthly"),
                ("schedule_0_daily_interval", "9"),
                ("schedule_0_time_entry_count", "2"),
                ("schedule_0_time_entry_id_0", "old"),
                ("schedule_0_time_entry_kind_0", "range"),
                ("schedule_0_time_entry_exact_time_0", "09:00"),
                ("reminder_offset", "4320"),
            ),
        )

        result = build_minimal_create_form(
            form,
            title=f"{OWNER_MARKER} load-created",
            description="bounded",
        )
        fields = dict(result.fields)

        self.assertIn("$ACTION_REF_1", fields)
        self.assertEqual(fields["behavior_schedule_count"], "1")
        self.assertEqual(fields["schedule_0_recurrence_kind"], "daily")
        self.assertEqual(fields["schedule_0_time_entry_count"], "1")
        self.assertEqual(
            fields["schedule_0_time_entry_exact_time_0"],
            "11:37",
        )
        self.assertEqual(fields["reminder_offset"], "0")

    def test_replace_fields_never_allows_action_metadata_replacement(self):
        form = RenderedActionForm(
            action=DOCUMENT_URL,
            fields=(("$ACTION_REF_1", ""), ("title", "old")),
        )

        updated = replace_action_fields(form, {"title": "new"})
        self.assertIn(("$ACTION_REF_1", ""), updated.fields)
        with self.assertRaisesRegex(ActionProtocolError, "stable"):
            replace_action_fields(form, {"$ACTION_REF_1": "changed"})

    def test_bounded_notes_cycle_without_unbounded_payload_growth(self):
        notes = [bounded_synthetic_note(OWNER_MARKER, index) for index in range(32)]

        self.assertEqual(len(set(notes)), 8)
        self.assertTrue(
            all(len(note) <= MAX_SYNTHETIC_NOTE_LENGTH for note in notes)
        )
        self.assertTrue(all(note.startswith(OWNER_MARKER) for note in notes))

    def test_action_response_requires_marker_for_rendered_form_but_allows_verified_lazy_post(self):
        rendered = FakeResponse(
            200,
            DOCUMENT_URL,
            {"content-type": "text/x-component"},
            b'1:{"message":"Behavior created."}',
        )
        lazy = FakeResponse(
            200,
            DOCUMENT_URL,
            {"content-type": "text/html; charset=utf-8"},
            b"<html><h1>Behaviors</h1></html>",
        )
        native_action = FakeResponse(
            200,
            DOCUMENT_URL,
            {"content-type": "text/html; charset=utf-8"},
            b"<html>Occurrence updated.</html>",
        )

        assert_action_success(rendered, marker="Behavior created.")
        assert_action_success(lazy, marker=None)
        assert_action_success(
            native_action,
            marker="Occurrence updated.",
        )
        with self.assertRaisesRegex(ActionProtocolError, "success result"):
            assert_action_success(rendered, marker="Behavior saved.")
        with self.assertRaisesRegex(ActionProtocolError, "login content"):
            assert_action_success(
                FakeResponse(
                    200,
                    DOCUMENT_URL,
                    {"content-type": "text/html"},
                    b"Continue with Google",
                ),
                marker=None,
            )

    def _occurrence_html(self, current_status, note):
        status_forms = []
        targets = ["completed", "not_completed"]
        if current_status != "unresolved":
            targets.append("unresolved")
        for index, target in enumerate(targets, start=1):
            status_forms.append(
                f"""
                <form method="post">
                  <input name="$ACTION_REF_{index}" type="hidden">
                  <input name="occurrence_id" value="{OCCURRENCE_ID}">
                  <input name="expected_status" value="{current_status}">
                  <input name="status" value="{target}">
                </form>
                """
            )
        status_forms.append(
            f"""
            <form method="post">
              <input name="$ACTION_REF_9" type="hidden">
              <input name="occurrence_id" value="{OCCURRENCE_ID}">
              <textarea name="note">{note}</textarea>
            </form>
            """
        )
        return "".join(status_forms)

    def _flight_payload(self):
        snapshot = {
            "id": BEHAVIOR_ID,
            "title": f"{OWNER_MARKER} fixture",
            "description": "Bounded fixture",
            "categoryId": "",
            "schedules": [
                {
                    "id": SCHEDULE_ID,
                    "recurrenceRule": {
                        "frequency": "daily",
                        "interval": 1,
                    },
                    "timeEntries": [
                        {
                            "id": SLOT_ID,
                            "scheduleId": SCHEDULE_ID,
                            "kind": "exact",
                            "preset": None,
                            "startTime": "09:00",
                            "endTime": None,
                            "sortOrder": 0,
                        }
                    ],
                    "sortOrder": 0,
                }
            ],
            "browserReminderEnabled": True,
            "emailReminderEnabled": False,
            "reminderOffsetMinutes": 0,
            "active": True,
        }
        definition = {
            "id": ACTION_ID,
            "bound": None,
            "name": "updateBehaviorAction",
            "env": "Server",
        }
        props = {
            "activeBehaviors": [snapshot],
            "updateAction": "$h10",
        }
        return (
            f"10:{json.dumps(definition, separators=(',', ':'))}\n"
            f"20:{json.dumps(props, separators=(',', ':'))}"
        )

    @staticmethod
    def _flight_html(payload):
        push = json.dumps([1, payload], separators=(",", ":"))
        return f"<html><script>self.__next_f.push({push})</script></html>"


if __name__ == "__main__":
    unittest.main()
