"""Write the system model's JSON Schema, which the client's types are generated from.

python -m tsoa_gui.schema [PATH]    (default: client/src/model/system.schema.json)
"""
import json
import sys
from pathlib import Path
from typing import Any

from .model import System

SCHEMA_FILE = Path(__file__).resolve().parents[2] / "client" / "src" / "model" / "system.schema.json"


def schema() -> dict[str, Any]:
    # Serialization mode describes what the server sends, which is what the
    # browser receives.
    result = System.model_json_schema(mode="serialization")
    _drop_property_titles(result)
    return result


def _drop_property_titles(node: Any) -> None:
    # pydantic titles every field ("Power W"), and the TypeScript generator
    # would make each title a type of its own. Types are named by $defs.
    if isinstance(node, dict):
        for prop in node.get("properties", {}).values():
            prop.pop("title", None)
        for value in node.values():
            _drop_property_titles(value)
    elif isinstance(node, list):
        for value in node:
            _drop_property_titles(value)


def schema_text() -> str:
    return json.dumps(schema(), indent=2) + "\n"


def main(argv: list[str] | None = None) -> None:
    args = sys.argv[1:] if argv is None else argv
    path = Path(args[0]) if args else SCHEMA_FILE
    path.write_text(schema_text(), encoding="utf-8", newline="\n")
    print("wrote", path)


if __name__ == "__main__":
    main()
