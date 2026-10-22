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


class Battery(Part):
    soc_percent: float | None = Field(None, description="State of charge.")
    voltage_v: float | None = None
    current_a: float | None = Field(None, description="Positive while charging, negative while discharging.")
    power_w: float | None = Field(None, description="Positive while charging, negative while discharging.")
    temperature_c: float | None = None
    time_to_go_s: float | None = Field(
        None, description="Time left at the present discharge rate. Unknown while charging or idle.")
    activity: Literal["idle", "charging", "discharging"] | None = None
    max_charge_voltage_v: float | None = Field(None, description="Charge voltage limit.")
    max_charge_current_a: float | None = Field(None, description="Charge current limit.")
    max_discharge_current_a: float | None = Field(None, description="Discharge current limit.")
    min_cell_voltage_v: float | None = Field(
        None, description="Lowest cell voltage, for batteries that report their cells.")
    max_cell_voltage_v: float | None = Field(
        None, description="Highest cell voltage, for batteries that report their cells.")


ChargerState = TypeAliasType("ChargerState", Literal[
    "off", "fault", "bulk", "absorption", "float", "storage", "equalize", "starting", "external_control", "other",
])


class SolarCharger(Part):
    name: str = Field(description="The charger's name as the device reports it.")
    power_w: float | None = None
    state: ChargerState | None = None
    yield_today_kwh: float | None = None


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

    source: PartName
    target: PartName
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
