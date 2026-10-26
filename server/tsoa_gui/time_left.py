"""How long the battery's present direction will last: time to empty while it discharges, time to full while it charges.

Venus OS's own time to go runs to its idea of empty, and only while
discharging. What a reader plans around is the cut-off, the state of charge at
which the system cuts its AC loads to protect the battery, so time to empty
runs to that, and time to full to 100%.

Both come from the battery's current averaged over a window that starts short
when the battery starts charging or discharging and lengthens while it keeps
going the same way, up to LONGEST_WINDOW_S. So an estimate appears at once and
moves often while it is fresh, and once settled, averaged over many minutes,
barely moves when a kettle switches on. The window starts short again whenever
the direction changes, or the battery stays idle, or its current unknown, for
longer than IDLE_GRACE_S. A shorter spell, such as a load switching over, adds
nothing to the average and leaves the last estimate standing.

The clock is monotonic, since the device may have no real-time clock.
"""
import time
from collections import deque
from collections.abc import Callable

from .model import Battery, System, TimeLeft

LONGEST_WINDOW_S = 15 * 60
SETTLED_AFTER_S = 5 * 60
IDLE_GRACE_S = 30
LONGEST_S = 30 * 24 * 3600
DEFAULT_CUT_OFF_SOC_PERCENT = 10.0

TOWARD = {"discharging": "empty", "charging": "full"}


class TimeLeftEstimator:
    """Adds the battery's time left to each model it is given, from the models it has been given before."""

    def __init__(self, cut_off_soc_percent: float = DEFAULT_CUT_OFF_SOC_PERCENT,
                 clock: Callable[[], float] = time.monotonic) -> None:
        self._cut_off = cut_off_soc_percent
        self._clock = clock
        self._samples: deque[tuple[float, float]] = deque()
        self._toward: str | None = None
        self._since = 0.0
        self._idle_since: float | None = None
        self._last: TimeLeft | None = None

    def apply(self, system: System) -> System:
        battery = system.battery
        if battery is None or battery.status == "offline":
            self._forget()
            return system
        cut_off = battery.cut_off_soc_percent if battery.cut_off_soc_percent is not None else self._cut_off
        # Stale readings are not new ones, so they add nothing to the
        # average, and the last estimate stands.
        if system.live:
            self._last = self._estimate(battery, cut_off)
        update = {"cut_off_soc_percent": cut_off, "time_left": self._last}
        return system.model_copy(update={"battery": battery.model_copy(update=update)})

    def _forget(self) -> None:
        self._samples.clear()
        self._toward = None
        self._idle_since = None
        self._last = None

    def _estimate(self, battery: Battery, cut_off: float) -> TimeLeft | None:
        toward = TOWARD.get(battery.activity or "")
        current = _current(battery)
        now = self._clock()
        if toward is None or current is None:
            if self._idle_since is None:
                self._idle_since = now
            if now - self._idle_since >= IDLE_GRACE_S:
                self._forget()
            return self._last
        self._idle_since = None
        if toward != self._toward:
            self._samples.clear()
            self._toward = toward
            self._since = now
        self._samples.append((now, current))
        while self._samples[0][0] < now - LONGEST_WINDOW_S:
            self._samples.popleft()

        charge = _charge_to_go_ah(battery, toward, cut_off)
        if charge is None:
            return None
        average = sum(sample for _, sample in self._samples) / len(self._samples)
        rate = -average if toward == "empty" else average
        seconds = LONGEST_S if rate <= 0 else min(LONGEST_S, charge / rate * 3600)
        return TimeLeft(toward=toward, seconds=round(seconds), settled=now - self._since >= SETTLED_AFTER_S)


def _current(battery: Battery) -> float | None:
    if battery.current_a is not None:
        return battery.current_a
    if battery.power_w is not None and battery.voltage_v:
        return battery.power_w / battery.voltage_v
    return None


def _charge_to_go_ah(battery: Battery, toward: str, cut_off: float) -> float | None:
    """The charge between the battery's state of charge and where it is heading, in amp-hours."""
    soc = battery.soc_percent
    if soc is None:
        return None
    capacity = battery.installed_capacity_ah
    # A battery that does not report its capacity may still report enough to
    # work it out: the charge left, or the charge used since it was full.
    if capacity is None and battery.capacity_ah is not None and soc > 0:
        capacity = battery.capacity_ah * 100 / soc
    if capacity is None and battery.consumed_ah is not None and soc < 100:
        capacity = battery.consumed_ah * 100 / (100 - soc)
    if capacity is None:
        return None
    share = soc - cut_off if toward == "empty" else 100 - soc
    return max(0.0, share) / 100 * capacity
