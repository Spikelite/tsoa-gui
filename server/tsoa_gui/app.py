"""The web application: the API and the built client it serves."""
import asyncio
import logging
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.sse import EventSourceResponse, ServerSentEvent
from fastapi.staticfiles import StaticFiles

from .events import RETRY_AFTER_S, StreamLimit, model_events
from .feed import Feed
from .headers import SecurityHeaders
from .model import System

log = logging.getLogger(__name__)

Job = Callable[[Feed], Awaitable[None]]


def create_app(client_dir: Path | None = None, feed: Feed | None = None, jobs: Sequence[Job] = (),
               stopping: Callable[[], bool] = lambda: False, streams: StreamLimit | None = None) -> FastAPI:
    """The app, serving the model from feed, which the jobs keep current while it runs.

    Its event streams end once stopping() is true, which the server running it
    sets as it starts to shut down, and no more are open at once than streams allows.
    """
    feed = feed if feed is not None else Feed()
    streams = streams if streams is not None else StreamLimit()

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        tasks = [asyncio.create_task(job(feed)) for job in jobs]
        for task in tasks:
            task.add_done_callback(_report_failure)
        try:
            yield
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    # The interactive API docs load their scripts from a CDN, which a device
    # on a LAN should not depend on, so they are off.
    app = FastAPI(title="tsoa-gui", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.add_middleware(SecurityHeaders)

    # Async, so the count is only ever touched from the event loop. The place
    # is given back once the response has ended, whether or not the stream
    # ever started.
    async def stream_place(request: Request) -> AsyncIterator[None]:
        address = request.client.host if request.client is not None else ""
        if not streams.take(address):
            raise HTTPException(status_code=503, detail="Too many event streams open",
                                headers={"Retry-After": str(RETRY_AFTER_S)})
        try:
            yield
        finally:
            streams.give_back(address)

    # Everything the server answers itself lives under /api. Behind a proxy
    # the device's own console can share this origin, and its paths are at
    # the top level, so they stay clear.
    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/system", response_model=System)
    def system() -> System:
        if feed.latest is None:
            raise HTTPException(status_code=503, detail="No readings yet")
        return feed.latest

    @app.get("/api/system/events", response_class=EventSourceResponse, dependencies=[Depends(stream_place)])
    async def system_events() -> AsyncIterator[ServerSentEvent]:
        async for event in model_events(feed, stopping):
            yield event

    # Mounted last: a mount at the root would otherwise answer for /api too.
    if client_dir is not None and (client_dir / "index.html").is_file():
        app.mount("/", StaticFiles(directory=client_dir, html=True), name="client")

    return app


def _report_failure(task: "asyncio.Task[None]") -> None:
    if not task.cancelled() and task.exception() is not None:
        log.error("a background job stopped", exc_info=task.exception())
