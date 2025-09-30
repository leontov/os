"""Инфраструктура плагинов для чат-команд KolibriSim."""

from __future__ import annotations

from typing import Callable, Dict, Protocol, TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - используется только для подсказок типов
    from .kolibri_sim import KolibriSim


CommandHandler = Callable[["KolibriSim", str], str]


class ToolPlugin(Protocol):
    """Протокол плагина, регистрирующего команды KolibriSim."""

    def register_commands(self, registry: "ToolRegistry") -> None:
        """Регистрирует обработчики команд с помощью переданного реестра."""


class ToolRegistry:
    """Реестр чат-команд, предоставляемых плагинами."""

    def __init__(self) -> None:
        self._commands: Dict[str, CommandHandler] = {}

    @staticmethod
    def _normalize(command: str) -> str:
        return command.strip().lower()

    def register_command(self, command: str, handler: CommandHandler) -> None:
        normalized = self._normalize(command)
        if normalized in self._commands:
            raise ValueError(f"команда уже зарегистрирована: {normalized}")
        self._commands[normalized] = handler

    def register_plugin(self, plugin: ToolPlugin) -> None:
        plugin.register_commands(self)

    def dispatch(self, sim: "KolibriSim", command: str, argument: str) -> str:
        normalized = self._normalize(command)
        handler = self._commands.get(normalized)
        if handler is None:
            raise ValueError(f"неизвестная команда: {normalized}")
        return handler(sim, argument)

