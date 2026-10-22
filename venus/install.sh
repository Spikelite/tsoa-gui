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
# A service already running moves to the new release when it restarts.
svc -t "${SERVICE_DIR:-/service}/tsoa-gui" 2>/dev/null || true

PORT=8088
. "$root/etc/tsoa-gui.conf"
echo "tsoa-gui $version is installed and serves HTTPS on port $PORT."
