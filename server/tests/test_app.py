from pathlib import Path

from fastapi.testclient import TestClient

from tsoa_gui.app import create_app


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
