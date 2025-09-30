"""REST API Kolibri для загрузки и предобработки вложений."""

from __future__ import annotations

import mimetypes
import os
import uuid
from pathlib import Path
from typing import Optional, Tuple

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

try:  # PDF может извлекаться, если установлен pypdf.
    from pypdf import PdfReader  # type: ignore
except ImportError:  # pragma: no cover - библиотека опциональна на CI.
    PdfReader = None  # type: ignore[assignment]

MAX_FILE_SIZE = 8 * 1024 * 1024  # 8 MiB
MAX_TEXT_LENGTH = 20_000
TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".csv", ".json", ".log"}

UPLOAD_ROOT = Path(os.getenv("KOLIBRI_UPLOAD_DIR", "logs/uploads")).resolve()
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Kolibri Attachments API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AttachmentProcessingResult(BaseModel):
    """Ответ API с результатами обработки вложения."""

    attachment_id: str
    filename: str
    content_type: str
    text: Optional[str] = None
    truncated: bool = False
    download_url: str
    ocr_performed: bool = False
    note: Optional[str] = None


@app.post("/api/attachments", response_model=AttachmentProcessingResult)
async def upload_attachment(file: UploadFile = File(...)) -> AttachmentProcessingResult:
    """Принимает файл, сохраняет и извлекает текстовое содержимое."""

    if not file.filename:
        raise HTTPException(status_code=400, detail="Имя файла не указано.")

    safe_name = Path(file.filename).name
    content_type = file.content_type or mimetypes.guess_type(safe_name)[0] or "application/octet-stream"

    file_id = uuid.uuid4().hex
    suffix = Path(safe_name).suffix
    stored_name = f"{file_id}{suffix.lower()}" if suffix else file_id
    stored_path = UPLOAD_ROOT / stored_name

    size = 0
    with stored_path.open("wb") as buffer:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_FILE_SIZE:
                stored_path.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="Файл превышает максимально допустимый размер 8 МБ.")
            buffer.write(chunk)

    text, truncated, ocr_performed, note = _extract_text(stored_path, content_type)
    download_url = f"/attachments/{stored_path.name}"

    return AttachmentProcessingResult(
        attachment_id=file_id,
        filename=safe_name,
        content_type=content_type,
        text=text,
        truncated=truncated,
        download_url=download_url,
        ocr_performed=ocr_performed,
        note=note,
    )


@app.get("/attachments/{attachment_name}")
async def download_attachment(attachment_name: str) -> FileResponse:
    """Возвращает ранее загруженный файл по безопасному пути."""

    sanitised = Path(attachment_name).name
    stored_path = UPLOAD_ROOT / sanitised
    if not stored_path.exists():
        raise HTTPException(status_code=404, detail="Вложение не найдено.")
    media_type = mimetypes.guess_type(sanitised)[0] or "application/octet-stream"
    return FileResponse(stored_path, filename=sanitised, media_type=media_type)


def _extract_text(path: Path, content_type: str) -> Tuple[Optional[str], bool, bool, Optional[str]]:
    """Пытается извлечь текст из файла."""

    suffix = path.suffix.lower()
    lowered_type = content_type.lower()

    if lowered_type.startswith("text/") or suffix in TEXT_EXTENSIONS:
        raw = path.read_bytes()
        text = _decode_bytes(raw).strip()
        truncated_text, truncated_flag = _truncate(text)
        return truncated_text, truncated_flag, False, None

    if lowered_type == "application/pdf" or suffix == ".pdf":
        if PdfReader is None:
            return None, False, False, "Обработка PDF недоступна: установите пакет 'pypdf'."
        try:
            reader = PdfReader(str(path))
        except Exception as error:  # pragma: no cover - зависит от содержимого PDF.
            return None, False, False, f"Не удалось прочитать PDF: {error}"
        chunks = []
        for page in reader.pages:
            page_text = page.extract_text() or ""
            if page_text:
                chunks.append(page_text)
        combined = "\n".join(chunks).strip()
        truncated_text, truncated_flag = _truncate(combined)
        return truncated_text, truncated_flag, False, None

    if lowered_type.startswith("image/"):
        try:
            from PIL import Image  # type: ignore
            import pytesseract  # type: ignore
            from pytesseract import TesseractNotFoundError  # type: ignore
        except ImportError:
            return None, False, False, "OCR для изображений недоступен: установите 'pillow' и 'pytesseract'."

        try:
            with Image.open(path) as image:
                text = pytesseract.image_to_string(image, lang="rus+eng")
        except TesseractNotFoundError:
            return None, False, False, "Исполняемый файл Tesseract OCR не найден."  # pragma: no cover
        except Exception as error:  # pragma: no cover - зависит от конкретного файла
            return None, False, False, f"Не удалось выполнить OCR: {error}"
        cleaned = text.strip()
        truncated_text, truncated_flag = _truncate(cleaned)
        return truncated_text, truncated_flag, True, None

    return None, False, False, "Формат вложения не поддерживается для автоматической расшифровки."


def _decode_bytes(data: bytes) -> str:
    """Подбирает корректную кодировку текста."""

    for encoding in ("utf-8", "utf-16", "cp1251"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="ignore")


def _truncate(text: str) -> Tuple[Optional[str], bool]:
    """Ограничивает длину текста и добавляет флаг усечения."""

    if not text:
        return None, False
    truncated = len(text) > MAX_TEXT_LENGTH
    processed = text[:MAX_TEXT_LENGTH] if truncated else text
    return processed, truncated


__all__ = ["app"]
