"""The release archive and the scripts that install it on a device.

The scripts are tested against a stand-in for the device's directories,
which the environment variables they honor point into a temporary tree.
They need a POSIX shell with symbolic links, so they are skipped on Windows.
"""
import importlib.util
import os
import shutil
import subprocess
import sys
import tarfile
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


def staged(tmp_path: Path, version: str) -> Path:
    client = tmp_path / "client"
    client.mkdir(exist_ok=True)
    (client / "index.html").write_text("<!doctype html><title>client</title>", encoding="utf-8")
    directory = tmp_path / f"tsoa-gui-{version}"
    build.stage(directory, version, client=client, vendor_into=lambda target: target.mkdir(parents=True))
    return directory


def test_the_archive_holds_the_release_with_nothing_of_who_built_it(tmp_path: Path):
    path = build.archive(staged(tmp_path, "1.0.0"), tmp_path)
    with tarfile.open(path) as tar:
        members = {m.name: m for m in tar.getmembers()}
    top = "tsoa-gui-1.0.0"
    for name in ("VERSION", "tested.json", "LICENSE", "app/client/index.html", "app/tsoa_gui/__main__.py",
                 "install.sh", "boot.sh", "uninstall.sh", "service/run", "service/log/run"):
        assert f"{top}/{name}" in members, name
    assert members[f"{top}/install.sh"].mode == 0o755
    assert members[f"{top}/VERSION"].mode == 0o644
    assert all(m.uname == "" and m.gname == "" and m.uid == 0 for m in members.values())
    assert not any("__pycache__" in name for name in members)


def run_script(script: Path, device: Path, stdin: str = "", env: dict[str, str] | None = None,
               check: bool = True) -> subprocess.CompletedProcess:
    env = dict(os.environ, TSOA_GUI_ROOT=str(device / "data" / "tsoa-gui"), RC_LOCAL=str(device / "data" / "rc.local"),
               SERVICE_DIR=str(device / "service"), PYTHON=sys.executable, **(env or {}))
    return subprocess.run(["sh", str(script)], env=env, input=stdin, capture_output=True, text=True, check=check)


@posix_shell
def test_install_update_and_removal(tmp_path: Path):
    device = tmp_path / "device"
    (device / "data").mkdir(parents=True)
    (device / "service").mkdir()
    (device / "data" / "rc.local").write_text("#!/bin/bash\necho first\n", encoding="utf-8")
    root = device / "data" / "tsoa-gui"
    line = f"sh {root}/current/boot.sh  # tsoa-gui"

    run_script(staged(tmp_path, "1") / "install.sh", device)
    assert os.readlink(root / "current") == "releases/1"
    assert (root / "etc" / "tsoa-gui.conf").read_text() == "PORT=8088\n"
    certificate = x509.load_pem_x509_certificate((root / "tls" / "cert.pem").read_bytes())
    assert certificate.not_valid_before_utc.year == 2020
    assert (root / "tls" / "key.pem").stat().st_mode & 0o077 == 0
    assert (device / "data" / "rc.local").read_text().splitlines() == ["#!/bin/bash", "echo first", line]
    assert (device / "service" / "tsoa-gui" / "run").is_file()
    assert (device / "service" / "tsoa-gui" / "log" / "run").is_file()
    assert not (device / "service" / "tsoa-gui").is_symlink()

    (root / "etc" / "tsoa-gui.conf").write_text("PORT=9443\n")
    key = (root / "tls" / "key.pem").read_bytes()
    run_script(staged(tmp_path, "2") / "install.sh", device)
    run_script(staged(tmp_path, "3") / "install.sh", device)
    assert os.readlink(root / "current") == "releases/3"
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


def supervised_update(tmp_path: Path, *works: str) -> tuple[subprocess.CompletedProcess, list[str]]:
    """Install once, then update with a supervisor running the old release."""
    device = tmp_path / "device"
    (device / "data").mkdir(parents=True)
    (device / "service").mkdir()
    run_script(staged(tmp_path, "1") / "install.sh", device)

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
    result = run_script(staged(tmp_path, "2") / "install.sh", device, env=env, check=False)
    return result, (state / "calls").read_text().split("\n")[:-1]


@posix_shell
def test_an_update_restarts_the_running_service(tmp_path: Path):
    result, calls = supervised_update(tmp_path, "term-works")
    assert result.returncode == 0
    assert calls == [f"-t {tmp_path / 'device' / 'service' / 'tsoa-gui'}"]


@posix_shell
def test_an_old_process_that_will_not_stop_is_killed(tmp_path: Path):
    result, calls = supervised_update(tmp_path, "kill-works")
    assert result.returncode == 0
    assert [call.split()[0] for call in calls] == ["-t", "-k"]
    assert "did not stop" in result.stderr


@posix_shell
def test_an_update_that_leaves_the_service_down_says_so(tmp_path: Path):
    result, calls = supervised_update(tmp_path)
    assert result.returncode == 1
    assert [call.split()[0] for call in calls] == ["-t", "-k"]
    assert "not running after the update" in result.stderr
