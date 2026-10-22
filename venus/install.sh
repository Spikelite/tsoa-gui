#!/bin/sh
# Installs or updates tsoa-gui on a Venus OS device, from this unpacked
# release. Everything goes under /data, which firmware updates keep; nothing
# is installed into the root filesystem.
#
# Usage: sh install.sh
set -eu

root=${TSOA_GUI_ROOT:-/data/tsoa-gui}
rc_local=${RC_LOCAL:-/data/rc.local}
python=${PYTHON:-python3}
here=$(cd "$(dirname "$0")" && pwd)
version=$(cat "$here/VERSION")
release=$root/releases/$version

mkdir -p "$root/releases" "$root/etc" "$root/tls"
if [ "$here" != "$release" ]; then
    rm -rf "$release"
    cp -R "$here" "$release"
fi

# Keep the release now in use and the one before it, to go back to.
previous=$(readlink "$root/current" 2>/dev/null || true)
ln -sfn "releases/$version" "$root/current"
for old in "$root"/releases/*; do
    case "releases/${old##*/}" in
        "releases/$version" | "$previous") ;;
        *) rm -rf "$old" ;;
    esac
done

[ -f "$root/etc/tsoa-gui.conf" ] || printf 'PORT=8088\n' > "$root/etc/tsoa-gui.conf"

if [ ! -f "$root/tls/cert.pem" ]; then
    # The device's own addresses, so a proxy in front can verify the certificate.
    addresses=$(ip -4 -o addr show 2>/dev/null | awk '{ split($4, a, "/"); if (a[1] != "127.0.0.1") print a[1] }') || true
    # shellcheck disable=SC2086 # one argument per address
    PYTHONPATH="$release/vendor:$release/app" "$python" -m tsoa_gui.certificate "$root/tls" $addresses
fi

line="sh $root/current/boot.sh  # tsoa-gui"
if [ ! -f "$rc_local" ]; then
    printf '#!/bin/bash\n' > "$rc_local"
    chmod 755 "$rc_local"
fi
grep -qxF "$line" "$rc_local" || printf '%s\n' "$line" >> "$rc_local"

sh "$root/current/boot.sh"

# A service already running moves to the new release when it restarts. An
# update must never leave it stopped, so the restart is checked: if the old
# process has not gone within the wait, it is killed, and the supervisor
# starts the new one.
service=${SERVICE_DIR:-/service}/tsoa-gui
wait_s=${RESTART_WAIT_S:-10}
service_pid() {
    svstat "$service" 2>/dev/null | sed -n 's/.*(pid \([0-9]*\)).*/\1/p'
}
replaced() {
    # True once a process other than $1 runs, within $wait_s seconds.
    waited=0
    while [ "$waited" -lt "$wait_s" ]; do
        now=$(service_pid)
        if [ -n "$now" ] && [ "$now" != "$1" ]; then
            return 0
        fi
        sleep 1
        waited=$((waited + 1))
    done
    return 1
}
old=$(service_pid)
if [ -n "$old" ]; then
    svc -t "$service"
    if ! replaced "$old"; then
        echo "The old tsoa-gui process ($old) did not stop within $wait_s s, so it is being killed." >&2
        svc -k "$service"
        if ! replaced "$old"; then
            echo "tsoa-gui is not running after the update: see svstat $service and /data/log/tsoa-gui/current." >&2
            exit 1
        fi
    fi
fi

PORT=8088
. "$root/etc/tsoa-gui.conf"
echo "tsoa-gui $version is installed and serves HTTPS on port $PORT."
