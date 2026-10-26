import asyncio
import json

from tsoa_gui.events import RETRY_MS, STOPPING_CHECK_S, model_events
from tsoa_gui.feed import Feed
from tsoa_gui.mock import snapshot
from tsoa_gui.patch import apply


def run(scenario):
    asyncio.run(asyncio.wait_for(scenario(), 5))


def test_the_stream_starts_with_the_release_then_the_whole_model_then_sends_changes():
    async def scenario():
        feed = Feed()
        feed.publish(snapshot(10))
        events = model_events(feed, release={"version": "1.2.3", "client": "abc"})

        release = await anext(events)
        assert release.event == "release" and release.retry == RETRY_MS
        assert json.loads(release.raw_data) == {"version": "1.2.3", "client": "abc"}
        first = await anext(events)
        assert first.event == "model"
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
        assert (await anext(events)).event == "release"
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


def test_the_stream_waits_for_the_first_reading_and_says_why_there_is_none():
    async def scenario():
        feed = Feed()
        events = model_events(feed)
        assert (await anext(events)).event == "release"
        status = await anext(events)
        assert status.event == "status" and json.loads(status.raw_data) == {"waiting": "connecting"}
        pending = asyncio.ensure_future(anext(events))
        await asyncio.sleep(0.05)
        assert not pending.done()
        feed.publish(snapshot(3))
        first = await pending
        assert first.event == "model"
        await events.aclose()

    run(scenario)


def test_the_stream_says_when_the_reason_for_no_reading_changes():
    async def scenario():
        feed = Feed()
        events = model_events(feed)
        await anext(events)
        await anext(events)
        feed.waiting = "broker_unreachable"
        # A stream waiting for its first model looks again at least this often.
        status = await asyncio.wait_for(anext(events), STOPPING_CHECK_S + 1)
        assert json.loads(status.raw_data) == {"waiting": "broker_unreachable"}
        feed.waiting = "broker_silent"
        status = await asyncio.wait_for(anext(events), STOPPING_CHECK_S + 1)
        assert json.loads(status.raw_data) == {"waiting": "broker_silent"}
        await events.aclose()

    run(scenario)


def test_a_stream_that_has_a_model_says_nothing_of_waiting():
    async def scenario():
        feed = Feed()
        feed.publish(snapshot(5))
        events = model_events(feed)
        assert [(await anext(events)).event, (await anext(events)).event] == ["release", "model"]
        await events.aclose()

    run(scenario)


def test_an_unchanged_model_sends_nothing():
    async def scenario():
        feed = Feed()
        feed.publish(snapshot(20))
        events = model_events(feed)
        await anext(events)
        await anext(events)

        feed.publish(snapshot(20))
        quiet = asyncio.ensure_future(anext(events))
        await asyncio.sleep(0.05)
        assert not quiet.done()

        feed.publish(snapshot(21))
        assert (await quiet).event == "patch"
        await events.aclose()

    run(scenario)
