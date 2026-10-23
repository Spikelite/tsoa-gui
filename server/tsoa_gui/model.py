"""The system model: everything a skin draws, in one structure.

The server builds it from the device's readings and sends it to the browser,
and skins never see anything else. The TypeScript types the client uses are
generated from these classes, so they are the one definition of the model.

Each unit is in its field's name. None means the value is not known, which
is different from zero: a skin draws an unknown reading as unknown, never as
zero. A part the system does not have is None on System and is left out of
the page; a part that is installed but not reporting has status "offline".
"""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from typing_extensions import TypeAliasType

# Named aliases become named types in the schema, and so in TypeScript.
Status = TypeAliasType("Status", Literal["good", "normal", "attention", "warning", "fault", "offline"])

PartName = TypeAliasType(
    "PartName", Literal["grid", "generator", "inverter_charger", "battery", "solar", "ac_loads", "dc_loads"])

# Where power can run from or to: a part, or the DC bus, the junction where
# the inverter/charger, the battery, solar and the DC loads all meet, which
# is not a part of its own.
FlowEnd = TypeAliasType("FlowEnd", PartName | Literal["dc_bus"])


class _Model(BaseModel):
    # Every field is always present in what the server sends, null or not, so
    # the schema marks them all required and TypeScript never sees undefined.
    model_config = ConfigDict(extra="forbid", json_schema_serialization_defaults_required=True)


class Part(_Model):
    status: Status = Field(
        description="How this part is doing. Every skin gives each level the same color: good green, normal "
                    "blue, attention yellow, warning orange, fault red, offline black, always paired with an "
                    "icon or a label so color is never the only signal.")


class Grid(Part):
    """The AC supply the system connects to: a utility grid or shore power."""

    kind: Literal["grid", "shore"] = Field(description="Whether the supply is a utility grid or shore power.")
    ac_input: Literal[1, 2] | None = Field(
        None, description="Which of the inverter/charger's AC inputs the supply is wired to, where the system says.")
    connected: bool | None = Field(None, description="Whether the supply is present and connected now.")
    power_w: float | None = Field(
        None, description="Power drawn from the supply. Negative when power is fed back into it.")
    voltage_v: float | None = None
    current_a: float | None = None
    frequency_hz: float | None = None
    input_current_limit_a: float | None = Field(
        None, description="The most current the inverter/charger will draw from the supply.")


class Generator(Part):
    ac_input: Literal[1, 2] | None = Field(
        None, description="Which of the inverter/charger's AC inputs the generator is wired to, where the system says.")
    running: bool | None = None
    power_w: float | None = Field(None, description="Power the generator supplies.")
    run_time_s: float | None = Field(None, description="How long the generator has been running this time.")


InverterMode = TypeAliasType("InverterMode", Literal["on", "off", "charger_only", "inverter_only"])

InverterState = TypeAliasType("InverterState", Literal[
    "off", "low_power", "fault", "bulk", "absorption", "float", "storage", "equalize",
    "passthrough", "inverting", "power_assist", "power_supply", "sustain", "external_control", "other",
])


class Alarm(_Model):
    name: str = Field(description="What the alarm is about, worded for the person reading it.")
    level: Literal["warning", "alarm"]


class AlarmCheck(_Model):
    """One condition a part watches for, and where it stands now."""

    name: str = Field(description="What the part watches, worded for the person reading it.")
    level: Literal["ok", "warning", "alarm"]


class AcPhase(_Model):
    """One phase of an AC connection."""

    phase: str = Field(description="The phase's name, L1, L2 or L3.")
    voltage_v: float | None = None
    current_a: float | None = None
    power_w: float | None = None
    apparent_power_va: float | None = None
    frequency_hz: float | None = None


EnergyEnd = TypeAliasType("EnergyEnd", Literal["input_1", "input_2", "battery", "output"])


class EnergyCounter(_Model):
    """Energy the inverter/charger has moved along one route, since its counters were last reset."""

    source: EnergyEnd
    target: EnergyEnd
    kwh: float


class Led(_Model):
    """One of the inverter/charger's front panel lights."""

    name: str
    state: Literal["off", "on", "blinking"]


class InverterCharger(Part):
    mode: InverterMode | None = Field(None, description="The mode it has been set to.")
    state: InverterState | None = Field(None, description="What it is doing now.")
    ac_in_power_w: float | None = Field(
        None, description="Power coming in on its AC input. Negative when it feeds power back out of the input.")
    ac_out_power_w: float | None = Field(None, description="Power going out of its AC output to the loads.")
    charge_current_a: float | None = Field(
        None, description="DC current into the battery. Negative when it draws from the battery to invert.")
    dc_power_w: float | None = Field(
        None, description="DC power into the battery. Negative when it draws from the battery to invert.")
    alarms: list[Alarm] = Field(default_factory=list, description="Alarms and warnings active now.")
    ac_inputs: int | None = Field(
        None, description="How many AC inputs it has: one on most models, two on those that switch between "
                          "two supplies, such as shore power and a generator.")
    active_input: Literal[1, 2] | None = Field(
        None, description="The AC input it is taking power from now, if any.")

    # The detail, for the inverter/charger's own page.
    product_name: str | None = Field(None, description="The model, as the unit reports it.")
    firmware_version: str | None = None
    rated_power_w: float | None = Field(None, description="The most power it is rated to invert.")
    phases: int | None = Field(None, description="How many phases it supplies.")
    units: int | None = Field(None, description="How many units work together as this one inverter/charger.")
    uptime_s: float | None = Field(None, description="Time since the unit last started.")
    input_connected: bool | None = Field(None, description="Whether the AC input in use is connected now.")
    input_current_limit_a: float | None = Field(
        None, description="The most current it will draw from the AC input in use.")
    input_phases: list[AcPhase] = Field(default_factory=list, description="Each phase of the AC input in use.")
    output_phases: list[AcPhase] = Field(default_factory=list, description="Each phase of the AC output.")
    output_apparent_power_va: float | None = None
    dc_voltage_v: float | None = Field(None, description="Battery voltage at its DC terminals.")
    max_charge_current_a: float | None = Field(None, description="The most current its charger can give.")
    battery_ripple_v: float | None = Field(
        None, description="Ripple on the battery voltage, which grows with cables or a battery too small for "
                          "the load.")
    battery_charge_voltage_v: float | None = Field(
        None, description="The charge voltage it holds to, as the system sets it for the battery.")
    battery_charge_current_a: float | None = Field(
        None, description="The charge current limit it follows, as the system sets it for the battery.")
    battery_discharge_current_a: float | None = Field(
        None, description="The discharge current limit it follows, as the system sets it for the battery.")
    battery_low_voltage_v: float | None = Field(None, description="The battery voltage it stops inverting at.")
    charging_disabled: bool | None = None
    too_cold_to_charge: bool | None = None
    too_low_to_invert: bool | None = Field(
        None, description="Whether the battery's charge is too low for it to invert.")
    power_assist: bool | None = Field(
        None, description="Whether it adds battery power to the supply when the loads need more than the "
                          "input limit allows.")
    ups_function: bool | None = None
    weak_input: bool | None = Field(None, description="Whether it is set to accept a weak or distorted supply.")
    output_voltage_setting_v: float | None = Field(None, description="The voltage it is set to invert at.")
    energy: list[EnergyCounter] = Field(default_factory=list, description="Energy moved along each route.")
    checks: list[AlarmCheck] = Field(
        default_factory=list, description="Every condition it watches for, alarming or not.")
    leds: list[Led] = Field(default_factory=list, description="Its front panel lights.")


class Cell(_Model):
    """One cell of a battery that reports its cells, in the order the battery numbers them."""

    voltage_v: float | None = None
    balancing: bool | None = Field(
        None, description="Whether the battery is bleeding charge from this cell to bring it level with the rest.")


class TemperatureSensor(_Model):
    name: str = Field(description="The sensor's name as the battery reports it.")
    temperature_c: float | None = None


class BatteryHistory(_Model):
    """What the battery has kept track of since it was last reset. Amounts drawn are positive."""

    charge_cycles: float | None = None
    full_discharges: float | None = None
    deepest_discharge_ah: float | None = None
    last_discharge_ah: float | None = None
    average_discharge_ah: float | None = None
    total_drawn_ah: float | None = None
    charged_kwh: float | None = None
    discharged_kwh: float | None = None
    min_voltage_v: float | None = None
    max_voltage_v: float | None = None
    min_cell_voltage_v: float | None = None
    max_cell_voltage_v: float | None = None
    min_temperature_c: float | None = None
    max_temperature_c: float | None = None
    low_voltage_alarms: float | None = None
    high_voltage_alarms: float | None = None
    since_full_charge_s: float | None = Field(None, description="Time since the battery was last fully charged.")


class TimeLeft(_Model):
    """How long the battery's present direction lasts, at the current it has averaged lately."""

    toward: Literal["empty", "full"] = Field(
        description="Empty is the cut-off state of charge, while discharging; full is 100%, while charging.")
    seconds: float = Field(description="Time until then. Past a month, a month.")
    settled: bool = Field(
        description="Whether the average behind it has run long enough to be trusted. A fresh estimate is "
                    "rough and moves often.")


class Battery(Part):
    soc_percent: float | None = Field(None, description="State of charge.")
    voltage_v: float | None = None
    current_a: float | None = Field(None, description="Positive while charging, negative while discharging.")
    power_w: float | None = Field(None, description="Positive while charging, negative while discharging.")
    temperature_c: float | None = None
    cut_off_soc_percent: float | None = Field(
        None, description="The state of charge at which the system cuts its AC loads to protect the battery: "
                          "ESS's minimum where the device has one, otherwise tsoa-gui's own setting.")
    time_left: TimeLeft | None = Field(
        None, description="Time to empty or to full. None while idle, or where the battery's capacity is not "
                          "known.")
    activity: Literal["idle", "charging", "discharging"] | None = None
    max_charge_voltage_v: float | None = Field(None, description="Charge voltage limit.")
    max_charge_current_a: float | None = Field(None, description="Charge current limit.")
    max_discharge_current_a: float | None = Field(None, description="Discharge current limit.")
    min_cell_voltage_v: float | None = Field(
        None, description="Lowest cell voltage, for batteries that report their cells.")
    max_cell_voltage_v: float | None = Field(
        None, description="Highest cell voltage, for batteries that report their cells.")

    # The detail, for the battery's own page. A battery reports some of it,
    # all of it or none, depending on what manages it.
    alarms: list[Alarm] = Field(default_factory=list, description="Alarms and warnings active now.")
    checks: list[AlarmCheck] = Field(
        default_factory=list, description="Every condition the battery watches for, alarming or not.")
    capacity_ah: float | None = Field(None, description="Charge left, in amp-hours.")
    installed_capacity_ah: float | None = Field(None, description="Capacity when full.")
    consumed_ah: float | None = Field(None, description="Charge drawn since the battery was last full.")
    health_percent: float | None = Field(None, description="State of health: capacity now against when new.")
    cells: list[Cell] = Field(default_factory=list, description="Each cell, for batteries that report them.")
    balancing: bool | None = Field(None, description="Whether the battery is balancing its cells now.")
    temperatures: list[TemperatureSensor] = Field(
        default_factory=list, description="The battery's own temperature sensors, each by name.")
    switch_temperature_c: float | None = Field(
        None, description="Temperature of the battery's power switches, which open to stop charge or discharge.")
    charge_allowed: bool | None = Field(None, description="Whether the battery lets itself be charged now.")
    discharge_allowed: bool | None = Field(None, description="Whether the battery lets itself be discharged now.")
    charge_limited_by: str | None = Field(
        None, description="What is setting the charge current limit now, in the battery's own words.")
    discharge_limited_by: str | None = Field(
        None, description="What is setting the discharge current limit now, in the battery's own words.")
    applied_charge_voltage_v: float | None = Field(
        None, description="The charge voltage the system applies, which a system limit can hold below the "
                          "battery's own charge voltage limit.")
    max_cell_charge_voltage_v: float | None = Field(None, description="The highest voltage a cell is charged to.")
    low_voltage_v: float | None = Field(None, description="The voltage the battery counts as empty.")
    modules_online: int | None = None
    modules_offline: int | None = None
    modules_blocking_charge: int | None = None
    modules_blocking_discharge: int | None = None
    manufacturer: str | None = Field(None, description="Who made the battery or its management system.")
    firmware_version: str | None = None
    history: BatteryHistory | None = None


ChargerState = TypeAliasType("ChargerState", Literal[
    "off", "fault", "bulk", "absorption", "float", "storage", "equalize", "starting", "external_control", "other",
])


class SolarCharger(Part):
    name: str = Field(description="The charger's name as the device reports it.")
    power_w: float | None = None
    state: ChargerState | None = None
    yield_today_kwh: float | None = None

    # The detail, for the solar page.
    pv_voltage_v: float | None = Field(None, description="Voltage from the panels.")
    pv_current_a: float | None = Field(None, description="Current from the panels.")
    battery_voltage_v: float | None = Field(None, description="Voltage at the charger's battery terminals.")
    battery_current_a: float | None = Field(None, description="Current the charger gives the battery.")
    max_power_today_w: float | None = Field(None, description="The most power it has given today.")
    yield_total_kwh: float | None = Field(None, description="Energy it has harvested since its counter was reset.")
    error: int | None = Field(None, description="The charger's own error code, 0 when there is none.")


class Solar(Part):
    power_w: float | None = Field(None, description="Total solar power, from every charger.")
    yield_today_kwh: float | None = Field(None, description="Total energy harvested today.")
    chargers: list[SolarCharger] = Field(default_factory=list)


class AcLoads(Part):
    power_w: float | None = Field(None, description="Total power used by AC loads.")
    on_output_w: float | None = Field(
        None, description="Loads on the inverter/charger's AC output, which the battery keeps powered.")
    on_input_w: float | None = Field(
        None, description="Loads on the supply side of the inverter/charger, which lose power with the supply.")
    voltage_v: float | None = Field(
        None, description="Voltage on the inverter/charger's AC output, the first phase on a multi-phase system: "
                          "what the loads on it see, from the supply when it passes through, from the inverter "
                          "when it inverts.")
    current_a: float | None = Field(None, description="Current on the inverter/charger's AC output, all phases together.")
    frequency_hz: float | None = Field(None, description="Frequency on the inverter/charger's AC output.")


class DcLoads(Part):
    power_w: float | None = Field(None, description="Total power used by DC loads.")
    measured_by: Literal["meter", "calculation"] | None = Field(
        None, description="Whether a DC meter measures the loads or the device works them out from other readings.")


class Flow(_Model):
    """Power moving from one part to another, drawn as animated flow between their panels."""

    source: FlowEnd
    target: FlowEnd
    power_w: float = Field(ge=0, description="Power moving from source to target. Never negative.")


class System(_Model):
    """The whole system as the browser receives it."""

    live: bool = Field(
        description="False when the server has stopped hearing from the device; every reading is then "
                    "the last one known.")
    grid: Grid | None = None
    generator: Generator | None = None
    inverter_charger: InverterCharger | None = None
    battery: Battery | None = None
    solar: Solar | None = None
    ac_loads: AcLoads | None = None
    dc_loads: DcLoads | None = None
    flows: list[Flow] = Field(default_factory=list)
