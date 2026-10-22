"""Invented readings that move like a real system, for developing skins and testing them.

Nothing here comes from a real installation. The mock is a 24 V system with
two solar arrays, a generator, an inverter/charger and 230 V shore power that
is there only in the evening. It runs through a whole day every ten minutes,
starting at midnight: the battery runs down overnight far enough to need
attention, the generator tops it up at dawn, the sun fills it by early
afternoon and the chargers hold back, shore power arrives in the evening with
a water heater on the supply side, and loads switch on and off throughout.
The inverter/charger warns of its temperature after the morning kettle and
trips on an overload for a few seconds at lunch, and one solar charger stops
reporting for half a minute around noon. Energy
follows the compressed day, so the battery's charge moves visibly, and the
day starts over at midnight.

snapshot(t) depends only on t, in seconds, so a test can pin any moment.
"""
import asyncio
import math
import time
from dataclasses import dataclass

from . import status
from .feed import Feed
from .flows import derive_flows
from .model import (
    AcLoads, Alarm, AlarmCheck, Battery, BatteryHistory, Cell, DcLoads, Generator, Grid, InverterCharger, Solar,
    SolarCharger, System, TemperatureSensor,
)

CYCLE_S = 600
TIME_SCALE = 24 * 3600 / CYCLE_S  # each real second covers this many seconds of the day

BATTERY_CAPACITY_WH = 25.6 * 200
SOC_AT_MIDNIGHT_PERCENT = 62.0
SHORE_V = 230.0
INVERTER_V = 230.0
SHORE_HZ = 50.0
SHORE_LIMIT_A = 16.0
GENERATOR_W = 3000.0
CHARGER_MAX_W = 1600.0
CHARGER_EFFICIENCY = 0.94
INVERTER_EFFICIENCY = 0.92
LOW_BATTERY_ALARM_PERCENT = 20.0
BATTERY_AH = 200.0
# Eight cells in series, each a few millivolts off the pack's mean, the last
# running high enough near full that the battery balances it.
CELL_OFFSETS_V = (-0.004, 0.002, 0.000, -0.002, 0.003, -0.001, 0.001, 0.001)
BALANCE_ABOVE_PERCENT = 95.0


def _window(phase: float, start: float, end: float) -> bool:
    return start <= phase < end


def _sun(phase: float, rise: float, set_: float, peak_w: float) -> float:
    if not rise <= phase < set_:
        return 0.0
    return peak_w * math.sin(math.pi * (phase - rise) / (set_ - rise)) ** 1.5


def _shore_voltage(local: float) -> float:
    return SHORE_V + 2.0 * math.sin(local / 11.0)


def _shore_frequency(local: float) -> float:
    return SHORE_HZ + 0.02 * math.sin(local / 13.0)


def _shore_connected(phase: float) -> bool:
    return _window(phase, 0.75, 0.95)


def _generator_running(phase: float) -> bool:
    return _window(phase, 0.20, 0.27)


def _ac_on_output_w(phase: float, t: float) -> float:
    watts = 220.0 + 15.0 * math.sin(t / 7.0)
    if phase < 0.25 or phase >= 0.92:
        watts += 120.0  # a heater overnight
    if _window(phase, 0.30, 0.32):
        watts += 1800.0  # kettle
    if _window(phase, 0.52, 0.54):
        watts += 1100.0  # microwave
    if _window(phase, 0.75, 0.92):
        watts += 400.0  # evening lights and television
    return watts


def _ac_on_input_w(phase: float) -> float:
    # A water heater wired on the supply side, so it only runs on shore power.
    return 1200.0 if _shore_connected(phase) and _window(phase, 0.78, 0.86) else 0.0


def _dc_loads_w(t: float) -> float:
    return 35.0 + (55.0 if int(t // 40) % 2 == 0 else 0.0)  # the fridge compressor cycles


@dataclass
class _Moment:
    phase: float
    east_w: float
    west_w: float
    on_output_w: float
    on_input_w: float
    dc_w: float
    ac_source: str | None
    charger_dc_w: float
    inverter_dc_w: float
    battery_w: float


def _moment(t: float, soc: float) -> _Moment:
    # Everything runs on the time of day, so every day is the same day.
    local = t % CYCLE_S
    phase = local / CYCLE_S
    east = _sun(phase, 0.25, 0.70, 480.0)
    west = _sun(phase, 0.32, 0.80, 420.0)
    on_output = _ac_on_output_w(phase, local)
    on_input = _ac_on_input_w(phase)
    dc = _dc_loads_w(local)
    source = "generator" if _generator_running(phase) else "grid" if _shore_connected(phase) else None

    charger_dc = 0.0
    if source is not None:
        taper = CHARGER_MAX_W if soc < 85 else max(60.0, CHARGER_MAX_W * (100 - soc) / 15)
        supply_w = GENERATOR_W if source == "generator" else SHORE_LIMIT_A * SHORE_V
        charger_dc = min(taper, max(0.0, supply_w - on_output) * CHARGER_EFFICIENCY)
        if soc >= 100:
            charger_dc = 0.0
    inverter_dc = charger_dc if source is not None else -on_output / INVERTER_EFFICIENCY

    solar = east + west
    battery = solar + inverter_dc - dc
    if soc >= 100 and battery > 0:
        # A full battery takes nothing more, so the chargers hold back.
        curtail = min(battery, solar)
        scale = (solar - curtail) / solar if solar else 0.0
        east, west, solar = east * scale, west * scale, solar - curtail
        battery = solar + inverter_dc - dc
    return _Moment(phase, east, west, on_output, on_input, dc, source, charger_dc, inverter_dc, battery)


def _day_so_far(t: float) -> tuple[float, float, float]:
    """State of charge and each array's yield, accumulated one second at a time since midnight."""
    midnight = t - (t % CYCLE_S)
    soc, east_wh, west_wh = SOC_AT_MIDNIGHT_PERCENT, 0.0, 0.0
    for second in range(int(midnight), int(t)):
        m = _moment(float(second), soc)
        hours = TIME_SCALE / 3600
        soc = min(100.0, max(0.0, soc + m.battery_w * hours / BATTERY_CAPACITY_WH * 100))
        east_wh += m.east_w * hours
        west_wh += m.west_w * hours
    return soc, east_wh, west_wh


def _charge_state(soc: float) -> str:
    return "bulk" if soc < 85 else "absorption" if soc < 98 else "float"


def snapshot(t: float) -> System:
    soc, east_wh, west_wh = _day_so_far(t)
    m = _moment(t, soc)

    voltage = round(25.6 + (soc - 50) * 0.012 + m.battery_w * 0.0002, 2)
    current = round(m.battery_w / voltage, 1)
    activity = "charging" if m.battery_w > 5 else "discharging" if m.battery_w < -5 else "idle"
    remaining_wh = max(0.0, soc - 10) / 100 * BATTERY_CAPACITY_WH
    alarms = [Alarm(name="Low battery", level="warning")] if soc < LOW_BATTERY_ALARM_PERCENT else []
    topping = max(0.0, soc - BALANCE_ABOVE_PERCENT)
    cell_voltages = [voltage / len(CELL_OFFSETS_V) + offset for offset in CELL_OFFSETS_V]
    cell_voltages[-1] += topping * 0.004
    cells = [Cell(voltage_v=round(v, 3), balancing=n == len(cell_voltages) - 1 and topping > 0)
             for n, v in enumerate(cell_voltages)]
    battery_temperature = 21.0 + abs(m.battery_w) * 0.002
    checks = [
        AlarmCheck(name=name, level=level) for name, level in (
            ("Low battery", "warning" if soc < LOW_BATTERY_ALARM_PERCENT else "ok"),
            ("High voltage", "ok"), ("Low cell voltage", "ok"), ("High cell voltage", "ok"),
            ("Cell imbalance", "ok"), ("High temperature", "ok"), ("Low temperature", "ok"),
            ("High charge current", "ok"), ("High discharge current", "ok"), ("Internal failure", "ok"),
        )
    ]
    battery = Battery(
        status=status.battery(soc, activity, alarms),
        soc_percent=round(soc, 1),
        voltage_v=voltage,
        current_a=current,
        power_w=round(m.battery_w),
        temperature_c=round(battery_temperature, 1),
        time_to_go_s=round(remaining_wh / -m.battery_w * 3600) if activity == "discharging" else None,
        activity=activity,
        max_charge_voltage_v=28.4,
        max_charge_current_a=150.0,
        max_discharge_current_a=200.0,
        min_cell_voltage_v=min(cell.voltage_v for cell in cells),
        max_cell_voltage_v=max(cell.voltage_v for cell in cells),
        alarms=alarms,
        checks=checks,
        capacity_ah=round(soc / 100 * BATTERY_AH, 1),
        installed_capacity_ah=BATTERY_AH,
        consumed_ah=round((100 - soc) / 100 * BATTERY_AH, 1),
        health_percent=97.0,
        cells=cells,
        balancing=topping > 0,
        temperatures=[
            TemperatureSensor(name="Cells 1-4", temperature_c=round(battery_temperature - 0.2, 1)),
            TemperatureSensor(name="Cells 5-8", temperature_c=round(battery_temperature + 0.3, 1)),
        ],
        switch_temperature_c=round(battery_temperature + 2.5 + abs(m.battery_w) * 0.002, 1),
        charge_allowed=soc < 100,
        discharge_allowed=soc > 5,
        charge_limited_by="Cell voltage" if topping > 0 else None,
        discharge_limited_by=None,
        applied_charge_voltage_v=28.2,
        max_cell_charge_voltage_v=3.55,
        low_voltage_v=24.0,
        modules_online=1,
        modules_offline=0,
        modules_blocking_charge=1 if soc >= 100 else 0,
        modules_blocking_discharge=0,
        manufacturer="Example Cells",
        firmware_version="1.4.2",
        history=BatteryHistory(
            charge_cycles=41.0, full_discharges=0.0, deepest_discharge_ah=142.0, last_discharge_ah=96.5,
            average_discharge_ah=74.0, total_drawn_ah=8210.0, charged_kwh=221.4, discharged_kwh=209.8,
            min_voltage_v=23.9, max_voltage_v=28.5, min_cell_voltage_v=2.98, max_cell_voltage_v=3.58,
            min_temperature_c=4.5, max_temperature_c=36.0, low_voltage_alarms=1.0, high_voltage_alarms=0.0,
            since_full_charge_s=None if soc >= 99.5 else round((100 - soc) * 2400),
        ),
    )

    ac_in = (m.on_output_w + m.charger_dc_w / CHARGER_EFFICIENCY) if m.ac_source else 0.0
    state = _charge_state(soc) if m.ac_source and m.charger_dc_w > 0 else "passthrough" if m.ac_source else "inverting"
    inverter_alarms = list(alarms)
    if _window(m.phase, 0.32, 0.35):
        inverter_alarms.append(Alarm(name="High temperature", level="warning"))
    if _window(m.phase, 0.530, 0.535):
        inverter_alarms.append(Alarm(name="Overload", level="alarm"))
    inverter = InverterCharger(
        status=status.inverter_charger(state, inverter_alarms),
        mode="on",
        state=state,
        ac_in_power_w=round(ac_in),
        ac_out_power_w=round(m.on_output_w),
        charge_current_a=round(m.inverter_dc_w / voltage, 1),
        dc_power_w=round(m.inverter_dc_w),
        alarms=inverter_alarms,
        # Shore power on AC input 1 and the generator on AC input 2.
        ac_inputs=2,
        active_input=1 if m.ac_source == "grid" else 2 if m.ac_source == "generator" else None,
    )

    shore = m.ac_source == "grid"
    grid = Grid(
        status="normal",
        kind="shore",
        ac_input=1,
        connected=_shore_connected(m.phase),
        power_w=round((ac_in if shore else 0.0) + m.on_input_w),
        voltage_v=round(_shore_voltage(t % CYCLE_S), 1) if _shore_connected(m.phase) else 0.0,
        current_a=round(((ac_in if shore else 0.0) + m.on_input_w) / SHORE_V, 1),
        frequency_hz=round(_shore_frequency(t % CYCLE_S), 2) if _shore_connected(m.phase) else None,
        input_current_limit_a=SHORE_LIMIT_A,
    )

    running = m.ac_source == "generator"
    generator = Generator(
        status="normal",
        ac_input=2,
        running=running,
        power_w=round(ac_in) if running else 0,
        run_time_s=round((m.phase - 0.20) * CYCLE_S * TIME_SCALE) if running else None,
    )

    west_offline = _window(m.phase, 0.48, 0.53)
    chargers = [
        _charger("East array", m.east_w, east_wh, soc),
        SolarCharger(status="offline", name="West array") if west_offline
        else _charger("West array", m.west_w, west_wh, soc),
    ]
    solar_w = m.east_w + (0.0 if west_offline else m.west_w)
    solar = Solar(
        status=status.solar(solar_w, [c.status for c in chargers]),
        power_w=round(solar_w),
        yield_today_kwh=round((east_wh + west_wh) / 1000, 2),
        chargers=chargers,
    )

    # What the loads on the output see: the supply in passthrough, a generator
    # that wanders more than shore power does, or the inverter's own steady
    # output.
    local = t % CYCLE_S
    if m.ac_source == "grid":
        out_v, out_hz = _shore_voltage(local), _shore_frequency(local)
    elif m.ac_source == "generator":
        out_v, out_hz = 228.0 + 3.0 * math.sin(local / 5.0), SHORE_HZ + 0.3 * math.sin(local / 7.0)
    else:
        out_v, out_hz = INVERTER_V, SHORE_HZ

    system = System(
        live=True,
        grid=grid,
        generator=generator,
        inverter_charger=inverter,
        battery=battery,
        solar=solar,
        ac_loads=AcLoads(
            status="normal",
            power_w=round(m.on_output_w + m.on_input_w),
            on_output_w=round(m.on_output_w),
            on_input_w=round(m.on_input_w),
            voltage_v=round(out_v, 1),
            current_a=round(m.on_output_w / out_v, 1),
            frequency_hz=round(out_hz, 2),
        ),
        dc_loads=DcLoads(status="normal", power_w=round(m.dc_w), measured_by="calculation"),
    )
    system.flows = derive_flows(system)
    return system


def _charger(name: str, power_w: float, yield_wh: float, soc: float) -> SolarCharger:
    state = _charge_state(soc) if power_w > 0 else "off"
    return SolarCharger(
        status=status.solar_charger(state, power_w),
        name=name,
        power_w=round(power_w),
        state=state,
        yield_today_kwh=round(yield_wh / 1000, 2),
    )


async def run(feed: Feed, interval_s: float = 1.0) -> None:
    """Publish the invented system every interval, starting at midnight of its day."""
    start = time.monotonic()
    while True:
        feed.publish(snapshot(time.monotonic() - start))
        await asyncio.sleep(interval_s)
