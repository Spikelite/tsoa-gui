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
from typing import Any, Literal

import aiomqtt

from . import status
from .feed import Feed
from .flows import derive_flows
from .model import (
    AcCircuit, AcLoads, AcPhase, Alarm, AlarmCheck, Battery, BatteryHistory, Cell, ChargerState, DcLoads, EnergyCounter,
    EnergyEnd, Generator, Grid, InverterCharger, InverterMode, InverterState, Led, Solar, SolarCharger, System,
    TemperatureSensor,
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
    "BmsCable": "Battery management cable", "StateOfHealth": "State of health",
    "BmsConnectionLost": "Battery management connection", "GridLost": "Supply lost",
    "HighDcCurrent": "High DC current", "HighDcVoltage": "High DC voltage", "MainsImbalance": "Supply imbalance",
}
# The inverter/charger's energy counters, each a route from one end to another,
# where "Inverter" is its battery side.
ENERGY_ROUTES: dict[str, tuple[EnergyEnd, EnergyEnd]] = {
    "AcIn1ToAcOut": ("input_1", "output"), "AcIn1ToInverter": ("input_1", "battery"),
    "AcIn2ToAcOut": ("input_2", "output"), "AcIn2ToInverter": ("input_2", "battery"),
    "InverterToAcOut": ("battery", "output"), "InverterToAcIn1": ("battery", "input_1"),
    "InverterToAcIn2": ("battery", "input_2"), "AcOutToAcIn1": ("output", "input_1"),
    "AcOutToAcIn2": ("output", "input_2"), "OutToInverter": ("output", "battery"),
}
# Its front panel lights, named as the panel labels them: 0 off, 1 on, 2 and 3 blinking.
LEDS = {
    "Mains": "Mains", "Bulk": "Bulk", "Absorption": "Absorption", "Float": "Float", "Inverter": "Inverter",
    "Overload": "Overload", "LowBattery": "Low battery", "Temperature": "Temperature",
}
LED_STATES: dict[int, Literal["off", "on", "blinking"]] = {0: "off", 1: "on", 2: "blinking", 3: "blinking"}
# Batteries that report their cells and temperature sensors number them from
# 1, up to these many.
MOST_CELLS = 32
MOST_SENSORS = 8


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


def _abs(value: float | None) -> float | None:
    return None if value is None else abs(value)


def _words(value: object) -> str | None:
    return (value.strip() or None) if isinstance(value, str) else None


def _ac_inputs(r: Readings) -> list[str]:
    return [kind for n in (1, 2) if (kind := AC_INPUT_KINDS.get(r.get("settings", 0, f"Settings/SystemSetup/AcInput{n}")))]


def _input_of(r: Readings, kinds: tuple[str, ...]) -> Literal[1, 2] | None:
    """Which AC input the system's settings say a supply of one of these kinds is wired to."""
    for n in (1, 2):
        if AC_INPUT_KINDS.get(r.get("settings", 0, f"Settings/SystemSetup/AcInput{n}")) in kinds:
            return n  # type: ignore[return-value]
    return None


# The inverter/charger reports the input it is using as 0 or 1; anything else
# means it is using neither.
ACTIVE_INPUTS: dict[object, Literal[1, 2]] = {0: 1, 1: 2}


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
        ac_input=_input_of(r, ("grid", "shore")),
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
        ac_input=_input_of(r, ("generator",)),
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
    checks = _checks(r, "vebus", instance)
    alarms = [Alarm(name=c.name, level=c.level) for c in checks if c.level != "ok"]
    voltage = r.number("vebus", instance, "Dc/0/Voltage")
    current = r.number("vebus", instance, "Dc/0/Current")

    def detail(path: str) -> float | None:
        return r.number("vebus", instance, path)

    def truth(path: str) -> bool | None:
        value = r.get("vebus", instance, path)
        return value if isinstance(value, bool) else value != 0 if isinstance(value, int | float) else None

    def phases(prefix: str) -> list[AcPhase]:
        found = []
        for n in (1, 2, 3):
            phase = AcPhase(
                phase=f"L{n}", voltage_v=detail(f"{prefix}/L{n}/V"), current_a=detail(f"{prefix}/L{n}/I"),
                power_w=detail(f"{prefix}/L{n}/P"), apparent_power_va=detail(f"{prefix}/L{n}/S"),
                frequency_hz=detail(f"{prefix}/L{n}/F"),
            )
            if any(v is not None for k, v in phase.model_dump().items() if k != "phase"):
                found.append(phase)
        return found

    firmware = r.get("vebus", instance, "FirmwareVersion")
    leds = [Led(name=name, state=LED_STATES[value]) for key, name in LEDS.items()
            if (value := r.get("vebus", instance, f"Leds/{key}")) in LED_STATES]
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
        ac_inputs=_count(r.get("vebus", instance, "Ac/NumberOfAcInputs")),
        active_input=ACTIVE_INPUTS.get(r.get("vebus", instance, "Ac/ActiveIn/ActiveInput")),
        product_name=_words(r.get("vebus", instance, "ProductName")),
        # VE.Bus firmware versions are written in hexadecimal.
        firmware_version=f"{firmware:x}" if isinstance(firmware, int) and not isinstance(firmware, bool) else None,
        rated_power_w=detail("Ac/Out/NominalInverterPower"),
        phases=_count(r.get("vebus", instance, "Ac/NumberOfPhases")),
        units=_count(r.get("vebus", instance, "Devices/NumberOfMultis")),
        uptime_s=detail("Devices/0/UpTime"),
        input_connected=truth("Ac/ActiveIn/Connected"),
        input_current_limit_a=detail("Ac/ActiveIn/CurrentLimit"),
        input_phases=phases("Ac/ActiveIn"),
        output_phases=phases("Ac/Out"),
        output_apparent_power_va=detail("Ac/Out/S"),
        dc_voltage_v=voltage,
        max_charge_current_a=detail("Dc/0/MaxChargeCurrent"),
        battery_ripple_v=detail("Devices/0/Diagnostics/UBatRipple"),
        battery_charge_voltage_v=detail("BatteryOperationalLimits/MaxChargeVoltage"),
        battery_charge_current_a=detail("BatteryOperationalLimits/MaxChargeCurrent"),
        battery_discharge_current_a=detail("BatteryOperationalLimits/MaxDischargeCurrent"),
        battery_low_voltage_v=detail("BatteryOperationalLimits/BatteryLowVoltage"),
        charging_disabled=truth("Devices/0/ExtendStatus/ChargeIsDisabled"),
        too_cold_to_charge=truth("Devices/0/ExtendStatus/ChargeDisabledDueToLowTemp"),
        too_low_to_invert=truth("Devices/0/ExtendStatus/SocTooLowToInvert"),
        power_assist=truth("Settings/PowerAssistEnabled"),
        ups_function=truth("Settings/UpsFunction"),
        weak_input=truth("Settings/WeakAcInput"),
        output_voltage_setting_v=detail("Settings/InverterOutputVoltage"),
        energy=[EnergyCounter(source=source, target=target, kwh=kwh) for key, (source, target) in ENERGY_ROUTES.items()
                if (kwh := detail(f"Energy/{key}")) is not None],
        checks=checks,
        leds=leds,
    )


def _count(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value > 0 else None


def _code(value: float | None) -> int | None:
    return None if value is None else int(value)


def _checks(r: Readings, service: str, instance: int) -> list[AlarmCheck]:
    """Every condition a service watches for, from its Alarms/ paths: 0 clear, 1 a warning, 2 an alarm."""
    levels: dict[int, Literal["ok", "warning", "alarm"]] = {0: "ok", 1: "warning", 2: "alarm"}
    rank = {"ok": 0, "warning": 1, "alarm": 2}
    checks: dict[str, AlarmCheck] = {}
    for (s, i, path), value in sorted(r.values.items()):
        # Per-phase alarms such as Alarms/L1/Overload count once, at their worst.
        if s == service and i == instance and path.startswith("Alarms/") and value in levels:
            word = path.rsplit("/", 1)[-1]
            name = ALARM_NAMES.get(word) or re.sub(r"(?<!^)(?=[A-Z])", " ", word).capitalize()
            level = levels[value]
            if name not in checks or rank[level] > rank[checks[name].level]:
                checks[name] = AlarmCheck(name=name, level=level)
    return list(checks.values())


def _alarms(r: Readings, service: str, instance: int) -> list[Alarm]:
    return [Alarm(name=c.name, level=c.level) for c in _checks(r, service, instance) if c.level != "ok"]


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
    checks = _checks(r, "battery", monitor) if monitor is not None else []
    alarms = [Alarm(name=c.name, level=c.level) for c in checks if c.level != "ok"]

    def detail(path: str) -> float | None:
        return r.number("battery", monitor, path)

    def flag(path: str) -> bool | None:
        value = detail(path)
        return None if value is None else value != 0

    def words(path: str) -> str | None:
        value = r.get("battery", monitor, path)
        return (value.strip() or None) if isinstance(value, str) else None

    def drawn(path: str) -> float | None:
        # Venus reports charge drawn as negative amp-hours.
        return _abs(detail(path))

    def whole(path: str) -> int | None:
        value = detail(path)
        return None if value is None else int(value)

    cells = []
    for n in range(1, MOST_CELLS + 1):
        cell_voltage = detail(f"Voltages/Cell{n}")
        if cell_voltage is None:
            break
        cells.append(Cell(voltage_v=cell_voltage, balancing=flag(f"Balances/Cell{n}")))
    sensors = [
        TemperatureSensor(name=words(f"System/Temperature{n}Name") or f"Sensor {n}", temperature_c=reading)
        for n in range(1, MOST_SENSORS + 1)
        if (reading := detail(f"System/Temperature{n}")) is not None
    ]
    history = BatteryHistory(
        charge_cycles=detail("History/ChargeCycles"),
        full_discharges=detail("History/FullDischarges"),
        deepest_discharge_ah=drawn("History/DeepestDischarge"),
        last_discharge_ah=drawn("History/LastDischarge"),
        average_discharge_ah=drawn("History/AverageDischarge"),
        total_drawn_ah=drawn("History/TotalAhDrawn"),
        charged_kwh=detail("History/ChargedEnergy"),
        discharged_kwh=detail("History/DischargedEnergy"),
        min_voltage_v=detail("History/MinimumVoltage"),
        max_voltage_v=detail("History/MaximumVoltage"),
        min_cell_voltage_v=detail("History/MinimumCellVoltage"),
        max_cell_voltage_v=detail("History/MaximumCellVoltage"),
        min_temperature_c=detail("History/MinimumTemperature"),
        max_temperature_c=detail("History/MaximumTemperature"),
        low_voltage_alarms=detail("History/LowVoltageAlarms"),
        high_voltage_alarms=detail("History/HighVoltageAlarms"),
        since_full_charge_s=detail("History/TimeSinceLastFullCharge"),
    )

    return Battery(
        status=status.battery(soc, activity, alarms),
        soc_percent=soc,
        voltage_v=voltage,
        current_a=r.number("system", 0, "Dc/Battery/Current"),
        power_w=r.number("system", 0, "Dc/Battery/Power"),
        temperature_c=_first(r.number("system", 0, "Dc/Battery/Temperature"), detail("Dc/0/Temperature")),
        cut_off_soc_percent=_ess_minimum_soc(r),
        activity=activity,
        max_charge_voltage_v=detail("Info/MaxChargeVoltage"),
        max_charge_current_a=detail("Info/MaxChargeCurrent"),
        max_discharge_current_a=detail("Info/MaxDischargeCurrent"),
        min_cell_voltage_v=detail("System/MinCellVoltage"),
        max_cell_voltage_v=detail("System/MaxCellVoltage"),
        alarms=alarms,
        checks=checks,
        capacity_ah=detail("Capacity"),
        installed_capacity_ah=detail("InstalledCapacity"),
        consumed_ah=_first(drawn("ConsumedAmphours"), _abs(r.number("system", 0, "Dc/Battery/ConsumedAmphours"))),
        health_percent=detail("Soh"),
        cells=cells,
        balancing=flag("Balancing"),
        temperatures=sensors,
        switch_temperature_c=detail("System/MOSTemperature"),
        charge_allowed=flag("Io/AllowToCharge"),
        discharge_allowed=flag("Io/AllowToDischarge"),
        charge_limited_by=words("Info/ChargeLimitation"),
        discharge_limited_by=words("Info/DischargeLimitation"),
        applied_charge_voltage_v=r.number("system", 0, "Control/EffectiveChargeVoltage"),
        max_cell_charge_voltage_v=detail("Info/MaxChargeCellVoltage"),
        low_voltage_v=detail("Info/BatteryLowVoltage"),
        modules_online=whole("System/NrOfModulesOnline"),
        modules_offline=whole("System/NrOfModulesOffline"),
        modules_blocking_charge=whole("System/NrOfModulesBlockingCharge"),
        modules_blocking_discharge=whole("System/NrOfModulesBlockingDischarge"),
        manufacturer=words("Manufacturer"),
        firmware_version=words("FirmwareVersion"),
        history=history if any(v is not None for v in history.model_dump().values()) else None,
    )


def _ess_minimum_soc(r: Readings) -> float | None:
    """ESS's minimum state of charge, below which it stops discharging the battery, on a system with ESS."""
    # BatteryLife's states as Victron documents them: 0 where ESS is not in
    # use, 1 to 8 with BatteryLife, whose own limit rises above the minimum
    # the owner set, 9 to keep the battery charged, 10 to 12 without BatteryLife.
    state = r.number("settings", 0, "Settings/CGwacs/BatteryLife/State")
    if not state:
        return None
    minimum = r.number("settings", 0, "Settings/CGwacs/BatteryLife/MinimumSocLimit")
    if 1 <= state <= 8:
        return _first(r.number("settings", 0, "Settings/CGwacs/BatteryLife/SocLimit"), minimum)
    return minimum


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
            pv_voltage_v=r.number("solarcharger", instance, "Pv/V"),
            pv_current_a=r.number("solarcharger", instance, "Pv/I"),
            battery_voltage_v=r.number("solarcharger", instance, "Dc/0/Voltage"),
            battery_current_a=r.number("solarcharger", instance, "Dc/0/Current"),
            max_power_today_w=r.number("solarcharger", instance, "History/Daily/0/MaxPower"),
            yield_total_kwh=_first(r.number("solarcharger", instance, "Yield/User"),
                                   r.number("solarcharger", instance, "Yield/System")),
            error=_code(r.number("solarcharger", instance, "ErrorCode")),
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


def _circuit_names(r: Readings) -> dict[int, str]:
    """Each AC load meter's name, made its own by its instance where another meter has the same one."""
    names = {instance: str(r.get("acload", instance, "CustomName") or r.get("acload", instance, "ProductName")
                           or f"AC load {instance}")
             for instance in r.instances("acload")}
    shared = {name for name in names.values() if list(names.values()).count(name) > 1}
    return {instance: f"{name} {instance}" if name in shared else name for instance, name in names.items()}


def _circuits(r: Readings) -> list[AcCircuit]:
    """Each energy meter in the AC load role, which Venus keeps out of its own totals."""
    circuits = []
    names = _circuit_names(r)
    for instance in r.instances("acload"):
        name = names[instance]
        if r.get("acload", instance, "Connected") == 0:
            circuits.append(AcCircuit(status="offline", name=name))
            continue
        # A meter on fewer phases publishes the others' paths as null.
        phases = [
            AcPhase(phase=f"L{n}", voltage_v=r.number("acload", instance, f"Ac/L{n}/Voltage"),
                    current_a=r.number("acload", instance, f"Ac/L{n}/Current"),
                    power_w=r.number("acload", instance, f"Ac/L{n}/Power"))
            for n in (1, 2, 3)
            if any(r.number("acload", instance, f"Ac/L{n}/{path}") is not None
                   for path in ("Voltage", "Current", "Power"))
        ]
        circuits.append(AcCircuit(
            status="normal",
            name=name,
            power_w=_first(r.number("acload", instance, "Ac/Power"), r.total("acload", instance, "Ac/{}/Power")),
            voltage_v=phases[0].voltage_v if phases else None,
            current_a=r.total("acload", instance, "Ac/{}/Current"),
            power_factor=r.number("acload", instance, "Ac/L1/PowerFactor") if len(phases) == 1 else None,
            # For a load, the forward counter is the one that grows.
            energy_kwh=r.number("acload", instance, "Ac/Energy/Forward"),
            phases=phases if len(phases) > 1 else [],
        ))
    return circuits


def _ac_loads(r: Readings) -> AcLoads | None:
    total = r.total("system", 0, "Ac/Consumption/{}/Power")
    on_output = r.total("system", 0, "Ac/ConsumptionOnOutput/{}/Power")
    on_input = r.total("system", 0, "Ac/ConsumptionOnInput/{}/Power")
    circuits = _circuits(r)
    if total is None and on_output is None and on_input is None and not circuits:
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
        circuits=circuits,
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
                feed.waiting = "broker_silent"
                if lost:
                    log.warning("reached the device's MQTT broker again")
                    lost = False
                await _follow(client, feed, readings)
        except aiomqtt.MqttError as error:
            feed.waiting = "broker_unreachable"
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
