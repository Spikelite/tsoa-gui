import json
import subprocess
import sys
import threading
from pathlib import Path

import httpx
import pytest

from tsoa_gui import __main__ as server_main
from tsoa_gui import certificate, versions

SERVER = Path(__file__).resolve().parents[1]


def test_matching_versions_pass():
    assert versions.mismatches(versions.found()) == []


def test_a_different_version_is_named():
    tested = dict(versions.found(), pydantic="1.0.0")
    [problem] = versions.mismatches(tested)
    assert "pydantic" in problem and "1.0.0" in problem


def test_the_installer_check_exits_1_on_other_versions(tmp_path: Path):
    tested = tmp_path / "tested.json"
    tested.write_text(json.dumps(versions.found()))
    check = [sys.executable, "-m", "tsoa_gui.versions", str(tested)]
    assert subprocess.run(check, cwd=SERVER).returncode == 0
    tested.write_text(json.dumps(dict(versions.found(), python="2.7")))
    result = subprocess.run(check, cwd=SERVER, capture_output=True, text=True)
    assert result.returncode == 1
    assert "Python is" in result.stderr and "tested with 2.7" in result.stderr


def test_the_page_names_the_release_and_each_problem():
    page = versions.notice_page("1.2.3", ["Python is 3.13, but this release was tested with 3.12", "<b>"]).decode()
    assert "tsoa-gui 1.2.3 was not tested" in page
    assert "<li>Python is 3.13, but this release was tested with 3.12.</li>" in page
    assert "<li>&lt;b&gt;.</li>" in page
    assert versions.INSTALL_GUIDE in page


def serving(server) -> str:
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"127.0.0.1:{server.server_port}"


def test_the_notice_answers_every_request_with_503_and_the_page():
    server = versions.notice_server(b"<p>newer release</p>", "127.0.0.1", 0)
    try:
        address = serving(server)
        for path in ("/", "/api/health", "/api/system/events"):
            response = httpx.get(f"http://{address}{path}")
            assert response.status_code == 503
            assert response.text == "<p>newer release</p>"
            assert response.headers["cache-control"] == "no-store"
        head = httpx.head(f"http://{address}/")
        assert head.status_code == 503 and head.content == b""
    finally:
        server.shutdown()
        server.server_close()


def test_the_notice_serves_https_with_the_device_certificate(tmp_path: Path):
    certificate.make(tmp_path, [], hostname="device.example.com")
    server = versions.notice_server(b"page", "127.0.0.1", 0, tmp_path / "cert.pem", tmp_path / "key.pem")
    try:
        response = httpx.get(f"https://{serving(server)}/", verify=False)
        assert response.status_code == 503 and response.text == "page"
    finally:
        server.shutdown()
        server.server_close()


def test_on_other_versions_none_of_the_server_loads(tmp_path: Path):
    tested = tmp_path / "tested.json"
    tested.write_text(json.dumps(dict(versions.found(), python="2.7")))
    # Runs main as the device would, but stops where it would start serving.
    script = f"""
import sys
from tsoa_gui import __main__ as main, versions
class Serving(Exception):
    pass
def notice_server(*args):
    raise Serving
versions.notice_server = notice_server
try:
    main.main(["--tested-versions", {str(tested)!r}])
except Serving:
    print(sorted(name for name in ("fastapi", "uvicorn", "starlette", "tsoa_gui.app", "tsoa_gui.model")
                 if name in sys.modules))
"""
    result = subprocess.run([sys.executable, "-c", script], cwd=SERVER, capture_output=True, text=True, check=True)
    assert result.stdout.strip() == "[]"
    assert "tsoa-gui will not start: Python is" in result.stderr


def test_an_account_is_a_user_and_group_id():
    assert server_main.account("8088:8089") == (8088, 8089)
    for value in ("8088", "tsoa:tsoa", ":8088", "8088:"):
        with pytest.raises(Exception):
            server_main.account(value)


def test_dropping_privileges_sets_the_group_before_the_user(monkeypatch: pytest.MonkeyPatch):
    calls = []
    for name in ("setgroups", "setgid", "setuid"):
        monkeypatch.setattr(server_main.os, name, lambda value, name=name: calls.append((name, value)), raising=False)
    server_main.drop_privileges(None)
    assert calls == []
    server_main.drop_privileges((8088, 8089))
    assert calls == [("setgroups", []), ("setgid", 8089), ("setuid", 8088)]
