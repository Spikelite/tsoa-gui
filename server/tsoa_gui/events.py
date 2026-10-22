"""The event stream each browser reads: the whole model, then what changes."""
import json
from collections.abc import AsyncIterator

from fastapi.sse import ServerSentEvent

from .feed import Feed
from .patch import diff

# How long the browser waits before reconnecting after losing the stream.
RETRY_MS = 2000


async def model_events(feed: Feed) -> AsyncIterator[ServerSentEvent]:
    # Listening starts before the latest model is read, so nothing published
    # in between is missed. A reconnecting browser starts again from the
    # whole model, so no event needs an id.
    with feed.listen() as queue:
        model = feed.latest if feed.latest is not None else await queue.get()
        sent = model.model_dump(mode="json")
        yield ServerSentEvent(event="model", raw_data=json.dumps(sent, separators=(",", ":")), retry=RETRY_MS)
        while True:
            current = (await queue.get()).model_dump(mode="json")
            patch = diff(sent, current)
            if patch:
                yield ServerSentEvent(event="patch", raw_data=json.dumps(patch, separators=(",", ":")))
                sent = current
