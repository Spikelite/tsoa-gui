"""What changed between two models, in the form the browser applies.

A patch has the model's shape but holds only what changed. Objects present
on both sides are compared key by key; anything else that changed, arrays
included, is sent whole. Unlike a JSON merge patch (RFC 7396), null means
the value is now null and never that a key was removed: the model always
has every key, and null is how it says a reading is not known.
"""
from typing import Any


def diff(old: dict[str, Any], new: dict[str, Any]) -> dict[str, Any]:
    patch: dict[str, Any] = {}
    for key, value in new.items():
        before = old.get(key)
        if key in old and before == value:
            continue
        if isinstance(before, dict) and isinstance(value, dict):
            patch[key] = diff(before, value)
        else:
            patch[key] = value
    return patch


def apply(model: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    """What the browser does with a patch, here so tests can check diff against it."""
    result = dict(model)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = apply(result[key], value)
        else:
            result[key] = value
    return result
