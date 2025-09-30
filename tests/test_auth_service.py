import json
from pathlib import Path

import pytest

from backend.service.auth_service import KolibriAuthService, load_hmac_key


def test_load_hmac_key_hex_and_binary(tmp_path: Path) -> None:
    hex_path = tmp_path / "hex.key"
    hex_path.write_text("aabbccdd\n")
    key = load_hmac_key(hex_path)
    assert key == bytes.fromhex("aabbccdd")

    raw_path = tmp_path / "raw.key"
    raw_path.write_bytes(b"kolibri-secret")
    assert load_hmac_key(raw_path) == b"kolibri-secret"


class FakeClock:
    def __init__(self, start: int) -> None:
        self.current = start

    def __call__(self) -> float:
        return float(self.current)

    def advance(self, seconds: int) -> None:
        self.current += seconds


def test_session_lifecycle() -> None:
    clock = FakeClock(1_000)
    service = KolibriAuthService(b"0123456789abcdef", access_ttl=10, refresh_ttl=30, time_source=clock)

    tokens = service.create_session("ui")
    assert tokens.refresh_token != tokens.access_token
    assert tokens.expires_at == pytest.approx(1_010)

    payload = tokens.access_token.split(".")[1]
    body = json.loads(base64_url_decode(payload))
    assert body["type"] == "access"

    clock.advance(5)
    refreshed = service.refresh_session(tokens.refresh_token)
    assert refreshed.expires_at == pytest.approx(1_015)
    assert refreshed.refresh_token != tokens.refresh_token

    clock.advance(40)
    with pytest.raises(ValueError):
        service.refresh_session(tokens.refresh_token)


def base64_url_decode(value: str) -> bytes:
    import base64

    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))
