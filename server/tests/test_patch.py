from tsoa_gui.mock import CYCLE_S, snapshot
from tsoa_gui.patch import apply, diff


def test_applying_each_change_through_a_day_gives_the_same_model():
    sent = snapshot(0).model_dump(mode="json")
    for second in range(1, CYCLE_S):
        current = snapshot(second).model_dump(mode="json")
        sent = apply(sent, diff(sent, current))
        assert sent == current


def test_only_what_changed_is_sent():
    old = {"live": True, "battery": {"status": "normal", "soc_percent": 50.0, "voltage_v": 25.6}}
    new = {"live": True, "battery": {"status": "normal", "soc_percent": 51.0, "voltage_v": 25.6}}
    assert diff(old, new) == {"battery": {"soc_percent": 51.0}}
    assert diff(new, new) == {}


def test_a_reading_that_becomes_unknown_is_sent_as_null():
    old = {"battery": {"soc_percent": 50.0}}
    new = {"battery": {"soc_percent": None}}
    patch = diff(old, new)
    assert patch == {"battery": {"soc_percent": None}}
    assert apply(old, patch) == new


def test_parts_appearing_and_disappearing_are_sent_whole():
    without = {"grid": None}
    with_grid = {"grid": {"status": "normal", "connected": True}}
    assert diff(without, with_grid) == with_grid
    assert diff(with_grid, without) == without


def test_lists_are_sent_whole():
    old = {"flows": [{"source": "solar", "target": "battery", "power_w": 100.0}]}
    new = {"flows": [{"source": "solar", "target": "battery", "power_w": 120.0}]}
    assert diff(old, new) == new
