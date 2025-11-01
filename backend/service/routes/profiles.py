"""Profile management endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status

from ..profiles import (
    Profile,
    ProfileCreatePayload,
    ProfileLanguagesUpdate,
    ProfileListResponse,
    ProfileUpdatePayload,
    get_profile_store,
)
from ..security import AuthContext, require_permission

__all__ = ["router"]

router = APIRouter()


@router.get("/api/v1/profiles", response_model=ProfileListResponse)
async def list_profiles(
    context: AuthContext = Depends(require_permission("kolibri.profile.read")),
) -> ProfileListResponse:
    store = get_profile_store()
    profiles = await store.list(context.subject)
    return ProfileListResponse(items=profiles)


@router.get("/api/v1/profiles/{profile_id}", response_model=Profile)
async def get_profile(
    profile_id: str,
    context: AuthContext = Depends(require_permission("kolibri.profile.read")),
) -> Profile:
    store = get_profile_store()
    return await store.get(context.subject, profile_id)


@router.post("/api/v1/profiles", response_model=Profile, status_code=status.HTTP_201_CREATED)
async def create_profile(
    payload: ProfileCreatePayload,
    context: AuthContext = Depends(require_permission("kolibri.profile.write")),
) -> Profile:
    store = get_profile_store()
    return await store.create(context.subject, payload)


@router.put("/api/v1/profiles/{profile_id}", response_model=Profile)
async def update_profile(
    profile_id: str,
    payload: ProfileUpdatePayload,
    context: AuthContext = Depends(require_permission("kolibri.profile.write")),
) -> Profile:
    store = get_profile_store()
    return await store.update(context.subject, profile_id, payload)


@router.patch("/api/v1/profiles/{profile_id}/languages", response_model=Profile)
async def update_profile_languages(
    profile_id: str,
    payload: ProfileLanguagesUpdate,
    context: AuthContext = Depends(require_permission("kolibri.profile.write")),
) -> Profile:
    store = get_profile_store()
    return await store.update_languages(context.subject, profile_id, payload.languages)


@router.delete("/api/v1/profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile(
    profile_id: str,
    context: AuthContext = Depends(require_permission("kolibri.profile.write")),
) -> Response:
    store = get_profile_store()
    await store.delete(context.subject, profile_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
