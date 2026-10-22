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
    ("system", 0, "Dc/Battery/TimeToGo"): 86400,
    ("system", 0, "Dc/Pv/Power"): 310.0,
    ("system", 0, "Dc/System/Power"): 45.0,
    ("vebus", 276, "Connected"): 1,
    ("vebus", 276, "Mode"): 3,
    ("vebus", 276, "State"): 3,
    ("vebus", 276, "Ac/ActiveIn/L1/V"): 231.5,
    ("vebus", 276, "Ac/ActiveIn/L1/I"): 4.6,
    ("vebus", 276, "Ac/ActiveIn/L1/F"): 50.01,
    ("vebus", 276, "Ac/ActiveIn/L1/P"): 1050.0,
    ("vebus", 276, "Ac/ActiveIn/CurrentLimit"): 16.0,
    ("vebus", 276, "Ac/Out/L1/P"): 700.0,
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

    inverter = system.inverter_charger
    assert (inverter.mode, inverter.state, inverter.status) == ("on", "bulk", "warning")
    assert [a.name for a in inverter.alarms] == ["High temperature"]
    assert inverter.ac_in_power_w == 1050.0 and inverter.ac_out_power_w == 700.0
    assert inverter.dc_power_w == 26.4 * 12.0

    battery = system.battery
    assert (battery.soc_percent, battery.activity, battery.status) == (64.5, "charging", "good")
    assert battery.time_to_go_s is None  # only while discharging
    assert battery.max_charge_current_a == 100.0 and battery.min_cell_voltage_v == 3.29

    solar = system.solar
    assert solar.power_w == 310.0 and solar.yield_today_kwh == 1.42
    assert [(c.name, c.status) for c in solar.chargers] == [("East array", "good"), ("Solar charger", "offline")]

    assert (system.ac_loads.on_output_w, system.ac_loads.on_input_w) == (700.0, 200.0)
    assert (system.dc_loads.power_w, system.dc_loads.measured_by) == (45.0, "calculation")
    assert {(f.source, f.target) for f in system.flows} == {
        ("grid", "inverter_charger"), ("grid", "ac_loads"), ("inverter_charger", "ac_loads"),
        ("inverter_charger", "battery"), ("solar", "battery"), ("battery", "dc_loads"),
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
