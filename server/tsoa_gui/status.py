"""The default rules that give each part its status level.

The design brief gives the levels their meaning: good is a positive
condition such as charging or solar producing, normal is operating as
expected, attention is approaching a limit, warning is outside the normal
range, fault is an alarm, a trip or a limit reached, and offline is
installed but not reporting. These rules turn that into numbers.
"""
from collections.abc import Iterable

from .model import Alarm, ChargerState, InverterState, Status

BATTERY_ATTENTION_SOC_PERCENT = 30.0
BATTERY_WARNING_SOC_PERCENT = 15.0

_CHARGING_STATES = {"bulk", "absorption", "float", "storage", "equalize"}


def from_alarms(alarms: Iterable[Alarm]) -> Status | None:
    levels = {alarm.level for alarm in alarms}
    if "alarm" in levels:
        return "fault"
    if "warning" in levels:
        return "warning"
    return None


def battery(soc_percent: float | None, activity: str | None, alarms: Iterable[Alarm] = ()) -> Status:
    if (level := from_alarms(alarms)) is not None:
        return level
    if soc_percent is not None and soc_percent < BATTERY_WARNING_SOC_PERCENT:
        return "warning"
    if soc_percent is not None and soc_percent < BATTERY_ATTENTION_SOC_PERCENT:
        return "attention"
    return "good" if activity == "charging" else "normal"


def inverter_charger(state: InverterState | None, alarms: Iterable[Alarm] = ()) -> Status:
    if state == "fault":
        return "fault"
    if (level := from_alarms(alarms)) is not None:
        return level
    return "good" if state in _CHARGING_STATES else "normal"


def solar_charger(state: ChargerState | None, power_w: float | None) -> Status:
    if state == "fault":
        return "fault"
    return "good" if power_w else "normal"


def solar(power_w: float | None, charger_levels: Iterable[Status] = ()) -> Status:
    levels = set(charger_levels)
    # One charger in trouble is worth showing on the whole panel.
    for level in ("fault", "warning", "attention"):
        if level in levels:
            return level
    return "good" if power_w else "normal"
