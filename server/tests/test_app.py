from pathlib import Path

from fastapi.testclient import TestClient

from tsoa_gui.app import create_app
from tsoa_gui.feed import Feed
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
