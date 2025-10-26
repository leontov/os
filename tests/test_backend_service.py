from __future__ import annotations

from typing import Any, Dict

import pytest
from fastapi.testclient import TestClient

from backend.service.actions import reset_actions_registry
from backend.service.config import get_settings
from backend.service.main import app
from backend.service.security import AuthContext, issue_session_token


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
        "KOLIBRI_SSO_ENABLED",
        "KOLIBRI_SSO_SHARED_SECRET",
        "KOLIBRI_SSO_SESSION_TTL",
        "KOLIBRI_SSO_OFFLINE_ROLES",
        "KOLIBRI_SSO_DEGRADED_TOKENS",
        "KOLIBRI_SAML_ENTITY_ID",
        "KOLIBRI_SAML_ACS_URL",
        "KOLIBRI_SAML_AUDIENCE",
        "KOLIBRI_SAML_ROLE_ATTRIBUTE",
        "KOLIBRI_SAML_SIGNATURE_ATTRIBUTE",
        "KOLIBRI_SAML_CLOCK_SKEW",
        "KOLIBRI_AUDIT_LOG_PATH",
        "KOLIBRI_GENOME_LOG_PATH",
        "KOLIBRI_PROMETHEUS_NAMESPACE",
    ):
        monkeypatch.delenv(key, raising=False)
    get_settings.cache_clear()
    reset_actions_registry()


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
    monkeypatch.setenv("KOLIBRI_SSO_ENABLED", "false")
    get_settings.cache_clear()

    response = client.post("/api/v1/infer", json={"prompt": "ping"})
    assert response.status_code == 503
    assert response.json()["detail"] == "LLM mode is disabled"


def test_infer_missing_endpoint(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setenv("KOLIBRI_RESPONSE_MODE", "llm")
    monkeypatch.setenv("KOLIBRI_SSO_ENABLED", "false")
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
    monkeypatch.setenv("KOLIBRI_SSO_ENABLED", "false")
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
    monkeypatch.setenv("KOLIBRI_SSO_ENABLED", "false")
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
    monkeypatch.setenv("KOLIBRI_SSO_ENABLED", "false")
    invalid_value = "bad" if env_key.endswith("TEMPERATURE") else "0"
    monkeypatch.setenv(env_key, invalid_value)

    with pytest.raises(RuntimeError):
        get_settings()


def test_infer_requires_auth_when_sso_enabled(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setenv("KOLIBRI_RESPONSE_MODE", "llm")
    monkeypatch.setenv("KOLIBRI_LLM_ENDPOINT", "https://example.test/llm")
    monkeypatch.setenv("KOLIBRI_SSO_SHARED_SECRET", "testing-secret")
    get_settings.cache_clear()

    response = client.post("/api/v1/infer", json={"prompt": "ping"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Missing bearer token"


def test_infer_accepts_valid_token(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setenv("KOLIBRI_RESPONSE_MODE", "llm")
    monkeypatch.setenv("KOLIBRI_LLM_ENDPOINT", "https://example.test/llm")
    monkeypatch.setenv("KOLIBRI_SSO_SHARED_SECRET", "testing-secret")
    get_settings.cache_clear()

    dummy_client = _DummyClient()

    def factory(*args: Any, **kwargs: Any) -> _DummyClient:
        dummy_client.args = args
        dummy_client.kwargs = kwargs
        return dummy_client

    monkeypatch.setattr("backend.service.main.httpx.AsyncClient", factory)

    settings = get_settings()
    context = AuthContext(subject="user@example.com", roles={"system:admin"}, attributes={}, session_expires_at=None, session_id="test")
    token = issue_session_token(context, settings)

    response = client.post(
        "/api/v1/infer",
        json={"prompt": "ping"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert dummy_client.post_calls


def test_actions_catalog_available_offline(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setenv("KOLIBRI_SSO_ENABLED", "false")
    get_settings.cache_clear()

    response = client.get("/api/v1/actions/catalog")
    assert response.status_code == 200
    payload = response.json()
    assert any(recipe["name"] == "ingest_dataset" for recipe in payload["recipes"])
    assert "automation" in payload["categories"]


def test_run_action_returns_timeline(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setenv("KOLIBRI_SSO_ENABLED", "false")
    get_settings.cache_clear()

    response = client.post(
        "/api/v1/actions/run",
        json={"action": "ingest_dataset", "parameters": {"dataset": "intranet"}},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "succeeded"
    assert any(entry["status"] in {"completed", "failed"} for entry in payload["timeline"])
    assert payload["output"]["dataset"] == "intranet"


def test_macro_crud(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setenv("KOLIBRI_SSO_ENABLED", "false")
    get_settings.cache_clear()

    create_response = client.post(
        "/api/v1/actions/macros",
        json={
            "name": "Sync portal",
            "action": "ingest_dataset",
            "parameters": {"dataset": "intranet"},
            "tags": ["daily"],
        },
    )
    assert create_response.status_code == 200
    macro_id = create_response.json()["id"]

    list_response = client.get("/api/v1/actions/macros")
    assert list_response.status_code == 200
    items = list_response.json()["items"]
    assert any(item["id"] == macro_id for item in items)

    update_response = client.put(
        f"/api/v1/actions/macros/{macro_id}",
        json={
            "name": "Sync intranet",
            "action": "ingest_dataset",
            "parameters": {"dataset": "intranet", "priority": "high"},
            "tags": ["daily", "priority"],
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Sync intranet"
    assert update_response.json()["parameters"]["priority"] == "high"

    delete_response = client.delete(f"/api/v1/actions/macros/{macro_id}")
    assert delete_response.status_code == 204

    list_after_delete = client.get("/api/v1/actions/macros")
    assert list_after_delete.status_code == 200
    assert not any(item["id"] == macro_id for item in list_after_delete.json()["items"])
