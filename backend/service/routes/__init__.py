"""Composable routers for the Kolibri backend service."""
from __future__ import annotations

from fastapi import APIRouter

from . import actions, health, inference, profiles, sso

__all__ = ["api_router"]

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(sso.router)
api_router.include_router(inference.router)
api_router.include_router(profiles.router)
api_router.include_router(actions.router)
