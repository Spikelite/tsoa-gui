from tsoa_gui.feed import Feed
from tsoa_gui.model import Battery, System
from tsoa_gui.time_left import LONGEST_S, SETTLED_AFTER_S, TimeLeftEstimator


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def system(current_a, soc=60.0, live=True, **battery):
    activity = "discharging" if current_a < 0 else "charging" if current_a > 0 else "idle"
    fields = {"soc_percent": soc, "current_a": current_a, "activity": activity, "installed_capacity_ah": 200.0,
              **battery}
    return System(live=live, battery=Battery(status="normal", **fields))


def run(estimator, clock, currents, **battery):
    """Feeds one reading a second, and returns the time left after each."""
    results = []
    for current in currents:
        results.append(estimator.apply(system(current, **battery)).battery.time_left)
        clock.now += 1
    return results


def test_an_estimate_appears_at_once_and_runs_to_the_cut_off():
    clock = Clock()
    first = run(TimeLeftEstimator(20.0, clock), clock, [-10.0])[0]
    # 40% of 200 Ah between 60% and the cut-off, at 10 A.
    assert (first.toward, first.seconds, first.settled) == ("empty", 8 * 3600, False)


def test_charging_estimates_time_to_full():
    clock = Clock()
    first = run(TimeLeftEstimator(20.0, clock), clock, [20.0])[0]
    assert (first.toward, first.seconds) == ("full", 4 * 3600)


def test_a_steady_load_settles_and_a_kettle_barely_moves_it():
    clock = Clock()
    estimator = TimeLeftEstimator(20.0, clock)
    # While fresh, a kettle moves the estimate a long way.
    fresh = run(estimator, clock, [-10.0] * 5 + [-80.0] * 5)
    assert fresh[-1].seconds < fresh[4].seconds * 0.5
    assert not fresh[-1].settled

    clock = Clock()
    estimator = TimeLeftEstimator(20.0, clock)
    steady = run(estimator, clock, [-10.0] * (SETTLED_AFTER_S + 1))
    assert steady[-1].settled and not steady[-2].settled
    kettle = run(estimator, clock, [-80.0] * 5)
    assert kettle[-1].seconds > steady[-1].seconds * 0.85


def test_a_change_of_direction_starts_the_average_again():
    clock = Clock()
    estimator = TimeLeftEstimator(20.0, clock)
    run(estimator, clock, [-10.0] * SETTLED_AFTER_S)
    charging = run(estimator, clock, [20.0])[0]
    assert (charging.toward, charging.seconds, charging.settled) == ("full", 4 * 3600, False)


def test_the_window_lets_go_of_old_readings():
    clock = Clock()
    estimator = TimeLeftEstimator(20.0, clock)
    run(estimator, clock, [-80.0] * 60 + [-10.0] * 3600)
    last = run(estimator, clock, [-10.0])[0]
    assert last.seconds == 8 * 3600


def test_the_devices_cut_off_wins_over_the_setting():
    clock = Clock()
    result = TimeLeftEstimator(20.0, clock).apply(system(-10.0, cut_off_soc_percent=40.0)).battery
    assert result.cut_off_soc_percent == 40.0
    assert result.time_left.seconds == 4 * 3600


def test_the_setting_is_the_cut_off_otherwise():
    clock = Clock()
    assert TimeLeftEstimator(25.0, clock).apply(system(-10.0)).battery.cut_off_soc_percent == 25.0


def test_capacity_is_worked_out_where_it_is_not_reported():
    clock = Clock()
    from_left = TimeLeftEstimator(20.0, clock).apply(
        system(-10.0, installed_capacity_ah=None, capacity_ah=120.0)).battery.time_left
    from_used = TimeLeftEstimator(20.0, clock).apply(
        system(-10.0, installed_capacity_ah=None, consumed_ah=80.0)).battery.time_left
    assert from_left.seconds == from_used.seconds == 8 * 3600
    unknown = TimeLeftEstimator(20.0, clock).apply(system(-10.0, installed_capacity_ah=None)).battery
    assert unknown.time_left is None


def test_an_idle_battery_has_no_estimate():
    clock = Clock()
    estimator = TimeLeftEstimator(20.0, clock)
    run(estimator, clock, [-10.0] * 10)
    assert run(estimator, clock, [0.0])[0] is None


def test_a_trickle_is_capped_and_the_cut_off_reached_is_none_left():
    clock = Clock()
    assert run(TimeLeftEstimator(20.0, clock), clock, [-0.0001])[0].seconds == LONGEST_S
    assert run(TimeLeftEstimator(20.0, clock), clock, [-10.0], soc=15.0)[0].seconds == 0


def test_stale_readings_keep_the_last_estimate():
    clock = Clock()
    estimator = TimeLeftEstimator(20.0, clock)
    before = run(estimator, clock, [-10.0])[0]
    stale = estimator.apply(system(-80.0, live=False)).battery.time_left
    assert stale == before


def test_the_feed_adds_the_estimate_to_what_it_publishes():
    clock = Clock()
    feed = Feed(prepare=TimeLeftEstimator(20.0, clock).apply)
    feed.publish(system(-10.0))
    assert feed.latest.battery.time_left.toward == "empty"
