"""The values tsoa-gui can change on the device, and the one route every change goes through.

The device's broker takes a write from anyone who can reach it, so a change is
checked here before it is sent: the session and its CSRF token, the account's
role, and the value against what the device reports for it and the ceiling an
admin set. It is then written to the device instance the control belongs to,
and the answer waits for the device to report on the value again. Every
change a signed-in account asks for is recorded, whether it was refused,
confirmed or never confirmed.
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
from .venus import Bounds, Device, NotConnected, Readings, vebus_instance

# Venus usually reports a new value within a second or two; a busy device can take longer.
CONFIRM_WITHIN_S = 10.0
CHANGES_PER_PAGE = 100


def _always(readings: Readings, instance: int) -> bool:
    return True


def _unbounded(readings: Readings, instance: int) -> Bounds:
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
    bounds: Callable[[Readings, int], Bounds] = _unbounded
    # Whether an admin sets the highest it may be, below the device's own
    # highest, which then has to be known. Until an admin has, only an admin
    # may raise it.
    ceiling: bool = False

    def refusal(self, readings: Readings, instance: int | None, value: float) -> tuple[int, str] | None:
        """Why value cannot be written by what the device reports, with the status that says so, or None."""
        if instance is None or readings.get(self.service, instance, self.path) is None:
            return 409, "The device does not report this setting."
        if not self.adjustable(readings, instance):
            return 409, "The device does not allow this setting to be changed now."
        low, high = self.bounds(readings, instance)
        if self.ceiling and high is None:
            return 409, "The device does not report the highest value this setting takes."
        if (low is not None and value < low) or (high is not None and value > high):
            return 400, f"The device accepts {_range(low, high)}."
        return None


def _input_current_limit(n: int) -> Control:
    # The device publishes the limit's highest beside it, but that is its
    # transfer relay's rating, far above what an input is usually plugged
    # into, so an admin sets the breaker's size as its ceiling. Some devices
    # publish no lowest, and quietly raise a value below their own.
    def adjustable(readings: Readings, instance: int) -> bool:
        return readings.get("vebus", instance, f"Ac/In/{n}/CurrentLimitIsAdjustable") == 1

    def bounds(readings: Readings, instance: int) -> Bounds:
        low, high = readings.bounds_of("vebus", instance, f"Ac/In/{n}/CurrentLimit")
        return (low if low is not None else 0.0), high

    return Control(name=f"input-{n}-current-limit", service="vebus", path=f"Ac/In/{n}/CurrentLimit",
                   role=Role.OPERATOR, instance=vebus_instance, adjustable=adjustable, bounds=bounds, ceiling=True)


# The controls the interface offers. Each names its device path, the role it
# needs and how its value is checked, so adding one is a short entry.
CONTROLS: tuple[Control, ...] = (_input_current_limit(1), _input_current_limit(2))


def _range(low: float | None, high: float | None) -> str:
    if low is not None and high is not None:
        return f"{low:g} to {high:g}"
    return f"at least {low:g}" if low is not None else f"at most {high:g}"


class NewValue(BaseModel):
    # Strict, so that a string or true is refused rather than read as a number.
    value: Annotated[float, Field(strict=True, allow_inf_nan=False)]


class NewCeiling(BaseModel):
    # None takes the ceiling away.
    value: Annotated[float | None, Field(strict=True, allow_inf_nan=False, gt=0)]


class ControlState(BaseModel):
    name: str
    value: Any
    adjustable: bool
    # The lowest and highest the device accepts, where it reports them.
    low: float | None
    high: float | None
    # The highest an admin lets it be set to, for a control that has one.
    ceiling: float | None


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
    reported: Any


def router(accounts: Accounts, device: Device, controls: Sequence[Control] = CONTROLS) -> APIRouter:
    api = APIRouter(prefix="/api")
    by_name = {control.name: control for control in controls}
    Viewer = Annotated[tuple[Session, Account], Depends(requires(accounts, Role.VIEWER))]
    Admin = Annotated[tuple[Session, Account], Depends(requires(accounts, Role.ADMIN))]

    def found(name: str) -> Control:
        control = by_name.get(name)
        if control is None:
            raise HTTPException(status_code=404, detail=f"There is no control called {name}.")
        return control

    def state(control: Control) -> ControlState | None:
        readings = device.readings
        instance = control.instance(readings)
        value = None if instance is None else readings.get(control.service, instance, control.path)
        if instance is None or value is None:
            return None
        low, high = control.bounds(readings, instance)
        return ControlState(name=control.name, value=value, adjustable=control.adjustable(readings, instance),
                            low=low, high=high, ceiling=accounts.ceiling(control.name) if control.ceiling else None)

    @api.get("/controls")
    def offered(_: Viewer) -> list[ControlState]:
        """The controls the device has now, as it reports them."""
        return [current for control in controls if (current := state(control)) is not None]

    @api.post("/controls/{name}")
    async def change(name: str, form: NewValue, current: Viewer) -> ChangeOut:
        control = found(name)
        _, account = current
        readings = device.readings
        instance = control.instance(readings)
        key = None if instance is None else (control.service, instance, control.path)
        old = None if key is None else readings.get(*key)

        async def record(outcome: Outcome, reason: str | None = None) -> ChangeOut:
            # Each record is a synced write to the device's storage, kept off the event loop.
            made = await asyncio.to_thread(accounts.record_change, Change(
                at=time.time(), account=account.name, control=control.name, instance=instance, old=old,
                new=form.value, outcome=outcome, reason=reason,
                reported=None if outcome == "refused" or key is None else readings.get(*key)))
            return _out(made)

        async def refuse(status: int, reason: str) -> None:
            await record("refused", reason)
            raise HTTPException(status_code=status, detail=reason)

        if not account.may(control.role):
            await refuse(403, "Your account cannot change this.")
        if (refusal := control.refusal(readings, instance, form.value)) is not None:
            await refuse(*refusal)
        assert instance is not None and key is not None
        if control.ceiling:
            ceiling = await asyncio.to_thread(accounts.ceiling, control.name)
            if ceiling is not None and form.value > ceiling:
                await refuse(400, f"An admin has set the highest this can be to {ceiling:g}.")
            if ceiling is None and not account.may(Role.ADMIN) and form.value > old:
                await refuse(403, "Until an admin sets the highest this can be, it can only be lowered.")
        if form.value == old:
            # Nothing to write, and a device reports a value again only once it changes.
            return await record("confirmed")
        updates = readings.updates.get(key, 0)
        try:
            await device.write(control.service, instance, control.path, form.value)
        except NotConnected:
            await refuse(503, "The device cannot be reached. Try again in a moment.")
        reported = await device.reports(key, after=updates, within=CONFIRM_WITHIN_S)
        return await record("confirmed" if reported else "unconfirmed")

    @api.put("/controls/{name}/ceiling")
    def set_ceiling(name: str, form: NewCeiling, _: Admin) -> ControlState:
        control = found(name)
        if not control.ceiling:
            raise HTTPException(status_code=404, detail=f"{name} has no ceiling to set.")
        before = state(control)
        if before is None:
            raise HTTPException(status_code=409, detail="The device does not report this setting.")
        if form.value is not None and before.high is not None and form.value > before.high:
            raise HTTPException(status_code=400, detail=f"The device accepts at most {before.high:g}.")
        accounts.set_ceiling(control.name, form.value)
        return before.model_copy(update={"ceiling": form.value})

    @api.get("/changes")
    def changes(_: Admin, before: int | None = None,
                limit: Annotated[int, Query(ge=1, le=CHANGES_PER_PAGE)] = CHANGES_PER_PAGE) -> list[ChangeOut]:
        return [_out(change) for change in accounts.changes(before=before, limit=limit)]

    return api


def _out(change: Change) -> ChangeOut:
    assert change.id is not None
    return ChangeOut(id=change.id, at=change.at, account=change.account, control=change.control,
                     instance=change.instance, old=change.old, new=change.new, outcome=change.outcome,
                     reason=change.reason, reported=change.reported)
