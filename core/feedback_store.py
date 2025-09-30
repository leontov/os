"""Feedback persistence helpers used by integration tests and pipelines."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import json
from pathlib import Path
from typing import Dict, Iterable, List, Optional


@dataclass(slots=True)
class FeedbackRecord:
  """Represents a single feedback entry collected from the UI."""

  conversation_id: str
  message_id: str
  rating: str
  response: str
  submitted_at: str
  comment: Optional[str] = None

  def to_training_row(self) -> Dict[str, str]:
    """Converts the record into a flat dictionary for ML ingestion."""

    row = {
      "conversation_id": self.conversation_id,
      "message_id": self.message_id,
      "rating": self.rating,
      "response": self.response,
      "submitted_at": self.submitted_at,
    }
    if self.comment:
      row["comment"] = self.comment
    return row


class FeedbackStore:
  """File-backed repository storing feedback submissions as JSON."""

  def __init__(self, path: "str | Path") -> None:
    self.path = Path(path)
    self.path.parent.mkdir(parents=True, exist_ok=True)
    if not self.path.exists():
      self._write([])

  def load(self) -> List[FeedbackRecord]:
    """Reads all stored feedback records."""

    try:
      with self.path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    except FileNotFoundError:
      return []

    if not isinstance(payload, list):
      return []

    records: List[FeedbackRecord] = []
    for item in payload:
      if not isinstance(item, dict):
        continue
      try:
        record = FeedbackRecord(
          conversation_id=str(item["conversation_id"]),
          message_id=str(item["message_id"]),
          rating=str(item["rating"]),
          response=str(item["response"]),
          submitted_at=str(item["submitted_at"]),
          comment=str(item["comment"]) if item.get("comment") else None,
        )
      except KeyError:
        continue
      records.append(record)
    return records

  def add(self, record: FeedbackRecord) -> None:
    """Appends a single record to the underlying storage file."""

    records = self.load()
    records = [existing for existing in records if existing.message_id != record.message_id]
    records.append(record)
    self._write(records)

  def extend(self, records: Iterable[FeedbackRecord]) -> None:
    """Stores multiple records at once, de-duplicating by message id."""

    existing = {record.message_id: record for record in self.load()}
    for record in records:
      existing[record.message_id] = record
    self._write(list(existing.values()))

  def _write(self, records: List[FeedbackRecord]) -> None:
    payload = [asdict(record) for record in records]
    with self.path.open("w", encoding="utf-8") as handle:
      json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)


def load_feedback_dataset(path: "str | Path") -> Dict[str, List[Dict[str, str]]]:
  """Loads feedback grouped by conversation for training pipelines."""

  store = FeedbackStore(path)
  grouped: Dict[str, List[Dict[str, str]]] = {}
  for record in store.load():
    grouped.setdefault(record.conversation_id, []).append(record.to_training_row())
  return grouped
