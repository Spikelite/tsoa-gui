"""The web application: the API and the built client it serves."""
import asyncio
import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.sse import EventSourceResponse, ServerSentEvent
from fastapi.staticfiles import StaticFiles

from .events import model_events
from .feed import Feed
from .model import System

log = logging.getLogger(__name__)

Job = Callable[[Feed], Awaitable[None]]

# A job that stops is started again after RESTART_AFTER_S, and after twice as
# long each time it stops again within RAN_WELL_S, up to RAN_WELL_S.
RESTART_AFTER_S = 5.0
RAN_WELL_S = 300.0


def create_app(client_dir: Path | None = None, feed: Feed | None = None, jobs: Sequence[Job] = (),
               stopping: Callable[[], bool] = lambda: False) -> FastAPI:
    """The app, serving the model from feed, which the jobs keep current while it runs.

    Its event streams end once stopping() is true, which the server running it
    sets as it starts to shut down.
    """
    feed = feed if feed is not None else Feed()

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        tasks = [asyncio.create_task(_keep_running(job, feed)) for job in jobs]
        try:
            yield
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    # The interactive API docs load their scripts from a CDN, which a device
    # on a LAN should not depend on, so they are off.
    app = FastAPI(title="tsoa-gui", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

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

    @app.get("/api/system/events", response_class=EventSourceResponse)
    async def system_events() -> AsyncIterator[ServerSentEvent]:
        async for event in model_events(feed, stopping):
            yield event

    # Mounted last: a mount at the root would otherwise answer for /api too.
    if client_dir is not None and (client_dir / "index.html").is_file():
        app.mount("/", StaticFiles(directory=client_dir, html=True), name="client")

    return app


async def _keep_running(job: Job, feed: Feed) -> None:
    """Runs the job, starting it again whenever it stops, with the model shown as stale until it does."""
    wait = RESTART_AFTER_S
    while True:
        started = time.monotonic()
        try:
            await job(feed)
            error: BaseException | None = None
        except Exception as failure:
            error = failure
        if time.monotonic() - started >= RAN_WELL_S:
            wait = RESTART_AFTER_S
        log.error("a background job stopped, starting it again in %g s", wait, exc_info=error)
        feed.go_stale()
        await asyncio.sleep(wait)
        wait = min(wait * 2, RAN_WELL_S)
