"""The event stream each browser reads: the release, then the whole model, then what changes."""
import asyncio
import json
from collections import Counter
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

# Viewing needs no sign-in, so without a limit anything on the network could
# open streams until the device ran out of memory or file descriptors. Every
# screen in a household or on a boat is a handful, far below either cap.
# Behind a proxy every stream comes from the proxy's address, so the screens
# behind it share the per-address cap.
MAX_STREAMS = 100
MAX_STREAMS_PER_ADDRESS = 20
# How long a refused browser waits before trying again, in seconds.
RETRY_AFTER_S = 30


class StreamLimit:
    """Counts the open streams, in all and from each address, and refuses any past the caps."""

    def __init__(self, total: int = MAX_STREAMS, per_address: int = MAX_STREAMS_PER_ADDRESS) -> None:
        self.total = total
        self.per_address = per_address
        self._open: Counter[str] = Counter()

    def take(self, address: str) -> bool:
        """Takes a place for a stream from address, or returns False if there is none."""
        if self._open.total() >= self.total or self._open[address] >= self.per_address:
            return False
        self._open[address] += 1
        return True

    def give_back(self, address: str) -> None:
        self._open[address] -= 1
        if self._open[address] <= 0:
            del self._open[address]


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


def busy_event() -> ServerSentEvent:
    """The whole of a stream refused for want of a place: it says so, and when to try again."""
    return ServerSentEvent(event="busy", raw_data=_json({"retry_after_s": RETRY_AFTER_S}),
                           retry=RETRY_AFTER_S * 1000)


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
