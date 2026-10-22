"""Make the self-signed certificate the server uses for HTTPS on a device.

python -m tsoa_gui.certificate DIR [ADDRESS ...]

Writes DIR/key.pem and DIR/cert.pem. The certificate names the device's host
name and the addresses given, so a proxy in front of the device can verify
it. It uses the cryptography package that Venus OS already ships.
"""
import datetime
import ipaddress
import os
import socket
import sys
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

VALID_DAYS = 3650
# A device without a real-time clock can boot with its clock in the past, so
# the certificate is valid from well before it was made.
VALID_FROM = datetime.datetime(2020, 1, 1, tzinfo=datetime.timezone.utc)


def make(directory: Path, addresses: list[str], hostname: str | None = None) -> None:
    hostname = hostname or socket.gethostname()
    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, hostname)])
    ips = dict.fromkeys(ipaddress.ip_address(a) for a in ["127.0.0.1", *addresses])
    alternatives = [x509.DNSName(hostname), x509.DNSName("localhost"), *(x509.IPAddress(ip) for ip in ips)]
    certificate = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(VALID_FROM)
        .not_valid_after(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=VALID_DAYS))
        .add_extension(x509.SubjectAlternativeName(alternatives), critical=False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    directory.mkdir(parents=True, exist_ok=True)
    key_pem = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    # Created readable by its owner only, before the key is written into it.
    descriptor = os.open(directory / "key.pem", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "wb") as key_file:
        key_file.write(key_pem)
    (directory / "cert.pem").write_bytes(certificate.public_bytes(serialization.Encoding.PEM))


def main(argv: list[str] | None = None) -> None:
    args = sys.argv[1:] if argv is None else argv
    if not args:
        sys.exit(__doc__)
    make(Path(args[0]), args[1:])


if __name__ == "__main__":
    main()
