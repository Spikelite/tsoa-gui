from collections import Counter

from tsoa_gui.mock import CYCLE_S, snapshot


def test_the_same_moment_gives_the_same_readings():
    assert snapshot(123.0) == snapshot(123.0)
    assert snapshot(123.0) == snapshot(123.0 + CYCLE_S)


def test_a_day_shows_every_status_level():
    levels = Counter()
    for second in range(CYCLE_S):
        system = snapshot(second)
        for part in (system.battery, system.inverter_charger, system.solar, *system.solar.chargers):
            levels[part.status] += 1
    assert set(levels) == {"good", "normal", "attention", "warning", "fault", "offline"}


def test_a_day_covers_the_ways_power_is_supplied():
    inputs = set()
    for second in range(0, CYCLE_S, 5):
        system = snapshot(second)
        inputs.add((system.grid.connected, system.generator.running))
    assert {(False, False), (False, True), (True, False)} <= inputs


def test_power_takes_the_paths_the_day_describes():
    def paths(fraction_of_day):
        return {(f.source, f.target) for f in snapshot(fraction_of_day * CYCLE_S).flows}

    # Every part on the DC side meets at the DC bus.
    # Midnight: the battery runs the DC loads, and the AC loads through the inverter.
    assert paths(0.0) == {("battery", "dc_bus"), ("dc_bus", "inverter_charger"), ("inverter_charger", "ac_loads"),
                          ("dc_bus", "dc_loads")}
    # Dawn: the generator runs the loads and charges the battery, and the
    # charger rather than the battery runs the DC loads.
    assert paths(0.22) == {("generator", "inverter_charger"), ("inverter_charger", "ac_loads"),
                           ("inverter_charger", "dc_bus"), ("dc_bus", "battery"), ("dc_bus", "dc_loads")}
    # Midday: solar charges the battery and runs the DC loads, and the AC loads through the inverter.
    assert paths(0.45) == {("solar", "dc_bus"), ("dc_bus", "battery"), ("dc_bus", "inverter_charger"),
                           ("inverter_charger", "ac_loads"), ("dc_bus", "dc_loads")}
    # Evening: shore power runs the loads, charges the battery, and feeds the
    # water heater on its own side of the inverter.
    assert paths(0.80) == {("grid", "inverter_charger"), ("grid", "ac_loads"), ("inverter_charger", "ac_loads"),
                           ("inverter_charger", "dc_bus"), ("dc_bus", "battery"), ("dc_bus", "dc_loads")}


def test_the_output_follows_its_source():
    inverting = snapshot(0.0).ac_loads  # midnight, on the battery
    assert (inverting.voltage_v, inverting.frequency_hz) == (230.0, 50.0)
    for fraction_of_day in (0.22, 0.80):  # the generator, then shore power
        loads = snapshot(fraction_of_day * CYCLE_S).ac_loads
        assert 220 < loads.voltage_v < 240 and 49.5 < loads.frequency_hz < 50.5
        assert loads.current_a == round(loads.on_output_w / loads.voltage_v, 1)


def test_readings_stay_in_range():
    for second in range(0, CYCLE_S, 7):
        system = snapshot(second)
        assert 0 <= system.battery.soc_percent <= 100
        assert system.solar.power_w >= 0
        assert all(flow.power_w > 0 for flow in system.flows)
        battery = system.battery
        if battery.activity == "discharging":
            assert battery.power_w < 0


def test_an_offline_charger_reports_nothing():
    offline = [c for second in range(CYCLE_S) for c in snapshot(second).solar.chargers if c.status == "offline"]
    assert offline
    assert all(c.power_w is None and c.state is None for c in offline)
