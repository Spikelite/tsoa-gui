"""The values tsoa-gui can change on the device, and the one route every change goes through.

The device's broker takes a write from anyone who can reach it, so a change is
checked here before it is sent: the session and its CSRF token, the account's
role, and the value against what the device reports for it. It is then written
to the device instance the control belongs to, and the answer waits for the
device to report the new value. Every change a signed-in account asks for is
recorded, whether it was refused, confirmed or never confirmed.
"""
import asyncio
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .accounts import Account, Accounts, Change, Outcome, Role, Session
from .signin import requires
from .venus import Device, NotConnected, Readings

# Venus usually reports a new value within a second or two; a busy device can take longer.
CONFIRM_WITHIN_S = 10.0
CHANGES_PER_PAGE = 100

Limits = tuple[float | None, float | None]


def _always(readings: Readings, instance: int) -> bool:
    return True


def _unlimited(readings: Readings, instance: int) -> Limits:
    return None, None


@dataclass(frozen=True)
class Control:
    """A value on the device that an account of role, or a higher one, may change."""
    # Its address: /api/controls/<name>.
    name: str
    service: str
    path: str
    role: Role
    # The instance of service it belongs to, found among the device's readings.
    instance: Callable[[Readings], int | None]
    # Whether the device lets it be changed now, which some values report beside themselves.
    adjustable: Callable[[Readings, int], bool] = _always
    # The lowest and highest the device accepts, where it reports them.
    limits: Callable[[Readings, int], Limits] = _unlimited
    # How far a reported value may be from the one written and still confirm it, for a device that rounds.
    tolerance: float = 0.0

    def refusal(self, readings: Readings, instance: int | None, value: float) -> tuple[int, str] | None:
        """Why value cannot be written, with the status that says so, or None if it can."""
        if instance is None or readings.get(self.service, instance, self.path) is None:
            return 409, "The device does not report this setting."
        if not self.adjustable(readings, instance):
            return 409, "The device does not allow this setting to be changed now."
        low, high = self.limits(readings, instance)
        if (low is not None and value < low) or (high is not None and value > high):
            return 400, f"The device accepts {_range(low, high)}."
        return None

    def reported(self, value: float) -> Callable[[Any], bool]:
        def matches(reading: Any) -> bool:
            return (isinstance(reading, int | float) and not isinstance(reading, bool)
                    and abs(reading - value) <= self.tolerance)
        return matches


# The controls each user interface offers. Each names its device path, the
# role it needs and how its value is checked, so adding one is a short entry.
CONTROLS: tuple[Control, ...] = ()


def _range(low: float | None, high: float | None) -> str:
    if low is not None and high is not None:
        return f"{low:g} to {high:g}"
    return f"at least {low:g}" if low is not None else f"at most {high:g}"


class NewValue(BaseModel):
    # Strict, so that a string or true is refused rather than read as a number.
    value: Annotated[float, Field(strict=True, allow_inf_nan=False)]


class ChangeOut(BaseModel):
    id: int
    # Seconds since 1970 by the device's clock, which may not have been set at the time.
    at: float
    account: str
    control: str
    instance: int | None
    old: Any
    new: Any
    outcome: Outcome
    reason: str | None


def router(accounts: Accounts, device: Device, controls: Sequence[Control] = CONTROLS) -> APIRouter:
    api = APIRouter(prefix="/api")
    by_name = {control.name: control for control in controls}
    Viewer = Annotated[tuple[Session, Account], Depends(requires(accounts, Role.VIEWER))]
    Admin = Annotated[tuple[Session, Account], Depends(requires(accounts, Role.ADMIN))]

    @api.post("/controls/{name}")
    async def change(name: str, form: NewValue, current: Viewer) -> ChangeOut:
        control = by_name.get(name)
        if control is None:
            raise HTTPException(status_code=404, detail=f"There is no control called {name}.")
        _, account = current
        readings = device.readings
        instance = control.instance(readings)
        old = None if instance is None else readings.get(control.service, instance, control.path)

        async def record(outcome: Outcome, reason: str | None = None) -> ChangeOut:
            # Each record is a synced write to the device's storage, kept off the event loop.
            made = await asyncio.to_thread(accounts.record_change, Change(
                at=time.time(), account=account.name, control=control.name, instance=instance, old=old,
                new=form.value, outcome=outcome, reason=reason))
            return _out(made)

        async def refuse(status: int, reason: str) -> None:
            await record("refused", reason)
            raise HTTPException(status_code=status, detail=reason)

        if not account.may(control.role):
            await refuse(403, "Your account cannot change this.")
        if (refusal := control.refusal(readings, instance, form.value)) is not None:
            await refuse(*refusal)
        assert instance is not None
        try:
            await device.write(control.service, instance, control.path, form.value)
        except NotConnected:
            await refuse(503, "The device cannot be reached. Try again in a moment.")
        confirmed = await device.reports((control.service, instance, control.path), control.reported(form.value),
                                         within=CONFIRM_WITHIN_S)
        return await record("confirmed" if confirmed else "unconfirmed")

    @api.get("/changes")
    def changes(_: Admin, before: int | None = None,
                limit: Annotated[int, Query(ge=1, le=CHANGES_PER_PAGE)] = CHANGES_PER_PAGE) -> list[ChangeOut]:
        return [_out(change) for change in accounts.changes(before=before, limit=limit)]

    return api


def _out(change: Change) -> ChangeOut:
    assert change.id is not None
    return ChangeOut(id=change.id, at=change.at, account=change.account, control=change.control,
                     instance=change.instance, old=change.old, new=change.new, outcome=change.outcome,
                     reason=change.reason)
