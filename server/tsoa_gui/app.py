"""The web application: the API and the built client it serves."""
import asyncio
import hashlib
import logging
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


def create_app(client_dir: Path | None = None, feed: Feed | None = None, jobs: Sequence[Job] = (),
               stopping: Callable[[], bool] = lambda: False, version: str | None = None) -> FastAPI:
    """The app, serving the model from feed, which the jobs keep current while it runs.

    Its event streams end once stopping() is true, which the server running it
    sets as it starts to shut down. version is the release's, and None on a
    development run.
    """
    feed = feed if feed is not None else Feed()
    # A page reloads when either changes. A development run has no version,
    # but a rebuilt client changes its fingerprint.
    release = {"version": version, "client": _fingerprint(client_dir)}

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


def _report_failure(task: "asyncio.Task[None]") -> None:
    if not task.cancelled() and task.exception() is not None:
        log.error("a background job stopped", exc_info=task.exception())
