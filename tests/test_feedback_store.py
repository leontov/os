from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.feedback_store import FeedbackRecord, FeedbackStore, load_feedback_dataset


def test_feedback_persists_across_reload(tmp_path: Path) -> None:
  store_path = tmp_path / "feedback.json"
  store = FeedbackStore(store_path)

  first = FeedbackRecord(
    conversation_id="conv-1",
    message_id="msg-1",
    rating="up",
    response="Ответ Колибри",
    submitted_at="2024-05-30T18:55:00Z",
    comment="Очень полезно",
  )
  store.add(first)

  reloaded = FeedbackStore(store_path)
  records = reloaded.load()
  assert records == [first]


def test_feedback_dataset_grouping(tmp_path: Path) -> None:
  store = FeedbackStore(tmp_path / "feedback.json")
  store.extend(
    [
      FeedbackRecord(
        conversation_id="conv-1",
        message_id="msg-1",
        rating="up",
        response="Первый ответ",
        submitted_at="2024-05-30T18:55:00Z",
        comment="👍",
      ),
      FeedbackRecord(
        conversation_id="conv-1",
        message_id="msg-2",
        rating="down",
        response="Второй ответ",
        submitted_at="2024-05-30T19:05:00Z",
      ),
      FeedbackRecord(
        conversation_id="conv-2",
        message_id="msg-3",
        rating="up",
        response="Третий ответ",
        submitted_at="2024-05-30T19:15:00Z",
        comment="нужно уточнение",
      ),
    ]
  )

  dataset = load_feedback_dataset(tmp_path / "feedback.json")
  assert set(dataset.keys()) == {"conv-1", "conv-2"}
  assert {row["message_id"] for row in dataset["conv-1"]} == {"msg-1", "msg-2"}
  assert dataset["conv-2"][0]["comment"] == "нужно уточнение"
