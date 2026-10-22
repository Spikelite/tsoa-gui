"""The server stops promptly when told to, even with a browser's stream open.

A browser's event stream never ends on its own, so without a limit on the
graceful shutdown the supervisor's restart left the old server stopped but
never gone. Signals only work this way on POSIX systems.
"""
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx
import pytest

from tsoa_gui.__main__ import SHUTDOWN_TIMEOUT_S

SERVER = Path(__file__).resolve().parents[1]


@pytest.mark.skipif(sys.platform == "win32", reason="needs POSIX signals")
def test_the_server_exits_on_sigterm_with_a_stream_open():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    server = subprocess.Popen([sys.executable, "-m", "tsoa_gui", "--mock", "--port", str(port)], cwd=SERVER,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        deadline = time.monotonic() + 15
        while True:
            try:
                httpx.get(f"http://127.0.0.1:{port}/api/health", timeout=1)
                break
            except httpx.HTTPError:
                assert time.monotonic() < deadline, "the server never started"
                time.sleep(0.2)
        with httpx.stream("GET", f"http://127.0.0.1:{port}/api/system/events", timeout=10) as stream:
            # Held, not discarded: dropping the iterator would close the stream
            # before the signal, and the test would no longer test anything.
            lines = stream.iter_lines()
            assert next(lines).startswith(("retry:", "event:"))
            os.kill(server.pid, signal.SIGTERM)
            # Uvicorn re-raises the signal once it has shut down, so the exit
            # is SIGTERM's own; what matters is that it comes, and in time.
            assert server.wait(timeout=SHUTDOWN_TIMEOUT_S + 5) in (0, -signal.SIGTERM)
    finally:
        if server.poll() is None:
            server.kill()
            server.wait()
