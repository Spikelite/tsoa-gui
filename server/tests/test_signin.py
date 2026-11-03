import argparse
import asyncio
import logging

import httpx
import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from tsoa_gui.__main__ import server_config
from tsoa_gui import accounts as accounts_module
from tsoa_gui.accounts import FAILURES_PER_NAME, HASHES_AT_ONCE, Accounts, Role
from tsoa_gui.app import create_app
from tsoa_gui.signin import COOKIE, CSRF_HEADER

PASSWORD = "correct horse"


@pytest.fixture
def accounts() -> Accounts:
    return Accounts()


@pytest.fixture
def client(accounts: Accounts) -> TestClient:
    return TestClient(create_app(accounts=accounts), base_url="https://testserver")


def signed_in(client: TestClient, name: str) -> str:
    """Signs client in as name and returns the CSRF token its changes need."""
    response = client.post("/api/session", json={"name": name, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()["csrf"]


def test_viewing_needs_no_account(client: TestClient):
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/session").json() == {"account": None, "setup_needed": True, "csrf": None}


def test_makes_the_first_account_with_the_setup_code_and_signs_it_in(client: TestClient, accounts: Accounts):
    code = accounts.setup_code()
    assert client.post("/api/setup", json={"code": "WRONGWRONGXX", "name": "owner",
                                           "password": PASSWORD}).status_code == 400
    response = client.post("/api/setup", json={"code": code, "name": "owner", "password": PASSWORD})
    assert response.status_code == 200
    body = response.json()
    assert body["account"] == {"name": "owner", "role": "admin"} and not body["setup_needed"] and body["csrf"]
    assert client.get("/api/session").json()["account"] == {"name": "owner", "role": "admin"}
    assert client.post("/api/setup", json={"code": code, "name": "again",
                                           "password": PASSWORD}).status_code == 409


def test_says_where_the_setup_code_is_while_there_is_no_account(caplog: pytest.LogCaptureFixture, tmp_path):
    accounts = Accounts(tmp_path / "accounts.db", tmp_path / "setup-code")
    with caplog.at_level(logging.WARNING), TestClient(create_app(accounts=accounts)):
        pass
    assert str(tmp_path / "setup-code") in caplog.text
    assert accounts.setup_code() not in caplog.text


def test_the_session_cookie_is_kept_from_scripts_and_other_sites(client: TestClient, accounts: Accounts):
    accounts.create("owner", PASSWORD, Role.ADMIN)
    response = client.post("/api/session", json={"name": "owner", "password": PASSWORD})
    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f"{COOKIE}=")
    for attribute in ("HttpOnly", "SameSite=strict", "Secure", "Path=/api"):
        assert attribute.lower() in cookie.lower(), attribute


def test_a_wrong_password_is_refused_and_then_limited(client: TestClient, accounts: Accounts):
    accounts.create("owner", PASSWORD, Role.ADMIN)
    for _ in range(FAILURES_PER_NAME):
        response = client.post("/api/session", json={"name": "owner", "password": "wrong horse"})
        assert response.status_code == 401
        assert response.json()["detail"] == "Wrong name or password."
    response = client.post("/api/session", json={"name": "owner", "password": PASSWORD})
    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) > 0


def test_signing_out_needs_the_csrf_token(client: TestClient, accounts: Accounts):
    accounts.create("owner", PASSWORD, Role.ADMIN)
    csrf = signed_in(client, "owner")
    assert client.delete("/api/session").status_code == 403
    assert client.delete("/api/session", headers={CSRF_HEADER: "forged"}).status_code == 403
    assert client.delete("/api/session", headers={CSRF_HEADER: csrf}).status_code == 204
    assert client.get("/api/session").json()["account"] is None


def test_only_an_admin_keeps_the_accounts(client: TestClient, accounts: Accounts):
    accounts.create("owner", PASSWORD, Role.ADMIN)
    accounts.create("crew", PASSWORD, Role.OPERATOR)
    assert client.get("/api/accounts").status_code == 401
    signed_in(client, "crew")
    assert client.get("/api/accounts").status_code == 403

    csrf = signed_in(client, "owner")
    assert client.get("/api/accounts").json() == [{"name": "crew", "role": "operator"},
                                                  {"name": "owner", "role": "admin"}]
    new = {"name": "guest", "password": PASSWORD, "role": "viewer"}
    assert client.post("/api/accounts", json=new).status_code == 403  # no CSRF token
    assert client.post("/api/accounts", json=new, headers={CSRF_HEADER: csrf}).status_code == 201
    assert client.post("/api/accounts", json=new, headers={CSRF_HEADER: csrf}).status_code == 409
    assert client.patch("/api/accounts/guest", json={"role": "operator"},
                        headers={CSRF_HEADER: csrf}).json() == {"name": "guest", "role": "operator"}
    assert client.patch("/api/accounts/owner", json={"role": "viewer"},
                        headers={CSRF_HEADER: csrf}).status_code == 409  # the only admin
    assert client.delete("/api/accounts/guest", headers={CSRF_HEADER: csrf}).status_code == 204
    assert client.delete("/api/accounts/guest", headers={CSRF_HEADER: csrf}).status_code == 404


def test_a_refused_change_to_an_account_changes_nothing(client: TestClient, accounts: Accounts):
    accounts.create("owner", PASSWORD, Role.ADMIN)
    accounts.create("crew", PASSWORD, Role.VIEWER)
    csrf = signed_in(client, "owner")
    response = client.patch("/api/accounts/crew", json={"role": "operator", "password": "short"},
                            headers={CSRF_HEADER: csrf})
    assert response.status_code == 400
    assert accounts.find("crew").role == Role.VIEWER
    assert accounts.check("crew", PASSWORD, "192.0.2.10").name == "crew"


def test_a_change_turned_away_while_hashing_is_busy_changes_nothing(
        client: TestClient, accounts: Accounts, monkeypatch: pytest.MonkeyPatch):
    accounts.create("owner", PASSWORD, Role.ADMIN)
    accounts.create("crew", PASSWORD, Role.VIEWER)
    csrf = signed_in(client, "owner")
    monkeypatch.setattr(accounts_module, "HASH_WAIT_S", 0.05)
    held = [accounts_module._hashing.acquire() for _ in range(HASHES_AT_ONCE)]
    try:
        response = client.patch("/api/accounts/crew", json={"role": "operator", "password": "battery staple"},
                                headers={CSRF_HEADER: csrf})
    finally:
        for _ in held:
            accounts_module._hashing.release()
    assert response.status_code == 429
    assert accounts.find("crew").role == Role.VIEWER


def test_changing_your_own_password_needs_the_current_one(client: TestClient, accounts: Accounts):
    accounts.create("owner", PASSWORD, Role.OPERATOR)
    csrf = signed_in(client, "owner")
    change = {"current": "wrong horse", "password": "battery staple"}
    assert client.post("/api/session/password", json=change, headers={CSRF_HEADER: csrf}).status_code == 401
    change["current"] = PASSWORD
    assert client.post("/api/session/password", json=change, headers={CSRF_HEADER: csrf}).status_code == 204
    # The session that changed it stays signed in.
    assert client.get("/api/session").json()["account"] == {"name": "owner", "role": "operator"}
    assert accounts.check("owner", "battery staple", "192.0.2.10").name == "owner"


def test_takes_a_browser_s_address_only_from_a_trusted_proxy():
    probe = FastAPI()

    @probe.get("/address")
    def address(request: Request) -> str:
        return request.client.host if request.client else ""

    def seen(trusted: list[str] | None, client: str) -> str:
        args = argparse.Namespace(host="127.0.0.1", port=0, certfile=None, keyfile=None, log_level="warning",
                                  trusted_proxy=trusted)
        config = server_config(probe, args)
        config.load()
        transport = httpx.ASGITransport(app=config.loaded_app, client=(client, 40000))

        async def get() -> str:
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as http:
                response = await http.get("/address", headers={"X-Forwarded-For": "192.0.2.50"})
                return response.json()

        return asyncio.run(get())

    assert seen(["192.0.2.1"], "192.0.2.1") == "192.0.2.50"
    assert seen(["192.0.2.1"], "192.0.2.9") == "192.0.2.9"
    assert seen(None, "192.0.2.1") == "192.0.2.1"
