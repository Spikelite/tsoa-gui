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

    # Midnight: the battery runs everything through the inverter.
    assert paths(0.0) == {("battery", "inverter_charger"), ("inverter_charger", "ac_loads"), ("battery", "dc_loads")}
    # Dawn: the generator runs the loads and charges the battery.
    assert paths(0.22) == {("generator", "inverter_charger"), ("inverter_charger", "ac_loads"),
                           ("inverter_charger", "battery"), ("battery", "dc_loads")}
    # Midday: solar charges the battery, which still runs the inverter.
    assert paths(0.45) == {("solar", "battery"), ("battery", "inverter_charger"), ("inverter_charger", "ac_loads"),
                           ("battery", "dc_loads")}
    # Evening: shore power runs the loads, charges the battery, and feeds the
    # water heater on its own side of the inverter.
    assert paths(0.80) == {("grid", "inverter_charger"), ("grid", "ac_loads"), ("inverter_charger", "ac_loads"),
                           ("inverter_charger", "battery"), ("battery", "dc_loads")}


def test_readings_stay_in_range():
    for second in range(0, CYCLE_S, 7):
        system = snapshot(second)
        assert 0 <= system.battery.soc_percent <= 100
        assert system.solar.power_w >= 0
        assert all(flow.power_w > 0 for flow in system.flows)
        battery = system.battery
        if battery.activity == "discharging":
            assert battery.power_w < 0 and battery.time_to_go_s > 0
        else:
            assert battery.time_to_go_s is None


def test_an_offline_charger_reports_nothing():
    offline = [c for second in range(CYCLE_S) for c in snapshot(second).solar.chargers if c.status == "offline"]
    assert offline
    assert all(c.power_w is None and c.state is None for c in offline)
