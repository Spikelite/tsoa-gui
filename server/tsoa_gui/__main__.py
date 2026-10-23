"""Run the tsoa-gui server, serving the built client and the API."""
import argparse
import os
import sys
import time
from pathlib import Path

from . import versions

BUILT_CLIENT = Path(__file__).resolve().parents[2] / "client" / "dist"

# A browser's event stream never ends on its own, so a graceful shutdown
# would wait on it forever and a restart would leave the server stopped but
# not gone. Past this many seconds, open requests are cut off.
SHUTDOWN_TIMEOUT_S = 3


def account(value: str) -> tuple[int, int]:
    uid, separator, gid = value.partition(":")
    if not (separator and uid.isdigit() and gid.isdigit()):
        raise argparse.ArgumentTypeError(f"expected UID:GID, such as 8088:8088, not {value!r}")
    return int(uid), int(gid)


def percent(value: str) -> float:
    # Written in a configuration file, a percentage is as likely as not to carry its sign.
    try:
        number = float(value.strip().removesuffix("%"))
    except ValueError:
        number = -1.0
    if not 0 <= number < 100:
        raise argparse.ArgumentTypeError(f"expected a state of charge from 0 to under 100, not {value!r}")
    return number


def drop_privileges(run_as: tuple[int, int] | None) -> None:
    if run_as is None:
        return
    uid, gid = run_as
    os.setgroups([])
    os.setgid(gid)
    os.setuid(uid)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m tsoa_gui", description=__doc__)
    parser.add_argument("--host", default="127.0.0.1", help="address to listen on (default: %(default)s)")
    parser.add_argument("--port", type=int, default=8088, help="port to listen on (default: %(default)s)")
    parser.add_argument("--client", type=Path, default=BUILT_CLIENT, metavar="DIR",
                        help="directory of the built client to serve (default: client/dist)")
    parser.add_argument("--mqtt-host", default="127.0.0.1",
                        help="the device's MQTT broker (default: %(default)s, the device itself)")
    parser.add_argument("--mqtt-port", type=int, default=1883, help="(default: %(default)s)")
    parser.add_argument("--cut-off-soc", type=percent, default=10.0, metavar="PERCENT",
                        help="the state of charge at which the system cuts its AC loads, for time to empty, where "
                             "the device has no ESS minimum of its own (default: %(default)g)")
    parser.add_argument("--mock", action="store_true",
                        help="serve invented readings that run through a day every ten minutes, instead of a device's")
    parser.add_argument("--certfile", type=Path, help="TLS certificate, to serve HTTPS")
    parser.add_argument("--keyfile", type=Path, help="TLS private key, to serve HTTPS")
    parser.add_argument("--log-level", default="warning", choices=["debug", "info", "warning", "error"],
                        help="(default: %(default)s)")
    parser.add_argument("--tested-versions", type=Path, metavar="FILE",
                        help="on a Python or pydantic other than the ones FILE names, serve only a page that says so")
    parser.add_argument("--run-as", type=account, metavar="UID:GID",
                        help="once the TLS key is read, switch to this user and group ID (needs root)")
    args = parser.parse_args(argv)
    if (args.certfile is None) != (args.keyfile is None):
        parser.error("--certfile and --keyfile go together")

    if args.tested_versions is not None:
        problems = versions.mismatches(versions.read(args.tested_versions))
        if problems:
            serve_notice(args, problems)
            return

    # Imported only once the versions are known to be the tested ones.
    import uvicorn

    from . import mock, venus
    from .app import create_app
    from .feed import Feed
    from .time_left import TimeLeftEstimator

    if args.mock:
        jobs = [mock.run]
    else:
        jobs = [lambda feed: venus.run(feed, args.mqtt_host, args.mqtt_port)]
    # No access log: on the device every line is a write to its storage.
    config = uvicorn.Config(
        create_app(args.client, feed=Feed(prepare=TimeLeftEstimator(args.cut_off_soc).apply), jobs=jobs),
        host=args.host,
        port=args.port,
        ssl_certfile=args.certfile,
        ssl_keyfile=args.keyfile,
        log_level=args.log_level,
        access_log=False,
        timeout_graceful_shutdown=SHUTDOWN_TIMEOUT_S,
    )
    config.load()  # reads the TLS key, which only root can
    drop_privileges(args.run_as)
    server = uvicorn.Server(config)
    try:
        server.run()
    except KeyboardInterrupt:
        pass
    if not server.started:
        sys.exit(3)  # as uvicorn.run does when the server cannot start


def serve_notice(args: argparse.Namespace, problems: list[str]) -> None:
    for problem in problems:
        print(f"tsoa-gui will not start: {problem}", file=sys.stderr, flush=True)
    release_file = args.tested_versions.with_name("VERSION")
    release = release_file.read_text(encoding="utf-8").strip() if release_file.is_file() else "this release"
    try:
        server = versions.notice_server(versions.notice_page(release, problems), args.host, args.port,
                                        args.certfile, args.keyfile)
    except OSError as error:
        print(f"tsoa-gui cannot serve the page that says so: {error}", file=sys.stderr, flush=True)
        # Exiting would have the supervisor restart it every second and log
        # the same lines each time, so it waits for a new release.
        while True:
            time.sleep(3600)
    drop_privileges(args.run_as)
    print("tsoa-gui serves a page saying a newer release is needed.", file=sys.stderr, flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
