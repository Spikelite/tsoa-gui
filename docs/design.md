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

A skin is a view over the same system model. It receives the model and its updates and decides how to draw them, and it never talks to the device itself. Every skin shows the time of day from the clock of the screen showing the page, so a wall display doubles as a clock: the minimal skin in the page's header beside the skin menu, and Sci-Fi FOF in segments of its own frame's top bar, where its skin choice drops down as a list of segments and the bottom bar carries the application's name. Sci-Fi FOF scales with the screen's height as well as its width, so the whole console fits on anything from a small touch panel to a TV. There are two. The default is minimal and technical. The second, Sci-Fi FOF (Form Over Function), draws the same diagram as an engineering console. Every part keeps its place from the minimal skin, stepped down from supplies to loads, and sits on black with no box of its own, named by a block of color. Thick conduits with rounded elbows, along which waves of plasma roll toward where the power goes, more often and faster the more power each carries, plug into each part's name or its equipment. The battery is one block of ten cells that light with its charge, a tenth each, with pulses of plasma running through them at the rhythm of the conduits' waves. The grid is a schematic of a tall lattice transmission tower, drawn in outline, with a wire carrying a steady blue flow down to a row of pips that power drips into: the pips nearest the wire turn blue in turn, and before the third is full the charge sets off down the row as a packet and into the grid's conduit. The grid's readings sit in the space above the row. The generator is a column of cells between ribbed caps round a housing, ring and dot: while it runs, blue light runs in from both ends, meets in the dot and passes into its conduit. Solar is a schematic of an array of panels, each a grid of cells that gather light until the array is full; the light then runs down a cable into a row of pips like the grid's and into the conduit. A part that exists but carries nothing just now keeps a dim, still conduit, so every part is always drawn joined to the rest. The inverter/charger is a hub that power runs through: its conduits carry on through open ports in its ribbed housing to a core of cells at its center, so the waves come in from where the power comes from and leave toward where it goes, and power from a supply straight to the AC loads is drawn through the hub with the rest. The core's color follows what the inverter/charger is doing, and an inverter/charger with two AC inputs has a node for each on the hub's left side, with the grid or shore supply and the generator each plugged into the input it is wired to and the input in use lit. The AC loads and the DC loads are each a circuit panel: the conduit feeding them runs on along its bus to a terminal block, with two rows of breakers tapped off it, each lit by the plasma as a wave on the bus reaches its tap. The battery's cells light from the middle of the top row, where its conduit feeds it, outward, then from the middle of the next row. Each part's name there is a rounded button in its status's color, with the status written after the name when it needs attention. All of its artwork is original, drawn in CSS and SVG, and it drops the cells' glow on a small screen.

A viewer chooses the skin from a menu at the top of the page, and each browser remembers its choice. A fixed display, with nobody to click, names its skin in the address instead, as in `?skin=sci-fi-fof`.

## Control and users

Viewing is read-only and needs no sign-in for now: anyone who can reach the server sees the readings, and a fixed display just opens the page. Nobody can change anything without signing in.

The interface will also control the system, starting with inverter mode, AC input current limit and charge current. What a signed-in user may do depends on their role: read-only viewers, operators with day-to-day controls, and administrators with everything including users and settings. The first account made on a new installation is its administrator. More roles may follow.

The device's own login grants full control, so roles are enforced by a server between the browser and the device. It holds the device connection, signs users in, and checks every change against the user's role.

## Data

Readings come from Venus OS's MQTT feed, the one the device's own console uses. The model is built from the system summary service where it can be, so one build works across installations without per-device setup.
