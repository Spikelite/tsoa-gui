"""Where power is moving between the parts, worked out from their readings.

Every skin draws the same paths, so they are decided here once:

    grid or generator  <->  inverter/charger  ->  AC loads on its output
    grid  ->  AC loads on the supply side
    inverter/charger  <->  DC bus  <->  battery
    solar  ->  DC bus  ->  DC loads

The inverter/charger, the battery, solar and the DC loads all connect to one
DC bus, and what solar and the charger put in, less what the DC loads take,
is what goes into the battery, or the other way round. So each of them is
joined to the bus, each by its own reading: DC loads fed while the battery
charges are fed by what comes in, not by the battery. A system whose DC side
is only the battery and the inverter/charger joins those two directly. Only
the active AC input connects to the inverter/charger.
"""
from .model import Flow, FlowEnd, PartName, System


def derive_flows(system: System) -> list[Flow]:
    flows: list[Flow] = []

    def add(source: FlowEnd, target: FlowEnd, power_w: float | None) -> None:
        # A path with no power, or power not known, is not drawn at all.
        if power_w is None or power_w == 0:
            return
        if power_w > 0:
            flows.append(Flow(source=source, target=target, power_w=power_w))
        else:
            flows.append(Flow(source=target, target=source, power_w=-power_w))

    inverter = system.inverter_charger
    if inverter is not None:
        active_input = _active_ac_input(system)
        if active_input is not None:
            add(active_input, "inverter_charger", inverter.ac_in_power_w)
        if system.ac_loads is not None:
            add("inverter_charger", "ac_loads", system.ac_loads.on_output_w)
        if system.battery is not None:
            add("inverter_charger", dc_side(system), inverter.dc_power_w)

    if system.grid is not None and system.grid.connected and system.ac_loads is not None:
        add("grid", "ac_loads", system.ac_loads.on_input_w)
    if uses_dc_bus(system):
        if system.solar is not None:
            add("solar", "dc_bus", system.solar.power_w)
        if system.dc_loads is not None:
            add("dc_bus", "dc_loads", system.dc_loads.power_w)
        add("dc_bus", "battery", system.battery.power_w if system.battery else None)

    return flows


def uses_dc_bus(system: System) -> bool:
    """Whether the DC side has more on it than the battery and the inverter/charger."""
    return system.battery is not None and (system.solar is not None or system.dc_loads is not None)


def dc_side(system: System) -> FlowEnd:
    return "dc_bus" if uses_dc_bus(system) else "battery"


def _active_ac_input(system: System) -> PartName | None:
    # A running generator takes over the AC input from the grid.
    if system.generator is not None and system.generator.running:
        return "generator"
    if system.grid is not None and system.grid.connected:
        return "grid"
    return None
