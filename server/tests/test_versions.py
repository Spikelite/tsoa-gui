from tsoa_gui import versions


def test_matching_versions_pass():
    assert versions.mismatches(versions.found()) == []


def test_a_different_version_is_named():
    tested = dict(versions.found(), pydantic="1.0.0")
    [problem] = versions.mismatches(tested)
    assert "pydantic" in problem and "1.0.0" in problem
