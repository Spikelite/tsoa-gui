# Run by /data/rc.local at every boot, as: sh /data/tsoa-gui/current/boot.sh
#
# rc.local runs its lines one after another, so this returns at once and
# exits 0 whatever happens, and never holds up the lines after it.
#
# daemontools writes its status files into a service's directory. /service
# is in RAM and rebuilt at every boot, so the service is copied there each
# time rather than linked, and those writes never reach the SD card.
release=$(dirname "$0")
service=${SERVICE_DIR:-/service}/tsoa-gui
if [ -f "$release/service/run" ] && [ -f "$release/service/log/run" ]; then
    mkdir -p "$service/log" &&
        cp "$release/service/log/run" "$service/log/run" &&
        cp "$release/service/run" "$service/run" &&
        chmod 755 "$service/run" "$service/log/run"
fi 2>/dev/null
exit 0
