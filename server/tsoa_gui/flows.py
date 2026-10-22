"""Where power is moving between the parts, worked out from their readings.

Every skin draws the same paths, so they are decided here once:

    grid or generator  <->  inverter/charger  ->  AC loads on its output
    grid  ->  AC loads on the supply side
    inverter/charger  <->  battery  <-  solar
    battery  ->  DC loads

The battery panel represents the DC side as a whole, so solar and the DC
loads connect to it. Only the active AC input connects to the inverter/charger.
"""
from .model import Flow, PartName, System


def derive_flows(system: System) -> list[Flow]:
    flows: list[Flow] = []

    def add(source: PartName, target: PartName, power_w: float | None) -> None:
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
            add("inverter_charger", "battery", inverter.dc_power_w)

    if system.grid is not None and system.grid.connected and system.ac_loads is not None:
        add("grid", "ac_loads", system.ac_loads.on_input_w)
    if system.solar is not None and system.battery is not None:
        add("solar", "battery", system.solar.power_w)
    if system.dc_loads is not None and system.battery is not None:
        add("battery", "dc_loads", system.dc_loads.power_w)

    return flows


def _active_ac_input(system: System) -> PartName | None:
    # A running generator takes over the AC input from the grid.
    if system.generator is not None and system.generator.running:
        return "generator"
    if system.grid is not None and system.grid.connected:
        return "grid"
    return None
