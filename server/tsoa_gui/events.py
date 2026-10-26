"""The event stream each browser reads: the release, then the whole model, then what changes."""
import asyncio
import json
from collections.abc import AsyncIterator, Callable
from typing import Any

from fastapi.sse import ServerSentEvent

from .feed import Feed
from .model import System
from .patch import diff

# How long the browser waits before reconnecting after losing the stream.
RETRY_MS = 2000
# How often a stream waiting for the next model looks to see whether the
# server is stopping, and so the most a stop waits on an open stream.
STOPPING_CHECK_S = 1.0


async def model_events(feed: Feed, stopping: Callable[[], bool] = lambda: False,
                       release: dict[str, Any] | None = None) -> AsyncIterator[ServerSentEvent]:
    """The stream, which ends once stopping() is true, so a server's graceful shutdown never has to cut it off.

    It opens with release, which says what the server is running, so a page
    left open across an update finds out as soon as it reconnects. Until there
    is a model, it says why not each time that changes.
    """
    if stopping():
        return
    # Listening starts before the latest model is read, so nothing published
    # in between is missed. A reconnecting browser starts again from the
    # whole model, so no event needs an id.
    with feed.listen() as queue:
        yield ServerSentEvent(event="release", raw_data=_json(release or {}), retry=RETRY_MS)
        model = feed.latest
        told = None
        while model is None:
            if feed.waiting != told:
                told = feed.waiting
                yield ServerSentEvent(event="status", raw_data=_json({"waiting": told}))
            if stopping():
                return
            model = await _take(queue)
        sent = model.model_dump(mode="json")
        yield ServerSentEvent(event="model", raw_data=_json(sent))
        while (model := await _next(queue, stopping)) is not None:
            current = model.model_dump(mode="json")
            patch = diff(sent, current)
            if patch:
                yield ServerSentEvent(event="patch", raw_data=_json(patch))
                sent = current


def _json(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"))


async def _take(queue: "asyncio.Queue[System]") -> System | None:
    """The next model published within STOPPING_CHECK_S, if there is one."""
    try:
        return await asyncio.wait_for(queue.get(), STOPPING_CHECK_S)
    except TimeoutError:
        return None


async def _next(queue: "asyncio.Queue[System]", stopping: Callable[[], bool]) -> System | None:
    """The next model published, or None once the server is stopping."""
    while not stopping():
        if (model := await _take(queue)) is not None:
            return model
    return None
