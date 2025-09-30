"""Minimal HTTP server that stores chat feedback submissions on disk."""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Tuple

from core.feedback_store import FeedbackRecord, FeedbackStore

DEFAULT_PORT = 8787
STORE_PATH = Path(os.getenv("KOLIBRI_FEEDBACK_PATH", "logs/feedback.json"))


class FeedbackRequestHandler(BaseHTTPRequestHandler):
  store = FeedbackStore(STORE_PATH)

  def do_POST(self) -> None:  # noqa: N802  (BaseHTTPRequestHandler API)
    if self.path != "/api/feedback":
      self.send_error(404, "Unknown endpoint")
      return

    content_length = int(self.headers.get("Content-Length", "0"))
    payload_bytes = self.rfile.read(content_length)

    try:
      payload = json.loads(payload_bytes)
    except json.JSONDecodeError:
      self.send_error(400, "Body must be valid JSON")
      return

    try:
      record = FeedbackRecord(
        conversation_id=str(payload["conversationId"]),
        message_id=str(payload["messageId"]),
        rating=str(payload["rating"]),
        response=str(payload["response"]),
        submitted_at=str(payload["submittedAt"]),
        comment=str(payload.get("comment")) if payload.get("comment") else None,
      )
    except KeyError as error:
      self.send_error(400, f"Missing field: {error.args[0]}")
      return

    self.store.add(record)
    self.send_response(204)
    self.end_headers()

  def do_GET(self) -> None:  # noqa: N802  (BaseHTTPRequestHandler API)
    if self.path != "/api/feedback":
      self.send_error(404, "Unknown endpoint")
      return

    dataset = [record.to_training_row() for record in self.store.load()]
    body = json.dumps(dataset, ensure_ascii=False).encode("utf-8")

    self.send_response(200)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Content-Length", str(len(body)))
    self.end_headers()
    self.wfile.write(body)

  def log_message(self, format: str, *args: Tuple[object, ...]) -> None:  # noqa: A003
    if os.getenv("KOLIBRI_FEEDBACK_SILENT") == "1":
      return
    super().log_message(format, *args)


def main() -> None:
  port = int(os.getenv("KOLIBRI_FEEDBACK_PORT", DEFAULT_PORT))
  server = HTTPServer(("0.0.0.0", port), FeedbackRequestHandler)
  print(f"Feedback server listening on http://127.0.0.1:{port}/api/feedback")
  try:
    server.serve_forever()
  except KeyboardInterrupt:
    pass
  finally:
    server.server_close()


if __name__ == "__main__":
  main()
