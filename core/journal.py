"""Disk-backed journal helpers for KolibriSim."""

from __future__ import annotations

import json
from pathlib import Path
from typing import List, Optional, Sequence

from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - импорт только для проверки типов
    from .kolibri_sim import ZhurnalZapis


class JsonlDiskJournal:
    """Stores Kolibri journal entries as JSONL files with rollover support."""

    def __init__(self, active_path: Path, rotate_dir: Optional[Path] = None) -> None:
        self._active_path = Path(active_path)
        if rotate_dir is None:
            self._rotate_dir = self._active_path.parent / "journal-archive"
        else:
            self._rotate_dir = Path(rotate_dir)
        self._meta_path = self._active_path.parent / f"{self._active_path.name}.meta.json"

    def load_snapshot(self, limit: int) -> tuple[int, List["ZhurnalZapis"]]:
        """Loads persisted state and enforces the retention limit."""

        offset = 0
        if self._meta_path.exists():
            try:
                data = json.loads(self._meta_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                data = {}
            raw_offset = data.get("offset", 0)
            if isinstance(raw_offset, int) and raw_offset >= 0:
                offset = raw_offset

        records: List["ZhurnalZapis"] = []
        if self._active_path.exists():
            contents = self._active_path.read_text(encoding="utf-8")
            lines = [stroka for stroka in contents.splitlines() if stroka.strip()]
            for line in lines:
                try:
                    zapis = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(zapis, dict):
                    records.append(zapis)  # type: ignore[arg-type]

        if len(records) > limit:
            extra = len(records) - limit
            offset += extra
            records = records[-limit:]
            self._write_active(records)
            self._write_meta(offset, len(records))

        return offset, records

    def persist(
        self,
        *,
        records: Sequence["ZhurnalZapis"],
        offset: int,
        rotated: Sequence["ZhurnalZapis"] | None = None,
        rotated_start: Optional[int] = None,
    ) -> None:
        """Persists the current snapshot and dumps rotated batches if necessary."""

        if rotated:
            self._write_rotation(rotated, rotated_start, offset)

        self._write_active(records)
        self._write_meta(offset, len(records))

    # --- Internal helpers -------------------------------------------------
    def _write_active(self, records: Sequence["ZhurnalZapis"]) -> None:
        self._active_path.parent.mkdir(parents=True, exist_ok=True)
        lines = [json.dumps(rec, ensure_ascii=False, sort_keys=True) for rec in records]
        text = "\n".join(lines)
        if text:
            text += "\n"
        self._active_path.write_text(text, encoding="utf-8")

    def _write_meta(self, offset: int, active_count: int) -> None:
        payload = {
            "offset": int(offset),
            "active_count": int(active_count),
            "active_path": str(self._active_path),
            "rotate_dir": str(self._rotate_dir),
        }
        self._meta_path.parent.mkdir(parents=True, exist_ok=True)
        self._meta_path.write_text(
            json.dumps(payload, ensure_ascii=False, sort_keys=True),
            encoding="utf-8",
        )

    def _write_rotation(
        self,
        rotated: Sequence["ZhurnalZapis"],
        rotated_start: Optional[int],
        offset: int,
    ) -> None:
        if not rotated:
            return
        start = rotated_start if rotated_start is not None else max(0, offset - len(rotated))
        end = start + len(rotated)
        name = f"{self._active_path.stem}-{start:08d}-{end:08d}.jsonl"
        rotate_path = self._rotate_dir / name
        rotate_path.parent.mkdir(parents=True, exist_ok=True)
        lines = [json.dumps(rec, ensure_ascii=False, sort_keys=True) for rec in rotated]
        text = "\n".join(lines)
        if text:
            text += "\n"
        rotate_path.write_text(text, encoding="utf-8")


__all__ = ["JsonlDiskJournal"]
