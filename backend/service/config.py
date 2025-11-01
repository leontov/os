"""Configuration helpers for the Kolibri enterprise service bundle."""
from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
import os
from typing import Dict, List, Optional


def _parse_bool(value: str | None, *, default: bool) -> bool:
    if value is None:
        return default
    normalised = value.strip().lower()
    if normalised in {"1", "true", "yes", "on"}:
        return True
    if normalised in {"0", "false", "no", "off"}:
        return False
    raise RuntimeError(f"Invalid boolean value: {value!r}")


def _parse_list(value: str | None) -> List[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _parse_degraded_tokens(value: str | None) -> Dict[str, List[str]]:
    if not value:
        return {}
    tokens: Dict[str, List[str]] = {}
    for raw_entry in value.split(";"):
        entry = raw_entry.strip()
        if not entry:
            continue
        if "=" not in entry:
            raise RuntimeError(
                "Degraded token entry must be formatted as token=role1,role2",
            )
        token, raw_roles = entry.split("=", 1)
        roles = [role.strip() for role in raw_roles.split(",") if role.strip()]
        if not roles:
            raise RuntimeError("Degraded token entry must include at least one role")
        tokens[token.strip()] = roles
    return tokens

@dataclass
class Settings:
    """Runtime configuration for the Kolibri backend service."""

    response_mode: str = "script"
    llm_endpoint: Optional[str] = None
    llm_api_key: Optional[str] = None
    llm_model: Optional[str] = None
    llm_timeout: float = 30.0
    llm_temperature_default: Optional[float] = None
    llm_max_tokens_default: Optional[int] = None
    moderation_forbidden_topics: List[str] = field(default_factory=list)
    moderation_tone_negative_threshold: float = 0.4
    paraphraser_endpoint: Optional[str] = None
    paraphraser_api_key: Optional[str] = None
    paraphraser_timeout: float = 10.0

    sso_enabled: bool = True
    saml_entity_id: str = "urn:kolibri:enterprise"
    saml_acs_url: Optional[str] = None
    saml_audience: List[str] = field(default_factory=lambda: ["kolibri"],)
    saml_role_attribute: str = "https://kolibri.ai/claims/roles"
    saml_signature_attribute: str = "https://kolibri.ai/claims/signature"
    saml_clock_skew_seconds: int = 120
    sso_shared_secret: Optional[str] = None
    sso_session_ttl_seconds: int = 3600
    offline_mode_roles: List[str] = field(default_factory=list)
    degraded_tokens: Dict[str, List[str]] = field(default_factory=dict)

    rbac_policy_path: Optional[str] = None
    audit_log_path: str = "logs/audit/enterprise.log"
    genome_log_path: str = "logs/genome/events.log"
    prometheus_namespace: str = "kolibri"
    log_level: str = "INFO"
    log_json: bool = True

    @classmethod
    def load(cls) -> "Settings":
        response_mode = os.getenv("KOLIBRI_RESPONSE_MODE", "script").strip().lower()
        llm_endpoint = os.getenv("KOLIBRI_LLM_ENDPOINT")
        llm_api_key = os.getenv("KOLIBRI_LLM_API_KEY")
        llm_model = os.getenv("KOLIBRI_LLM_MODEL")
        timeout_raw = os.getenv("KOLIBRI_LLM_TIMEOUT", "30")
        temperature_raw = os.getenv("KOLIBRI_LLM_TEMPERATURE")
        max_tokens_raw = os.getenv("KOLIBRI_LLM_MAX_TOKENS")

        try:
            llm_timeout = float(timeout_raw)
        except ValueError as exc:
            raise RuntimeError("KOLIBRI_LLM_TIMEOUT must be numeric") from exc

        if temperature_raw:
            try:
                llm_temperature_default = float(temperature_raw)
            except ValueError as exc:
                raise RuntimeError("KOLIBRI_LLM_TEMPERATURE must be numeric") from exc
            if not 0.0 <= llm_temperature_default <= 2.0:
                raise RuntimeError("KOLIBRI_LLM_TEMPERATURE must be between 0.0 and 2.0")
        else:
            llm_temperature_default = None

        if max_tokens_raw:
            try:
                llm_max_tokens_default = int(max_tokens_raw)
            except ValueError as exc:
                raise RuntimeError("KOLIBRI_LLM_MAX_TOKENS must be an integer") from exc
            if llm_max_tokens_default <= 0:
                raise RuntimeError("KOLIBRI_LLM_MAX_TOKENS must be positive")
        else:
            llm_max_tokens_default = None

        forbidden_topics = _parse_list(os.getenv("KOLIBRI_MODERATION_FORBIDDEN_TOPICS"))
        tone_threshold_raw = os.getenv("KOLIBRI_MODERATION_TONE_THRESHOLD", "0.4")
        try:
            tone_threshold = float(tone_threshold_raw)
        except ValueError as exc:
            raise RuntimeError("KOLIBRI_MODERATION_TONE_THRESHOLD must be numeric") from exc
        if tone_threshold < 0.0:
            raise RuntimeError("KOLIBRI_MODERATION_TONE_THRESHOLD must be non-negative")

        paraphraser_endpoint = os.getenv("KOLIBRI_PARAPHRASER_ENDPOINT")
        paraphraser_api_key = os.getenv("KOLIBRI_PARAPHRASER_API_KEY")
        paraphraser_timeout_raw = os.getenv("KOLIBRI_PARAPHRASER_TIMEOUT", "10")
        try:
            paraphraser_timeout = float(paraphraser_timeout_raw)
        except ValueError as exc:
            raise RuntimeError("KOLIBRI_PARAPHRASER_TIMEOUT must be numeric") from exc
        if paraphraser_timeout <= 0:
            raise RuntimeError("KOLIBRI_PARAPHRASER_TIMEOUT must be positive")

        sso_enabled = _parse_bool(os.getenv("KOLIBRI_SSO_ENABLED"), default=True)
        saml_entity_id = os.getenv("KOLIBRI_SAML_ENTITY_ID", "urn:kolibri:enterprise").strip()
        saml_acs_url = os.getenv("KOLIBRI_SAML_ACS_URL")
        saml_audience = _parse_list(os.getenv("KOLIBRI_SAML_AUDIENCE")) or ["kolibri"]
        saml_role_attribute = os.getenv("KOLIBRI_SAML_ROLE_ATTRIBUTE", "https://kolibri.ai/claims/roles")
        saml_signature_attribute = os.getenv(
            "KOLIBRI_SAML_SIGNATURE_ATTRIBUTE", "https://kolibri.ai/claims/signature"
        )
        clock_skew_raw = os.getenv("KOLIBRI_SAML_CLOCK_SKEW", "120")
        try:
            saml_clock_skew_seconds = int(clock_skew_raw)
        except ValueError as exc:
            raise RuntimeError("KOLIBRI_SAML_CLOCK_SKEW must be integer seconds") from exc

        sso_shared_secret = os.getenv("KOLIBRI_SSO_SHARED_SECRET")
        session_ttl_raw = os.getenv("KOLIBRI_SSO_SESSION_TTL", "3600")
        try:
            sso_session_ttl_seconds = int(session_ttl_raw)
        except ValueError as exc:
            raise RuntimeError("KOLIBRI_SSO_SESSION_TTL must be integer seconds") from exc
        if sso_session_ttl_seconds <= 0:
            raise RuntimeError("KOLIBRI_SSO_SESSION_TTL must be positive")

        offline_mode_roles = _parse_list(os.getenv("KOLIBRI_SSO_OFFLINE_ROLES"))
        degraded_tokens = _parse_degraded_tokens(os.getenv("KOLIBRI_SSO_DEGRADED_TOKENS"))

        rbac_policy_path = os.getenv("KOLIBRI_RBAC_POLICY_PATH")
        audit_log_path = os.getenv("KOLIBRI_AUDIT_LOG_PATH", "logs/audit/enterprise.log")
        genome_log_path = os.getenv("KOLIBRI_GENOME_LOG_PATH", "logs/genome/events.log")
        prometheus_namespace = os.getenv("KOLIBRI_PROMETHEUS_NAMESPACE", "kolibri")
        log_level = os.getenv("KOLIBRI_LOG_LEVEL", "INFO").strip() or "INFO"
        log_json = _parse_bool(os.getenv("KOLIBRI_LOG_JSON"), default=True)

        return cls(
            response_mode=response_mode or "script",
            llm_endpoint=llm_endpoint,
            llm_api_key=llm_api_key,
            llm_model=llm_model,
            llm_timeout=llm_timeout,
            llm_temperature_default=llm_temperature_default,
            llm_max_tokens_default=llm_max_tokens_default,
            moderation_forbidden_topics=forbidden_topics,
            moderation_tone_negative_threshold=tone_threshold,
            paraphraser_endpoint=paraphraser_endpoint,
            paraphraser_api_key=paraphraser_api_key,
            paraphraser_timeout=paraphraser_timeout,
            sso_enabled=sso_enabled,
            saml_entity_id=saml_entity_id,
            saml_acs_url=saml_acs_url,
            saml_audience=saml_audience,
            saml_role_attribute=saml_role_attribute,
            saml_signature_attribute=saml_signature_attribute,
            saml_clock_skew_seconds=saml_clock_skew_seconds,
            sso_shared_secret=sso_shared_secret,
            sso_session_ttl_seconds=sso_session_ttl_seconds,
            offline_mode_roles=offline_mode_roles,
            degraded_tokens=degraded_tokens,
            rbac_policy_path=rbac_policy_path,
            audit_log_path=audit_log_path,
            genome_log_path=genome_log_path,
            prometheus_namespace=prometheus_namespace,
            log_level=log_level,
            log_json=log_json,
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.load()
