"""The web application: the API and the built client it serves."""
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles


def create_app(client_dir: Path | None = None) -> FastAPI:
    # The interactive API docs load their scripts from a CDN, which a device
    # on a LAN should not depend on, so they are off.
    app = FastAPI(title="tsoa-gui", docs_url=None, redoc_url=None, openapi_url=None)

    # Everything the server answers itself lives under /api. Behind a proxy
    # the device's own console can share this origin, and its paths are at
    # the top level, so they stay clear.
    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    # Mounted last: a mount at the root would otherwise answer for /api too.
    if client_dir is not None and (client_dir / "index.html").is_file():
        app.mount("/", StaticFiles(directory=client_dir, html=True), name="client")

    return app
