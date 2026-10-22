"""Run the tsoa-gui server, serving the built client and the API."""
import argparse
from pathlib import Path

import uvicorn

from .app import create_app

BUILT_CLIENT = Path(__file__).resolve().parents[2] / "client" / "dist"


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m tsoa_gui", description=__doc__)
    parser.add_argument("--host", default="127.0.0.1", help="address to listen on (default: %(default)s)")
    parser.add_argument("--port", type=int, default=8088, help="port to listen on (default: %(default)s)")
    parser.add_argument("--client", type=Path, default=BUILT_CLIENT, metavar="DIR",
                        help="directory of the built client to serve (default: client/dist)")
    args = parser.parse_args(argv)
    uvicorn.run(create_app(args.client), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
