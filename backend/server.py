"""Минимальный HTTP-сервер Kolibri, отдающий ответы через SSE."""

from __future__ import annotations

import json
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Iterable, Iterator

_STREAM_ENDPOINT = "/api/chat/stream"
_DEFAULT_MODE = "Быстрый ответ"


def _build_response(prompt: str, mode: str) -> str:
    prompt = prompt.strip()
    if not prompt:
        return "KolibriScript завершил работу без вывода."
    mode = mode.strip() or _DEFAULT_MODE
    return f"[{mode}] Колибри получил запрос: {prompt}"


def _stream_tokens(text: str, chunk_size: int = 16) -> Iterator[str]:
    for index in range(0, len(text), chunk_size):
        yield text[index : index + chunk_size]
        time.sleep(0.05)


class KolibriSSEHandler(BaseHTTPRequestHandler):
    server_version = "KolibriSSE/0.1"

    def log_message(self, format: str, *args: object) -> None:  # noqa: A003 - наследуем API BaseHTTPRequestHandler
        return

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_OPTIONS(self) -> None:  # noqa: N802 - часть HTTP API
        if self.path != _STREAM_ENDPOINT:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802 - часть HTTP API
        if self.path != _STREAM_ENDPOINT:
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        length_header = self.headers.get("Content-Length")
        if not length_header:
            self.send_error(HTTPStatus.LENGTH_REQUIRED, "Отсутствует длина запроса")
            return

        try:
            body = self.rfile.read(int(length_header))
        except ValueError:
            self.send_error(HTTPStatus.BAD_REQUEST, "Некорректная длина запроса")
            return

        try:
            payload = json.loads(body.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_error(HTTPStatus.BAD_REQUEST, "Некорректный JSON")
            return

        prompt = str(payload.get("prompt", ""))
        mode = str(payload.get("mode", _DEFAULT_MODE))
        response_text = _build_response(prompt, mode)

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        generator: Iterable[str] = _stream_tokens(response_text)
        try:
            for token in generator:
                chunk = f"data: {token}\n\n".encode("utf-8")
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            return
        finally:
            if hasattr(generator, "close"):
                try:
                    generator.close()  # type: ignore[attr-defined]
                except Exception:
                    pass

        try:
            self.wfile.write(b"event: done\n\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            return


def run(host: str = "0.0.0.0", port: int = 8080) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((host, port), KolibriSSEHandler)

    thread = threading.Thread(target=server.serve_forever, name="kolibri-sse", daemon=True)
    thread.start()
    return server


if __name__ == "__main__":
    httpd = run()
    try:
        print(f"Kolibri SSE server запущен на {httpd.server_address}")
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Остановка Kolibri SSE сервера...")
    finally:
        httpd.shutdown()
        httpd.server_close()
