"""The Python and pydantic a release was tested with, checked at startup.

On a Venus OS device both come with the firmware, and an update can change
them. A release records the versions it was built and tested for, and on any
others the server runs none of its own code: it answers every request with a
page that says so, served by the standard library alone.

python -m tsoa_gui.versions FILE

checks the versions FILE names against this Python, for the installer, and
exits 1 if they differ.
"""
import html
import json
import platform
import ssl
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

INSTALL_GUIDE = "https://github.com/Spikelite/tsoa-gui/blob/main/docs/install.md#after-a-venus-os-firmware-update"
NAMES = {"python": "Python", "pydantic": "pydantic"}


def found() -> dict[str, str]:
    try:
        from pydantic import VERSION as pydantic
    except Exception:  # an update can remove it, or leave it broken
        pydantic = "not installed"
    return {"python": ".".join(platform.python_version_tuple()[:2]), "pydantic": pydantic}


def mismatches(tested: dict[str, str]) -> list[str]:
    here = found()
    return [f"{NAMES.get(name, name)} is {here.get(name)}, but this release was tested with {version}"
            for name, version in tested.items() if here.get(name) != version]


def read(path: Path) -> dict[str, str]:
    return json.loads(path.read_text(encoding="utf-8"))


def notice_page(release: str, problems: list[str]) -> bytes:
    items = "".join(f"<li>{html.escape(problem)}.</li>" for problem in problems)
    # It reloads itself, so a kiosk shows tsoa-gui again once a release that
    # fits is installed.
    return f"""<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="60">
<title>tsoa-gui needs a newer release</title>
<style>
  :root {{ color-scheme: light dark; font: 18px/1.5 system-ui, sans-serif; }}
  body {{ max-width: 40em; margin: 2em auto; padding: 0 1em; }}
</style>
<h1>tsoa-gui needs a newer release</h1>
<p>This device's software has changed, most likely in a Venus OS firmware update,
and tsoa-gui {html.escape(release)} was not tested with it:</p>
<ul>{items}</ul>
<p>Install a newer tsoa-gui release, as the
<a href="{INSTALL_GUIDE}">install guide</a> describes. Until then tsoa-gui shows
only this page. The device itself and its own console are not affected.</p>
<p>This page reloads itself every minute.</p>
</html>
""".encode("utf-8")


class _Notice(BaseHTTPRequestHandler):
    page = b""
    # An idle or stalled connection gives up its thread after this long.
    timeout = 10

    def do_GET(self) -> None:
        self._answer(self.page)

    def do_HEAD(self) -> None:
        self._answer(b"")

    def _answer(self, body: bytes) -> None:
        self.send_response(503)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(self.page)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Retry-After", "60")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        # No access log: on the device every line is a write to its storage.
        pass


def notice_server(page: bytes, host: str, port: int, certfile: Path | None = None,
                  keyfile: Path | None = None) -> ThreadingHTTPServer:
    """A server answering every request with page and status 503, not yet serving."""
    handler = type("Notice", (_Notice,), {"page": page})
    server = ThreadingHTTPServer((host, port), handler)
    if certfile is not None:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(certfile, keyfile)
        # The handshake happens in each connection's own thread, so one slow
        # client cannot hold up the others.
        server.socket = context.wrap_socket(server.socket, server_side=True, do_handshake_on_connect=False)
    return server


if __name__ == "__main__":
    problems = mismatches(read(Path(sys.argv[1])))
    for problem in problems:
        print(f"{problem}.", file=sys.stderr)
    sys.exit(1 if problems else 0)
