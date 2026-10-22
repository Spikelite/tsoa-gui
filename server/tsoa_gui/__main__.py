"""Run the tsoa-gui server, serving the built client and the API."""
import argparse
import sys
import time
from pathlib import Path

import uvicorn

from . import mock, venus, versions
from .app import create_app

BUILT_CLIENT = Path(__file__).resolve().parents[2] / "client" / "dist"

# A browser's event stream never ends on its own, so a graceful shutdown
# would wait on it forever and a restart would leave the server stopped but
# not gone. Past this many seconds, open requests are cut off.
SHUTDOWN_TIMEOUT_S = 3


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m tsoa_gui", description=__doc__)
    parser.add_argument("--host", default="127.0.0.1", help="address to listen on (default: %(default)s)")
    parser.add_argument("--port", type=int, default=8088, help="port to listen on (default: %(default)s)")
    parser.add_argument("--client", type=Path, default=BUILT_CLIENT, metavar="DIR",
                        help="directory of the built client to serve (default: client/dist)")
    parser.add_argument("--mqtt-host", default="127.0.0.1",
                        help="the device's MQTT broker (default: %(default)s, the device itself)")
    parser.add_argument("--mqtt-port", type=int, default=1883, help="(default: %(default)s)")
    parser.add_argument("--mock", action="store_true",
                        help="serve invented readings that run through a day every ten minutes, instead of a device's")
    parser.add_argument("--certfile", type=Path, help="TLS certificate, to serve HTTPS")
    parser.add_argument("--keyfile", type=Path, help="TLS private key, to serve HTTPS")
    parser.add_argument("--log-level", default="warning", choices=["debug", "info", "warning", "error"],
                        help="(default: %(default)s)")
    parser.add_argument("--tested-versions", type=Path, metavar="FILE",
                        help="refuse to serve on a Python or pydantic other than the ones FILE names")
    args = parser.parse_args(argv)
    if (args.certfile is None) != (args.keyfile is None):
        parser.error("--certfile and --keyfile go together")

    if args.tested_versions is not None:
        problems = versions.mismatches(versions.read(args.tested_versions))
        if problems:
            for problem in problems:
                print(f"tsoa-gui will not start: {problem}", file=sys.stderr, flush=True)
            # Exiting would have the supervisor restart it every second and
            # log the same lines each time, so it waits for a new release.
            while True:
                time.sleep(3600)

    if args.mock:
        jobs = [mock.run]
    else:
        jobs = [lambda feed: venus.run(feed, args.mqtt_host, args.mqtt_port)]
    # No access log: on the device every line is a write to its storage.
    uvicorn.run(
        create_app(args.client, jobs=jobs),
        host=args.host,
        port=args.port,
        ssl_certfile=args.certfile,
        ssl_keyfile=args.keyfile,
        log_level=args.log_level,
        access_log=False,
        timeout_graceful_shutdown=SHUTDOWN_TIMEOUT_S,
    )


if __name__ == "__main__":
    main()
