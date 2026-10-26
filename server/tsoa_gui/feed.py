"""The latest system model, handed to everyone listening whenever it changes."""
import asyncio
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Literal

from .model import System

# Why there is no model yet, which the page says once it has waited a while:
# the job has not yet reached the device's broker or given up on it, it cannot
# reach it, or it reaches it but has heard no readings.
Waiting = Literal["connecting", "broker_unreachable", "broker_silent"]


class Feed:
    def __init__(self, prepare: Callable[[System], System] | None = None) -> None:
        # What the server works out over time, such as the battery's time
        # left, is added here, whichever job built the model.
        self._prepare = prepare
        self.latest: System | None = None
        self.waiting: Waiting = "connecting"
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
