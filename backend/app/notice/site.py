"""Who asked the database.

A slow trip and a timeout name the same caller. The transport frames are the
pipe: naming them made every timeout one cause, and the function a person was
waiting on disappeared.
"""

from __future__ import annotations

import traceback
from pathlib import Path

#: Frames that move a query and never ask one. The site is the first frame
#: outside them.
TRANSPORT_FILES = (
    "app/database.py",
    "app/services/read_budget.py",
    "app/db_safe.py",
    "app/notice/site.py",
    "app/security/error_handling.py",
    "app/services/background/dispatch.py",
)

_LIBRARY = ("site-packages/", "/httpx/", "/httpcore/", "/postgrest/", "/gotrue/")


def app_relative(filename: str) -> str | None:
    parts = filename.replace("\\", "/").split("/")
    try:
        index = len(parts) - 1 - parts[::-1].index("app")
    except ValueError:
        return None
    return "/".join(parts[index:])


def asking_site(exc: BaseException | None = None) -> tuple[str, str] | None:
    """The caller behind `exc`, or behind the live stack when `exc` is None.

    Walks `__cause__` then `__context__` after the exception itself, so a
    client library that re-raises still names the application frame. None
    when the only frames are the transport.
    """
    if exc is None:
        return _from_frames(traceback.extract_stack())
    seen: set[int] = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        found = _from_frames(traceback.extract_tb(current.__traceback__))
        if found is not None:
            return found
        nxt = current.__cause__
        if nxt is None:
            nxt = current.__context__
        current = nxt
    return None


def _from_frames(frames: list[traceback.FrameSummary]) -> tuple[str, str] | None:
    for frame in reversed(frames):
        rel = app_relative(frame.filename)
        if rel is not None and rel not in TRANSPORT_FILES:
            return rel, frame.name
    for frame in reversed(frames):
        path = frame.filename.replace("\\", "/")
        if any(part in path for part in _LIBRARY):
            continue
        rel = app_relative(frame.filename)
        if rel in TRANSPORT_FILES:
            continue
        name = Path(frame.filename).name
        if name:
            return name, frame.name
    return None
