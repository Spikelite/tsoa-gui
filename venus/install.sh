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
service=${SERVICE_DIR:-/service}/tsoa-gui
# Without symbolic links, so that running the installer of a release that is
# already installed, as rollback.sh does, is recognized.
here=$(cd "$(dirname "$0")" && pwd -P)
version=$(cat "$here/VERSION" 2>/dev/null || true)
case $version in
    "" | .* | *[!0-9A-Za-z._+-]*)
        echo "$here/VERSION does not hold a release version, so nothing was installed." >&2
        exit 1
        ;;
esac
release=$root/releases/$version

if ! PYTHONPATH="$here/vendor:$here/app" "$python" -m tsoa_gui.versions "$here/tested.json"; then
    echo "tsoa-gui $version was not tested with this device's software, so nothing was changed." >&2
    echo "Install a release made for it: see the install guide." >&2
    exit 1
fi

mkdir -p "$root/releases" "$root/etc" "$root/tls"
if [ "$here" != "$release" ]; then
    rm -rf "$release"
    cp -R "$here" "$release"
fi
# Compiled here, as root, because the server runs as an account that cannot
# write into the release; otherwise every start would compile it again.
"$python" "$release/precompile.py" "$release/app" "$release/vendor" || true
# The server reads the release as that account, whatever the umask was when
# it was unpacked.
chmod -R a+rX "$release"

# Keep the release now in use and the one before it, to go back to. Running
# the current release's installer again keeps the one before it as it was.
current=$(readlink "$root/current" 2>/dev/null || true)
previous=$(readlink "$root/previous" 2>/dev/null || true)
if [ "$current" != "releases/$version" ]; then
    previous=$current
elif [ -z "$previous" ]; then
    # Installed by a release that kept no record of the one before: that is
    # the other one there, if there is exactly one.
    others=$(ls "$root/releases" | grep -vxF "$version" || true)
    [ "$(printf '%s\n' "$others" | grep -c .)" = 1 ] && previous=releases/$others
fi
ln -sfn "releases/$version" "$root/current"
if [ -n "$previous" ]; then
    ln -sfn "$previous" "$root/previous"
else
    rm -f "$root/previous"
fi
for old in "$root"/releases/*; do
    case "releases/${old##*/}" in
        "releases/$version" | "$previous") ;;
        *) rm -rf "$old" ;;
    esac
done

[ -f "$root/etc/tsoa-gui.conf" ] || printf 'PORT=8088\n' > "$root/etc/tsoa-gui.conf"
PORT=8088
RUN_AS=${RUN_AS:-8088:8088}
. "$root/etc/tsoa-gui.conf"

# The server's own data, the one place it can write. The account it runs as
# exists only as these numbers: Venus replaces /etc/passwd at every firmware
# update.
mkdir -p "$root/var"
[ -z "$RUN_AS" ] || chown "$RUN_AS" "$root/var"
chmod 700 "$root/var"

# The device's addresses on the network: not loopback, and not the
# link-local ones a device gives itself when nothing else gives it one.
addresses=$(ip -4 -o addr show 2>/dev/null |
    awk '{ split($4, a, "/"); if (a[1] !~ /^127\./ && a[1] !~ /^169\.254\./) print a[1] }') || true
if [ ! -f "$root/tls/cert.pem" ]; then
    # The device's own addresses, so a proxy in front can verify the certificate.
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

# Success is the server answering. The supervisor takes up to five seconds
# to notice a new service, and the server some more to start.
health=${HEALTH_URL:-https://127.0.0.1:$PORT/api/health}
start_wait_s=${START_WAIT_S:-60}
status() {
    "$python" - "$health" <<'EOF'
import ssl, sys, urllib.error, urllib.request
# Its own certificate is self-signed, and this only asks whether it answers.
context = ssl.create_default_context()
context.check_hostname = False
context.verify_mode = ssl.CERT_NONE
try:
    print(urllib.request.urlopen(sys.argv[1], timeout=5, context=context).status)
except urllib.error.HTTPError as error:
    print(error.code)
except Exception:
    print(0)
EOF
}
waited=0
answer=$(status)
while [ "$answer" = 0 ] && [ "$waited" -lt "$start_wait_s" ]; do
    sleep 1
    waited=$((waited + 1))
    answer=$(status)
done
case $answer in
    200)
        echo "tsoa-gui $version is installed and running. Open it in a browser at:"
        for address in ${addresses:-DEVICE-ADDRESS}; do
            echo "    https://$address:$PORT"
        done
        ;;
    0)
        echo "tsoa-gui $version is installed, but it did not answer on port $PORT within $start_wait_s s:" >&2
        echo "see svstat $service and /data/log/tsoa-gui/current." >&2
        exit 1
        ;;
    *)
        echo "tsoa-gui $version is installed, but it answers with HTTP status $answer instead of running:" >&2
        echo "see /data/log/tsoa-gui/current." >&2
        exit 1
        ;;
esac
