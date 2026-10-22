"""Build the archive that installs tsoa-gui on a Venus OS device.

python venus/build.py [--version VERSION] [--out DIR]

Run it after `npm run build` in client/. The archive holds the server, the
built client, the server's pure-Python dependencies, the scripts that
install, start and remove it, the license, and the Python and pydantic
versions it was tested with.
"""
import argparse
import json
import shutil
import subprocess
import sys
import tarfile
import tempfile
from collections.abc import Callable
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
VENUS = REPO / "venus"
# The Python that Venus OS ships, which a release is built and tested for.
PYTHON = "3.12"
SCRIPTS = ["install.sh", "uninstall.sh", "boot.sh", "service/run", "service/log/run"]


def tested_versions() -> dict[str, str]:
    pins = {}
    for line in (REPO / "server" / "requirements-venus.txt").read_text(encoding="utf-8").splitlines():
        name, separator, version = line.partition("==")
        if separator and not line.startswith("#"):
            pins[name.strip()] = version.strip()
    return {"python": PYTHON, "pydantic": pins["pydantic"]}


def default_version() -> str:
    described = subprocess.run(["git", "describe", "--always", "--dirty"], cwd=REPO,
                               capture_output=True, text=True, check=True).stdout.strip()
    return f"dev-{described}"


def vendor(target: Path) -> None:
    # Pure-Python wheels only, so a release built on any machine runs on the
    # device; --isolated keeps the builder's own pip settings out of it.
    subprocess.run([
        sys.executable, "-m", "pip", "install", "--isolated", "--quiet", "--disable-pip-version-check",
        "--target", str(target), "--no-deps", "--no-compile", "--only-binary=:all:",
        "--platform", "any", "--implementation", "py", "--abi", "none", "--python-version", PYTHON,
        "-r", str(REPO / "server" / "requirements.txt"),
    ], check=True)
    shutil.rmtree(target / "bin", ignore_errors=True)  # console scripts, unused on the device


def stage(directory: Path, version: str, client: Path = REPO / "client" / "dist",
          vendor_into: Callable[[Path], None] = vendor) -> None:
    if not (client / "index.html").is_file():
        sys.exit(f"{client} has no built client: run `npm run build` in client/ first")
    shutil.copytree(REPO / "server" / "tsoa_gui", directory / "app" / "tsoa_gui",
                    ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copytree(client, directory / "app" / "client")
    vendor_into(directory / "vendor")
    for script in SCRIPTS:
        (directory / script).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(VENUS / script, directory / script)
    shutil.copyfile(REPO / "LICENSE", directory / "LICENSE")
    (directory / "VERSION").write_text(version + "\n", encoding="utf-8", newline="\n")
    (directory / "tested.json").write_text(json.dumps(tested_versions(), indent=2) + "\n",
                                           encoding="utf-8", newline="\n")


def archive(directory: Path, out: Path) -> Path:
    def normalize(info: tarfile.TarInfo) -> tarfile.TarInfo:
        executable = info.isdir() or info.name.split("/", 1)[-1] in SCRIPTS
        info.mode = 0o755 if executable else 0o644
        # Nothing about the machine or the account that built it.
        info.uid = info.gid = 0
        info.uname = info.gname = ""
        return info

    path = out / f"{directory.name}.tar.gz"
    with tarfile.open(path, "w:gz") as tar:
        tar.add(directory, arcname=directory.name, filter=normalize)
    return path


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python venus/build.py", description=__doc__.splitlines()[0])
    parser.add_argument("--version", help="the release's version (default: dev- and the commit)")
    parser.add_argument("--out", type=Path, default=REPO / "dist", help="where to write the archive (default: dist/)")
    args = parser.parse_args(argv)
    version = args.version or default_version()
    with tempfile.TemporaryDirectory() as temporary:
        directory = Path(temporary) / f"tsoa-gui-{version}"
        stage(directory, version)
        args.out.mkdir(parents=True, exist_ok=True)
        print(archive(directory, args.out))


if __name__ == "__main__":
    main()
