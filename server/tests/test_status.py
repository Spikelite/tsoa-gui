from tsoa_gui import status
from tsoa_gui.model import Alarm

WARNING = Alarm(name="High temperature", level="warning")
ALARM = Alarm(name="Overload", level="alarm")


def test_battery_levels_follow_state_of_charge():
    assert status.battery(80, "charging") == "good"
    assert status.battery(80, "discharging") == "normal"
    assert status.battery(status.BATTERY_ATTENTION_SOC_PERCENT - 1, "discharging") == "attention"
    assert status.battery(status.BATTERY_WARNING_SOC_PERCENT - 1, "charging") == "warning"
    assert status.battery(None, None) == "normal"


def test_alarms_outrank_everything_else():
    assert status.battery(90, "charging", [WARNING]) == "warning"
    assert status.battery(90, "charging", [WARNING, ALARM]) == "fault"
    assert status.inverter_charger("bulk", [ALARM]) == "fault"


def test_inverter_charger_is_good_while_charging():
    assert status.inverter_charger("absorption") == "good"
    assert status.inverter_charger("inverting") == "normal"
    assert status.inverter_charger("fault") == "fault"


def test_solar_is_good_while_producing_and_shows_a_troubled_charger():
    assert status.solar_charger("bulk", 120) == "good"
    assert status.solar_charger("off", 0) == "normal"
    assert status.solar(300, ["good", "good"]) == "good"
    assert status.solar(0, ["normal"]) == "normal"
    assert status.solar(300, ["good", "fault"]) == "fault"
