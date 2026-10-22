"""Reads a Venus OS device's MQTT feed and keeps the system model current.

Venus publishes every value of every service on its MQTT broker as
N/<portal ID>/<service>/<instance>/<path>, each payload a JSON object
{"value": ...}, and an empty payload when a value goes away. It does so only
while a client sends it a keepalive on R/<portal ID>/keepalive. This module
reads: the keepalive is the only thing it publishes, and it never writes to
W/, which would change settings on the device.

The model is built from the system summary service where it can be, so one
build works on any installation without setup, with detail from the
services the summary points at: the inverter/charger, the active battery
monitor and the solar chargers.
"""
import asyncio
import json
import logging
import re
import time
from collections.abc import Callable
from typing import Any

import aiomqtt

from . import status
from .feed import Feed
from .flows import derive_flows
from .model import (
    AcLoads, Alarm, Battery, ChargerState, DcLoads, Generator, Grid, InverterCharger, InverterMode, InverterState,
    Solar, SolarCharger, System,
)

log = logging.getLogger(__name__)

KEEPALIVE_EVERY_S = 30.0
PUBLISH_EVERY_S = 1.0
STALE_AFTER_S = 10.0
RECONNECT_AFTER_S = 5.0

Key = tuple[str, int, str]

# Values Venus uses on its services, as Victron documents them.
AC_INPUT_KINDS = {1: "grid", 2: "generator", 3: "shore"}
MODES: dict[int, InverterMode] = {1: "charger_only", 2: "inverter_only", 3: "on", 4: "off"}
INVERTER_STATES: dict[int, InverterState] = {
    0: "off", 1: "low_power", 2: "fault", 3: "bulk", 4: "absorption", 5: "float", 6: "storage", 7: "equalize",
    8: "passthrough", 9: "inverting", 10: "power_assist", 11: "power_supply", 244: "sustain", 252: "external_control",
}
CHARGER_STATES: dict[int, ChargerState] = {
    0: "off", 2: "fault", 3: "bulk", 4: "absorption", 5: "float", 6: "storage", 7: "equalize", 245: "starting",
    252: "external_control",
}
BATTERY_ACTIVITY = {0: "idle", 1: "charging", 2: "discharging"}
ALARM_NAMES = {
    "LowBattery": "Low battery", "HighTemperature": "High temperature", "Overload": "Overload",
    "Ripple": "DC ripple", "LowSoc": "Low state of charge", "CellImbalance": "Cell imbalance",
}


class Readings:
    """Every value the device has published, by service, instance and path."""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self.values: dict[Key, Any] = {}
        self.last_heard: float | None = None
        self._clock = clock

    def update(self, key: Key, value: Any) -> None:
        self.last_heard = self._clock()
        if value is None:
            self.values.pop(key, None)
        else:
            self.values[key] = value

    def heard_within(self, seconds: float) -> bool:
        return self.last_heard is not None and self._clock() - self.last_heard < seconds

    def get(self, service: str, instance: int | None, path: str) -> Any:
        return None if instance is None else self.values.get((service, instance, path))

    def number(self, service: str, instance: int | None, path: str) -> float | None:
        value = self.get(service, instance, path)
        return float(value) if isinstance(value, int | float) and not isinstance(value, bool) else None

    def total(self, service: str, instance: int | None, template: str) -> float | None:
        """The sum over the phases of a per-phase path such as Ac/Grid/{}/Power."""
        phases = [self.number(service, instance, template.format(f"L{n}")) for n in (1, 2, 3)]
        known = [p for p in phases if p is not None]
        return sum(known) if known else None

    def instances(self, service: str) -> list[int]:
        return sorted({instance for (s, instance, _) in self.values if s == service})


def parse(topic: str, payload: bytes | str | None) -> tuple[Key, Any] | None:
    """The key and value of one message, or None for a message that is not a reading."""
    parts = topic.split("/", 4)
    if len(parts) != 5 or parts[0] != "N" or not parts[3].isdigit():
        return None
    key = (parts[2], int(parts[3]), parts[4])
    if not payload:
        return key, None
    try:
        return key, json.loads(payload)["value"]
    except (ValueError, KeyError, TypeError):
        return None


def build(readings: Readings, live: bool) -> System:
    system = System(
        live=live,
        grid=_grid(readings),
        generator=_generator(readings),
        inverter_charger=_inverter_charger(readings),
        battery=_battery(readings),
        solar=_solar(readings),
        ac_loads=_ac_loads(readings),
        dc_loads=_dc_loads(readings),
    )
    system.flows = derive_flows(system)
    return system


def _first(*values: float | None) -> float | None:
    return next((v for v in values if v is not None), None)


def _ac_inputs(r: Readings) -> list[str]:
    return [kind for n in (1, 2) if (kind := AC_INPUT_KINDS.get(r.get("settings", 0, f"Settings/SystemSetup/AcInput{n}")))]


def _vebus(r: Readings) -> int | None:
    instance = r.get("system", 0, "VebusInstance")
    return instance if isinstance(instance, int) and not isinstance(instance, bool) else None


def _grid(r: Readings) -> Grid | None:
    kind = next((k for k in _ac_inputs(r) if k in ("grid", "shore")), None)
    power = r.total("system", 0, "Ac/Grid/{}/Power")
    if kind is None and power is None:
        return None
    source = AC_INPUT_KINDS.get(r.get("system", 0, "Ac/ActiveIn/Source"))
    connected = None if r.get("system", 0, "Ac/ActiveIn/Source") is None else source == (kind or "grid")
    vebus = _vebus(r) if connected else None
    return Grid(
        status="normal",
        kind="shore" if kind == "shore" else "grid",
        connected=connected,
        power_w=power,
        voltage_v=r.number("vebus", vebus, "Ac/ActiveIn/L1/V"),
        current_a=r.total("vebus", vebus, "Ac/ActiveIn/{}/I"),
        frequency_hz=r.number("vebus", vebus, "Ac/ActiveIn/L1/F"),
        input_current_limit_a=r.number("vebus", _vebus(r), "Ac/ActiveIn/CurrentLimit"),
    )


def _generator(r: Readings) -> Generator | None:
    power = r.total("system", 0, "Ac/Genset/{}/Power")
    startstop = 0 in r.instances("generator")
    if "generator" not in _ac_inputs(r) and not startstop and power is None:
        return None
    # The start/stop service knows best; without it, a generator feeding the
    # active AC input is running.
    state = r.get("generator", 0, "State")
    source = r.get("system", 0, "Ac/ActiveIn/Source")
    if state is not None:
        running: bool | None = state == 1
    elif source is not None:
        running = source == 2
    else:
        running = None
    return Generator(
        status="normal",
        running=running,
        power_w=power,
        run_time_s=r.number("generator", 0, "Runtime") if running else None,
    )


def _inverter_charger(r: Readings) -> InverterCharger | None:
    instance = _vebus(r)
    if instance is None:
        return None
    if r.get("vebus", instance, "Connected") == 0 or instance not in r.instances("vebus"):
        return InverterCharger(status="offline")
    raw_state = r.get("vebus", instance, "State")
    state = None if raw_state is None else INVERTER_STATES.get(raw_state, "other")
    alarms = _alarms(r, "vebus", instance)
    voltage = r.number("vebus", instance, "Dc/0/Voltage")
    current = r.number("vebus", instance, "Dc/0/Current")
    return InverterCharger(
        status=status.inverter_charger(state, alarms),
        mode=MODES.get(r.get("vebus", instance, "Mode")),
        state=state,
        ac_in_power_w=_first(r.number("vebus", instance, "Ac/ActiveIn/P"), r.total("vebus", instance, "Ac/ActiveIn/{}/P")),
        ac_out_power_w=_first(r.number("vebus", instance, "Ac/Out/P"), r.total("vebus", instance, "Ac/Out/{}/P")),
        charge_current_a=current,
        dc_power_w=_first(r.number("vebus", instance, "Dc/0/Power"),
                          voltage * current if voltage is not None and current is not None else None),
        alarms=alarms,
    )


def _alarms(r: Readings, service: str, instance: int) -> list[Alarm]:
    alarms: dict[str, Alarm] = {}
    for (s, i, path), value in sorted(r.values.items()):
        # 1 is a warning and 2 an alarm; per-phase alarms such as Alarms/L1/Overload count once.
        if s == service and i == instance and path.startswith("Alarms/") and value in (1, 2):
            word = path.rsplit("/", 1)[-1]
            name = ALARM_NAMES.get(word) or re.sub(r"(?<!^)(?=[A-Z])", " ", word).capitalize()
            level = "warning" if value == 1 else "alarm"
            if name not in alarms or level == "alarm":
                alarms[name] = Alarm(name=name, level=level)
    return list(alarms.values())


def _active_battery(r: Readings) -> int | None:
    """The instance of the battery monitor the system uses, when it is a battery service."""
    # For example "com.victronenergy.battery.ttyUSB0/512": a service name, then its instance.
    value = r.get("system", 0, "ActiveBatteryService")
    if not isinstance(value, str):
        return None
    name, _, instance = value.rpartition("/")
    if name.removeprefix("com.victronenergy.").split(".")[0] != "battery" or not instance.isdigit():
        return None
    return int(instance)


def _battery(r: Readings) -> Battery | None:
    soc = r.number("system", 0, "Dc/Battery/Soc")
    voltage = r.number("system", 0, "Dc/Battery/Voltage")
    monitor = _active_battery(r)
    if soc is None and voltage is None and monitor is None:
        return None
    if monitor is not None and r.get("battery", monitor, "Connected") == 0:
        return Battery(status="offline")
    activity = BATTERY_ACTIVITY.get(r.get("system", 0, "Dc/Battery/State"))
    alarms = _alarms(r, "battery", monitor) if monitor is not None else []

    def detail(path: str) -> float | None:
        return r.number("battery", monitor, path)

    return Battery(
        status=status.battery(soc, activity, alarms),
        soc_percent=soc,
        voltage_v=voltage,
        current_a=r.number("system", 0, "Dc/Battery/Current"),
        power_w=r.number("system", 0, "Dc/Battery/Power"),
        temperature_c=_first(r.number("system", 0, "Dc/Battery/Temperature"), detail("Dc/0/Temperature")),
        time_to_go_s=r.number("system", 0, "Dc/Battery/TimeToGo") if activity == "discharging" else None,
        activity=activity,
        max_charge_voltage_v=detail("Info/MaxChargeVoltage"),
        max_charge_current_a=detail("Info/MaxChargeCurrent"),
        max_discharge_current_a=detail("Info/MaxDischargeCurrent"),
        min_cell_voltage_v=detail("System/MinCellVoltage"),
        max_cell_voltage_v=detail("System/MaxCellVoltage"),
    )


def _solar(r: Readings) -> Solar | None:
    chargers = []
    for instance in r.instances("solarcharger"):
        name = (r.get("solarcharger", instance, "CustomName") or r.get("solarcharger", instance, "ProductName")
                or f"Solar charger {instance}")
        if r.get("solarcharger", instance, "Connected") == 0:
            chargers.append(SolarCharger(status="offline", name=str(name)))
            continue
        raw_state = r.get("solarcharger", instance, "State")
        state = None if raw_state is None else CHARGER_STATES.get(raw_state, "other")
        power = r.number("solarcharger", instance, "Yield/Power")
        chargers.append(SolarCharger(
            status=status.solar_charger(state, power),
            name=str(name),
            power_w=power,
            state=state,
            yield_today_kwh=r.number("solarcharger", instance, "History/Daily/0/Yield"),
        ))
    # DC-coupled solar from the chargers, plus PV inverters on the AC side.
    sources = [r.number("system", 0, "Dc/Pv/Power")]
    sources += [r.total("system", 0, f"Ac/PvOn{side}/{{}}/Power") for side in ("Output", "Grid", "Genset")]
    known = [p for p in sources if p is not None]
    if not chargers and not known:
        return None
    power = sum(known) if known else None
    yields = [c.yield_today_kwh for c in chargers if c.yield_today_kwh is not None]
    return Solar(
        status=status.solar(power, [c.status for c in chargers]),
        power_w=power,
        yield_today_kwh=sum(yields) if yields else None,
        chargers=chargers,
    )


def _ac_loads(r: Readings) -> AcLoads | None:
    total = r.total("system", 0, "Ac/Consumption/{}/Power")
    on_output = r.total("system", 0, "Ac/ConsumptionOnOutput/{}/Power")
    on_input = r.total("system", 0, "Ac/ConsumptionOnInput/{}/Power")
    if total is None and on_output is None and on_input is None:
        return None
    # What the loads see comes from the inverter/charger's own output.
    vebus = _vebus(r)
    return AcLoads(
        status="normal",
        power_w=total,
        on_output_w=on_output,
        on_input_w=on_input,
        voltage_v=r.number("vebus", vebus, "Ac/Out/L1/V"),
        current_a=r.total("vebus", vebus, "Ac/Out/{}/I"),
        frequency_hz=r.number("vebus", vebus, "Ac/Out/L1/F"),
    )


def _dc_loads(r: Readings) -> DcLoads | None:
    power = r.number("system", 0, "Dc/System/Power")
    if power is None:
        return None
    metered = any(r.instances(service) for service in ("dcload", "dcsystem"))
    return DcLoads(status="normal", power_w=power, measured_by="meter" if metered else "calculation")


async def run(feed: Feed, host: str = "127.0.0.1", port: int = 1883) -> None:
    """Keep the feed current from the device's broker, reconnecting whenever it is lost."""
    readings = Readings()
    # An outage is logged when it starts and when it ends, not at every
    # retry: on a device each log line is a write to its storage.
    lost = False
    while True:
        try:
            async with aiomqtt.Client(host, port) as client:
                if lost:
                    log.warning("reached the device's MQTT broker again")
                    lost = False
                await _follow(client, feed, readings)
        except aiomqtt.MqttError as error:
            if not lost:
                log.warning("lost the device's MQTT broker, retrying every %g s: %s", RECONNECT_AFTER_S, error)
            lost = True
        if feed.latest is not None and feed.latest.live:
            feed.publish(feed.latest.model_copy(update={"live": False}))
        await asyncio.sleep(RECONNECT_AFTER_S)


async def _follow(client: Any, feed: Feed, readings: Readings) -> None:
    portal = await _portal_id(client)
    await client.subscribe(f"N/{portal}/#")
    tasks = [asyncio.create_task(_keep_alive(client, portal)), asyncio.create_task(_publish(feed, readings))]
    try:
        async for message in client.messages:
            if (reading := parse(str(message.topic), message.payload)) is not None:
                readings.update(*reading)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


async def _portal_id(client: Any) -> str:
    # Venus publishes its portal ID, retained, before any keepalive, so a
    # client can find it without being told.
    await client.subscribe("N/+/system/0/Serial")
    async for message in client.messages:
        parts = str(message.topic).split("/")
        if len(parts) == 5 and parts[1]:
            await client.unsubscribe("N/+/system/0/Serial")
            return parts[1]
    raise aiomqtt.MqttError("the broker closed before the device named itself")


async def _keep_alive(client: Any, portal: str) -> None:
    # The first keepalive asks Venus to send every value once. Later ones
    # only keep readings coming, without the whole tree again each time.
    payload = None
    while True:
        await client.publish(f"R/{portal}/keepalive", payload=payload)
        payload = json.dumps({"keepalive-options": ["suppress-republish"]})
        await asyncio.sleep(KEEPALIVE_EVERY_S)


async def _publish(feed: Feed, readings: Readings) -> None:
    while True:
        await asyncio.sleep(PUBLISH_EVERY_S)
        if readings.last_heard is not None:
            feed.publish(build(readings, live=readings.heard_within(STALE_AFTER_S)))
