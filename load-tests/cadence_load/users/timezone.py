"""Separately tagged, bounded changed-timezone mutation user."""

from __future__ import annotations

from locust import between, task

from cadence_load.actions import (
    TIMEZONE_REQUEST_NAME,
    ActionProtocolError,
    AuthenticatedActionUser,
    TimezoneActionSurface,
    discover_timezone_action_surface,
    replace_action_fields,
    selector_value,
)
from cadence_load.data import REQUEST_BY_KEY


ALTERNATE_TIMEZONES = (
    "America/Chicago",
    "America/New_York",
)
CHANGED_TIMEZONE_THINK_TIME_SECONDS = (45.0, 75.0)
MAX_CHANGED_TIMEZONE_WRITES_PER_USER = 4


def select_alternate_timezone(profile_timezone: str) -> str:
    """Choose one fixed valid IANA timezone different from the fixture value."""

    for timezone in ALTERNATE_TIMEZONES:
        if timezone != profile_timezone:
            return timezone
    raise ActionProtocolError(
        "The changed-timezone profile could not choose a safe alternate."
    )


def resolve_next_timezone(
    *,
    profile_timezone: str,
    alternate_timezone: str,
    current_timezone: str,
) -> str:
    """Toggle only between the fixture timezone and its fixed alternate."""

    if profile_timezone == alternate_timezone:
        raise ActionProtocolError(
            "The changed-timezone profile requires distinct timezone states."
        )
    if current_timezone == profile_timezone:
        return alternate_timezone
    if current_timezone == alternate_timezone:
        return profile_timezone
    raise ActionProtocolError(
        "The rendered timezone was outside the bounded profile states."
    )


class CadenceChangedTimezoneUser(AuthenticatedActionUser):
    """Perform at most four low-frequency, two-state timezone writes."""

    weight = 1
    wait_time = between(*CHANGED_TIMEZONE_THINK_TIME_SECONDS)

    def on_identity_ready(self) -> None:
        identity = self.required_identity()
        self._profile_timezone = selector_value(
            identity,
            "profile_timezone",
        )
        self._alternate_timezone = select_alternate_timezone(
            self._profile_timezone
        )
        self._changed_timezone_writes = 0

    @task(1)
    def task_changed_timezone(self) -> None:
        surface = self._load_timezone_surface()
        if (
            self._changed_timezone_writes
            >= MAX_CHANGED_TIMEZONE_WRITES_PER_USER
        ):
            self._assert_bounded_timezone(surface.timezone)
            return

        target_timezone = resolve_next_timezone(
            profile_timezone=self._profile_timezone,
            alternate_timezone=self._alternate_timezone,
            current_timezone=surface.timezone,
        )
        form = replace_action_fields(
            surface.form,
            {"timezone": target_timezone},
        )
        receipt = self.submit_action(
            form,
            referer=f"{self.base_url}/settings",
            name=TIMEZONE_REQUEST_NAME,
            success_marker="Timezone saved.",
        )
        refreshed = self._load_timezone_surface()
        if refreshed.timezone != target_timezone:
            raise ActionProtocolError(
                "The refreshed Settings page did not expose the submitted "
                "timezone."
            )
        self.verify_action(receipt)
        self._changed_timezone_writes += 1

    def _assert_bounded_timezone(self, timezone: str) -> None:
        if timezone not in {
            self._profile_timezone,
            self._alternate_timezone,
        }:
            raise ActionProtocolError(
                "The rendered timezone was outside the bounded profile states."
            )

    def _load_timezone_surface(self) -> TimezoneActionSurface:
        result = self.protected_document(
            REQUEST_BY_KEY["settings"],
            transform=lambda body, url: discover_timezone_action_surface(
                body,
                document_url=url,
            ),
        )
        if not isinstance(result, TimezoneActionSurface):
            raise ActionProtocolError(
                "The changed-timezone action surface was unavailable."
            )
        return result
