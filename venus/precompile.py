"""Compile a release's Python files to bytecode, for install.sh.

python3 precompile.py DIR ...

The server runs as an account that cannot write into the release, so
without this it would compile everything again, in memory, at every start.
Venus OS leaves compileall and py_compile out of its Python, so this does
what they do with the import system's own functions, which every Python has.
A file that does not compile is skipped: the server then compiles it itself.
"""
import importlib.util
import os
import sys
from importlib import _bootstrap_external


def precompile(path: str) -> None:
    with open(path, "rb") as file:
        source = file.read()
    code = compile(source, path, "exec", dont_inherit=True)
    stat = os.stat(path)
    # What the import system checks before it uses the file: the source's
    # modification time and size.
    data = _bootstrap_external._code_to_timestamp_pyc(code, stat.st_mtime, stat.st_size)
    cached = importlib.util.cache_from_source(path)
    os.makedirs(os.path.dirname(cached), exist_ok=True)
    temporary = f"{cached}.{os.getpid()}"
    with open(temporary, "wb") as file:
        file.write(data)
    os.replace(temporary, cached)


def main(directories: list[str]) -> int:
    skipped = 0
    for directory in directories:
        for parent, _, names in os.walk(directory):
            for name in names:
                if name.endswith(".py"):
                    try:
                        precompile(os.path.join(parent, name))
                    except (OSError, SyntaxError, ValueError):
                        skipped += 1
    return skipped


if __name__ == "__main__":
    main(sys.argv[1:])
