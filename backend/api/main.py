"""FastAPI application that handles chat attachment uploads."""
from __future__ import annotations

import io
import json
from pathlib import Path
from typing import List
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from pypdf import PdfReader

MAX_ATTACHMENTS = 5
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MiB
MAX_TEXT_LENGTH = 20_000

TEXT_MIME_TYPES = {"text/plain", "text/markdown"}
JSON_MIME_TYPES = {"application/json"}
PDF_MIME_TYPES = {"application/pdf"}
DEFAULT_CONTENT_TYPE = "application/octet-stream"

app = FastAPI(title="Kolibri Attachment API")


class AttachmentResponse(BaseModel):
    """Payload returned to the frontend after successful processing."""

    id: str
    name: str
    content_type: str = Field(alias="contentType")
    size: int
    text: str

    class Config:
        allow_population_by_field_name = True


def _truncate_text(value: str) -> str:
    """Limit extracted text to a reasonable size while preserving meaning."""

    stripped = value.strip()
    if len(stripped) <= MAX_TEXT_LENGTH:
        return stripped
    return f"{stripped[:MAX_TEXT_LENGTH].rstrip()}…"


def _guess_content_type(filename: str | None) -> str:
    if not filename:
        return DEFAULT_CONTENT_TYPE
    extension = Path(filename).suffix.lower()
    return {
        ".txt": "text/plain",
        ".md": "text/markdown",
        ".markdown": "text/markdown",
        ".json": "application/json",
        ".pdf": "application/pdf",
    }.get(extension, DEFAULT_CONTENT_TYPE)


def _normalise_content_type(content_type: str | None, filename: str | None) -> str:
    if content_type:
        return content_type.split(";", 1)[0].strip().lower()
    return _guess_content_type(filename)


def _ensure_within_limits(data: bytes, filename: str) -> None:
    if not data:
        raise HTTPException(status_code=400, detail=f"Файл {filename} пуст и не может быть обработан.")
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Файл {filename} превышает допустимый размер {MAX_FILE_SIZE // (1024 * 1024)} МБ.",
        )


def _extract_text_from_json(data: bytes, filename: str) -> str:
    try:
        decoded = data.decode("utf-8")
    except UnicodeDecodeError as error:
        raise HTTPException(status_code=400, detail=f"Файл {filename} не является UTF-8 JSON: {error}.") from error

    try:
        parsed = json.loads(decoded)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=400, detail=f"Файл {filename} содержит некорректный JSON: {error}.") from error

    return json.dumps(parsed, ensure_ascii=False, indent=2)


def _extract_text_from_plain(data: bytes, filename: str) -> str:
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError as error:
        raise HTTPException(status_code=400, detail=f"Файл {filename} должен быть в кодировке UTF-8: {error}.") from error


def _extract_text_from_pdf(data: bytes, filename: str) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
    except Exception as error:  # noqa: BLE001 - surface parser issues to the client
        raise HTTPException(status_code=400, detail=f"Не удалось прочитать PDF {filename}: {error}.") from error

    text_parts: List[str] = []
    for index, page in enumerate(reader.pages, start=1):
        try:
            page_text = page.extract_text() or ""
        except Exception as error:  # noqa: BLE001 - propagate extraction issues
            raise HTTPException(
                status_code=400,
                detail=f"Не удалось извлечь текст со страницы {index} PDF {filename}: {error}.",
            ) from error
        text_parts.append(page_text.strip())

    combined = "\n\n".join(part for part in text_parts if part)
    if not combined:
        raise HTTPException(status_code=400, detail=f"В файле {filename} не удалось найти текст.")
    return combined


def _extract_text(content_type: str, data: bytes, filename: str) -> str:
    if content_type in TEXT_MIME_TYPES:
        return _extract_text_from_plain(data, filename)
    if content_type in JSON_MIME_TYPES:
        return _extract_text_from_json(data, filename)
    if content_type in PDF_MIME_TYPES:
        return _extract_text_from_pdf(data, filename)
    raise HTTPException(status_code=415, detail=f"Тип файла {content_type} не поддерживается для распознавания.")


@app.post("/api/attachments", response_model=List[AttachmentResponse])
async def upload_attachments(files: List[UploadFile] = File(...)) -> List[AttachmentResponse]:
    """Accept attachments, extract their text and return structured payloads."""

    if not files:
        raise HTTPException(status_code=400, detail="Не переданы файлы для обработки.")
    if len(files) > MAX_ATTACHMENTS:
        raise HTTPException(status_code=400, detail=f"Можно загрузить не более {MAX_ATTACHMENTS} файлов за раз.")

    processed: List[AttachmentResponse] = []
    for upload in files:
        filename = upload.filename or "вложение"
        raw = await upload.read()
        await upload.close()

        _ensure_within_limits(raw, filename)
        content_type = _normalise_content_type(upload.content_type, upload.filename)
        text = _extract_text(content_type, raw, filename)

        processed.append(
            AttachmentResponse(
                id=str(uuid4()),
                name=filename,
                content_type=content_type,
                size=len(raw),
                text=_truncate_text(text),
            )
        )

    return processed
