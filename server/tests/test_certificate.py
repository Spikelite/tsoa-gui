import ipaddress
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives.serialization import load_pem_private_key

from tsoa_gui.certificate import make


def test_the_certificate_names_the_device_and_its_addresses(tmp_path: Path):
    make(tmp_path, ["192.0.2.10", "192.0.2.10"], hostname="device.example.com")
    certificate = x509.load_pem_x509_certificate((tmp_path / "cert.pem").read_bytes())
    names = certificate.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    assert names.get_values_for_type(x509.DNSName) == ["device.example.com", "localhost"]
    assert names.get_values_for_type(x509.IPAddress) == [
        ipaddress.ip_address("127.0.0.1"), ipaddress.ip_address("192.0.2.10")]
    assert certificate.not_valid_before_utc.year == 2020
    assert certificate.not_valid_after_utc.year >= 2035


def test_the_key_matches_the_certificate(tmp_path: Path):
    make(tmp_path, [], hostname="device.example.com")
    key = load_pem_private_key((tmp_path / "key.pem").read_bytes(), password=None)
    certificate = x509.load_pem_x509_certificate((tmp_path / "cert.pem").read_bytes())
    assert key.public_key().public_numbers() == certificate.public_key().public_numbers()
