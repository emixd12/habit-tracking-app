"""One identity exercising the complete ordinary mixed mutation workload."""

from cadence_load.actions import MUTATION_TASK_WEIGHTS
from cadence_load.users.daily import CadenceDailyTrackerUser
from cadence_load.users.exporter import CadenceExporterUser
from cadence_load.users.maintainer import CadenceBehaviorMaintainerUser
from cadence_load.users.reviewer import CadenceReflectiveReviewerUser


class CadenceMixedCalibrationUser(
    CadenceDailyTrackerUser,
    CadenceBehaviorMaintainerUser,
    CadenceReflectiveReviewerUser,
    CadenceExporterUser,
):
    """Run every ordinary mixed task against one authenticated identity."""

    weight = sum(MUTATION_TASK_WEIGHTS.values())

    def on_identity_ready(self) -> None:
        CadenceDailyTrackerUser.on_identity_ready(self)
        CadenceBehaviorMaintainerUser.on_identity_ready(self)
        CadenceReflectiveReviewerUser.on_identity_ready(self)
