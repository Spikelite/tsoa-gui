# Installing tsoa-gui

tsoa-gui runs on the Venus OS device itself, as an add-on under `/data`, which firmware updates keep. Once it is installed, any browser on the same network opens it at `https://<device address>:8088`. Installing it changes nothing about the device's own console, VRM or anything else the device does, and it only reads from the device.

The addresses on this page, such as `192.0.2.10`, are examples. Use your own device's address wherever one appears.

## What you need

A Victron GX device, such as a Cerbo GX or an Ekrano GX, or a Raspberry Pi, running Venus OS v3.70 or later. Each release's notes name the Python and pydantic versions it was tested with; tsoa-gui uses the ones Venus ships, and a release refuses to install on a device with others. It needs about 20 MB on the device's data partition, for the release in use and the one before it.

A computer on the same network, with `ssh` and `scp`. Windows 10 and 11, macOS and Linux all have them: on Windows, use PowerShell.

Nothing about MQTT needs enabling. tsoa-gui reads the device's MQTT broker from the device itself, and Venus OS always runs that broker for its own console. The MQTT Access setting only opens the broker to other machines on the network, so leave it as it is.

## Getting root access over SSH

Installing needs a command line on the device, as root. On the device's console, either its own screen or Remote Console:

1. Go to Settings, General, Access & Security, and set Access level to User & Installer. The default password is `ZZZ`.
2. Still on that page, without opening the Access level item, raise the level to Superuser: drag the list of entries on the page down and hold it there for five seconds, until Access level shows Superuser. In the older interface, highlight Access level and hold the right button of the keypad, or the right arrow key on Remote Console, instead.
3. Set Root password to a password of your own, at least six characters.
4. Turn on Enable SSH on LAN.

Victron's [root access page](https://www.victronenergy.com/live/ccgx:root_access) has the details, including how to log in with an SSH key instead of the password. A firmware update resets the root password, but keeps SSH keys, so a key saves setting the password again after each update.

Find the device's address under Settings, Connectivity, Ethernet or Wi-Fi (on older firmware, Settings, Ethernet or Wi-Fi), or in your router's list of devices. Then check that you can log in from the computer:

    ssh root@192.0.2.10

The first time, `ssh` asks whether to trust the device's key: answer `yes`. Type `exit` to leave.

## Downloading a release

Releases are on the [Releases page](https://github.com/Spikelite/tsoa-gui/releases). Each has two files: `tsoa-gui-<version>.tar.gz`, the release itself, and `tsoa-gui-<version>.tar.gz.sha256`, which holds the archive's SHA-256. Checking it makes sure the archive arrived whole and is the one that was published. The examples below use version 0.1.0; use the latest release's version.

If the device is connected to the internet, it can download them itself. Log in, then:

    cd /tmp
    wget https://github.com/Spikelite/tsoa-gui/releases/download/v0.1.0/tsoa-gui-0.1.0.tar.gz
    wget https://github.com/Spikelite/tsoa-gui/releases/download/v0.1.0/tsoa-gui-0.1.0.tar.gz.sha256
    sha256sum -c tsoa-gui-0.1.0.tar.gz.sha256

`sha256sum` prints `OK` when it matches. If it does not, delete both files and download them again.

Otherwise, download both files from the Releases page on the computer and check the archive there. In the folder you downloaded them to, on Linux:

    sha256sum -c tsoa-gui-0.1.0.tar.gz.sha256

on macOS:

    shasum -a 256 -c tsoa-gui-0.1.0.tar.gz.sha256

Both print `OK` when it matches. On Windows, in PowerShell:

    Get-FileHash tsoa-gui-0.1.0.tar.gz
    Get-Content tsoa-gui-0.1.0.tar.gz.sha256

and compare the two long hexadecimal numbers: they must be the same, apart from upper and lower case. If they differ, download the archive again, and do not install it until they match. Then copy it to the device and log in:

    scp tsoa-gui-0.1.0.tar.gz root@192.0.2.10:/tmp/
    ssh root@192.0.2.10
    cd /tmp

## Installing

On the device, in `/tmp` where the archive is, unpack it and run its installer:

    tar xzf tsoa-gui-0.1.0.tar.gz
    sh tsoa-gui-0.1.0/install.sh

The installer puts the release in `/data/tsoa-gui`, makes the device start tsoa-gui at every boot, starts it, and waits until it answers. It ends by printing the addresses to open:

    tsoa-gui 0.1.0 is installed and running. Open it in a browser at:
        https://192.0.2.10:8088

If it says anything else instead, see [Troubleshooting](#troubleshooting). `/tmp` is cleared at the next boot, so the unpacked files there need no tidying.

## Opening it

Open the address the installer printed, `https://192.0.2.10:8088`, in a browser on any computer, phone or tablet on the same network. The `https://` and the `:8088` are both needed.

Viewing needs no sign-in. While tsoa-gui waits for the device's first readings, which takes a few seconds after it starts, the page says so.

An address on the network can change when the device restarts or the router does. Giving the device a fixed address, in the router's settings or the device's own, keeps the bookmark and any kiosk working.

### The certificate warning

tsoa-gui serves its page over HTTPS with a certificate it made for itself when it was installed. No certificate authority vouches for it, so the first time a browser opens the page it warns that the connection is not private, or that the certificate is not trusted. The connection is still encrypted; the warning means the browser cannot confirm, on its own, which device it is talking to. On your own network, opening your device's own address, it is safe to go on:

- In Chrome or Edge, choose Advanced, then Proceed to 192.0.2.10.
- In Firefox, choose Advanced, then Accept the Risk and Continue.
- In Safari, choose Show Details, then visit this website.

Firefox and Safari remember the choice; Chrome and Edge ask again after a while.

A kiosk, with nobody there to click through the warning, should trust the device's certificate instead. It is in `/data/tsoa-gui/tls/cert.pem` on the device; copy it to the kiosk with `scp root@192.0.2.10:/data/tsoa-gui/tls/cert.pem .` and add it to the kiosk's trusted certificates, as its operating system or browser describes. Then the page opens with no warning. A reverse proxy with a trusted certificate of its own, in front of the device, also works.

The certificate names the device's addresses at the time of installing. If the address changes, a browser or kiosk that trusted it warns again; make a new one by deleting `/data/tsoa-gui/tls` and running the installer again, then trust the new one.

### Kiosk addresses

A kiosk screen, with nobody to use the page's menus, takes its choices from the address. `?skin=` picks the skin, `minimal` or `sci-fi-fof`:

    https://192.0.2.10:8088/?skin=sci-fi-fof

`?part=` opens straight onto one part's own page, one of `grid`, `generator`, `inverter_charger`, `battery`, `solar`, `ac_loads` or `dc_loads`:

    https://192.0.2.10:8088/?skin=sci-fi-fof&part=battery

Without `?skin=`, each browser remembers the last skin chosen on it.

### Time to empty

The battery's time to empty runs to the state of charge at which the system cuts its AC loads to protect the battery. On a system with ESS, that is ESS's minimum state of charge, or BatteryLife's limit while BatteryLife is on, read from the device. Otherwise it is 10%; to change it, set `CUT_OFF_SOC=` to the percentage, such as `CUT_OFF_SOC=20`, in `/data/tsoa-gui/etc/tsoa-gui.conf` and restart tsoa-gui with `svc -t /service/tsoa-gui`.

## Updating

### After a tsoa-gui release

Download the new release and check its SHA-256 as before, either on the device or on the computer, then install it the same way. On the device, for a release 0.2.0:

    cd /tmp
    wget https://github.com/Spikelite/tsoa-gui/releases/download/v0.2.0/tsoa-gui-0.2.0.tar.gz
    wget https://github.com/Spikelite/tsoa-gui/releases/download/v0.2.0/tsoa-gui-0.2.0.tar.gz.sha256
    sha256sum -c tsoa-gui-0.2.0.tar.gz.sha256
    tar xzf tsoa-gui-0.2.0.tar.gz
    sh tsoa-gui-0.2.0/install.sh

The installer keeps the settings and the certificate, restarts tsoa-gui on the new release and checks that it answers. It keeps the release that was in use, to go back to, and removes any older one. Browsers already showing the page pick up the new release when they next load it.

### After a Venus OS firmware update

tsoa-gui lives in `/data`, which a firmware update keeps, so it starts again by itself after the update. Two things can change:

A firmware update can bring a newer Python or pydantic than the release was tested with. tsoa-gui then does not run; its page says that it needs a newer release and names the versions it found. Install the latest tsoa-gui release, as above. If there is no release yet for those versions, the page stays until there is; the device itself and its own console are not affected. The page reloads itself every minute, so a kiosk shows tsoa-gui again once a fitting release is installed.

A firmware update also resets the root password, so set it again on the device's console before logging in, unless you log in with an SSH key.

## Going back to the previous release

If a new release does not work for you, go back to the one before it:

    ssh root@192.0.2.10
    sh /data/tsoa-gui/current/rollback.sh

It restarts tsoa-gui on the previous release and checks that it answers. Running it again goes forward to the newer release.

## Uninstalling

    ssh root@192.0.2.10
    sh /data/tsoa-gui/current/uninstall.sh

It stops tsoa-gui, stops the device starting it at boot, and asks whether to delete `/data/tsoa-gui`, which holds its releases, settings and certificate. Answer `y` to remove everything, or `n` to keep the settings for a later install. Its logs are in `/data/log/tsoa-gui`; delete that directory too if you want them gone.

## Troubleshooting

Everything below is typed on the device, after `ssh root@192.0.2.10`.

The service's state comes from `svstat`:

    svstat /service/tsoa-gui

`up (pid 1234) 300 seconds` means it is running. A number of seconds that stays small, run after run, means it keeps stopping and being restarted; `down` or an error means it is not running at all. `svc -t /service/tsoa-gui` restarts it.

tsoa-gui logs warnings and errors only, to `/data/log/tsoa-gui/current`. To read it, with the times made readable:

    tai64nlocal < /data/log/tsoa-gui/current | tail -n 50

If the installer said tsoa-gui did not answer, or answered with an HTTP status instead of running, the log says why.

If `wget` on the device cannot connect, check that the device reaches the internet, for example that VRM shows it online. If it reports a certificate that is not yet valid or has expired, the device's clock is wrong, which happens on a device that has not reached the internet since it started; check the date and time in its settings, or download on the computer instead.

If the installer said the release was not tested with the device's software, the device's Python or pydantic is not the one that release was built for: install the latest release, or, for an older Venus OS, check the [supported versions](#what-you-need).

If the page keeps saying it is waiting for the first readings, tsoa-gui is running but has nothing from the device yet. Check that the device's own console shows readings, and look in the log for errors about MQTT. Restarting it with `svc -t /service/tsoa-gui` starts a fresh connection.

If the page says tsoa-gui needs a newer release, see [After a Venus OS firmware update](#after-a-venus-os-firmware-update).

If tsoa-gui does not start after the device reboots, check Settings, General, Modification checks on the device's console: with Modifications enabled turned off, the device skips `/data/rc.local`, which starts tsoa-gui. Turn it back on and reboot.

If the browser cannot connect at all, check the address and the port, and that the computer is on the same network as the device. tsoa-gui listens on port 8088; to change it, set `PORT=` in `/data/tsoa-gui/etc/tsoa-gui.conf` and restart it with `svc -t /service/tsoa-gui`.

tsoa-gui starts as root only to read its certificate's key, then runs as user and group ID 8088, which have no rights beyond reading its own files, so `ps` shows `8088` as its user.
