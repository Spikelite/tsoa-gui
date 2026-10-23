import asyncio
import json

from tsoa_gui import venus
from tsoa_gui.feed import Feed
from tsoa_gui.venus import Readings, build, parse

PORTAL = "0123456789ab"  # invented, as every reading here is

# An invented installation: shore power on AC input 1 and a generator on
# AC input 2, an inverter/charger at instance 276, a battery monitor at 512,
# two solar chargers, and a DC system.
DEVICE = {
    ("settings", 0, "Settings/SystemSetup/AcInput1"): 3,
    ("settings", 0, "Settings/SystemSetup/AcInput2"): 2,
    ("system", 0, "VebusInstance"): 276,
    ("system", 0, "ActiveBatteryService"): "com.victronenergy.battery.ttyUSB1/512",
    ("system", 0, "Ac/ActiveIn/Source"): 3,
    ("system", 0, "Ac/Grid/L1/Power"): 1250.0,
    ("system", 0, "Ac/Consumption/L1/Power"): 900.0,
    ("system", 0, "Ac/ConsumptionOnOutput/L1/Power"): 700.0,
    ("system", 0, "Ac/ConsumptionOnInput/L1/Power"): 200.0,
    ("system", 0, "Dc/Battery/Soc"): 64.5,
    ("system", 0, "Dc/Battery/Voltage"): 26.4,
    ("system", 0, "Dc/Battery/Current"): 18.2,
    ("system", 0, "Dc/Battery/Power"): 480.0,
    ("system", 0, "Dc/Battery/State"): 1,
    ("system", 0, "Dc/Pv/Power"): 310.0,
    ("system", 0, "Dc/System/Power"): 45.0,
    ("vebus", 276, "Connected"): 1,
    ("vebus", 276, "Ac/NumberOfAcInputs"): 2,
    ("vebus", 276, "Ac/ActiveIn/ActiveInput"): 0,
    ("vebus", 276, "Mode"): 3,
    ("vebus", 276, "State"): 3,
    ("vebus", 276, "Ac/ActiveIn/L1/V"): 231.5,
    ("vebus", 276, "Ac/ActiveIn/L1/I"): 4.6,
    ("vebus", 276, "Ac/ActiveIn/L1/F"): 50.01,
    ("vebus", 276, "Ac/ActiveIn/L1/P"): 1050.0,
    ("vebus", 276, "Ac/ActiveIn/CurrentLimit"): 16.0,
    ("vebus", 276, "Ac/Out/L1/P"): 700.0,
    ("vebus", 276, "Ac/Out/L1/V"): 230.2,
    ("vebus", 276, "Ac/Out/L1/I"): 3.1,
    ("vebus", 276, "Ac/Out/L1/F"): 50.01,
    ("vebus", 276, "Dc/0/Voltage"): 26.4,
    ("vebus", 276, "Dc/0/Current"): 12.0,
    ("vebus", 276, "Alarms/HighTemperature"): 1,
    ("vebus", 276, "Alarms/L1/Overload"): 0,
    ("battery", 512, "Connected"): 1,
    ("battery", 512, "Info/MaxChargeVoltage"): 28.4,
    ("battery", 512, "Info/MaxChargeCurrent"): 100.0,
    ("battery", 512, "Info/MaxDischargeCurrent"): 150.0,
    ("battery", 512, "System/MinCellVoltage"): 3.29,
    ("battery", 512, "System/MaxCellVoltage"): 3.31,
    ("solarcharger", 278, "Connected"): 1,
    ("solarcharger", 278, "CustomName"): "East array",
    ("solarcharger", 278, "State"): 3,
    ("solarcharger", 278, "Yield/Power"): 310.0,
    ("solarcharger", 278, "History/Daily/0/Yield"): 1.42,
    ("solarcharger", 279, "Connected"): 0,
    ("solarcharger", 279, "ProductName"): "Solar charger",
}


def readings(values=DEVICE) -> Readings:
    r = Readings()
    for key, value in values.items():
        r.update(key, value)
    return r


def test_parse_reads_a_value_and_its_removal():
    topic = f"N/{PORTAL}/system/0/Dc/Battery/Soc"
    assert parse(topic, b'{"value": 64.5}') == (("system", 0, "Dc/Battery/Soc"), 64.5)
    assert parse(topic, b"") == (("system", 0, "Dc/Battery/Soc"), None)


def test_parse_ignores_what_is_not_a_reading():
    assert parse(f"R/{PORTAL}/keepalive", b"") is None
    assert parse(f"N/{PORTAL}/system/x/Serial", b'{"value": 1}') is None
    assert parse(f"N/{PORTAL}/system/0/Serial", b"not json") is None


def test_build_reads_the_whole_installation():
    system = build(readings(), live=True)
    assert system.live

    assert system.grid.kind == "shore" and system.grid.connected
    assert system.grid.power_w == 1250.0 and system.grid.voltage_v == 231.5 and system.grid.frequency_hz == 50.01
    assert system.grid.input_current_limit_a == 16.0

    assert system.generator.running is False

    # Shore power is wired to AC input 1 and the generator to AC input 2, and
    # the inverter/charger, which has both, is taking power from input 1.
    assert (system.grid.ac_input, system.generator.ac_input) == (1, 2)

    inverter = system.inverter_charger
    assert (inverter.mode, inverter.state, inverter.status) == ("on", "bulk", "warning")
    assert [a.name for a in inverter.alarms] == ["High temperature"]
    assert inverter.ac_in_power_w == 1050.0 and inverter.ac_out_power_w == 700.0
    assert inverter.dc_power_w == 26.4 * 12.0
    assert (inverter.ac_inputs, inverter.active_input) == (2, 1)

    battery = system.battery
    assert (battery.soc_percent, battery.activity, battery.status) == (64.5, "charging", "good")
    assert battery.voltage_v == 26.4
    assert battery.cut_off_soc_percent is None  # no ESS
    assert battery.max_charge_current_a == 100.0 and battery.min_cell_voltage_v == 3.29

    solar = system.solar
    assert solar.power_w == 310.0 and solar.yield_today_kwh == 1.42
    assert [(c.name, c.status) for c in solar.chargers] == [("East array", "good"), ("Solar charger", "offline")]

    assert (system.ac_loads.on_output_w, system.ac_loads.on_input_w) == (700.0, 200.0)
    loads = system.ac_loads
    assert (loads.voltage_v, loads.current_a, loads.frequency_hz) == (230.2, 3.1, 50.01)
    assert (system.dc_loads.power_w, system.dc_loads.measured_by) == (45.0, "calculation")
    assert {(f.source, f.target) for f in system.flows} == {
        ("grid", "inverter_charger"), ("grid", "ac_loads"), ("inverter_charger", "ac_loads"),
        ("inverter_charger", "dc_bus"), ("solar", "dc_bus"), ("dc_bus", "dc_loads"), ("dc_bus", "battery"),
    }


def test_parts_the_installation_lacks_are_left_out():
    system = build(readings({("system", 0, "Dc/Battery/Soc"): 50.0}), live=True)
    assert system.battery is not None
    assert (system.grid, system.generator, system.inverter_charger, system.solar, system.dc_loads) == (None,) * 5


def test_a_silent_inverter_charger_is_offline():
    values = {k: v for k, v in DEVICE.items() if k[0] != "vebus"}
    assert build(readings(values), live=True).inverter_charger.status == "offline"


def test_a_running_generator_is_the_active_input():
    values = dict(DEVICE)
    values[("system", 0, "Ac/ActiveIn/Source")] = 2
    system = build(readings(values), live=True)
    assert system.generator.running and not system.grid.connected
    assert ("generator", "inverter_charger") in {(f.source, f.target) for f in system.flows}


def test_an_inverter_charger_on_neither_input_says_so():
    values = dict(DEVICE)
    values[("vebus", 276, "Ac/ActiveIn/ActiveInput")] = 240
    assert build(readings(values), live=True).inverter_charger.active_input is None


def test_inputs_are_unknown_where_the_system_does_not_say():
    values = {k: v for k, v in DEVICE.items() if not k[2].startswith(("Settings/SystemSetup", "Ac/NumberOf"))}
    system = build(readings(values), live=True)
    assert system.grid.ac_input is None and system.inverter_charger.ac_inputs is None


def test_the_cut_off_is_ess_minimum_or_batterylife_limit():
    def cut_off(state, limit=35.0, minimum=20.0):
        values = {**DEVICE, ("settings", 0, "Settings/CGwacs/BatteryLife/State"): state,
                  ("settings", 0, "Settings/CGwacs/BatteryLife/SocLimit"): limit,
                  ("settings", 0, "Settings/CGwacs/BatteryLife/MinimumSocLimit"): minimum}
        return build(readings(values), live=True).battery.cut_off_soc_percent

    assert cut_off(0) is None  # ESS not in use
    assert cut_off(2) == 35.0  # BatteryLife's own limit, above the minimum
    assert cut_off(2, limit=None) == 20.0
    assert cut_off(9) == 20.0  # keeping the battery charged
    assert cut_off(10) == 20.0  # without BatteryLife


def test_a_battery_that_reports_its_cells_gives_its_detail():
    values = dict(DEVICE)
    for n, voltage in enumerate([3.301, 3.305, 3.298, 3.310], start=1):
        values[("battery", 512, f"Voltages/Cell{n}")] = voltage
        values[("battery", 512, f"Balances/Cell{n}")] = 1 if n == 4 else 0
    values.update({
        ("battery", 512, "System/Temperature1"): 21.0,
        ("battery", 512, "System/Temperature1Name"): "Front",
        ("battery", 512, "System/Temperature2"): 21.4,
        ("battery", 512, "System/MOSTemperature"): 24.5,
        ("battery", 512, "Io/AllowToCharge"): 0,
        ("battery", 512, "Io/AllowToDischarge"): 1,
        ("battery", 512, "Info/ChargeLimitation"): "SoC",
        ("battery", 512, "Info/DischargeLimitation"): "  ",
        ("battery", 512, "ConsumedAmphours"): -12.5,
        ("battery", 512, "InstalledCapacity"): 200.0,
        ("battery", 512, "Soh"): 98,
        ("battery", 512, "Alarms/LowSoc"): 0,
        ("battery", 512, "Alarms/HighCellVoltage"): 1,
        ("battery", 512, "History/ChargeCycles"): 12,
        ("battery", 512, "History/DeepestDischarge"): -150.0,
        ("system", 0, "Control/EffectiveChargeVoltage"): 27.6,
    })
    battery = build(readings(values), live=True).battery

    # The pack's voltage comes from the system, apart from its cells'.
    assert battery.voltage_v == 26.4
    assert [(c.voltage_v, c.balancing) for c in battery.cells] == [
        (3.301, False), (3.305, False), (3.298, False), (3.310, True)]
    assert [(t.name, t.temperature_c) for t in battery.temperatures] == [("Front", 21.0), ("Sensor 2", 21.4)]
    assert battery.switch_temperature_c == 24.5
    assert (battery.charge_allowed, battery.discharge_allowed) == (False, True)
    # A blank reason is no reason.
    assert (battery.charge_limited_by, battery.discharge_limited_by) == ("SoC", None)
    # Amp-hours drawn read as positive amounts.
    assert battery.consumed_ah == 12.5
    assert battery.history.deepest_discharge_ah == 150.0
    assert battery.history.charge_cycles == 12
    assert (battery.installed_capacity_ah, battery.health_percent) == (200.0, 98)
    assert battery.applied_charge_voltage_v == 27.6
    assert [(c.name, c.level) for c in battery.checks] == [
        ("High cell voltage", "warning"), ("Low state of charge", "ok")]
    assert [(a.name, a.level) for a in battery.alarms] == [("High cell voltage", "warning")]


def test_an_inverter_charger_gives_its_detail():
    values = dict(DEVICE)
    values.update({
        ("vebus", 276, "ProductName"): "Example 24/3000",
        ("vebus", 276, "FirmwareVersion"): 0x502,
        ("vebus", 276, "Ac/Out/NominalInverterPower"): 2400,
        ("vebus", 276, "Ac/Out/L1/S"): 760,
        ("vebus", 276, "Ac/ActiveIn/L1/V"): 231.0,
        ("vebus", 276, "Ac/ActiveIn/Connected"): 1,
        ("vebus", 276, "Devices/0/UpTime"): 3600,
        ("vebus", 276, "Devices/0/Diagnostics/UBatRipple"): 0.05,
        ("vebus", 276, "BatteryOperationalLimits/MaxChargeVoltage"): 28.2,
        ("vebus", 276, "Devices/0/ExtendStatus/ChargeDisabledDueToLowTemp"): 0,
        ("vebus", 276, "Settings/PowerAssistEnabled"): True,
        ("vebus", 276, "Energy/AcIn1ToAcOut"): 6.5,
        ("vebus", 276, "Energy/InverterToAcOut"): 0.25,
        ("vebus", 276, "Leds/Mains"): 1,
        ("vebus", 276, "Leds/Bulk"): 2,
        ("vebus", 276, "Leds/Float"): 0,
    })
    inverter = build(readings(values), live=True).inverter_charger

    assert (inverter.product_name, inverter.firmware_version, inverter.rated_power_w) == (
        "Example 24/3000", "502", 2400)
    assert [(p.phase, p.voltage_v, p.power_w, p.apparent_power_va) for p in inverter.output_phases] == [
        ("L1", 230.2, 700.0, 760)]
    assert [(p.phase, p.voltage_v) for p in inverter.input_phases] == [("L1", 231.0)]
    assert (inverter.input_connected, inverter.uptime_s, inverter.battery_ripple_v) == (True, 3600, 0.05)
    assert inverter.battery_charge_voltage_v == 28.2
    assert (inverter.too_cold_to_charge, inverter.power_assist, inverter.weak_input) == (False, True, None)
    assert [(e.source, e.target, e.kwh) for e in inverter.energy] == [
        ("input_1", "output", 6.5), ("battery", "output", 0.25)]
    assert [(led.name, led.state) for led in inverter.leds] == [("Mains", "on"), ("Bulk", "blinking"), ("Float", "off")]
    # Per-phase alarms count once, and every condition shows, alarming or not.
    assert [(c.name, c.level) for c in inverter.checks] == [("High temperature", "warning"), ("Overload", "ok")]


def test_a_solar_charger_gives_its_detail():
    values = dict(DEVICE)
    values.update({
        ("solarcharger", 278, "Pv/V"): 71.2,
        ("solarcharger", 278, "Pv/I"): 4.4,
        ("solarcharger", 278, "Dc/0/Voltage"): 26.5,
        ("solarcharger", 278, "Dc/0/Current"): 11.3,
        ("solarcharger", 278, "History/Daily/0/MaxPower"): 455,
        ("solarcharger", 278, "Yield/User"): 812.4,
        ("solarcharger", 278, "ErrorCode"): 0,
    })
    east = build(readings(values), live=True).solar.chargers[0]
    assert (east.pv_voltage_v, east.pv_current_a, east.battery_voltage_v, east.battery_current_a) == (71.2, 4.4, 26.5, 11.3)
    assert (east.max_power_today_w, east.yield_total_kwh, east.error) == (455, 812.4, 0)


def test_a_battery_that_reports_no_detail_has_none():
    battery = build(readings(DEVICE), live=True).battery
    assert (battery.cells, battery.temperatures, battery.checks, battery.history) == ([], [], [], None)


def test_readings_go_stale_without_messages():
    now = [100.0]
    r = Readings(clock=lambda: now[0])
    r.update(("system", 0, "Dc/Battery/Soc"), 50.0)
    assert r.heard_within(venus.STALE_AFTER_S)
    now[0] += venus.STALE_AFTER_S + 1
    assert not r.heard_within(venus.STALE_AFTER_S)


class FakeMessage:
    def __init__(self, topic: str, value=None):
        self.topic = topic
        self.payload = b"" if value is None else json.dumps({"value": value}).encode()


class FakeClient:
    """Plays a device's broker: names the portal, then sends readings."""

    def __init__(self, messages):
        self.subscribed, self.published = [], []
        self._queue: asyncio.Queue = asyncio.Queue()
        for message in messages:
            self._queue.put_nowait(message)

    async def subscribe(self, topic):
        self.subscribed.append(topic)

    async def unsubscribe(self, topic):
        pass

    async def publish(self, topic, payload=None):
        self.published.append((topic, payload))

    @property
    def messages(self):
        return self._iterate()

    async def _iterate(self):
        while True:
            message = await self._queue.get()
            if message is None:
                return
            yield message


def test_following_the_broker_finds_the_portal_keeps_alive_and_publishes():
    async def scenario():
        messages = [FakeMessage(f"N/{PORTAL}/system/0/Serial", PORTAL)]
        messages += [FakeMessage(f"N/{PORTAL}/{s}/{i}/{p}", v) for (s, i, p), v in DEVICE.items()]
        client = FakeClient(messages)
        feed = Feed()
        follow = asyncio.create_task(venus._follow(client, feed, Readings()))
        with feed.listen() as queue:
            model = await asyncio.wait_for(queue.get(), 5)
        client._queue.put_nowait(None)
        await asyncio.wait_for(follow, 5)
        return client, model

    original = venus.PUBLISH_EVERY_S
    venus.PUBLISH_EVERY_S = 0.05
    try:
        client, model = asyncio.run(scenario())
    finally:
        venus.PUBLISH_EVERY_S = original
    assert client.subscribed == ["N/+/system/0/Serial", f"N/{PORTAL}/#"]
    assert client.published[0] == (f"R/{PORTAL}/keepalive", None)
    assert all(topic == f"R/{PORTAL}/keepalive" for topic, _ in client.published)
    assert model.live and model.battery.soc_percent == 64.5


def test_a_broker_outage_is_logged_once(monkeypatch, caplog):
    class Refusing:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            raise venus.aiomqtt.MqttError("connection refused")

        async def __aexit__(self, *exc):
            return False

    monkeypatch.setattr(venus.aiomqtt, "Client", Refusing)
    monkeypatch.setattr(venus, "RECONNECT_AFTER_S", 0)

    async def scenario():
        task = asyncio.create_task(venus.run(Feed()))
        await asyncio.sleep(0.05)
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    with caplog.at_level("WARNING"):
        asyncio.run(scenario())
    assert len([r for r in caplog.records if "lost the device's MQTT broker" in r.message]) == 1
