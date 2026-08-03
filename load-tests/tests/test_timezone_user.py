import unittest
from collections import deque
from types import SimpleNamespace

from cadence_load.actions import (
    TIMEZONE_REQUEST_NAME,
    ActionProtocolError,
    RenderedActionForm,
    TimezoneActionSurface,
    discover_timezone_action_surface,
)
from cadence_load.users.timezone import (
    ALTERNATE_TIMEZONES,
    CHANGED_TIMEZONE_THINK_TIME_SECONDS,
    MAX_CHANGED_TIMEZONE_WRITES_PER_USER,
    CadenceChangedTimezoneUser,
    resolve_next_timezone,
    select_alternate_timezone,
)


PROFILE_TIMEZONE = "America/New_York"
ALTERNATE_TIMEZONE = "America/Chicago"
SETTINGS_URL = "http://127.0.0.1:3100/settings"


def timezone_surface(timezone: str) -> TimezoneActionSurface:
    return TimezoneActionSurface(
        form=RenderedActionForm(
            action=SETTINGS_URL,
            fields=(
                ("$ACTION_REF_1", ""),
                ("timezone", timezone),
            ),
        ),
        timezone=timezone,
    )


class FakeChangedTimezoneUser:
    base_url = "http://127.0.0.1:3100"

    def __init__(self, surfaces):
        self._profile_timezone = PROFILE_TIMEZONE
        self._alternate_timezone = ALTERNATE_TIMEZONE
        self._changed_timezone_writes = 0
        self.surfaces = deque(surfaces)
        self.submissions = []
        self.verifications = []

    def _load_timezone_surface(self):
        return self.surfaces.popleft()

    def _assert_bounded_timezone(self, timezone):
        return CadenceChangedTimezoneUser._assert_bounded_timezone(
            self,
            timezone,
        )

    def submit_action(self, form, **kwargs):
        self.submissions.append((form, kwargs))
        return object()

    def verify_action(self, receipt):
        self.verifications.append(receipt)


class ChangedTimezoneUserTests(unittest.TestCase):
    def test_selects_a_fixed_valid_alternate_different_from_profile(self):
        for profile_timezone in (
            "America/New_York",
            "America/Chicago",
            "Europe/Paris",
        ):
            with self.subTest(profile_timezone=profile_timezone):
                alternate = select_alternate_timezone(profile_timezone)
                self.assertIn(alternate, ALTERNATE_TIMEZONES)
                self.assertNotEqual(alternate, profile_timezone)

    def test_next_timezone_toggles_only_between_the_two_bounded_states(self):
        self.assertEqual(
            resolve_next_timezone(
                profile_timezone=PROFILE_TIMEZONE,
                alternate_timezone=ALTERNATE_TIMEZONE,
                current_timezone=PROFILE_TIMEZONE,
            ),
            ALTERNATE_TIMEZONE,
        )
        self.assertEqual(
            resolve_next_timezone(
                profile_timezone=PROFILE_TIMEZONE,
                alternate_timezone=ALTERNATE_TIMEZONE,
                current_timezone=ALTERNATE_TIMEZONE,
            ),
            PROFILE_TIMEZONE,
        )
        with self.assertRaisesRegex(
            ActionProtocolError,
            "outside the bounded profile states",
        ):
            resolve_next_timezone(
                profile_timezone=PROFILE_TIMEZONE,
                alternate_timezone=ALTERNATE_TIMEZONE,
                current_timezone="Europe/Paris",
            )

    def test_discovers_the_shared_rendered_timezone_action_surface(self):
        html = """
        <form action="/settings" method="post">
          <input type="hidden" name="$ACTION_REF_1" value="">
          <select name="timezone">
            <option value="America/Chicago">America/Chicago</option>
            <option value="America/New_York" selected>
              America/New_York
            </option>
          </select>
        </form>
        """

        surface = discover_timezone_action_surface(
            html,
            document_url=SETTINGS_URL,
        )

        self.assertEqual(surface.timezone, PROFILE_TIMEZONE)
        self.assertIn(
            ("timezone", PROFILE_TIMEZONE),
            surface.form.fields,
        )

    def test_identity_setup_uses_profile_selector_and_resets_write_budget(self):
        class FakeIdentityUser:
            def required_identity(self):
                return SimpleNamespace(
                    selectors=SimpleNamespace(
                        profile_timezone=PROFILE_TIMEZONE,
                    )
                )

        user = FakeIdentityUser()
        CadenceChangedTimezoneUser.on_identity_ready(user)

        self.assertEqual(user._profile_timezone, PROFILE_TIMEZONE)
        self.assertEqual(user._alternate_timezone, ALTERNATE_TIMEZONE)
        self.assertEqual(user._changed_timezone_writes, 0)

    def test_write_uses_real_action_and_verifies_the_refreshed_timezone(self):
        user = FakeChangedTimezoneUser(
            [
                timezone_surface(PROFILE_TIMEZONE),
                timezone_surface(ALTERNATE_TIMEZONE),
            ]
        )

        CadenceChangedTimezoneUser.task_changed_timezone(user)

        self.assertEqual(user._changed_timezone_writes, 1)
        self.assertEqual(len(user.submissions), 1)
        self.assertEqual(len(user.verifications), 1)
        form, options = user.submissions[0]
        self.assertIn(("timezone", ALTERNATE_TIMEZONE), form.fields)
        self.assertEqual(options["name"], TIMEZONE_REQUEST_NAME)
        self.assertEqual(options["referer"], SETTINGS_URL)
        self.assertEqual(options["success_marker"], "Timezone saved.")

    def test_write_fails_if_refreshed_settings_does_not_match(self):
        user = FakeChangedTimezoneUser(
            [
                timezone_surface(PROFILE_TIMEZONE),
                timezone_surface(PROFILE_TIMEZONE),
            ]
        )

        with self.assertRaisesRegex(
            ActionProtocolError,
            "did not expose the submitted timezone",
        ):
            CadenceChangedTimezoneUser.task_changed_timezone(user)

        self.assertEqual(user._changed_timezone_writes, 0)
        self.assertEqual(user.verifications, [])

    def test_write_budget_turns_later_iterations_into_verified_reads(self):
        user = FakeChangedTimezoneUser(
            [timezone_surface(PROFILE_TIMEZONE)]
        )
        user._changed_timezone_writes = MAX_CHANGED_TIMEZONE_WRITES_PER_USER

        CadenceChangedTimezoneUser.task_changed_timezone(user)

        self.assertEqual(user.submissions, [])
        self.assertEqual(
            user._changed_timezone_writes,
            MAX_CHANGED_TIMEZONE_WRITES_PER_USER,
        )

    def test_profile_is_explicitly_low_frequency_and_stably_named(self):
        self.assertEqual(CHANGED_TIMEZONE_THINK_TIME_SECONDS, (45.0, 75.0))
        self.assertEqual(MAX_CHANGED_TIMEZONE_WRITES_PER_USER, 4)
        self.assertEqual(
            TIMEZONE_REQUEST_NAME,
            "INT-SETTINGS-003 POST /settings server-action",
        )
        self.assertEqual(
            CadenceChangedTimezoneUser.task_changed_timezone.locust_task_weight,
            1,
        )


if __name__ == "__main__":
    unittest.main()
