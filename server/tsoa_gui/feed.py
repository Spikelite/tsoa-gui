"""The latest system model, handed to everyone listening whenever it changes."""
import asyncio
from collections.abc import Iterator
from contextlib import contextmanager

from .model import System


class Feed:
    def __init__(self) -> None:
        self.latest: System | None = None
        self._listeners: set[asyncio.Queue[System]] = set()

    def publish(self, model: System) -> None:
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
