import json

import pytest
from pydantic import ValidationError

from tsoa_gui.model import Battery, Flow, System
from tsoa_gui.schema import SCHEMA_FILE, schema, schema_text


def test_the_schema_file_matches_the_model():
    # The client's types are generated from this file, so a model change has
    # to be followed by `python -m tsoa_gui.schema` and `npm run model`.
    assert SCHEMA_FILE.read_text(encoding="utf-8") == schema_text()


def test_every_field_is_required_in_what_the_server_sends():
    battery = schema()["$defs"]["Battery"]
    assert set(battery["required"]) == set(battery["properties"])


def test_no_property_carries_a_title():
    def titled_properties(node):
        if isinstance(node, dict):
            yield from (name for name, prop in node.get("properties", {}).items() if "title" in prop)
            for value in node.values():
                yield from titled_properties(value)
        elif isinstance(node, list):
            for value in node:
                yield from titled_properties(value)

    assert list(titled_properties(schema())) == []


def test_an_unknown_reading_is_sent_as_null_not_left_out():
    sent = json.loads(System(live=True, battery=Battery(status="offline")).model_dump_json())
    assert sent["battery"]["soc_percent"] is None
    assert sent["grid"] is None


def test_unknown_fields_are_refused():
    with pytest.raises(ValidationError):
        Battery(status="normal", charge=50)


def test_a_flow_is_never_negative():
    with pytest.raises(ValidationError):
        Flow(source="solar", target="battery", power_w=-1)
