import asyncio
import json

from tsoa_gui.events import RETRY_MS, model_events
from tsoa_gui.feed import Feed
from tsoa_gui.mock import snapshot
from tsoa_gui.patch import apply


def run(scenario):
    asyncio.run(asyncio.wait_for(scenario(), 5))


def test_the_stream_starts_with_the_whole_model_then_sends_changes():
    async def scenario():
        feed = Feed()
        feed.publish(snapshot(10))
        events = model_events(feed)

        first = await anext(events)
        assert first.event == "model" and first.retry == RETRY_MS
        model = json.loads(first.raw_data)
        assert model == snapshot(10).model_dump(mode="json")

        feed.publish(snapshot(11))
        second = await anext(events)
        assert second.event == "patch"
        assert apply(model, json.loads(second.raw_data)) == snapshot(11).model_dump(mode="json")
        await events.aclose()

    run(scenario)


def test_the_stream_ends_once_the_server_is_stopping():
    async def scenario():
        feed = Feed()
        feed.publish(snapshot(10))
        stopping = False
        events = model_events(feed, lambda: stopping)
        assert (await anext(events)).event == "model"
        stopping = True
        # It ends while waiting for a change, without one ever being published.
        try:
            await anext(events)
        except StopAsyncIteration:
            return
        raise AssertionError("the stream went on after the server began to stop")

    run(scenario)


def test_a_stream_that_has_sent_nothing_ends_once_the_server_is_stopping():
    async def scenario():
        events = model_events(Feed(), lambda: True)
        try:
            await anext(events)
        except StopAsyncIteration:
            return
        raise AssertionError("the stream went on after the server began to stop")

    run(scenario)


def test_the_stream_waits_for_the_first_reading():
    async def scenario():
        feed = Feed()
        events = model_events(feed)
        pending = asyncio.ensure_future(anext(events))
        await asyncio.sleep(0.05)
        assert not pending.done()
        feed.publish(snapshot(3))
        first = await pending
        assert first.event == "model"
        await events.aclose()

    run(scenario)


def test_an_unchanged_model_sends_nothing():
    async def scenario():
        feed = Feed()
        feed.publish(snapshot(20))
        events = model_events(feed)
        await anext(events)

        feed.publish(snapshot(20))
        quiet = asyncio.ensure_future(anext(events))
        await asyncio.sleep(0.05)
        assert not quiet.done()

        feed.publish(snapshot(21))
        assert (await quiet).event == "patch"
        await events.aclose()

    run(scenario)
