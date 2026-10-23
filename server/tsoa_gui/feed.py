"""The latest system model, handed to everyone listening whenever it changes."""
import asyncio
from collections.abc import Callable, Iterator
from contextlib import contextmanager

from .model import System


class Feed:
    def __init__(self, prepare: Callable[[System], System] | None = None) -> None:
        # What the server works out over time, such as the battery's time
        # left, is added here, whichever job built the model.
        self._prepare = prepare
        self.latest: System | None = None
        self._listeners: set[asyncio.Queue[System]] = set()

    def publish(self, model: System) -> None:
        if self._prepare is not None:
            model = self._prepare(model)
        self.latest = model
        for queue in self._listeners:
            # A listener that has fallen behind needs only the newest model,
            # since it is told what changed since the last one it took.
            if queue.full():
                queue.get_nowait()
            queue.put_nowait(model)

    @contextmanager
    def listen(self) -> Iterator[asyncio.Queue[System]]:
        queue: asyncio.Queue[System] = asyncio.Queue(maxsize=1)
        self._listeners.add(queue)
        try:
            yield queue
        finally:
            self._listeners.discard(queue)
