from __future__ import annotations

from typing import Any, Dict

import pytest
from fastapi.testclient import TestClient

from backend.service.main import app, get_settings


@pytest.fixture(autouse=True)
def clear_settings_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in (
        "KOLIBRI_RESPONSE_MODE",
        "KOLIBRI_LLM_ENDPOINT",
        "KOLIBRI_LLM_API_KEY",
        "KOLIBRI_LLM_MODEL",
        "KOLIBRI_LLM_TIMEOUT",
        "KOLIBRI_LLM_TEMPERATURE",
        "KOLIBRI_LLM_MAX_TOKENS",
    ):
        monkeypatch.delenv(key, raising=False)
    get_settings.cache_clear()


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def test_health_reports_response_mode(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setenv("KOLIBRI_RESPONSE_MODE", "script")
    get_settings.cache_clear()

    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["response_mode"] == "script"


def test_infer_disabled_when_not_llm(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setenv("KOLIBRI_RESPONSE_MODE", "script")
    get_settings.cache_clear()

    response = client.post("/api/v1/infer", json={"prompt": "ping"})
    assert response.status_code == 503
    assert response.json()["detail"] == "LLM mode is disabled"


def test_infer_missing_endpoint(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setenv("KOLIBRI_RESPONSE_MODE", "llm")
    get_settings.cache_clear()

    response = client.post("/api/v1/infer", json={"prompt": "ping"})
    assert response.status_code == 503
    assert "endpoint" in response.json()["detail"].lower()


class _DummyResponse:
    status_code = 200
    text = "OK"

    def raise_for_status(self) -> None:
        return None

    def json(self) -> Dict[str, Any]:
        return {"response": "pong", "provider": "test-provider"}


class _DummyClient:
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self.args = args
        self.kwargs = kwargs
        self.post_calls: list[Dict[str, Any]] = []

    async def __aenter__(self) -> "_DummyClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:  # type: ignore[override]
        return None

    async def post(self, *args: Any, **kwargs: Any) -> _DummyResponse:
        self.post_calls.append({"args": args, "kwargs": kwargs})
        return _DummyResponse()


def test_infer_success(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setenv("KOLIBRI_RESPONSE_MODE", "llm")
    monkeypatch.setenv("KOLIBRI_LLM_ENDPOINT", "https://example.test/llm")
    get_settings.cache_clear()

    dummy_client = _DummyClient()

    def factory(*args: Any, **kwargs: Any) -> _DummyClient:
        dummy_client.args = args
        dummy_client.kwargs = kwargs
        return dummy_client

    monkeypatch.setattr("backend.service.main.httpx.AsyncClient", factory)

    response = client.post("/api/v1/infer", json={"prompt": "ping", "mode": "test"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["response"] == "pong"
    assert payload["provider"] == "test-provider"
    assert payload["latency_ms"] >= 0

    assert dummy_client.post_calls
    sent_json = dummy_client.post_calls[0]["kwargs"]["json"]
    assert sent_json["prompt"] == "ping"
    assert sent_json["mode"] == "test"


def test_infer_applies_defaults(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setenv("KOLIBRI_RESPONSE_MODE", "llm")
    monkeypatch.setenv("KOLIBRI_LLM_ENDPOINT", "https://example.test/llm")
    monkeypatch.setenv("KOLIBRI_LLM_TEMPERATURE", "0.9")
    monkeypatch.setenv("KOLIBRI_LLM_MAX_TOKENS", "256")
    get_settings.cache_clear()

    dummy_client = _DummyClient()

    def factory(*args: Any, **kwargs: Any) -> _DummyClient:
        dummy_client.args = args
        dummy_client.kwargs = kwargs
        return dummy_client

    monkeypatch.setattr("backend.service.main.httpx.AsyncClient", factory)

    response = client.post("/api/v1/infer", json={"prompt": "ping"})

    assert response.status_code == 200
    sent_json = dummy_client.post_calls[0]["kwargs"]["json"]
    assert sent_json["temperature"] == pytest.approx(0.9)
    assert sent_json["max_tokens"] == 256


@pytest.mark.parametrize(
    "env_key", ["KOLIBRI_LLM_TEMPERATURE", "KOLIBRI_LLM_MAX_TOKENS"],
)
def test_invalid_defaults_raise(monkeypatch: pytest.MonkeyPatch, env_key: str) -> None:
    monkeypatch.setenv("KOLIBRI_RESPONSE_MODE", "llm")
    invalid_value = "bad" if env_key.endswith("TEMPERATURE") else "0"
    monkeypatch.setenv(env_key, invalid_value)

    with pytest.raises(RuntimeError):
        get_settings()
