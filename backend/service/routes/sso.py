"""SSO and authentication endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Form, HTTPException, Response, status

from ..audit import log_audit_event, log_genome_event
from ..config import Settings, get_settings
from ..instrumentation import SSO_EVENTS
from ..schemas import SAMLLoginResponse
from ..security import AuthContext, issue_session_token, parse_saml_response, require_permission

__all__ = ["router"]

router = APIRouter()


@router.get("/api/v1/sso/saml/metadata")
async def saml_metadata(settings: Settings = Depends(get_settings)) -> Response:
    acs_url = settings.saml_acs_url or "/api/v1/sso/saml/acs"
    metadata = f"""
<EntityDescriptor xmlns=\"urn:oasis:names:tc:SAML:2.0:metadata\" entityID=\"{settings.saml_entity_id}\">
  <SPSSODescriptor WantAssertionsSigned=\"true\" AuthnRequestsSigned=\"false\" protocolSupportEnumeration=\"urn:oasis:names:tc:SAML:2.0:protocol\">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService Binding=\"urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST\" Location=\"{acs_url}\" index=\"1\" isDefault=\"true\"/>
  </SPSSODescriptor>
</EntityDescriptor>
""".strip()
    return Response(content=metadata, media_type="application/samlmetadata+xml")


@router.post("/api/v1/sso/saml/acs", response_model=SAMLLoginResponse)
async def saml_acs(
    saml_response: str = Form(..., alias="SAMLResponse"),
    relay_state: str | None = Form(default=None, alias="RelayState"),
    settings: Settings = Depends(get_settings),
) -> SAMLLoginResponse:
    context = parse_saml_response(saml_response, settings)
    try:
        token = issue_session_token(context, settings)
    except RuntimeError as exc:  # pragma: no cover - configuration error path
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    SSO_EVENTS.labels(event="login").inc()
    log_audit_event(
        event_type="sso.login",
        actor=context.subject,
        payload={"roles": sorted(context.roles), "relay_state": relay_state},
        settings=settings,
    )
    log_genome_event(
        stage="sso",
        actor=context.subject,
        payload={"session_id": context.session_id, "expires_at": context.session_expires_at},
        settings=settings,
    )
    return SAMLLoginResponse(
        token=token,
        subject=context.subject,
        expires_at=context.session_expires_at,
        relay_state=relay_state,
    )


@router.get("/api/v1/sso/session", response_model=SAMLLoginResponse)
async def saml_session(
    context: AuthContext = Depends(require_permission("kolibri.audit.read")),
) -> SAMLLoginResponse:
    return SAMLLoginResponse(
        token="redacted",
        subject=context.subject,
        expires_at=context.session_expires_at,
        relay_state=None,
    )
