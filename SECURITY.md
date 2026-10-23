# Security

## Supported versions

Only the latest 0.x release is supported. A fix ships as a new release, not as a patch to an older one, so update to the latest to get it.

## Reporting a vulnerability

Report it privately through [GitHub's private vulnerability reporting](https://github.com/Spikelite/tsoa-gui/security/advisories/new), not in a public issue. Say which tsoa-gui and Venus OS versions you found it on, what an attacker could do, and how to reproduce it. As with any report, leave out the portal ID, serial numbers, IP addresses and hostnames of your installation.

tsoa-gui is maintained by one person, so a reply may take some days. Once a fix is released, the advisory is published with credit to you, unless you would rather not be named.

Problems in Venus OS itself, or in the device's own console, belong with Victron Energy.

## Who can see what

Viewing needs no sign-in. Anyone who can reach the device on port 8088 sees every reading tsoa-gui shows, which is what lets a kiosk screen simply open the page. Keep tsoa-gui on your own network: never forward port 8088 to the internet. To check on the system from away, use a VPN into your network rather than opening the port.

tsoa-gui serves HTTPS with a self-signed certificate, so a browser warns the first time it connects. A proxy in front of it can present a trusted certificate instead.

The server reads the device's local MQTT broker on the device itself and does not make the broker reachable from anywhere else. The only thing it publishes there is the keepalive Venus OS needs before it sends readings.
