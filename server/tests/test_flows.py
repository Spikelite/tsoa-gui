from tsoa_gui.flows import derive_flows
from tsoa_gui.model import AcLoads, Battery, DcLoads, Generator, Grid, InverterCharger, Solar, System


def paths(system: System) -> set[tuple[str, str, float]]:
    return {(f.source, f.target, f.power_w) for f in derive_flows(system)}


def test_charging_from_the_grid_with_solar():
    system = System(
        live=True,
        grid=Grid(status="normal", kind="grid", connected=True, power_w=900),
        inverter_charger=InverterCharger(status="good", ac_in_power_w=800, dc_power_w=500),
        battery=Battery(status="good"),
        solar=Solar(status="good", power_w=300),
        ac_loads=AcLoads(status="normal", on_output_w=250, on_input_w=100),
        dc_loads=DcLoads(status="normal", power_w=40),
    )
    assert paths(system) == {
        ("grid", "inverter_charger", 800),
        ("grid", "ac_loads", 100),
        ("inverter_charger", "ac_loads", 250),
        ("inverter_charger", "battery", 500),
        ("solar", "battery", 300),
        ("battery", "dc_loads", 40),
    }


def test_negative_power_reverses_the_path():
    system = System(
        live=True,
        grid=Grid(status="normal", kind="grid", connected=True),
        inverter_charger=InverterCharger(status="normal", ac_in_power_w=-600, dc_power_w=-700),
        battery=Battery(status="normal"),
    )
    assert paths(system) == {("inverter_charger", "grid", 600), ("battery", "inverter_charger", 700)}


def test_a_running_generator_takes_the_ac_input_from_the_grid():
    system = System(
        live=True,
        grid=Grid(status="normal", kind="shore", connected=True),
        generator=Generator(status="normal", running=True),
        inverter_charger=InverterCharger(status="good", ac_in_power_w=1500),
    )
    assert paths(system) == {("generator", "inverter_charger", 1500)}


def test_unknown_or_zero_power_draws_no_path():
    system = System(
        live=True,
        battery=Battery(status="offline"),
        solar=Solar(status="normal", power_w=0),
        dc_loads=DcLoads(status="offline", power_w=None),
    )
    assert paths(system) == set()


def test_a_disconnected_supply_feeds_nothing():
    system = System(
        live=True,
        grid=Grid(status="normal", kind="shore", connected=False),
        inverter_charger=InverterCharger(status="normal", ac_in_power_w=50),
        ac_loads=AcLoads(status="normal", on_input_w=200),
    )
    assert paths(system) == set()
