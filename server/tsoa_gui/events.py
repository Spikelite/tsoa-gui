"""The event stream each browser reads: the whole model, then what changes."""
import asyncio
import json
from collections.abc import AsyncIterator, Callable

from fastapi.sse import ServerSentEvent

from .feed import Feed
from .model import System
from .patch import diff

# How long the browser waits before reconnecting after losing the stream.
RETRY_MS = 2000
# How often a stream waiting for the next model looks to see whether the
# server is stopping, and so the most a stop waits on an open stream.
STOPPING_CHECK_S = 1.0


async def model_events(feed: Feed, stopping: Callable[[], bool] = lambda: False) -> AsyncIterator[ServerSentEvent]:
    """The stream, which ends once stopping() is true, so a server's graceful shutdown never has to cut it off."""
    # Listening starts before the latest model is read, so nothing published
    # in between is missed. A reconnecting browser starts again from the
    # whole model, so no event needs an id.
    with feed.listen() as queue:
        model = feed.latest if feed.latest is not None else await _next(queue, stopping)
        if model is None:
            return
        sent = model.model_dump(mode="json")
        yield ServerSentEvent(event="model", raw_data=json.dumps(sent, separators=(",", ":")), retry=RETRY_MS)
        while (model := await _next(queue, stopping)) is not None:
            current = model.model_dump(mode="json")
            patch = diff(sent, current)
            if patch:
                yield ServerSentEvent(event="patch", raw_data=json.dumps(patch, separators=(",", ":")))
                sent = current


async def _next(queue: "asyncio.Queue[System]", stopping: Callable[[], bool]) -> System | None:
    """The next model published, or None once the server is stopping."""
    while not stopping():
        try:
            return await asyncio.wait_for(queue.get(), STOPPING_CHECK_S)
        except TimeoutError:
            pass
    return None
