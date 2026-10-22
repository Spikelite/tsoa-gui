"""The Python and pydantic a release was tested with, checked at startup.

On a Venus OS device both come with the firmware, and an update can change
them. A release records the versions it was built and tested for, and the
server refuses to serve on any others rather than run untested.
"""
import json
import platform
from pathlib import Path

import pydantic


def found() -> dict[str, str]:
    return {"python": ".".join(platform.python_version_tuple()[:2]), "pydantic": pydantic.VERSION}


def mismatches(tested: dict[str, str]) -> list[str]:
    here = found()
    return [f"{name} is {here.get(name)}, but this release was tested with {version}"
            for name, version in tested.items() if here.get(name) != version]


def read(path: Path) -> dict[str, str]:
    return json.loads(path.read_text(encoding="utf-8"))
