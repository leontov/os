"""Authentication service for Kolibri backend.

This module exposes a lightweight HTTP service that issues HMAC signed JWT
access tokens for the frontend.  The service keeps all logic self-contained to
avoid external dependencies.
"""

from __future__ import annotations

import base64
import dataclasses
import hmac
import hashlib
import json
import secrets
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Callable, Dict, Optional

__all__ = [
    "SessionTokens",
    "KolibriAuthService",
    "KolibriAuthHTTPServer",
    "KolibriAuthRequestHandler",
    "load_hmac_key",
]


@dataclasses.dataclass
class SessionTokens:
    """Container with issued tokens and expiry metadata."""

    access_token: str
    refresh_token: str
    expires_at: float


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * ((4 - len(data) % 4) % 4)
    return base64.urlsafe_b64decode((data + padding).encode("ascii"))


def load_hmac_key(path: str | Path) -> bytes:
    """Loads an HMAC key from *path*.

    The loader accepts either hexadecimal strings (with optional whitespace) or
    raw binary data.  The resulting key must be non-empty and shorter than 64
    bytes to remain compatible with Kolibri's C components.
    """

    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"HMAC key file not found: {file_path}")

    data = file_path.read_bytes()
    if not data:
        raise ValueError("HMAC key file is empty")

    stripped = bytes(ch for ch in data if ch not in b" \t\r\n")
    if stripped and all(chr(b) in "0123456789abcdefABCDEF" for b in stripped):
        if len(stripped) % 2 != 0:
            raise ValueError("Hex encoded HMAC key must contain an even number of digits")
        key = bytes(int(stripped[i : i + 2], 16) for i in range(0, len(stripped), 2))
    else:
        key = data

    if not key:
        raise ValueError("HMAC key must not be empty")
    if len(key) > 64:
        raise ValueError("HMAC key is too large; expected at most 64 bytes")
    return key


class KolibriAuthService:
    """Issues and validates JWT tokens signed with HMAC-SHA256."""

    def __init__(
        self,
        key: bytes,
        access_ttl: int = 300,
        refresh_ttl: int = 3600,
        *,
        time_source: Callable[[], float] | None = None,
    ) -> None:
        if not key:
            raise ValueError("HMAC key is required")
        self._key = key
        self._access_ttl = max(access_ttl, 1)
        self._refresh_ttl = max(refresh_ttl, self._access_ttl)
        self._time = time_source or time.time

    def seconds_until(self, timestamp: float) -> int:
        """Returns the remaining whole seconds until *timestamp*."""

        remaining = int(timestamp - self._time())
        return remaining if remaining > 0 else 0

    def _sign(self, payload: Dict[str, Any]) -> tuple[str, float]:
        now = int(self._time())
        header = {"alg": "HS256", "typ": "JWT"}
        segments = [
            _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8")),
            _b64url_encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")),
        ]
        signing_input = ".".join(segments).encode("ascii")
        signature = hmac.new(self._key, signing_input, hashlib.sha256).digest()
        token = ".".join((*segments, _b64url_encode(signature)))
        exp = float(payload["exp"])
        return token, exp

    def _issue(self, token_type: str, session_id: str, ttl: int) -> tuple[str, float]:
        now = int(self._time())
        payload = {
            "sid": session_id,
            "type": token_type,
            "iat": now,
            "exp": now + ttl,
            "nonce": secrets.token_hex(8),
        }
        return self._sign(payload)

    def create_session(self, client_id: Optional[str] = None) -> SessionTokens:
        session_id = secrets.token_hex(16)
        if client_id:
            session_id = f"{session_id}:{client_id}"[:64]
        access, exp = self._issue("access", session_id, self._access_ttl)
        refresh, _ = self._issue("refresh", session_id, self._refresh_ttl)
        return SessionTokens(access, refresh, exp)

    def _verify(self, token: str, expected_type: str) -> Dict[str, Any]:
        try:
            header_b64, payload_b64, signature_b64 = token.split(".")
        except ValueError as exc:  # pragma: no cover - sanity guard
            raise ValueError("Malformed token") from exc

        signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
        signature = _b64url_decode(signature_b64)
        expected = hmac.new(self._key, signing_input, hashlib.sha256).digest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError("Invalid token signature")

        payload_bytes = _b64url_decode(payload_b64)
        payload = json.loads(payload_bytes.decode("utf-8"))
        if payload.get("type") != expected_type:
            raise ValueError("Unexpected token type")
        exp = int(payload.get("exp", 0))
        if exp <= int(self._time()):
            raise ValueError("Token expired")
        return payload

    def refresh_session(self, refresh_token: str) -> SessionTokens:
        payload = self._verify(refresh_token, "refresh")
        session_id = str(payload.get("sid"))
        access, exp = self._issue("access", session_id, self._access_ttl)
        refresh, _ = self._issue("refresh", session_id, self._refresh_ttl)
        return SessionTokens(access, refresh, exp)


class KolibriAuthHTTPServer(HTTPServer):
    """HTTP server embedding :class:`KolibriAuthService`."""

    def __init__(self, server_address: tuple[str, int], service: KolibriAuthService):
        super().__init__(server_address, KolibriAuthRequestHandler)
        self.service = service


class KolibriAuthRequestHandler(BaseHTTPRequestHandler):
    """Minimal handler exposing handshake and refresh endpoints."""

    server: KolibriAuthHTTPServer  # type: ignore[assignment]

    def _set_headers(self, status: HTTPStatus = HTTPStatus.OK) -> None:
        self.send_response(status.value)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Pragma", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")

    def do_OPTIONS(self) -> None:  # noqa: N802 - http.server naming
        self._set_headers()
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802 - http.server naming
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length > 0 else b""
        try:
            payload = json.loads(raw.decode("utf-8")) if raw else {}
        except json.JSONDecodeError:
            self._respond_error("Malformed JSON", HTTPStatus.BAD_REQUEST)
            return

        if self.path == "/api/session/handshake":
            self._handle_handshake(payload)
            return
        if self.path == "/api/session/refresh":
            self._handle_refresh(payload)
            return

        self._respond_error("Not found", HTTPStatus.NOT_FOUND)

    def _handle_handshake(self, payload: Dict[str, Any]) -> None:
        client_id = None
        if isinstance(payload, dict):
            cid = payload.get("client_id")
            if isinstance(cid, str) and cid:
                client_id = cid
        tokens = self.server.service.create_session(client_id)
        body = {
            "token": tokens.access_token,
            "refresh_token": tokens.refresh_token,
            "expires_in": self.server.service.seconds_until(tokens.expires_at),
        }
        self._set_headers()
        self.end_headers()
        self.wfile.write(json.dumps(body).encode("utf-8"))

    def _handle_refresh(self, payload: Dict[str, Any]) -> None:
        if not isinstance(payload, dict) or "refresh_token" not in payload:
            self._respond_error("Missing refresh_token", HTTPStatus.BAD_REQUEST)
            return
        refresh_token = payload["refresh_token"]
        if not isinstance(refresh_token, str):
            self._respond_error("Invalid refresh_token", HTTPStatus.BAD_REQUEST)
            return
        try:
            tokens = self.server.service.refresh_session(refresh_token)
        except ValueError as error:
            self._respond_error(str(error), HTTPStatus.UNAUTHORIZED)
            return
        body = {
            "token": tokens.access_token,
            "refresh_token": tokens.refresh_token,
            "expires_in": self.server.service.seconds_until(tokens.expires_at),
        }
        self._set_headers()
        self.end_headers()
        self.wfile.write(json.dumps(body).encode("utf-8"))

    def _respond_error(self, message: str, status: HTTPStatus) -> None:
        self._set_headers(status)
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode("utf-8"))

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003 - match BaseHTTPRequestHandler API
        # Silence the default noisy logging to stderr; real deployments can wrap the
        # server and provide a custom handler if needed.
        return


def run_server(host: str, port: int, key_path: str) -> KolibriAuthHTTPServer:
    key = load_hmac_key(key_path)
    service = KolibriAuthService(key)
    server = KolibriAuthHTTPServer((host, port), service)
    return server


def main(argv: Optional[list[str]] = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Kolibri authentication service")
    parser.add_argument("--listen", default="127.0.0.1:8787", help="Listen address in host:port format")
    parser.add_argument("--key", required=True, help="Path to the HMAC key file")
    args = parser.parse_args(argv)

    if ":" not in args.listen:
        raise SystemExit("--listen must be in host:port format")
    host, port_str = args.listen.rsplit(":", 1)
    port = int(port_str)

    server = run_server(host, port, args.key)
    try:
        server.serve_forever()
    except KeyboardInterrupt:  # pragma: no cover - interactive usage
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entrypoint
    raise SystemExit(main())
