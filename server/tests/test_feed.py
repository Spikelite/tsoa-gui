import asyncio

from tsoa_gui.feed import Feed
from tsoa_gui.mock import snapshot


def test_a_listener_receives_what_is_published():
    async def scenario():
        feed = Feed()
        with feed.listen() as queue:
            feed.publish(snapshot(1))
            assert await asyncio.wait_for(queue.get(), 1) == snapshot(1)
        assert feed.latest == snapshot(1)

    asyncio.run(scenario())


def test_a_listener_that_falls_behind_gets_only_the_newest():
    async def scenario():
        feed = Feed()
        with feed.listen() as queue:
            for second in range(5):
                feed.publish(snapshot(second))
            assert await asyncio.wait_for(queue.get(), 1) == snapshot(4)
            assert queue.empty()

    asyncio.run(scenario())


def test_a_listener_that_has_gone_is_not_fed():
    async def scenario():
        feed = Feed()
        with feed.listen() as queue:
            pass
        feed.publish(snapshot(1))
        assert queue.empty()

    asyncio.run(scenario())
