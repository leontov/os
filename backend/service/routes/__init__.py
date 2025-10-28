"""Composable routers for the Kolibri backend service."""
from __future__ import annotations

from fastapi import APIRouter

from . import actions, health, inference, sso

__all__ = ["api_router"]

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(sso.router)
api_router.include_router(inference.router)
api_router.include_router(actions.router)
