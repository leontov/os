"""Action orchestration endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status

from ..actions import (
    ActionCatalogResponse,
    ActionMacro,
    ActionMacroListResponse,
    ActionMacroPayload,
    ActionRunRequest,
    ActionRunResult,
    get_macro_store,
    get_orchestrator,
)
from ..security import AuthContext, require_permission

__all__ = ["router"]

router = APIRouter()


@router.get("/api/v1/actions/catalog", response_model=ActionCatalogResponse)
async def actions_catalog(
    context: AuthContext = Depends(require_permission("kolibri.actions.run")),
) -> ActionCatalogResponse:
    orchestrator = get_orchestrator()
    recipes = orchestrator.list_descriptors()
    categories = sorted({category for recipe in recipes for category in recipe.categories})
    tags = sorted({tag for recipe in recipes for tag in recipe.tags})
    return ActionCatalogResponse(recipes=recipes, categories=categories, tags=tags)


@router.post("/api/v1/actions/run", response_model=ActionRunResult)
async def run_action(
    request: ActionRunRequest,
    context: AuthContext = Depends(require_permission("kolibri.actions.run")),
) -> ActionRunResult:
    orchestrator = get_orchestrator()
    return await orchestrator.execute(request.action, request.parameters, subject=context.subject)


@router.get("/api/v1/actions/macros", response_model=ActionMacroListResponse)
async def list_macros(
    context: AuthContext = Depends(require_permission("kolibri.actions.run")),
) -> ActionMacroListResponse:
    store = get_macro_store()
    items = await store.list(context.subject)
    return ActionMacroListResponse(items=items)


@router.post("/api/v1/actions/macros", response_model=ActionMacro)
async def create_macro(
    payload: ActionMacroPayload,
    context: AuthContext = Depends(require_permission("kolibri.actions.macros")),
) -> ActionMacro:
    store = get_macro_store()
    return await store.upsert(context.subject, payload)


@router.put("/api/v1/actions/macros/{macro_id}", response_model=ActionMacro)
async def update_macro(
    macro_id: str,
    payload: ActionMacroPayload,
    context: AuthContext = Depends(require_permission("kolibri.actions.macros")),
) -> ActionMacro:
    store = get_macro_store()
    return await store.upsert(context.subject, payload, macro_id=macro_id)


@router.delete("/api/v1/actions/macros/{macro_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_macro(
    macro_id: str,
    context: AuthContext = Depends(require_permission("kolibri.actions.macros")),
) -> Response:
    store = get_macro_store()
    await store.delete(context.subject, macro_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
