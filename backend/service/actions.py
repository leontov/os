"""Action orchestration primitives exposed via the FastAPI service."""
from __future__ import annotations

import asyncio
import inspect
import time
import uuid
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Iterable, List, Literal, Optional

from fastapi import HTTPException, status
from pydantic import BaseModel, Field


ActionStatus = Literal["queued", "in_progress", "completed", "failed"]
LogLevel = Literal["debug", "info", "warning", "error"]


class ActionTimelineEntry(BaseModel):
    """Represents a single step in the execution timeline."""

    id: str
    title: str
    status: ActionStatus
    message: Optional[str] = None
    started_at: float = Field(description="UNIX timestamp (seconds)")
    finished_at: Optional[float] = Field(default=None, description="UNIX timestamp (seconds)")
    duration_ms: Optional[float] = None


class ActionLogEntry(BaseModel):
    """Structured log message emitted during execution."""

    id: str
    step_id: Optional[str]
    level: LogLevel
    message: str
    timestamp: float


class ActionPermissionEntry(BaseModel):
    """Audit trail of permissions that were evaluated for the action."""

    id: str
    name: str
    granted: bool
    reason: Optional[str] = None
    timestamp: float
    step_id: Optional[str] = None


class ActionExecutionError(RuntimeError):
    """Raised when a tool fails due to user-provided input or recoverable error."""


class ActionInputSpec(BaseModel):
    """Describes a single input parameter expected by a recipe/tool."""

    key: str
    label: str
    type: Literal["string", "number", "boolean", "select"]
    description: Optional[str] = None
    placeholder: Optional[str] = None
    default: Optional[Any] = None
    options: Optional[List[Dict[str, Any]]] = None
    required: bool = False


class ActionRecipeDescriptor(BaseModel):
    """Metadata describing a server-side action recipe."""

    name: str
    title: str
    description: str
    categories: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    estimated_duration: Optional[str] = None
    inputs: List[ActionInputSpec] = Field(default_factory=list)


class ActionRunResult(BaseModel):
    """Result returned to clients after executing an action."""

    action: str
    status: Literal["succeeded", "failed"]
    parameters: Dict[str, Any] = Field(default_factory=dict)
    output: Dict[str, Any] = Field(default_factory=dict)
    timeline: List[ActionTimelineEntry] = Field(default_factory=list)
    logs: List[ActionLogEntry] = Field(default_factory=list)
    permissions: List[ActionPermissionEntry] = Field(default_factory=list)


class ActionExecutionContext:
    """Context shared with tool handlers to produce diagnostics."""

    def __init__(self, action: str, subject: str) -> None:
        self.action = action
        self.subject = subject
        self.timeline: List[ActionTimelineEntry] = []
        self.logs: List[ActionLogEntry] = []
        self.permissions: List[ActionPermissionEntry] = []
        self._timeline_index: Dict[str, ActionTimelineEntry] = {}

        initial_entry = ActionTimelineEntry(
            id=str(uuid.uuid4()),
            title="Получен запрос",
            status="queued",
            message=f"Инициатор: {subject or 'неизвестно'}",
            started_at=time.time(),
            finished_at=None,
            duration_ms=None,
        )
        self.timeline.append(initial_entry)
        self._timeline_index[initial_entry.id] = initial_entry

    def _register(self, entry: ActionTimelineEntry) -> None:
        self.timeline.append(entry)
        self._timeline_index[entry.id] = entry

    def step(self, title: str, message: Optional[str] = None) -> "_ActionStepScope":
        entry = ActionTimelineEntry(
            id=str(uuid.uuid4()),
            title=title,
            status="in_progress",
            message=message,
            started_at=time.time(),
            finished_at=None,
            duration_ms=None,
        )
        self._register(entry)
        return _ActionStepScope(entry, self)

    def log(self, message: str, *, level: LogLevel = "info", step_id: Optional[str] = None) -> None:
        record = ActionLogEntry(
            id=str(uuid.uuid4()),
            step_id=step_id,
            level=level,
            message=message,
            timestamp=time.time(),
        )
        self.logs.append(record)

    def request_permission(
        self,
        name: str,
        *,
        granted: bool,
        reason: Optional[str] = None,
        step_id: Optional[str] = None,
    ) -> None:
        entry = ActionPermissionEntry(
            id=str(uuid.uuid4()),
            name=name,
            granted=granted,
            reason=reason,
            timestamp=time.time(),
            step_id=step_id,
        )
        self.permissions.append(entry)
        self.log(
            f"Проверка доступа {name}: {'разрешено' if granted else 'запрещено'}",
            level="debug" if granted else "warning",
            step_id=step_id,
        )

    def fail(self, message: str) -> None:
        entry = ActionTimelineEntry(
            id=str(uuid.uuid4()),
            title="Ошибка",
            status="failed",
            message=message,
            started_at=time.time(),
            finished_at=time.time(),
            duration_ms=0.0,
        )
        self._register(entry)
        self.log(message, level="error", step_id=entry.id)

    def complete(self, message: Optional[str] = None) -> None:
        entry = ActionTimelineEntry(
            id=str(uuid.uuid4()),
            title="Завершено",
            status="completed",
            message=message,
            started_at=time.time(),
            finished_at=time.time(),
            duration_ms=0.0,
        )
        self._register(entry)


class _ActionStepScope(AbstractAsyncContextManager["_ActionStepScope"]):
    """Context manager that updates the lifecycle of a timeline entry."""

    def __init__(self, entry: ActionTimelineEntry, context: ActionExecutionContext) -> None:
        self.entry = entry
        self.context = context

    async def __aenter__(self) -> "_ActionStepScope":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:  # type: ignore[override]
        self.__exit__(exc_type, exc, tb)

    def __enter__(self) -> "_ActionStepScope":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.entry.finished_at = time.time()
        self.entry.duration_ms = (self.entry.finished_at - self.entry.started_at) * 1000.0
        if exc:
            self.entry.status = "failed"
            self.entry.message = str(exc)
            self.context.log(str(exc), level="error", step_id=self.entry.id)
        else:
            self.entry.status = "completed"

    def update(self, message: str) -> None:
        self.entry.message = message
        self.context.log(message, step_id=self.entry.id)

    def log(self, message: str, level: LogLevel = "info") -> None:
        self.context.log(message, level=level, step_id=self.entry.id)

    def request_permission(self, name: str, *, granted: bool, reason: Optional[str] = None) -> None:
        self.context.request_permission(name, granted=granted, reason=reason, step_id=self.entry.id)

    @property
    def id(self) -> str:
        return self.entry.id


ActionHandler = Callable[[Dict[str, Any], ActionExecutionContext], Any]


@dataclass
class ActionTool:
    """A server-side tool that can be orchestrated."""

    descriptor: ActionRecipeDescriptor
    handler: ActionHandler


class ActionOrchestrator:
    """Registry and execution manager for server-side tools."""

    def __init__(self) -> None:
        self._tools: Dict[str, ActionTool] = {}

    def register(self, tool: ActionTool) -> None:
        name = tool.descriptor.name
        if name in self._tools:
            raise ValueError(f"Tool {name!r} is already registered")
        self._tools[name] = tool

    def list_descriptors(self) -> List[ActionRecipeDescriptor]:
        return [tool.descriptor for tool in self._tools.values()]

    async def execute(self, name: str, parameters: Dict[str, Any], *, subject: str) -> ActionRunResult:
        if name not in self._tools:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"Action {name!r} is not registered")

        tool = self._tools[name]
        context = ActionExecutionContext(name, subject)
        sanitized_parameters = self._apply_defaults(tool.descriptor.inputs, parameters)

        try:
            result = tool.handler(sanitized_parameters, context)
            if inspect.isawaitable(result):
                result = await result  # type: ignore[assignment]
        except ActionExecutionError as exc:
            context.fail(str(exc))
            return ActionRunResult(
                action=name,
                status="failed",
                parameters=sanitized_parameters,
                output={"error": str(exc)},
                timeline=context.timeline,
                logs=context.logs,
                permissions=context.permissions,
            )
        except Exception as exc:  # pragma: no cover - defensive branch
            context.fail("Непредвиденная ошибка выполнения")
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

        context.complete("Готово")
        payload: Dict[str, Any] = result if isinstance(result, dict) else {"result": result}
        return ActionRunResult(
            action=name,
            status="succeeded",
            parameters=sanitized_parameters,
            output=payload,
            timeline=context.timeline,
            logs=context.logs,
            permissions=context.permissions,
        )

    @staticmethod
    def _apply_defaults(inputs: Iterable[ActionInputSpec], parameters: Dict[str, Any]) -> Dict[str, Any]:
        sanitized: Dict[str, Any] = {}
        for spec in inputs:
            if spec.key in parameters:
                sanitized[spec.key] = parameters[spec.key]
            elif spec.default is not None:
                sanitized[spec.key] = spec.default
            elif spec.required:
                raise ActionExecutionError(f"Обязательный параметр {spec.key!r} отсутствует")
        for key, value in parameters.items():
            if key not in sanitized:
                sanitized[key] = value
        return sanitized


class ActionRunRequest(BaseModel):
    action: str = Field(description="Имя действия из каталога")
    parameters: Dict[str, Any] = Field(default_factory=dict)


class ActionCatalogResponse(BaseModel):
    recipes: List[ActionRecipeDescriptor]
    categories: List[str]
    tags: List[str]


class ActionMacroPayload(BaseModel):
    name: str
    action: str
    parameters: Dict[str, Any] = Field(default_factory=dict)
    tags: List[str] = Field(default_factory=list)


class ActionMacro(ActionMacroPayload):
    id: str
    created_at: float
    updated_at: float


class ActionMacroListResponse(BaseModel):
    items: List[ActionMacro]


@dataclass
class InMemoryMacroStore:
    """Thread-safe in-memory storage for user macros."""

    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    _storage: Dict[str, Dict[str, ActionMacro]] = field(default_factory=dict)

    async def list(self, subject: str) -> List[ActionMacro]:
        async with self._lock:
            return list(self._storage.get(subject, {}).values())

    async def upsert(self, subject: str, payload: ActionMacroPayload, macro_id: Optional[str] = None) -> ActionMacro:
        async with self._lock:
            user_macros = self._storage.setdefault(subject, {})
            now = time.time()
            if macro_id is None:
                macro_id = str(uuid.uuid4())
            existing = user_macros.get(macro_id)
            macro = ActionMacro(
                id=macro_id,
                name=payload.name,
                action=payload.action,
                parameters=payload.parameters,
                tags=payload.tags,
                created_at=existing.created_at if existing else now,
                updated_at=now,
            )
            user_macros[macro_id] = macro
            return macro

    async def delete(self, subject: str, macro_id: str) -> None:
        async with self._lock:
            user_macros = self._storage.get(subject)
            if not user_macros or macro_id not in user_macros:
                raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Макрос не найден")
            del user_macros[macro_id]


@dataclass
class _ActionRegistry:
    orchestrator: ActionOrchestrator = field(default_factory=ActionOrchestrator)
    macros: InMemoryMacroStore = field(default_factory=InMemoryMacroStore)


_REGISTRY: Optional[_ActionRegistry] = None


def get_registry() -> _ActionRegistry:
    global _REGISTRY
    if _REGISTRY is None:
        orchestrator = ActionOrchestrator()
        _register_builtin_tools(orchestrator)
        _REGISTRY = _ActionRegistry(orchestrator=orchestrator)
    return _REGISTRY


def get_orchestrator() -> ActionOrchestrator:
    return get_registry().orchestrator


def get_macro_store() -> InMemoryMacroStore:
    return get_registry().macros


def reset_actions_registry() -> None:
    """Reset global registry state (primarily for tests)."""

    global _REGISTRY
    _REGISTRY = None


def _register_builtin_tools(orchestrator: ActionOrchestrator) -> None:
    """Populate the orchestrator with bundled demo tools."""

    def _ingest_handler(parameters: Dict[str, Any], ctx: ActionExecutionContext) -> Dict[str, Any]:
        dataset = parameters.get("dataset", "")
        if not dataset:
            raise ActionExecutionError("Не выбран источник данных")

        with ctx.step("Проверка параметров") as step:
            step.update(f"Источник: {dataset}")
            priority = parameters.get("priority", "standard")
            step.log(f"Приоритет загрузки: {priority}")
            step.request_permission("kolibri.genome.write", granted=True, reason="Требуется для записи в память")

        with ctx.step("Извлечение документов") as step:
            step.log("Старт выгрузки")
            total = 5
            for index in range(1, total + 1):
                step.log(f"Обработан пакет {index}/{total}")
            ctx.log("Выгрузка завершена", step_id=step.id)

        with ctx.step("Обновление индекса") as step:
            step.log("Построение векторного индекса")
            step.log("Обновление кеша поиска", level="debug")

        return {"dataset": dataset, "documents_ingested": 125, "priority": parameters.get("priority", "standard")}

    orchestrator.register(
        ActionTool(
            descriptor=ActionRecipeDescriptor(
                name="ingest_dataset",
                title="Синхронизация источника",
                description="Загружает документы во внутренний геном Kolibri с обновлением индексов.",
                categories=["knowledge", "automation"],
                tags=["etl", "sync", "knowledge"],
                estimated_duration="4-6 мин",
                inputs=[
                    ActionInputSpec(
                        key="dataset",
                        label="Источник",
                        type="select",
                        description="Выберите хранилище или каталог, который нужно синхронизировать.",
                        options=[
                            {"label": "Корпоративный портал", "value": "intranet"},
                            {"label": "База знаний клиентов", "value": "customers"},
                            {"label": "Локальная папка", "value": "local"},
                        ],
                        required=True,
                    ),
                    ActionInputSpec(
                        key="priority",
                        label="Приоритет",
                        type="select",
                        options=[
                            {"label": "Стандартный", "value": "standard"},
                            {"label": "Высокий", "value": "high"},
                        ],
                        default="standard",
                    ),
                ],
            ),
            handler=_ingest_handler,
        )
    )

    def _benchmark_handler(parameters: Dict[str, Any], ctx: ActionExecutionContext) -> Dict[str, Any]:
        model = parameters.get("model") or "kolibri-large"
        dataset = parameters.get("benchmark", "russian_qa")
        iterations = int(parameters.get("iterations", 3))

        with ctx.step("Подготовка стенда") as step:
            step.log(f"Модель: {model}")
            step.log(f"Набор: {dataset}")
            step.request_permission("kolibri.benchmarks.run", granted=True, reason="Создание тестовых экземпляров")

        with ctx.step("Запуск испытаний") as step:
            for iteration in range(1, iterations + 1):
                step.log(f"Итерация {iteration}/{iterations}")

        with ctx.step("Сбор метрик") as step:
            step.log("Агрегация результатов")

        return {
            "model": model,
            "benchmark": dataset,
            "iterations": iterations,
            "metrics": {"accuracy": 0.82, "latency_ms": 740},
        }

    orchestrator.register(
        ActionTool(
            descriptor=ActionRecipeDescriptor(
                name="benchmark_model",
                title="Бенчмарк ядра",
                description="Прогоняет сценарии качества и латентности для выбранной модели.",
                categories=["observability", "automation"],
                tags=["metrics", "quality", "latency"],
                estimated_duration="2-3 мин",
                inputs=[
                    ActionInputSpec(
                        key="model",
                        label="Модель",
                        type="string",
                        placeholder="kolibri-large",
                        default="kolibri-large",
                    ),
                    ActionInputSpec(
                        key="benchmark",
                        label="Набор тестов",
                        type="select",
                        options=[
                            {"label": "Russian QA", "value": "russian_qa"},
                            {"label": "Legal QA", "value": "legal_qa"},
                            {"label": "Financial QA", "value": "fin_qa"},
                        ],
                        default="russian_qa",
                    ),
                    ActionInputSpec(
                        key="iterations",
                        label="Количество итераций",
                        type="number",
                        default=3,
                    ),
                ],
            ),
            handler=_benchmark_handler,
        )
    )

    def _incident_handler(parameters: Dict[str, Any], ctx: ActionExecutionContext) -> Dict[str, Any]:
        ticket = parameters.get("ticket")
        if not ticket:
            raise ActionExecutionError("Номер инцидента обязателен")

        with ctx.step("Анализ контекста") as step:
            step.log(f"Инцидент: {ticket}")
            step.request_permission("kolibri.incidents.read", granted=True, reason="Чтение журнала мониторинга")

        with ctx.step("Применение рецепта") as step:
            recipe = parameters.get("playbook", "rebuild-cache")
            step.log(f"Рецепт: {recipe}")
            if recipe not in {"rebuild-cache", "rotate-keys", "drain-queue"}:
                raise ActionExecutionError("Неизвестный плейбук")
            step.log("Прогрев кеша")

        return {"ticket": ticket, "playbook": recipe, "actions": ["flush_cache", "notify_ops"]}

    orchestrator.register(
        ActionTool(
            descriptor=ActionRecipeDescriptor(
                name="resolve_incident",
                title="Инцидентный плейбук",
                description="Автоматизирует типовые шаги восстановления после инцидента.",
                categories=["operations"],
                tags=["incident", "automation", "ops"],
                estimated_duration="1-2 мин",
                inputs=[
                    ActionInputSpec(
                        key="ticket",
                        label="Номер инцидента",
                        type="string",
                        required=True,
                        placeholder="INC-2048",
                    ),
                    ActionInputSpec(
                        key="playbook",
                        label="Плейбук",
                        type="select",
                        options=[
                            {"label": "Перестроить кеш", "value": "rebuild-cache"},
                            {"label": "Ротация ключей", "value": "rotate-keys"},
                            {"label": "Очистка очереди", "value": "drain-queue"},
                        ],
                        default="rebuild-cache",
                    ),
                ],
            ),
            handler=_incident_handler,
        )
    )

