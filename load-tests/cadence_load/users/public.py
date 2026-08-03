"""Anonymous public-request helpers for an identity-owning Locust user."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator, Protocol


class CookieJarLike(Protocol):
    def copy(self): ...

    def clear(self) -> None: ...

    def update(self, values) -> None: ...


@contextmanager
def anonymous_cookie_jar(cookie_jar: CookieJarLike) -> Iterator[None]:
    """Clear one VU's cookies for a public request and always restore them."""

    authenticated_snapshot = cookie_jar.copy()
    cookie_jar.clear()
    try:
        yield
    finally:
        cookie_jar.clear()
        cookie_jar.update(authenticated_snapshot)
