"""Fixed-slot Behavior lifecycle and unchanged-timezone mutation user."""

from __future__ import annotations

from dataclasses import dataclass

from locust import task

from cadence_load.actions import (
    MUTATION_TASK_WEIGHTS,
    ActionProtocolError,
    AuthenticatedActionUser,
    BehaviorSnapshot,
    RenderedActionForm,
    RenderedServerActionReference,
    TIMEZONE_REQUEST_NAME,
    TimezoneActionSurface,
    assert_behavior_state,
    build_behavior_update_fields,
    build_minimal_create_form,
    discover_action_form,
    discover_behavior_snapshot,
    discover_server_action_reference,
    discover_timezone_action_surface,
    selector_value,
    synthesize_action_form,
)
from cadence_load.data import REQUEST_BY_KEY
from cadence_load.semantic_evidence import MutationReceipt


CREATE_REQUEST_NAME = "INT-BEHAVIOR-019 POST /behaviors server-action"
UPDATE_REQUEST_NAME = "INT-BEHAVIOR-020 POST /behaviors server-action"
ARCHIVE_REQUEST_NAME = "INT-BEHAVIOR-022 POST /behaviors server-action"
RESTORE_REQUEST_NAME = "INT-BEHAVIOR-023 POST /behaviors server-action"


@dataclass(frozen=True, repr=False)
class _BehaviorActionSurface:
    snapshot: BehaviorSnapshot
    update: RenderedServerActionReference
    archive: RenderedServerActionReference
    restore: RenderedServerActionReference


@dataclass(frozen=True, repr=False)
class _CreateActionSurface:
    already_exists: bool
    form: RenderedActionForm | None


class CadenceBehaviorMaintainerUser(AuthenticatedActionUser):
    """One create maximum, then bounded cycles ending in canonical active state."""

    weight = sum(
        MUTATION_TASK_WEIGHTS[key]
        for key in (
            "behaviors_read",
            "behavior_create",
            "behavior_update",
            "behavior_archive",
            "behavior_restore",
            "timezone_unchanged",
        )
    )

    def on_identity_ready(self) -> None:
        identity = self.required_identity()
        self._maintainer_behavior_id = selector_value(
            identity,
            "maintainer_behavior_id",
            kind="uuid",
        )
        self._maintainer_schedule_only_behavior_id = selector_value(
            identity,
            "schedule_only_behavior_id",
            kind="uuid",
        )
        self._maintainer_created_once = False
        self._maintainer_update_sequence = 0

    @task(MUTATION_TASK_WEIGHTS["behaviors_read"])
    def task_behaviors_read(self) -> None:
        self.protected_document(REQUEST_BY_KEY["behaviors"])

    @task(MUTATION_TASK_WEIGHTS["behavior_create"])
    def task_behavior_create(self) -> None:
        if self._maintainer_created_once:
            self.protected_document(REQUEST_BY_KEY["behaviors"])
            return

        identity = self.required_identity()
        title = f"{identity.selectors.owner_marker} load-created"
        surface = self.protected_document(
            REQUEST_BY_KEY["behaviors"],
            transform=lambda body, url: _discover_create_surface(
                body,
                url,
                title,
            ),
        )
        if not isinstance(surface, _CreateActionSurface):
            raise ActionProtocolError(
                "The create Behavior action form was unavailable."
        )
        if surface.already_exists:
            self._maintainer_created_once = True
            return
        if surface.form is None:
            raise ActionProtocolError(
                "The create Behavior action form was unavailable."
            )
        create_form = build_minimal_create_form(
            surface.form,
            title=title,
            description="Bounded local mutation fixture.",
        )
        receipt = self.submit_action(
            create_form,
            referer=f"{self.base_url}/behaviors",
            name=CREATE_REQUEST_NAME,
            success_marker="Behavior created.",
        )
        visible = self.protected_document(
            REQUEST_BY_KEY["behaviors"],
            transform=lambda body, _url: title in body,
        )
        if visible is not True:
            raise ActionProtocolError(
                "The refreshed Behaviors page lacked the created Behavior."
            )
        self.verify_action(receipt)
        self._maintainer_created_once = True

    @task(MUTATION_TASK_WEIGHTS["behavior_update"])
    def task_behavior_update(self) -> None:
        if self._maintainer_update_sequence % 2 == 0:
            self._update_title()
        else:
            self._update_schedule_time()
        self._maintainer_update_sequence += 1

    @task(MUTATION_TASK_WEIGHTS["behavior_archive"])
    def task_behavior_archive(self) -> None:
        surface = self._load_behavior_surface(self._maintainer_behavior_id)
        if not surface.snapshot.active:
            receipt = self._restore(surface)
            surface = self._load_behavior_surface(self._maintainer_behavior_id)
            assert_behavior_state(
                surface.snapshot,
                owner_marker=self.required_identity().selectors.owner_marker,
                active=True,
            )
            self.verify_action(receipt)
        receipt = self._archive(surface)
        surface = self._load_behavior_surface(self._maintainer_behavior_id)
        assert_behavior_state(
            surface.snapshot,
            owner_marker=self.required_identity().selectors.owner_marker,
            active=False,
        )
        self.verify_action(receipt)
        receipt = self._restore(surface)
        assert_behavior_state(
            self._load_behavior_surface(
                self._maintainer_behavior_id
            ).snapshot,
            owner_marker=self.required_identity().selectors.owner_marker,
            active=True,
        )
        self.verify_action(receipt)

    @task(MUTATION_TASK_WEIGHTS["behavior_restore"])
    def task_behavior_restore(self) -> None:
        surface = self._load_behavior_surface(self._maintainer_behavior_id)
        if surface.snapshot.active:
            receipt = self._archive(surface)
            surface = self._load_behavior_surface(self._maintainer_behavior_id)
            assert_behavior_state(
                surface.snapshot,
                owner_marker=self.required_identity().selectors.owner_marker,
                active=False,
            )
            self.verify_action(receipt)
        receipt = self._restore(surface)
        assert_behavior_state(
            self._load_behavior_surface(
                self._maintainer_behavior_id
            ).snapshot,
            owner_marker=self.required_identity().selectors.owner_marker,
            active=True,
        )
        self.verify_action(receipt)

    @task(MUTATION_TASK_WEIGHTS["timezone_unchanged"])
    def task_timezone_unchanged(self) -> None:
        surface = self._load_timezone_surface()
        receipt = self.submit_action(
            surface.form,
            referer=f"{self.base_url}/settings",
            name=TIMEZONE_REQUEST_NAME,
            success_marker="Timezone is already saved.",
        )
        refreshed = self._load_timezone_surface()
        if refreshed.timezone != surface.timezone:
            raise ActionProtocolError(
                "The unchanged timezone action changed the rendered timezone."
            )
        self.verify_action(receipt)

    def _update_title(self) -> None:
        surface = self._ensure_active(self._maintainer_behavior_id)
        identity = self.required_identity()
        marker = identity.selectors.owner_marker
        baseline_title = selector_value(
            identity,
            "maintainer_behavior_title",
        )
        title = f"{marker} maintainer-a"
        if surface.snapshot.title == title:
            self._update_schedule_time()
            return
        if surface.snapshot.title != baseline_title:
            raise ActionProtocolError(
                "The maintainer behavior title was outside its bounded "
                "baseline state."
            )
        fields = build_behavior_update_fields(
            surface.snapshot,
            title=title,
        )
        form = synthesize_action_form(
            surface.update,
            document_url=f"{self.base_url}/behaviors",
            stable_fields=fields,
        )
        receipt = self.submit_action(
            form,
            referer=f"{self.base_url}/behaviors",
            name=UPDATE_REQUEST_NAME,
            success_marker=None,
        )
        assert_behavior_state(
            self._load_behavior_surface(
                self._maintainer_behavior_id
            ).snapshot,
            owner_marker=marker,
            active=True,
            title=title,
        )
        self.verify_action(receipt)

    def _update_schedule_time(self) -> None:
        surface = self._ensure_active(
            self._maintainer_schedule_only_behavior_id
        )
        current_time = _first_exact_time(surface.snapshot)
        next_time = "10:43" if current_time != "10:43" else "10:17"
        fields = build_behavior_update_fields(
            surface.snapshot,
            first_exact_time=next_time,
        )
        form = synthesize_action_form(
            surface.update,
            document_url=f"{self.base_url}/behaviors",
            stable_fields=fields,
        )
        receipt = self.submit_action(
            form,
            referer=f"{self.base_url}/behaviors",
            name=UPDATE_REQUEST_NAME,
            success_marker=None,
        )
        assert_behavior_state(
            self._load_behavior_surface(
                self._maintainer_schedule_only_behavior_id
            ).snapshot,
            owner_marker=self.required_identity().selectors.owner_marker,
            active=True,
            title=surface.snapshot.title,
            first_exact_time=next_time,
        )
        self.verify_action(receipt)

    def _ensure_active(self, behavior_id: str) -> _BehaviorActionSurface:
        surface = self._load_behavior_surface(behavior_id)
        if surface.snapshot.active:
            return surface
        receipt = self._restore(surface)
        refreshed = self._load_behavior_surface(behavior_id)
        assert_behavior_state(
            refreshed.snapshot,
            owner_marker=self.required_identity().selectors.owner_marker,
            active=True,
        )
        self.verify_action(receipt)
        return refreshed

    def _archive(
        self,
        surface: _BehaviorActionSurface,
    ) -> MutationReceipt:
        form = synthesize_action_form(
            surface.archive,
            document_url=f"{self.base_url}/behaviors",
            stable_fields=(("behavior_id", surface.snapshot.id),),
        )
        return self.submit_action(
            form,
            referer=f"{self.base_url}/behaviors",
            name=ARCHIVE_REQUEST_NAME,
            success_marker=None,
        )

    def _restore(
        self,
        surface: _BehaviorActionSurface,
    ) -> MutationReceipt:
        form = synthesize_action_form(
            surface.restore,
            document_url=f"{self.base_url}/behaviors",
            stable_fields=(("behavior_id", surface.snapshot.id),),
        )
        return self.submit_action(
            form,
            referer=f"{self.base_url}/behaviors",
            name=RESTORE_REQUEST_NAME,
            success_marker=None,
        )

    def _load_behavior_surface(
        self,
        behavior_id: str,
    ) -> _BehaviorActionSurface:
        result = self.protected_document(
            REQUEST_BY_KEY["behaviors"],
            transform=lambda body, _url: _discover_behavior_surface(
                body,
                behavior_id,
            ),
        )
        if not isinstance(result, _BehaviorActionSurface):
            raise ActionProtocolError(
                "The behavior mutation action surface was unavailable."
            )
        return result

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
                "The unchanged timezone action surface was unavailable."
            )
        return result


def _discover_behavior_surface(
    body: str,
    behavior_id: str,
) -> _BehaviorActionSurface:
    return _BehaviorActionSurface(
        snapshot=discover_behavior_snapshot(
            body,
            behavior_id=behavior_id,
        ),
        update=discover_server_action_reference(
            body,
            prop_name="updateAction",
            exported_name="updateBehaviorAction",
        ),
        archive=discover_server_action_reference(
            body,
            prop_name="archiveAction",
            exported_name="archiveBehaviorAction",
        ),
        restore=discover_server_action_reference(
            body,
            prop_name="restoreAction",
            exported_name="restoreBehaviorAction",
        ),
    )


def _discover_create_surface(
    body: str,
    url: str,
    title: str,
) -> _CreateActionSurface:
    if title in body:
        return _CreateActionSurface(already_exists=True, form=None)
    return _CreateActionSurface(
        already_exists=False,
        form=discover_action_form(
            body,
            document_url=url,
            required_fields={
                "title": None,
                "behavior_schedule_count": None,
            },
            absent_fields=("behavior_id",),
        ),
    )


def _first_exact_time(snapshot: BehaviorSnapshot) -> str:
    if not snapshot.schedules:
        raise ActionProtocolError(
            "The schedule-only behavior lacked a schedule."
        )
    entries = snapshot.schedules[0].get("timeEntries")
    if (
        not isinstance(entries, list)
        or len(entries) != 1
        or not isinstance(entries[0], dict)
        or entries[0].get("kind") != "exact"
        or not isinstance(entries[0].get("startTime"), str)
    ):
        raise ActionProtocolError(
            "The schedule-only behavior was not one exact-time fixed slot."
        )
    return str(entries[0]["startTime"])
