#!/bin/sh
# Goes back to the release installed before the current one, by running that
# release's installer again. Running it a second time goes forward again.
#
# Usage: sh /data/tsoa-gui/current/rollback.sh
set -eu

root=${TSOA_GUI_ROOT:-/data/tsoa-gui}
previous=$(readlink "$root/previous" 2>/dev/null || true)
if [ -z "$previous" ] || [ ! -f "$root/$previous/install.sh" ]; then
    echo "There is no earlier release of tsoa-gui on this device to go back to." >&2
    exit 1
fi
exec sh "$root/$previous/install.sh"
