"""Build the archive that installs tsoa-gui on a Venus OS device.

python venus/build.py [--version VERSION] [--out DIR] [--notes FILE]

Run it after `npm run build` in client/. The archive holds the server, the
built client, the server's pure-Python dependencies, the scripts that
install, start and remove it, the license, and the Python and pydantic
versions it was tested with. Beside it goes its SHA-256, in the format
`sha256sum -c` reads.

Built from the same commit and the same built client, the archive is the
same byte for byte on any machine: the dependencies are checked against the
hashes in server/requirements-hashes.txt, and every date in it is the
commit's.
"""
import argparse
import gzip
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from collections.abc import Callable
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
VENUS = REPO / "venus"
GITHUB = "https://github.com/Spikelite/tsoa-gui"
# The Python that Venus OS ships, which a release is built and tested for.
PYTHON = "3.12"
SCRIPTS = ["install.sh", "rollback.sh", "uninstall.sh", "boot.sh", "service/run", "service/log/run"]
# Run by install.sh with python3, so not executable themselves.
HELPERS = ["precompile.py"]
# What install.sh accepts as a version, since it names a directory there.
VERSION_PATTERN = re.compile(r"[0-9A-Za-z][0-9A-Za-z._+-]*")
# Written by pip as it installs, and different from one pip to the next; the
# device never uninstalls a package, so it never reads them.
PIP_RECORDS = ["INSTALLER", "REQUESTED", "RECORD", "direct_url.json"]


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


def source_date() -> int:
    """The time every file in the archive carries: SOURCE_DATE_EPOCH, or the commit's."""
    if "SOURCE_DATE_EPOCH" in os.environ:
        return int(os.environ["SOURCE_DATE_EPOCH"])
    committed = subprocess.run(["git", "log", "-1", "--format=%ct"], cwd=REPO, capture_output=True, text=True)
    if committed.returncode != 0:
        sys.exit(f"git cannot give the commit's date, so set SOURCE_DATE_EPOCH: {committed.stderr.strip()}")
    return int(committed.stdout)


def vendor(target: Path) -> None:
    # Pure-Python wheels only, so a release built on any machine runs on the
    # device; --isolated keeps the builder's own pip settings out of it.
    subprocess.run([
        sys.executable, "-m", "pip", "install", "--isolated", "--quiet", "--disable-pip-version-check",
        "--target", str(target), "--no-deps", "--no-compile", "--only-binary=:all:",
        "--platform", "any", "--implementation", "py", "--abi", "none", "--python-version", PYTHON,
        "--require-hashes", "-r", str(REPO / "server" / "requirements-hashes.txt"),
    ], check=True)
    shutil.rmtree(target / "bin", ignore_errors=True)  # console scripts, unused on the device
    for record in PIP_RECORDS:
        for path in target.glob(f"*.dist-info/{record}"):
            path.unlink()


def stage(directory: Path, version: str, client: Path = REPO / "client" / "dist",
          vendor_into: Callable[[Path], None] = vendor) -> None:
    if not VERSION_PATTERN.fullmatch(version):
        sys.exit(f"{version!r} cannot be a version: use letters, digits and . _ + - only")
    if not (client / "index.html").is_file():
        sys.exit(f"{client} has no built client: run `npm run build` in client/ first")
    shutil.copytree(REPO / "server" / "tsoa_gui", directory / "app" / "tsoa_gui",
                    ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copytree(client, directory / "app" / "client")
    vendor_into(directory / "vendor")
    for script in SCRIPTS + HELPERS:
        (directory / script).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(VENUS / script, directory / script)
    shutil.copyfile(REPO / "LICENSE", directory / "LICENSE")
    (directory / "VERSION").write_text(version + "\n", encoding="utf-8", newline="\n")
    (directory / "tested.json").write_text(json.dumps(tested_versions(), indent=2) + "\n",
                                           encoding="utf-8", newline="\n")


def archive(directory: Path, out: Path, date: int = 0) -> Path:
    def normalize(info: tarfile.TarInfo) -> tarfile.TarInfo:
        executable = info.isdir() or info.name.split("/", 1)[-1] in SCRIPTS
        info.mode = 0o755 if executable else 0o644
        # Nothing about the machine or the account that built it, or when.
        info.uid = info.gid = 0
        info.uname = info.gname = ""
        info.mtime = date
        return info

    path = out / f"{directory.name}.tar.gz"
    # tarfile adds a directory's entries in sorted order; gzip is told the
    # date and no file name, which it would otherwise take from the build.
    with open(path, "wb") as file, gzip.GzipFile(filename="", mode="wb", fileobj=file, mtime=date) as zipped:
        with tarfile.open(fileobj=zipped, mode="w", format=tarfile.PAX_FORMAT) as tar:
            tar.add(directory, arcname=directory.name, filter=normalize)
    return path


def checksum(path: Path) -> Path:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    written = path.with_name(path.name + ".sha256")
    written.write_text(f"{digest}  {path.name}\n", encoding="utf-8", newline="\n")
    return written


def notes(version: str, path: Path) -> str:
    """The release's notes on GitHub, ahead of the list of changes GitHub adds."""
    tested = tested_versions()
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    guide = f"{GITHUB}/blob/v{version}/docs/install.md"
    return f"""tsoa-gui {version} for Venus OS devices. To install it, or to update an earlier release, follow the [install guide]({guide}).

This release was tested with Python {tested["python"]} and pydantic {tested["pydantic"]}, as Venus OS ships them. On a device with other versions, after a firmware update for example, it does not run: it shows a page saying a newer release is needed.

SHA-256 of `{path.name}`:

    {digest}
"""


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python venus/build.py", description=__doc__.splitlines()[0])
    parser.add_argument("--version", help="the release's version (default: dev- and the commit)")
    parser.add_argument("--out", type=Path, default=REPO / "dist", help="where to write the archive (default: dist/)")
    parser.add_argument("--notes", type=Path, metavar="FILE", help="also write the release's notes to FILE")
    args = parser.parse_args(argv)
    version = args.version or default_version()
    with tempfile.TemporaryDirectory() as temporary:
        directory = Path(temporary) / f"tsoa-gui-{version}"
        stage(directory, version)
        args.out.mkdir(parents=True, exist_ok=True)
        path = archive(directory, args.out, source_date())
    checksum(path)
    if args.notes is not None:
        args.notes.write_text(notes(version, path), encoding="utf-8", newline="\n")
    print(path)


if __name__ == "__main__":
    main()
