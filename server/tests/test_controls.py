import asyncio
import json
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tsoa_gui import controls as controls_module
from tsoa_gui.accounts import SCHEMA, UPGRADES, Accounts, Change, Role
from tsoa_gui.app import create_app
from tsoa_gui.signin import CSRF_HEADER
from tsoa_gui.venus import Device

PASSWORD = "correct horse"
# An invented inverter/charger at instance 276, with one AC input.
LIMIT = ("vebus", 276, "Ac/In/1/CurrentLimit")
ADJUSTABLE = ("vebus", 276, "Ac/In/1/CurrentLimitIsAdjustable")
HIGHEST = 60.0


class FakeDevice(Device):
    """A device that takes each write and reports the value back a little later, raised to its own lowest."""

    def __init__(self, confirms: bool = True, lowest: float = 0.0) -> None:
        super().__init__()
        self.written: list[tuple[str, str]] = []
        self.readings.update(("system", 0, "VebusInstance"), 276)
        self.readings.update(LIMIT, 16.0, (None, HIGHEST))
        self.readings.update(ADJUSTABLE, 1)
        self.readings.update(("vebus", 276, "Ac/In/2/CurrentLimit"), None)

        async def send(where: str, payload: str) -> None:
            self.written.append((where, payload))
            if confirms:
                service, instance, path = where.split("/", 2)
                key = (service, int(instance), path)
                value = max(lowest, json.loads(payload)["value"])
                asyncio.get_running_loop().call_later(0.05, self.readings.update, key, value, (None, HIGHEST))

        self.attach(send)


@pytest.fixture
def accounts() -> Accounts:
    accounts = Accounts()
    accounts.create("owner", PASSWORD, Role.ADMIN)
    accounts.create("crew", PASSWORD, Role.OPERATOR)
    accounts.create("guest", PASSWORD, Role.VIEWER)
    return accounts


def client_for(accounts: Accounts, device: Device) -> TestClient:
    return TestClient(create_app(accounts=accounts, device=device), base_url="https://testserver")


def signed_in(client: TestClient, name: str) -> str:
    response = client.post("/api/session", json={"name": name, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()["csrf"]


def set_limit(client: TestClient, csrf: str | None, value: object):
    headers = {} if csrf is None else {CSRF_HEADER: csrf}
    return client.post("/api/controls/input-1-current-limit", json={"value": value}, headers=headers)


def set_ceiling(client: TestClient, csrf: str, value: object):
    return client.put("/api/controls/input-1-current-limit/ceiling", json={"value": value},
                      headers={CSRF_HEADER: csrf})


def test_an_operator_lowers_the_limit_and_the_device_confirms_it(accounts: Accounts):
    device = FakeDevice()
    client = client_for(accounts, device)
    response = set_limit(client, signed_in(client, "crew"), 12.5)
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["outcome"], body["old"], body["new"], body["reported"]) == ("confirmed", 16.0, 12.5, 12.5)
    assert device.written == [("vebus/276/Ac/In/1/CurrentLimit", '{"value": 12.5}')]
    [change] = accounts.changes()
    assert (change.account, change.control, change.instance, change.old, change.new, change.outcome,
            change.reported) == ("crew", "input-1-current-limit", 276, 16.0, 12.5, "confirmed", 12.5)


def test_a_value_the_device_raises_is_confirmed_as_the_device_reports_it(accounts: Accounts):
    client = client_for(accounts, FakeDevice(lowest=4.2))
    body = set_limit(client, signed_in(client, "crew"), 3).json()
    assert (body["outcome"], body["new"], body["reported"]) == ("confirmed", 3.0, 4.2)


def test_a_device_that_never_reports_back_leaves_the_change_unconfirmed(
        accounts: Accounts, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(controls_module, "CONFIRM_WITHIN_S", 0.2)
    device = FakeDevice(confirms=False)
    client = client_for(accounts, device)
    body = set_limit(client, signed_in(client, "crew"), 12).json()
    assert (body["outcome"], body["reported"]) == ("unconfirmed", 16.0)
    assert len(device.written) == 1


def test_the_value_already_set_is_confirmed_without_a_write(accounts: Accounts):
    device = FakeDevice()
    client = client_for(accounts, device)
    assert set_limit(client, signed_in(client, "crew"), 16).json()["outcome"] == "confirmed"
    assert device.written == []


def test_an_account_whose_role_does_not_allow_it_is_refused_and_recorded(accounts: Accounts):
    device = FakeDevice()
    client = client_for(accounts, device)
    assert set_limit(client, signed_in(client, "guest"), 12).status_code == 403
    assert device.written == []
    [change] = accounts.changes()
    assert (change.account, change.outcome, change.reason) == ("guest", "refused", "Your account cannot change this.")


def test_a_change_without_a_session_or_its_csrf_token_is_refused_and_not_recorded(accounts: Accounts):
    device = FakeDevice()
    client = client_for(accounts, device)
    assert set_limit(client, None, 12).status_code == 401
    signed_in(client, "crew")
    assert set_limit(client, None, 12).status_code == 403
    assert set_limit(client, "forged", 12).status_code == 403
    assert device.written == [] and accounts.changes() == []


@pytest.mark.parametrize("value", [-1, HIGHEST + 0.5])
def test_a_value_outside_what_the_device_accepts_is_refused_not_clamped(accounts: Accounts, value: float):
    device = FakeDevice()
    client = client_for(accounts, device)
    response = set_limit(client, signed_in(client, "owner"), value)
    assert response.status_code == 400
    assert response.json()["detail"] == f"The device accepts 0 to {HIGHEST:g}."
    assert device.written == [] and device.readings.get(*LIMIT) == 16.0
    [change] = accounts.changes()
    assert change.outcome == "refused" and change.new == value


def test_a_limit_the_device_does_not_allow_changing_now_is_refused(accounts: Accounts):
    device = FakeDevice()
    device.readings.update(ADJUSTABLE, 0)
    client = client_for(accounts, device)
    assert set_limit(client, signed_in(client, "crew"), 12).status_code == 409
    assert device.written == []


def test_a_limit_without_its_highest_reported_is_refused(accounts: Accounts):
    device = FakeDevice()
    device.readings.update(LIMIT, 16.0)
    client = client_for(accounts, device)
    response = set_limit(client, signed_in(client, "owner"), 12)
    assert response.status_code == 409
    assert response.json()["detail"] == "The device does not report the highest value this setting takes."


def test_an_input_the_device_does_not_have_is_refused(accounts: Accounts):
    client = client_for(accounts, FakeDevice())
    csrf = signed_in(client, "owner")
    response = client.post("/api/controls/input-2-current-limit", json={"value": 12}, headers={CSRF_HEADER: csrf})
    assert response.status_code == 409


def test_a_device_out_of_reach_is_said_so(accounts: Accounts):
    device = FakeDevice()
    device.detach()
    client = client_for(accounts, device)
    assert set_limit(client, signed_in(client, "crew"), 12).status_code == 503
    assert accounts.changes()[0].outcome == "refused"


@pytest.mark.parametrize("value", ["12", True, None, "NaN"])
def test_only_a_number_is_a_value(accounts: Accounts, value: object):
    device = FakeDevice()
    client = client_for(accounts, device)
    assert set_limit(client, signed_in(client, "crew"), value).status_code == 422
    assert device.written == [] and accounts.changes() == []


def test_there_is_no_control_by_another_name(accounts: Accounts):
    client = client_for(accounts, FakeDevice())
    csrf = signed_in(client, "owner")
    assert client.post("/api/controls/elsewhere", json={"value": 1}, headers={CSRF_HEADER: csrf}).status_code == 404


def test_until_an_admin_sets_a_ceiling_only_an_admin_raises_the_limit(accounts: Accounts):
    client = client_for(accounts, FakeDevice())
    crew = signed_in(client, "crew")
    response = set_limit(client, crew, 20)
    assert response.status_code == 403
    assert response.json()["detail"] == "Until an admin sets the highest this can be, it can only be lowered."
    assert set_limit(client, crew, 12).json()["outcome"] == "confirmed"
    assert set_limit(client, signed_in(client, "owner"), 40).json()["outcome"] == "confirmed"


def test_nobody_sets_the_limit_above_the_ceiling_an_admin_set(accounts: Accounts):
    client = client_for(accounts, FakeDevice())
    owner = signed_in(client, "owner")
    assert set_ceiling(client, owner, HIGHEST + 1).status_code == 400
    assert set_ceiling(client, owner, 0).status_code == 422
    assert set_ceiling(client, owner, 30).json()["ceiling"] == 30
    assert set_limit(client, owner, 31).status_code == 400
    crew = signed_in(client, "crew")
    assert set_ceiling(client, crew, 50).status_code == 403
    assert set_limit(client, crew, 31).json()["detail"] == "An admin has set the highest this can be to 30."
    assert set_limit(client, crew, 25).json()["outcome"] == "confirmed"
    assert accounts.ceiling("input-1-current-limit") == 30
    owner = signed_in(client, "owner")
    assert set_ceiling(client, owner, None).json()["ceiling"] is None
    assert accounts.ceiling("input-1-current-limit") is None


def test_a_signed_in_account_sees_the_controls_the_device_has(accounts: Accounts):
    client = client_for(accounts, FakeDevice())
    assert client.get("/api/controls").status_code == 401
    owner = signed_in(client, "owner")
    set_ceiling(client, owner, 30)
    signed_in(client, "guest")
    assert client.get("/api/controls").json() == [{"name": "input-1-current-limit", "value": 16.0,
                                                   "adjustable": True, "low": 0.0, "high": HIGHEST,
                                                   "ceiling": 30.0}]


def test_only_an_admin_reads_the_changes_newest_first_a_page_at_a_time(accounts: Accounts):
    for n in range(5):
        accounts.record_change(Change(at=1.0 + n, account="crew", control="input-1-current-limit", instance=276,
                                      old=float(n), new=float(n + 1), outcome="confirmed", reported=float(n + 1)))
    client = client_for(accounts, FakeDevice())
    assert client.get("/api/changes").status_code == 401
    signed_in(client, "crew")
    assert client.get("/api/changes").status_code == 403
    signed_in(client, "owner")
    page = client.get("/api/changes", params={"limit": 2}).json()
    assert [change["new"] for change in page] == [5.0, 4.0]
    assert page[0]["reported"] == 5.0
    rest = client.get("/api/changes", params={"before": page[-1]["id"]}).json()
    assert [change["new"] for change in rest] == [3.0, 2.0, 1.0]


@pytest.mark.parametrize("version", [1, 2])
def test_the_changes_and_ceilings_are_kept_across_a_restart_and_added_to_an_older_database(
        tmp_path: Path, version: int):
    db = sqlite3.connect(tmp_path / "accounts.db", isolation_level=None)
    db.executescript(f"BEGIN; {SCHEMA} {''.join(UPGRADES[:version - 1])} PRAGMA user_version = {version}; COMMIT;")
    db.close()
    accounts = Accounts(tmp_path / "accounts.db")
    accounts.record_change(Change(at=1.0, account="crew", control="input-1-current-limit", instance=276, old=16.0,
                                  new=3.0, outcome="confirmed", reported=4.2))
    accounts.set_ceiling("input-1-current-limit", 30.0)
    accounts.close()
    again = Accounts(tmp_path / "accounts.db")
    assert [(change.old, change.new, change.reported) for change in again.changes()] == [(16.0, 3.0, 4.2)]
    assert again.ceiling("input-1-current-limit") == 30.0
