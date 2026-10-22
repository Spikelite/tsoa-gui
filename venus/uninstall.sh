#!/bin/sh
# Removes tsoa-gui from a Venus OS device: stops the service, takes it out of
# /service and /data/rc.local, and deletes /data/tsoa-gui if you agree.
#
# Usage: sh uninstall.sh
set -u

root=${TSOA_GUI_ROOT:-/data/tsoa-gui}
rc_local=${RC_LOCAL:-/data/rc.local}
service=${SERVICE_DIR:-/service}/tsoa-gui

svc -dx "$service" "$service/log" 2>/dev/null || true
rm -rf "$service"

if [ -f "$rc_local" ]; then
    grep -vxF "sh $root/current/boot.sh  # tsoa-gui" "$rc_local" > "$rc_local.tsoa-gui" || true
    # Written back over the original, which keeps its owner and mode.
    cat "$rc_local.tsoa-gui" > "$rc_local"
    rm -f "$rc_local.tsoa-gui"
fi

printf 'Delete %s, with its settings and data? [y/N] ' "$root"
read -r answer || answer=
case $answer in
    y | Y) rm -rf "$root" && echo "Removed $root." ;;
    *) echo "Kept $root." ;;
esac
