"""Kolibri inference backend service."""
from __future__ import annotations

import asyncio
import os
from typing import Any, Dict, Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


DEFAULT_MAX_OUTPUT_TOKENS = 512
DEFAULT_TEMPERATURE = 0.7
DEFAULT_PROVIDER = "echo"
DEFAULT_SYSTEM_PROMPT = (
    "Ты — Kolibri, лаконичный помощник. Отвечай на русском языке, "
    "используя ясные и дружелюбные формулировки."
)


class GenerationRequest(BaseModel):
    prompt: str = Field(..., description="Входной запрос пользователя")
    mode: Optional[str] = Field(
        default=None,
        description="Произвольный маркер режима, пересылаемый в модель",
    )
    temperature: float = Field(
        default=DEFAULT_TEMPERATURE,
        ge=0.0,
        le=2.0,
        description="Коэффициент случайности выборки",
    )
    max_output_tokens: int = Field(
        default=DEFAULT_MAX_OUTPUT_TOKENS,
        ge=64,
        le=8192,
        description="Ограничение длины ответа модели в токенах",
    )


class GenerationResponse(BaseModel):
    output: str = Field(..., description="Ответ модели")
    provider: str = Field(..., description="Идентификатор используемого провайдера")
    model: str = Field(..., description="Название модели, вернувшей ответ")
    mode: Optional[str] = Field(
        default=None, description="Исходный маркер режима, повторённый в ответе"
    )


class ModelBackend:
    async def generate(self, payload: GenerationRequest) -> GenerationResponse:  # pragma: no cover - interface
        raise NotImplementedError

    async def aclose(self) -> None:
        return None


class EchoBackend(ModelBackend):
    """Простейший fallback, имитирующий модель для локальной отладки."""

    provider = "echo"

    async def generate(self, payload: GenerationRequest) -> GenerationResponse:
        prefix = os.getenv("KOLIBRI_ECHO_PREFIX", "Колибри (офлайн)")
        mode_line = f"[режим: {payload.mode}]\n" if payload.mode else ""
        body = payload.prompt.strip() or "(пустой запрос)"
        output = f"{prefix}\n{mode_line}{body}\n\nНастройте провайдера, чтобы получать ответы от настоящей модели."
        return GenerationResponse(
            output=output,
            provider=self.provider,
            model=os.getenv("KOLIBRI_ECHO_MODEL", "debug"),
            mode=payload.mode,
        )


class OpenAIBackend(ModelBackend):
    """Интеграция с OpenAI API через совместимый REST-слой."""

    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str,
        timeout: float,
        organisation: Optional[str] = None,
    ) -> None:
        headers = {"Authorization": f"Bearer {api_key}"}
        if organisation:
            headers["OpenAI-Organization"] = organisation
        self._client = httpx.AsyncClient(base_url=base_url, headers=headers, timeout=timeout)
        self._model = model
        self.provider = "openai"
        self._system_prompt = os.getenv("KOLIBRI_OPENAI_SYSTEM_PROMPT", DEFAULT_SYSTEM_PROMPT)

    async def generate(self, payload: GenerationRequest) -> GenerationResponse:
        request_json: Dict[str, Any] = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": self._system_prompt},
                self._mode_to_message(payload.mode),
                {"role": "user", "content": payload.prompt},
            ],
            "max_tokens": payload.max_output_tokens,
            "temperature": payload.temperature,
        }

        # Удаляем режим, если его нет.
        if request_json["messages"][1] is None:
            request_json["messages"].pop(1)

        response = await self._client.post("/chat/completions", json=request_json)
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as error:  # pragma: no cover - зависит от сети
            detail = error.response.text
            raise HTTPException(status_code=error.response.status_code, detail=detail) from error

        data = response.json()
        choices = data.get("choices")
        if not choices:
            raise HTTPException(status_code=502, detail="OpenAI вернул пустой ответ")

        message = choices[0].get("message") or {}
        content = message.get("content")
        if not isinstance(content, str):
            raise HTTPException(status_code=502, detail="OpenAI ответ не содержит текста")

        return GenerationResponse(
            output=content.strip(),
            provider=self.provider,
            model=data.get("model", self._model),
            mode=payload.mode,
        )

    @staticmethod
    def _mode_to_message(mode: Optional[str]) -> Optional[Dict[str, str]]:
        if not mode:
            return None
        return {
            "role": "system",
            "content": f"Текущий пользовательский режим: {mode}",
        }

    async def aclose(self) -> None:
        await self._client.aclose()


def build_backend() -> ModelBackend:
    provider = os.getenv("KOLIBRI_INFERENCE_PROVIDER", DEFAULT_PROVIDER).lower()

    if provider == "openai":
        api_key = os.getenv("KOLIBRI_OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("Не задан KOLIBRI_OPENAI_API_KEY для провайдера openai")
        model = os.getenv("KOLIBRI_OPENAI_MODEL", "gpt-4o-mini")
        base_url = os.getenv("KOLIBRI_OPENAI_BASE_URL", "https://api.openai.com/v1")
        organisation = os.getenv("KOLIBRI_OPENAI_ORG")
        timeout = float(os.getenv("KOLIBRI_OPENAI_TIMEOUT", "60"))
        return OpenAIBackend(
            api_key=api_key,
            model=model,
            base_url=base_url,
            timeout=timeout,
            organisation=organisation,
        )

    # Если провайдер неизвестен, используем echo и уведомляем через лог.
    if provider not in {"echo", "openai"}:
        print(
            f"[kolibri-inference] Неизвестный провайдер '{provider}', используется echo",  # noqa: T201
        )

    return EchoBackend()


cors_raw = os.getenv("KOLIBRI_CORS_ALLOW_ORIGINS", "*")
cors_origins = [origin.strip() for origin in cors_raw.split(",") if origin.strip()]
if not cors_origins:
    cors_origins = ["*"]

app = FastAPI(title="Kolibri Inference Service", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

_backend: ModelBackend = build_backend()
_lock = asyncio.Lock()


@app.on_event("shutdown")
async def shutdown_event() -> None:
    await _backend.aclose()


@app.get("/health", response_model=Dict[str, Any])
async def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "provider": getattr(_backend, "provider", "unknown"),
    }


@app.post("/generate", response_model=GenerationResponse)
async def generate(payload: GenerationRequest) -> GenerationResponse:
    async with _lock:
        return await _backend.generate(payload)
