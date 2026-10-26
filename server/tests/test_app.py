import asyncio
from pathlib import Path

from fastapi.testclient import TestClient

from tsoa_gui.app import create_app
from tsoa_gui.events import RETRY_AFTER_S, StreamLimit
from tsoa_gui.feed import Feed
from tsoa_gui.headers import CONTENT_SECURITY_POLICY, HEADERS
from tsoa_gui.mock import snapshot


def test_health_answers_without_a_built_client():
    client = TestClient(create_app())
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_serves_the_built_client_without_hiding_the_api(tmp_path: Path):
    (tmp_path / "index.html").write_text("<!doctype html><title>placeholder</title>", encoding="utf-8")
    client = TestClient(create_app(tmp_path))
    page = client.get("/")
    assert page.status_code == 200
    assert "<title>placeholder</title>" in page.text
    assert client.get("/api/health").json() == {"status": "ok"}


def test_no_built_client_means_no_page():
    assert TestClient(create_app()).get("/").status_code == 404


def test_a_directory_without_an_index_is_not_served(tmp_path: Path):
    (tmp_path / "stray.txt").write_text("not a client", encoding="utf-8")
    assert TestClient(create_app(tmp_path)).get("/stray.txt").status_code == 404


def test_interactive_api_docs_are_off():
    client = TestClient(create_app())
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404, path


def test_the_current_model_is_unavailable_until_the_first_reading():
    feed = Feed()
    client = TestClient(create_app(feed=feed))
    assert client.get("/api/system").status_code == 503
    feed.publish(snapshot(30))
    response = client.get("/api/system")
    assert response.status_code == 200
    assert response.json() == snapshot(30).model_dump(mode="json")


def test_jobs_run_while_the_app_runs():
    started = []

    async def job(feed: Feed) -> None:
        started.append(feed)
        feed.publish(snapshot(0))

    with TestClient(create_app(jobs=[job])) as client:
        assert client.get("/api/system").status_code == 200
    assert len(started) == 1


def test_the_event_stream_is_served_as_server_sent_events():
    route = next(r for r in create_app().routes if getattr(r, "path", None) == "/api/system/events")
    assert route.response_class.media_type == "text/event-stream"


def test_every_response_carries_the_security_headers(tmp_path: Path):
    (tmp_path / "index.html").write_text("<!doctype html><title>placeholder</title>", encoding="utf-8")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "index.js").write_text("export {};", encoding="utf-8")
    feed = Feed()
    feed.publish(snapshot(30))
    client = TestClient(create_app(tmp_path, feed=feed))
    for path in ("/", "/assets/index.js", "/api/system", "/api/health", "/api/missing"):
        response = client.get(path)
        for name, value in HEADERS.items():
            assert response.headers.get(name) == value, (path, name)


def test_the_policy_keeps_scripts_and_connections_to_the_page_s_own_origin():
    directives = dict(d.split(" ", 1) for d in CONTENT_SECURITY_POLICY.split("; "))
    assert directives["default-src"] == "'self'"
    assert "script-src" not in directives and "connect-src" not in directives
    assert directives["object-src"] == "'none'"


class Stream:
    """An event stream request driven by hand, from a chosen address, held open until closed."""

    def __init__(self, app, address: str):
        self.status: int | None = None
        self.headers: dict[str, str] = {}
        self._started = asyncio.Event()
        self._gone = asyncio.Event()
        scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "GET",
                 "scheme": "http", "path": "/api/system/events", "raw_path": b"/api/system/events",
                 "query_string": b"", "root_path": "", "headers": [(b"host", b"testserver")],
                 "client": (address, 50000), "server": ("testserver", 80)}
        self._task = asyncio.create_task(app(scope, self._receive, self._send))

    async def _receive(self):
        await self._gone.wait()
        return {"type": "http.disconnect"}

    async def _send(self, message):
        if message["type"] == "http.response.start":
            self.status = message["status"]
            self.headers = {k.decode(): v.decode() for k, v in message["headers"]}
            self._started.set()

    async def started(self) -> "Stream":
        await self._started.wait()
        return self

    async def close(self) -> None:
        self._gone.set()
        await self._task


def run(scenario):
    asyncio.run(asyncio.wait_for(scenario(), 5))


def test_streams_past_the_cap_are_refused_until_one_closes():
    async def scenario():
        feed = Feed()
        feed.publish(snapshot(10))
        app = create_app(feed=feed, streams=StreamLimit(total=3, per_address=10))
        held = [await Stream(app, f"192.0.2.{n}").started() for n in range(3)]
        assert [s.status for s in held] == [200, 200, 200]

        refused = await Stream(app, "192.0.2.9").started()
        assert refused.status == 503
        assert refused.headers["retry-after"] == str(RETRY_AFTER_S)
        await refused.close()

        await held.pop().close()
        held.append(await Stream(app, "192.0.2.9").started())
        assert held[-1].status == 200
        for stream in held:
            await stream.close()

    run(scenario)


def test_one_address_cannot_take_every_stream():
    async def scenario():
        feed = Feed()
        feed.publish(snapshot(10))
        app = create_app(feed=feed, streams=StreamLimit(total=10, per_address=2))
        held = [await Stream(app, "192.0.2.1").started() for _ in range(2)]
        refused = await Stream(app, "192.0.2.1").started()
        assert refused.status == 503
        await refused.close()
        held.append(await Stream(app, "192.0.2.2").started())
        assert [s.status for s in held] == [200, 200, 200]
        for stream in held:
            await stream.close()

    run(scenario)


def test_a_refused_stream_carries_the_security_headers_too():
    async def scenario():
        app = create_app(streams=StreamLimit(total=0))
        refused = await Stream(app, "192.0.2.1").started()
        assert refused.status == 503
        for name, value in HEADERS.items():
            assert refused.headers[name.lower()] == value
        await refused.close()

    run(scenario)
