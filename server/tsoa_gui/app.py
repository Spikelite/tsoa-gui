"""The web application: the API and the built client it serves."""
import asyncio
import hashlib
import logging
import time
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

# A job that stops is started again after RESTART_AFTER_S, and after twice as
# long each time it stops again within RAN_WELL_S, up to RAN_WELL_S.
RESTART_AFTER_S = 5.0
RAN_WELL_S = 300.0


def create_app(client_dir: Path | None = None, feed: Feed | None = None, jobs: Sequence[Job] = (),
               stopping: Callable[[], bool] = lambda: False, streams: StreamLimit | None = None,
               version: str | None = None) -> FastAPI:
    """The app, serving the model from feed, which the jobs keep current while it runs.

    Its event streams end once stopping() is true, which the server running it
    sets as it starts to shut down, and no more are open at once than streams allows.
    version is the release's, and None on a development run.
    """
    feed = feed if feed is not None else Feed()
    streams = streams if streams is not None else StreamLimit()
    # A page reloads when either changes. A development run has no version,
    # but a rebuilt client changes its fingerprint.
    release = {"version": version, "client": _fingerprint(client_dir)}

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
        async for event in model_events(feed, stopping, release):
            yield event

    # Mounted last: a mount at the root would otherwise answer for /api too.
    if client_dir is not None and (client_dir / "index.html").is_file():
        app.mount("/", StaticFiles(directory=client_dir, html=True), name="client")

    return app


def _fingerprint(client_dir: Path | None) -> str | None:
    """A hash of the client's index.html, which names every asset by a hash of its content."""
    index = client_dir / "index.html" if client_dir is not None else None
    if index is None or not index.is_file():
        return None
    return hashlib.sha256(index.read_bytes()).hexdigest()[:16]


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
