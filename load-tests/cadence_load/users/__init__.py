"""Locust user package without eager profile-specific imports."""

__all__ = ["CadenceReadUser"]


def __getattr__(name: str):
    if name == "CadenceReadUser":
        from cadence_load.users.reader import CadenceReadUser

        return CadenceReadUser
    raise AttributeError(name)
