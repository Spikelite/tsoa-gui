import asyncio
import json
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tsoa_gui import controls as controls_module
from tsoa_gui.accounts import SCHEMA, Accounts, Change, Role
from tsoa_gui.app import create_app
from tsoa_gui.controls import Control
from tsoa_gui.signin import CSRF_HEADER
from tsoa_gui.venus import Device, Readings

PASSWORD = "correct horse"
LIMIT = ("vebus", 276, "Ac/In/1/CurrentLimit")


def first_vebus(readings: Readings) -> int | None:
    instances = readings.instances("vebus")
    return instances[0] if instances else None


# Invented, after the shape of an input current limit.
CURRENT_LIMIT = Control(
    name="input-current-limit", service="vebus", path="Ac/In/1/CurrentLimit", role=Role.OPERATOR,
    instance=first_vebus,
    adjustable=lambda r, i: r.get("vebus", i, "Ac/In/1/CurrentLimitIsAdjustable") == 1,
    limits=lambda r, i: (0, r.number("vebus", i, "Ac/In/1/CurrentLimitMax")),
    tolerance=0.05,
)


class FakeDevice(Device):
    """A device that takes each write and, if it confirms, reports the value back a little later."""

    def __init__(self, confirms: bool = True) -> None:
        super().__init__()
        self.written: list[tuple[str, str]] = []
        for path, value in (("Ac/In/1/CurrentLimit", 16.0), ("Ac/In/1/CurrentLimitIsAdjustable", 1),
                            ("Ac/In/1/CurrentLimitMax", 50.0)):
            self.readings.update(("vebus", 276, path), value)

        async def send(where: str, payload: str) -> None:
            self.written.append((where, payload))
            if confirms:
                service, instance, path = where.split("/", 2)
                value = json.loads(payload)["value"]
                asyncio.get_running_loop().call_later(0.05, self.readings.update, (service, int(instance), path),
                                                      value)

        self.attach(send)


@pytest.fixture
def accounts() -> Accounts:
    accounts = Accounts()
    accounts.create("owner", PASSWORD, Role.ADMIN)
    accounts.create("crew", PASSWORD, Role.OPERATOR)
    accounts.create("guest", PASSWORD, Role.VIEWER)
    return accounts


def client_for(accounts: Accounts, device: Device) -> TestClient:
    return TestClient(create_app(accounts=accounts, device=device, controls_offered=[CURRENT_LIMIT]),
                      base_url="https://testserver")


def signed_in(client: TestClient, name: str) -> str:
    response = client.post("/api/session", json={"name": name, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()["csrf"]


def set_limit(client: TestClient, csrf: str | None, value: object):
    headers = {} if csrf is None else {CSRF_HEADER: csrf}
    return client.post("/api/controls/input-current-limit", json={"value": value}, headers=headers)


def test_an_operator_changes_a_value_and_the_device_confirms_it(accounts: Accounts):
    device = FakeDevice()
    client = client_for(accounts, device)
    response = set_limit(client, signed_in(client, "crew"), 25)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["outcome"] == "confirmed" and body["old"] == 16.0 and body["new"] == 25.0
    assert device.written == [("vebus/276/Ac/In/1/CurrentLimit", '{"value": 25.0}')]
    assert device.readings.get(*LIMIT) == 25.0
    [change] = accounts.changes()
    assert (change.account, change.control, change.instance, change.old, change.new, change.outcome) == (
        "crew", "input-current-limit", 276, 16.0, 25.0, "confirmed")


def test_a_device_that_never_reports_the_value_leaves_the_change_unconfirmed(
        accounts: Accounts, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(controls_module, "CONFIRM_WITHIN_S", 0.2)
    device = FakeDevice(confirms=False)
    client = client_for(accounts, device)
    response = set_limit(client, signed_in(client, "crew"), 25)
    assert response.status_code == 200
    assert response.json()["outcome"] == "unconfirmed"
    assert len(device.written) == 1
    assert accounts.changes()[0].outcome == "unconfirmed"


def test_an_account_whose_role_does_not_allow_it_is_refused_and_recorded(accounts: Accounts):
    device = FakeDevice()
    client = client_for(accounts, device)
    response = set_limit(client, signed_in(client, "guest"), 25)
    assert response.status_code == 403
    assert device.written == []
    [change] = accounts.changes()
    assert (change.account, change.outcome, change.reason) == ("guest", "refused", "Your account cannot change this.")


def test_a_change_without_a_session_or_its_csrf_token_is_refused_and_not_recorded(accounts: Accounts):
    device = FakeDevice()
    client = client_for(accounts, device)
    assert set_limit(client, None, 25).status_code == 401
    signed_in(client, "crew")
    assert set_limit(client, None, 25).status_code == 403
    assert set_limit(client, "forged", 25).status_code == 403
    assert device.written == [] and accounts.changes() == []


@pytest.mark.parametrize("value", [-1, 50.5])
def test_a_value_outside_what_the_device_accepts_is_refused_not_clamped(accounts: Accounts, value: float):
    device = FakeDevice()
    client = client_for(accounts, device)
    response = set_limit(client, signed_in(client, "crew"), value)
    assert response.status_code == 400
    assert response.json()["detail"] == "The device accepts 0 to 50."
    assert device.written == [] and device.readings.get(*LIMIT) == 16.0
    [change] = accounts.changes()
    assert change.outcome == "refused" and change.new == value


def test_a_value_the_device_does_not_allow_changing_now_is_refused(accounts: Accounts):
    device = FakeDevice()
    device.readings.update(("vebus", 276, "Ac/In/1/CurrentLimitIsAdjustable"), 0)
    client = client_for(accounts, device)
    assert set_limit(client, signed_in(client, "crew"), 25).status_code == 409
    assert device.written == []


def test_a_value_the_device_does_not_report_is_refused(accounts: Accounts):
    client = client_for(accounts, Device())
    response = set_limit(client, signed_in(client, "crew"), 25)
    assert response.status_code == 409
    assert accounts.changes()[0].instance is None


def test_a_device_out_of_reach_is_said_so(accounts: Accounts):
    device = FakeDevice()
    device.detach()
    client = client_for(accounts, device)
    assert set_limit(client, signed_in(client, "crew"), 25).status_code == 503
    assert accounts.changes()[0].outcome == "refused"


@pytest.mark.parametrize("value", ["25", True, None, "NaN"])
def test_only_a_number_is_a_value(accounts: Accounts, value: object):
    device = FakeDevice()
    client = client_for(accounts, device)
    assert set_limit(client, signed_in(client, "crew"), value).status_code == 422
    assert device.written == [] and accounts.changes() == []


def test_there_is_no_control_by_another_name(accounts: Accounts):
    client = client_for(accounts, FakeDevice())
    csrf = signed_in(client, "owner")
    assert client.post("/api/controls/elsewhere", json={"value": 1}, headers={CSRF_HEADER: csrf}).status_code == 404


def test_only_an_admin_reads_the_changes_newest_first_a_page_at_a_time(accounts: Accounts):
    for n in range(5):
        accounts.record_change(Change(at=1.0 + n, account="crew", control="input-current-limit", instance=276,
                                      old=float(n), new=float(n + 1), outcome="confirmed"))
    client = client_for(accounts, FakeDevice())
    assert client.get("/api/changes").status_code == 401
    signed_in(client, "crew")
    assert client.get("/api/changes").status_code == 403
    signed_in(client, "owner")
    page = client.get("/api/changes", params={"limit": 2}).json()
    assert [change["new"] for change in page] == [5.0, 4.0]
    rest = client.get("/api/changes", params={"before": page[-1]["id"]}).json()
    assert [change["new"] for change in rest] == [3.0, 2.0, 1.0]


def test_the_changes_are_kept_across_a_restart_and_added_to_an_older_database(tmp_path: Path):
    # A database made before the changes were recorded.
    db = sqlite3.connect(tmp_path / "accounts.db", isolation_level=None)
    db.executescript(f"BEGIN; {SCHEMA} PRAGMA user_version = 1; COMMIT;")
    db.close()
    accounts = Accounts(tmp_path / "accounts.db")
    accounts.record_change(Change(at=1.0, account="crew", control="input-current-limit", instance=276, old=16.0,
                                  new=25.0, outcome="confirmed"))
    accounts.close()
    again = Accounts(tmp_path / "accounts.db")
    assert [(change.old, change.new) for change in again.changes()] == [(16.0, 25.0)]
