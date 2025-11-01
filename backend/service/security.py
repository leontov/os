"""Security primitives for the Kolibri enterprise bundle."""
from __future__ import annotations

import base64
import binascii
import datetime as dt
import hashlib
import hmac
import json
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, MutableMapping, Optional, Sequence, Set

from fastapi import Depends, Header, HTTPException, status

from .config import Settings, get_settings

SAML_ASSERTION_NS = "urn:oasis:names:tc:SAML:2.0:assertion"
SAML_PROTOCOL_NS = "urn:oasis:names:tc:SAML:2.0:protocol"
SAML_DS_NS = "http://www.w3.org/2000/09/xmldsig#"

NAMESPACES = {
    "saml2": SAML_ASSERTION_NS,
    "samlp": SAML_PROTOCOL_NS,
    "ds": SAML_DS_NS,
}


@dataclass(frozen=True)
class AuthContext:
    """Resolved authentication context for the current request."""

    subject: str
    roles: Set[str]
    attributes: Mapping[str, str]
    session_expires_at: Optional[float] = None
    session_id: Optional[str] = None


class RBACPolicy:
    """A minimal, file-driven role based access control policy."""

    def __init__(self, mapping: Mapping[str, Sequence[str]]) -> None:
        if not mapping:
            raise ValueError("RBAC policy must define at least one role")
        self._permissions: Dict[str, Set[str]] = {
            role: {permission.strip() for permission in permissions if permission.strip()}
            for role, permissions in mapping.items()
        }
        for role, permissions in self._permissions.items():
            if not permissions:
                raise ValueError(f"Role {role!r} does not define any permissions")

    def permissions_for(self, roles: Iterable[str]) -> Set[str]:
        result: Set[str] = set()
        for role in roles:
            perms = self._permissions.get(role)
            if perms:
                result.update(perms)
        return result

    def is_allowed(self, roles: Iterable[str], permission: str) -> bool:
        granted = self.permissions_for(roles)
        return permission in granted or "*" in granted

    @classmethod
    def from_dict(cls, payload: Mapping[str, Sequence[str]]) -> "RBACPolicy":
        return cls(payload)


DEFAULT_RBAC_MAPPING: Dict[str, Sequence[str]] = {
    "system:admin": ("*",),
    "operator": (
        "kolibri.infer",
        "kolibri.analytics.view",
        "kolibri.audit.read",
        "kolibri.actions.run",
        "kolibri.actions.macros",
        "kolibri.profile.read",
        "kolibri.profile.write",
    ),
    "auditor": (
        "kolibri.audit.read",
        "kolibri.genome.read",
        "kolibri.profile.read",
    ),
    "observer": ("kolibri.analytics.view", "kolibri.profile.read"),
}


@lru_cache(maxsize=4)
def _load_rbac_policy(path: Optional[str]) -> RBACPolicy:
    if not path:
        return RBACPolicy.from_dict(DEFAULT_RBAC_MAPPING)

    policy_path = Path(path)
    try:
        contents = policy_path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:  # pragma: no cover - defensive branch
        raise RuntimeError(f"RBAC policy file {policy_path} not found") from exc
    try:
        payload = json.loads(contents)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"RBAC policy file {policy_path} is not valid JSON") from exc
    if not isinstance(payload, Mapping):
        raise RuntimeError("RBAC policy must be a JSON object mapping roles to permissions")
    mapping: Dict[str, List[str]] = {}
    for role, permissions in payload.items():
        if not isinstance(role, str):
            raise RuntimeError("RBAC role names must be strings")
        if not isinstance(permissions, Sequence):
            raise RuntimeError(f"Permissions for role {role!r} must be a list")
        mapping[role] = [str(permission) for permission in permissions]
    return RBACPolicy.from_dict(mapping)


def get_rbac_policy(settings: Settings = Depends(get_settings)) -> RBACPolicy:
    return _load_rbac_policy(settings.rbac_policy_path)


def _decode_base64(data: str) -> bytes:
    try:
        return base64.b64decode(data, validate=True)
    except binascii.Error as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Malformed base64 payload") from exc


def _parse_instant(value: str) -> float:
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1]
    try:
        dt_value = dt.datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid SAML timestamp") from exc
    return dt_value.replace(tzinfo=dt.timezone.utc).timestamp()


def _extract_first(element: ET.Element, xpath: str) -> Optional[ET.Element]:
    return element.find(xpath, NAMESPACES)


def parse_saml_response(raw_response: str, settings: Settings) -> AuthContext:
    assertion_xml = _decode_base64(raw_response)
    try:
        root = ET.fromstring(assertion_xml)
    except ET.ParseError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="SAML assertion is not well formed") from exc

    assertion = root.find(".//saml2:Assertion", NAMESPACES)
    if assertion is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="SAML assertion missing")

    subject = assertion.findtext(".//saml2:Subject/saml2:NameID", default="", namespaces=NAMESPACES).strip()
    if not subject:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="SAML subject missing")

    conditions = assertion.find(".//saml2:Conditions", NAMESPACES)
    if conditions is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="SAML conditions missing")

    not_before = conditions.get("NotBefore")
    not_on_or_after = conditions.get("NotOnOrAfter")
    now = time.time()
    if not_on_or_after is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="SAML condition NotOnOrAfter missing")

    expires_at = _parse_instant(not_on_or_after)
    if now > expires_at + settings.saml_clock_skew_seconds:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="SAML assertion has expired")

    if not_before:
        valid_from = _parse_instant(not_before) - settings.saml_clock_skew_seconds
        if now + settings.saml_clock_skew_seconds < valid_from:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="SAML assertion is not yet valid")

    audiences = {
        audience.text.strip()
        for audience in assertion.findall(
            ".//saml2:Conditions/saml2:AudienceRestriction/saml2:Audience", NAMESPACES
        )
        if audience.text
    }
    if audiences and not audiences.intersection(settings.saml_audience):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="SAML audience is not accepted")

    attributes: Dict[str, str] = {}
    roles: Set[str] = set()
    signature_value: Optional[str] = None
    for attribute in assertion.findall(".//saml2:AttributeStatement/saml2:Attribute", NAMESPACES):
        name = attribute.get("Name", "").strip()
        values = [value.text.strip() for value in attribute.findall("saml2:AttributeValue", NAMESPACES) if value.text]
        if not name or not values:
            continue
        if name == settings.saml_role_attribute:
            roles.update(values)
        elif name == settings.saml_signature_attribute:
            signature_value = values[0]
        else:
            attributes[name] = values[0]

    if not roles:
        roles.add("observer")

    if settings.sso_shared_secret:
        if not signature_value:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="SAML signature attribute missing")
        expected = hmac.new(
            settings.sso_shared_secret.encode("utf-8"),
            f"{subject}|{int(expires_at)}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, signature_value):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="SAML signature mismatch")

    return AuthContext(
        subject=subject,
        roles=roles,
        attributes=attributes,
        session_expires_at=expires_at,
        session_id=assertion.get("ID"),
    )


def _sign_payload(payload: Mapping[str, object], secret: str) -> str:
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    signature = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).digest()
    token_body = base64.urlsafe_b64encode(body).rstrip(b"=")
    token_sig = base64.urlsafe_b64encode(signature).rstrip(b"=")
    return f"{token_body.decode('ascii')}.{token_sig.decode('ascii')}"


def _verify_payload(token: str, secret: str) -> Mapping[str, object]:
    try:
        body_part, sig_part = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Malformed session token") from exc
    body_bytes = base64.urlsafe_b64decode(body_part + "==")
    provided_sig = base64.urlsafe_b64decode(sig_part + "==")
    expected_sig = hmac.new(secret.encode("utf-8"), body_bytes, hashlib.sha256).digest()
    if not hmac.compare_digest(provided_sig, expected_sig):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid session signature")
    try:
        payload = json.loads(body_bytes.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid session payload") from exc
    if not isinstance(payload, MutableMapping):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid session payload")
    return payload


def issue_session_token(context: AuthContext, settings: Settings) -> str:
    if not settings.sso_shared_secret:
        raise RuntimeError("KOLIBRI_SSO_SHARED_SECRET must be configured to issue tokens")
    now = int(time.time())
    expires_at = int(context.session_expires_at or (now + settings.sso_session_ttl_seconds))
    payload = {
        "sub": context.subject,
        "roles": sorted(context.roles),
        "attrs": dict(context.attributes),
        "iat": now,
        "exp": expires_at,
        "sid": context.session_id,
    }
    return _sign_payload(payload, settings.sso_shared_secret)


def verify_session_token(token: str, settings: Settings) -> AuthContext:
    degraded_roles = settings.degraded_tokens.get(token)
    if degraded_roles:
        return AuthContext(
            subject="degraded-mode",
            roles=set(degraded_roles),
            attributes={"mode": "degraded"},
            session_expires_at=None,
            session_id=None,
        )

    if not settings.sso_shared_secret:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="SSO secret is not configured")

    payload = _verify_payload(token, settings.sso_shared_secret)
    exp = payload.get("exp")
    now = time.time()
    if isinstance(exp, (int, float)) and now > float(exp):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Session token expired")

    subject = str(payload.get("sub", "")).strip()
    if not subject:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Session token missing subject")

    roles_payload = payload.get("roles")
    if isinstance(roles_payload, Sequence):
        roles = {str(role) for role in roles_payload}
    else:
        roles = {"observer"}

    attrs_payload = payload.get("attrs")
    attributes: Dict[str, str]
    if isinstance(attrs_payload, Mapping):
        attributes = {str(key): str(value) for key, value in attrs_payload.items()}
    else:
        attributes = {}

    return AuthContext(
        subject=subject,
        roles=roles,
        attributes=attributes,
        session_expires_at=float(exp) if isinstance(exp, (int, float)) else None,
        session_id=str(payload.get("sid")) if payload.get("sid") else None,
    )


def get_current_identity(
    authorization: Optional[str] = Header(default=None, convert_underscores=False),
    settings: Settings = Depends(get_settings),
) -> AuthContext:
    if not settings.sso_enabled:
        roles = set(settings.offline_mode_roles or ["system:admin"])
        return AuthContext(
            subject="offline-mode",
            roles=roles,
            attributes={"mode": "offline"},
            session_expires_at=None,
            session_id=None,
        )

    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        if not token:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Empty bearer token")
        return verify_session_token(token, settings)

    raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")


def require_permission(permission: str):
    def dependency(
        context: AuthContext = Depends(get_current_identity),
        policy: RBACPolicy = Depends(get_rbac_policy),
    ) -> AuthContext:
        if not policy.is_allowed(context.roles, permission):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return context

    return dependency
