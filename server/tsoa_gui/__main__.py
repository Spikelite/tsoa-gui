"""Run the tsoa-gui server, serving the built client and the API."""
import argparse
from pathlib import Path

import uvicorn

from . import mock
from .app import create_app

BUILT_CLIENT = Path(__file__).resolve().parents[2] / "client" / "dist"


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m tsoa_gui", description=__doc__)
    parser.add_argument("--host", default="127.0.0.1", help="address to listen on (default: %(default)s)")
    parser.add_argument("--port", type=int, default=8088, help="port to listen on (default: %(default)s)")
    parser.add_argument("--client", type=Path, default=BUILT_CLIENT, metavar="DIR",
                        help="directory of the built client to serve (default: client/dist)")
    parser.add_argument("--mock", action="store_true",
                        help="serve invented readings that run through a day every ten minutes")
    parser.add_argument("--certfile", type=Path, help="TLS certificate, to serve HTTPS")
    parser.add_argument("--keyfile", type=Path, help="TLS private key, to serve HTTPS")
    parser.add_argument("--log-level", default="warning", choices=["debug", "info", "warning", "error"],
                        help="(default: %(default)s)")
    args = parser.parse_args(argv)
    if (args.certfile is None) != (args.keyfile is None):
        parser.error("--certfile and --keyfile go together")

    jobs = [mock.run] if args.mock else []
    # No access log: on the device every line is a write to its storage.
    uvicorn.run(
        create_app(args.client, jobs=jobs),
        host=args.host,
        port=args.port,
        ssl_certfile=args.certfile,
        ssl_keyfile=args.keyfile,
        log_level=args.log_level,
        access_log=False,
    )


if __name__ == "__main__":
    main()
