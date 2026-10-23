"""The release archive and the scripts that install it on a device.

The scripts are tested against a stand-in for the device's directories,
which the environment variables they honor point into a temporary tree.
They need a POSIX shell with symbolic links, so they are skipped on Windows.
"""
import hashlib
import importlib.util
import json
import os
import shutil
import socket
import subprocess
import sys
import tarfile
import threading
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
from cryptography import x509

REPO = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("build", REPO / "venus" / "build.py")
build = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(build)

posix_shell = pytest.mark.skipif(sys.platform == "win32" or shutil.which("sh") is None,
                                 reason="needs a POSIX shell with symbolic links")


def test_the_tested_versions_come_from_what_venus_ships():
    assert build.tested_versions() == {"python": "3.12", "pydantic": "2.7.4"}


def pins(name: str) -> dict[str, str]:
    found = {}
    for line in (REPO / "server" / name).read_text(encoding="utf-8").splitlines():
        requirement, separator, version = line.split(" ")[0].partition("==")
        if separator and not line.startswith("#"):
            found[requirement] = version
    return found


def test_every_package_a_release_vendors_has_its_hash_and_the_same_version():
    assert pins("requirements-hashes.txt") == pins("requirements.txt")
    for line in (REPO / "server" / "requirements-hashes.txt").read_text(encoding="utf-8").splitlines():
        if not line.startswith("#"):
            assert " --hash=sha256:" in line, line


def staged(tmp_path: Path, version: str, tested: dict[str, str] | None = None) -> Path:
    client = tmp_path / "client"
    client.mkdir(parents=True, exist_ok=True)
    (client / "index.html").write_text("<!doctype html><title>client</title>", encoding="utf-8")
    directory = tmp_path / f"tsoa-gui-{version}"
    build.stage(directory, version, client=client, vendor_into=lambda target: target.mkdir(parents=True))
    if tested is not None:
        (directory / "tested.json").write_text(json.dumps(tested), encoding="utf-8")
    return directory


def test_the_archive_holds_the_release_with_nothing_of_who_built_it(tmp_path: Path):
    path = build.archive(staged(tmp_path, "1.0.0"), tmp_path, date=1700000000)
    with tarfile.open(path) as tar:
        members = {m.name: m for m in tar.getmembers()}
    top = "tsoa-gui-1.0.0"
    for name in ("VERSION", "tested.json", "LICENSE", "app/client/index.html", "app/tsoa_gui/__main__.py",
                 "install.sh", "rollback.sh", "boot.sh", "uninstall.sh", "service/run", "service/log/run",
                 "precompile.py"):
        assert f"{top}/{name}" in members, name
    assert members[f"{top}/install.sh"].mode == 0o755
    assert members[f"{top}/rollback.sh"].mode == 0o755
    assert members[f"{top}/VERSION"].mode == 0o644
    assert members[f"{top}/precompile.py"].mode == 0o644
    assert all(m.uname == "" and m.gname == "" and m.uid == 0 for m in members.values())
    assert all(m.mtime == 1700000000 for m in members.values())
    assert not any("__pycache__" in name for name in members)


def test_the_same_release_makes_the_same_archive(tmp_path: Path):
    directory = staged(tmp_path, "1.0.0")
    first, second = tmp_path / "first", tmp_path / "second"
    first.mkdir()
    second.mkdir()
    built = build.archive(directory, first, date=1700000000).read_bytes()
    # Files touched since have new dates of their own, which must not show.
    os.utime(directory / "VERSION", (1800000000, 1800000000))
    assert build.archive(directory, second, date=1700000000).read_bytes() == built


def test_a_version_that_cannot_name_a_directory_is_refused(tmp_path: Path):
    for version in ("", "../up", ".hidden", "1.0 beta"):
        with pytest.raises(SystemExit):
            staged(tmp_path, version)


def test_the_checksum_and_notes_name_the_archive(tmp_path: Path):
    path = build.archive(staged(tmp_path, "1.0.0"), tmp_path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    assert build.checksum(path).read_text() == f"{digest}  tsoa-gui-1.0.0.tar.gz\n"
    notes = build.notes("1.0.0", path)
    assert digest in notes
    assert "/blob/v1.0.0/docs/install.md" in notes
    assert "Python 3.12 and pydantic 2.7.4" in notes


class Health(BaseHTTPRequestHandler):
    status = 200

    def do_GET(self) -> None:
        self.send_response(self.server.status)
        self.end_headers()

    def log_message(self, format: str, *args: object) -> None:
        pass


@pytest.fixture
def health() -> Iterator[ThreadingHTTPServer]:
    """The server's health check, answering with its .status."""
    server = ThreadingHTTPServer(("127.0.0.1", 0), Health)
    server.status = 200
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield server
    server.shutdown()
    server.server_close()


def unused_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def run_script(script: Path, device: Path, stdin: str = "", env: dict[str, str] | None = None,
               check: bool = True, health: ThreadingHTTPServer | None = None) -> subprocess.CompletedProcess:
    url = f"http://127.0.0.1:{health.server_port if health else unused_port()}/api/health"
    env = dict(os.environ, TSOA_GUI_ROOT=str(device / "data" / "tsoa-gui"), RC_LOCAL=str(device / "data" / "rc.local"),
               SERVICE_DIR=str(device / "service"), PYTHON=sys.executable, HEALTH_URL=url, START_WAIT_S="0",
               RUN_AS=f"{os.getuid()}:{os.getgid()}", **(env or {}))
    return subprocess.run(["sh", str(script)], env=env, input=stdin, capture_output=True, text=True, check=check)


def new_device(tmp_path: Path) -> Path:
    device = tmp_path / "device"
    (device / "data").mkdir(parents=True)
    (device / "service").mkdir()
    return device


@posix_shell
def test_install_update_and_removal(tmp_path: Path, health: ThreadingHTTPServer):
    device = new_device(tmp_path)
    (device / "data" / "rc.local").write_text("#!/bin/bash\necho first\n", encoding="utf-8")
    root = device / "data" / "tsoa-gui"
    line = f"sh {root}/current/boot.sh  # tsoa-gui"

    result = run_script(staged(tmp_path, "1") / "install.sh", device, health=health)
    assert "tsoa-gui 1 is installed and running" in result.stdout
    assert os.readlink(root / "current") == "releases/1"
    assert not (root / "previous").exists()
    assert (root / "etc" / "tsoa-gui.conf").read_text() == "PORT=8088\n"
    certificate = x509.load_pem_x509_certificate((root / "tls" / "cert.pem").read_bytes())
    assert certificate.not_valid_before_utc.year == 2020
    assert (root / "tls" / "key.pem").stat().st_mode & 0o077 == 0
    assert (root / "var").stat().st_mode & 0o777 == 0o700
    assert (root / "var").stat().st_uid == os.getuid()
    assert uses_its_bytecode(root / "releases" / "1" / "app", "tsoa_gui.versions")
    assert (device / "data" / "rc.local").read_text().splitlines() == ["#!/bin/bash", "echo first", line]
    assert (device / "service" / "tsoa-gui" / "run").is_file()
    assert (device / "service" / "tsoa-gui" / "log" / "run").is_file()
    assert not (device / "service" / "tsoa-gui").is_symlink()

    (root / "etc" / "tsoa-gui.conf").write_text("PORT=9443\n")
    key = (root / "tls" / "key.pem").read_bytes()
    run_script(staged(tmp_path, "2") / "install.sh", device, health=health)
    run_script(staged(tmp_path, "3") / "install.sh", device, health=health)
    assert os.readlink(root / "current") == "releases/3"
    assert os.readlink(root / "previous") == "releases/2"
    assert sorted(p.name for p in (root / "releases").iterdir()) == ["2", "3"]
    assert (root / "etc" / "tsoa-gui.conf").read_text() == "PORT=9443\n"
    assert (root / "tls" / "key.pem").read_bytes() == key
    assert (device / "data" / "rc.local").read_text().count(line) == 1

    run_script(root / "current" / "uninstall.sh", device, stdin="n\n")
    assert (device / "data" / "rc.local").read_text().splitlines() == ["#!/bin/bash", "echo first"]
    assert not (device / "service" / "tsoa-gui").exists()
    assert root.exists()
    run_script(staged(tmp_path, "4") / "uninstall.sh", device, stdin="y\n")
    assert not root.exists()


def uses_its_bytecode(app: Path, module: str) -> bool:
    """Whether importing module from app loads it from the bytecode compiled beside it."""
    # Run from app, so that the source tree's own copy is not the one found.
    imported = subprocess.run([sys.executable, "-v", "-c", f"import {module}"], capture_output=True, text=True,
                              cwd=app, env=dict(os.environ, PYTHONPATH=str(app), PYTHONDONTWRITEBYTECODE="1"))
    return f"code object from '{app}" in imported.stderr and "__pycache__" in imported.stderr


def test_precompiling_needs_neither_compileall_nor_py_compile(tmp_path: Path):
    (tmp_path / "app").mkdir()
    (tmp_path / "app" / "example_module.py").write_text("VALUE = 1\n")
    (tmp_path / "app" / "broken.py").write_text("def (\n")
    # As on Venus OS, whose Python leaves both modules out.
    script = ("import runpy, sys; sys.modules['compileall'] = sys.modules['py_compile'] = None; "
              f"sys.argv = ['precompile.py', {str(tmp_path / 'app')!r}]; "
              f"runpy.run_path({str(REPO / 'venus' / 'precompile.py')!r}, run_name='__main__')")
    subprocess.run([sys.executable, "-c", script], check=True)
    assert uses_its_bytecode(tmp_path / "app", "example_module")
    assert not uses_its_bytecode(tmp_path / "app", "broken")


FAKE_IP = r"""#!/bin/sh
echo '1: lo    inet 127.0.0.1/8 scope host lo\       valid_lft forever preferred_lft forever'
echo '2: eth0    inet 192.0.2.10/24 brd 192.0.2.255 scope global eth0\       valid_lft forever preferred_lft forever'
echo '2: eth0    inet 169.254.7.9/16 brd 169.254.255.255 scope link eth0:ll\       valid_lft forever preferred_lft forever'
"""


@posix_shell
def test_the_addresses_to_open_leave_out_loopback_and_link_local(tmp_path: Path, health: ThreadingHTTPServer):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "ip").write_text(FAKE_IP)
    (bin_dir / "ip").chmod(0o755)
    device = new_device(tmp_path)
    env = {"PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"}
    result = run_script(staged(tmp_path, "1") / "install.sh", device, env=env, health=health)
    assert [line.strip() for line in result.stdout.splitlines()[1:]] == ["https://192.0.2.10:8088"]
    certificate = x509.load_pem_x509_certificate((device / "data" / "tsoa-gui" / "tls" / "cert.pem").read_bytes())
    named = [str(ip) for ip in certificate.extensions.get_extension_for_class(
        x509.SubjectAlternativeName).value.get_values_for_type(x509.IPAddress)]
    assert "192.0.2.10" in named
    assert not any(address.startswith("169.254.") for address in named)


@posix_shell
def test_installing_the_current_release_again_keeps_the_one_before(tmp_path: Path, health: ThreadingHTTPServer):
    device = new_device(tmp_path)
    root = device / "data" / "tsoa-gui"
    run_script(staged(tmp_path, "1") / "install.sh", device, health=health)
    run_script(staged(tmp_path, "2") / "install.sh", device, health=health)
    run_script(staged(tmp_path / "again", "2") / "install.sh", device, health=health)
    assert os.readlink(root / "current") == "releases/2"
    assert os.readlink(root / "previous") == "releases/1"
    assert sorted(p.name for p in (root / "releases").iterdir()) == ["1", "2"]


@posix_shell
def test_an_install_without_a_record_of_the_release_before_keeps_it(tmp_path: Path, health: ThreadingHTTPServer):
    # As an earlier installer left it: two releases, and no previous link.
    device = new_device(tmp_path)
    root = device / "data" / "tsoa-gui"
    run_script(staged(tmp_path, "1") / "install.sh", device, health=health)
    run_script(staged(tmp_path, "2") / "install.sh", device, health=health)
    (root / "previous").unlink()
    run_script(staged(tmp_path / "again", "2") / "install.sh", device, health=health)
    assert os.readlink(root / "previous") == "releases/1"
    assert sorted(p.name for p in (root / "releases").iterdir()) == ["1", "2"]


@posix_shell
def test_going_back_and_forward_again(tmp_path: Path, health: ThreadingHTTPServer):
    device = new_device(tmp_path)
    root = device / "data" / "tsoa-gui"
    run_script(staged(tmp_path, "1") / "install.sh", device, health=health)
    run_script(staged(tmp_path, "2") / "install.sh", device, health=health)

    result = run_script(root / "current" / "rollback.sh", device, health=health)
    assert "tsoa-gui 1 is installed and running" in result.stdout
    assert os.readlink(root / "current") == "releases/1"
    assert os.readlink(root / "previous") == "releases/2"
    assert sorted(p.name for p in (root / "releases").iterdir()) == ["1", "2"]

    run_script(root / "current" / "rollback.sh", device, health=health)
    assert os.readlink(root / "current") == "releases/2"
    assert os.readlink(root / "previous") == "releases/1"


@posix_shell
def test_going_back_with_nothing_to_go_back_to_says_so(tmp_path: Path, health: ThreadingHTTPServer):
    device = new_device(tmp_path)
    root = device / "data" / "tsoa-gui"
    run_script(staged(tmp_path, "1") / "install.sh", device, health=health)
    result = run_script(root / "current" / "rollback.sh", device, check=False)
    assert result.returncode == 1
    assert "no earlier release" in result.stderr
    assert os.readlink(root / "current") == "releases/1"


@posix_shell
@pytest.mark.parametrize("version", ["", "..", "1/2"])
def test_a_release_without_a_proper_version_changes_nothing(tmp_path: Path, version: str):
    device = new_device(tmp_path)
    release = staged(tmp_path, "1")
    (release / "VERSION").write_text(version + "\n")
    result = run_script(release / "install.sh", device, check=False)
    assert result.returncode == 1
    assert "nothing was installed" in result.stderr
    assert list((device / "data").iterdir()) == []


@posix_shell
def test_a_release_not_tested_with_the_device_changes_nothing(tmp_path: Path, health: ThreadingHTTPServer):
    device = new_device(tmp_path)
    root = device / "data" / "tsoa-gui"
    run_script(staged(tmp_path, "1") / "install.sh", device, health=health)
    untested = staged(tmp_path, "2", tested={"python": "2.7", "pydantic": "2.7.4"})
    result = run_script(untested / "install.sh", device, check=False, health=health)
    assert result.returncode == 1
    assert "Python is 3.12, but this release was tested with 2.7" in result.stderr
    assert "nothing was changed" in result.stderr
    assert os.readlink(root / "current") == "releases/1"
    assert sorted(p.name for p in (root / "releases").iterdir()) == ["1"]


@posix_shell
def test_an_install_whose_server_does_not_answer_says_so(tmp_path: Path):
    result = run_script(staged(tmp_path, "1") / "install.sh", new_device(tmp_path), check=False)
    assert result.returncode == 1
    assert "did not answer on port 8088" in result.stderr
    assert "running" not in result.stdout


@posix_shell
def test_an_install_whose_server_shows_the_version_page_says_so(tmp_path: Path, health: ThreadingHTTPServer):
    health.status = 503
    result = run_script(staged(tmp_path, "1") / "install.sh", new_device(tmp_path), check=False, health=health)
    assert result.returncode == 1
    assert "HTTP status 503" in result.stderr


@posix_shell
def test_boot_returns_cleanly_even_with_no_release(tmp_path: Path):
    device = tmp_path / "device"
    (device / "service").mkdir(parents=True)
    empty = tmp_path / "missing-release"
    empty.mkdir()
    shutil.copyfile(REPO / "venus" / "boot.sh", empty / "boot.sh")
    run_script(empty / "boot.sh", device)
    assert not (device / "service" / "tsoa-gui").exists()


FAKE_SVSTAT = '#!/bin/sh\necho "$1: up (pid $(cat "$FAKE_STATE/pid")) 30 seconds"\n'
# Plays daemontools' svc: records each call, and moves to a new pid on -t or
# -k only when the scenario's flag file says that one works.
FAKE_SVC = """#!/bin/sh
echo "$*" >> "$FAKE_STATE/calls"
case "$1" in
    -t) [ -f "$FAKE_STATE/term-works" ] && echo $(( $(cat "$FAKE_STATE/pid") + 1 )) > "$FAKE_STATE/pid" ;;
    -k) [ -f "$FAKE_STATE/kill-works" ] && echo $(( $(cat "$FAKE_STATE/pid") + 1 )) > "$FAKE_STATE/pid" ;;
esac
exit 0
"""


def supervised_update(tmp_path: Path, health: ThreadingHTTPServer,
                      *works: str) -> tuple[subprocess.CompletedProcess, list[str]]:
    """Install once, then update with a supervisor running the old release."""
    device = new_device(tmp_path)
    run_script(staged(tmp_path, "1") / "install.sh", device, health=health)

    state, bin_dir = tmp_path / "supervisor", tmp_path / "bin"
    state.mkdir()
    bin_dir.mkdir()
    (state / "pid").write_text("100\n")
    for flag in works:
        (state / flag).touch()
    for name, text in (("svstat", FAKE_SVSTAT), ("svc", FAKE_SVC)):
        (bin_dir / name).write_text(text)
        (bin_dir / name).chmod(0o755)
    env = {"PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}", "FAKE_STATE": str(state), "RESTART_WAIT_S": "1"}
    result = run_script(staged(tmp_path, "2") / "install.sh", device, env=env, check=False, health=health)
    return result, (state / "calls").read_text().split("\n")[:-1]


@posix_shell
def test_an_update_restarts_the_running_service(tmp_path: Path, health: ThreadingHTTPServer):
    result, calls = supervised_update(tmp_path, health, "term-works")
    assert result.returncode == 0
    assert calls == [f"-t {tmp_path / 'device' / 'service' / 'tsoa-gui'}"]


@posix_shell
def test_an_old_process_that_will_not_stop_is_killed(tmp_path: Path, health: ThreadingHTTPServer):
    result, calls = supervised_update(tmp_path, health, "kill-works")
    assert result.returncode == 0
    assert [call.split()[0] for call in calls] == ["-t", "-k"]
    assert "did not stop" in result.stderr


@posix_shell
def test_an_update_that_leaves_the_service_down_says_so(tmp_path: Path, health: ThreadingHTTPServer):
    result, calls = supervised_update(tmp_path, health)
    assert result.returncode == 1
    assert [call.split()[0] for call in calls] == ["-t", "-k"]
    assert "not running after the update" in result.stderr
