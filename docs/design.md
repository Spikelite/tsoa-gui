# Design

## The overview

One page is both the status board and the data view. Each part of the system has a panel showing what it is doing now:

| Part | Key readings |
|---|---|
| Grid or shore | connected or not, voltage, current, power, frequency, input current limit |
| Generator | running or stopped, power, run time |
| Inverter/charger | mode, state (inverting, bulk, absorption, float, passthrough), AC in and out power, charge current, alarms |
| Battery | state of charge, voltage, current, power, temperature, time to go, charge limits, cell spread where the battery reports cells |
| Solar | power per charger and in total, today's yield, charger state |
| AC loads | power on each output |
| DC loads | power, where it is measured |

A part the system does not have is left out. A part that is installed but not reporting is drawn as offline.

Power moves between the panels as animated flow whose direction and speed follow the readings. Readings arrive about once a second, and every displayed value eases from its last reading to the next instead of jumping.

## Status colors

Every skin gives color the same meaning, and pairs each state with an icon or a label so that color is never the only signal.

| State | Color | Meaning |
|---|---|---|
| Good | green | a positive condition, such as charging or solar producing |
| Normal | blue | operating as expected |
| Attention | yellow | approaching a limit |
| Warning | orange | outside the normal range |
| Fault | red | an alarm, a trip, or a limit reached |
| Offline | black | installed but not reporting, or data missing; drawn with an outline so it stays visible on a dark background |

Dark mode is the default.

## Skins

A skin is a view over the same system model. It receives the model and its updates and decides how to draw them, and it never talks to the device itself. Two are planned. The default is minimal and technical. The second, Sci-Fi FOF (short for Form Over Function), is an engineering-console terminal that shows the battery as a glowing vertical core whose light and pulse follow its charge and power. All of its artwork is original.

## Control and users

The interface will also control the system, starting with inverter mode, AC input current limit and charge current. What a user may do depends on their role: read-only viewers, operators with day-to-day controls, administrators with everything including users and settings, and kiosk accounts for a fixed display that signs in without a password at the screen. More roles may follow.

The device's own login grants full control, so roles are enforced by a server between the browser and the device. It holds the device connection, signs users in, and checks every change against the user's role.

## Data

Readings come from Venus OS's MQTT feed, the one the device's own console uses. The model is built from the system summary service where it can be, so one build works across installations without per-device setup.
