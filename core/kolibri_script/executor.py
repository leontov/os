"""Минималистичный исполнитель KolibriScript для Python-тестов.

Модуль реализует минималистичный рантайм сценариев KolibriScript, который
используется в тестах для проверки интеграции с ``KolibriSim``. Он содержит три
ключевых части:

*   :class:`ExecutionContext` — хранит переменные сценария, стек блоков и
    предоставляет методы нормализации состояния.
*   :class:`KolibriSimAdapter` — адаптирует вызовы симулятора и транслирует их
    в эффекты (журнал, обращения к геному, роевые команды).
*   :class:`Executor` — последовательный интерпретатор упрощённого набора
    инструкций.

Реализация не претендует на полноту настоящего KolibriScript, но отражает
ключевые концепции языка: блоки, переменные, взаимодействие с геномом и
системой эффектов. Благодаря этому можно писать детерминированные unit-тесты,
используя настоящую реализацию KolibriSim.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Optional, Protocol, Sequence

from core.kolibri_sim import KolibriSim, ZapisBloka


class ExecutorEffects(Protocol):
    """Интерфейс слоя эффектов KolibriScript.

    Исполнитель делегирует этому интерфейсу все побочные эффекты. Такая
    абстракция позволяет в тестах подменять поведение и собирать события для
    последующего анализа.
    """

    def log(self, tip: str, soobshenie: str, *, block: Optional[str]) -> None:
        """Фиксирует сообщение журнала в контексте текущего блока."""

    def record_genome_access(
        self,
        deistvie: str,
        *,
        block: Optional[str],
        zapis: Optional[ZapisBloka],
    ) -> None:
        """Сообщает об обращении к геному (создание или чтение блока)."""

    def swarm_callback(
        self,
        komanda: str,
        dannye: Mapping[str, Any],
        *,
        block: Optional[str],
    ) -> None:
        """Передаёт сведения о роевой команде."""

    def snapshot(self) -> Mapping[str, Any]:
        """Возвращает сериализуемое представление накопленных эффектов."""


@dataclass
class DefaultExecutorEffects:
    """Стандартная реализация эффектов, используемая в тестах."""

    _logs: List[Dict[str, Any]] = field(default_factory=list)
    _genome_events: List[Dict[str, Any]] = field(default_factory=list)
    _swarm_events: List[Dict[str, Any]] = field(default_factory=list)

    def log(self, tip: str, soobshenie: str, *, block: Optional[str]) -> None:
        self._logs.append({"tip": tip, "soobshenie": soobshenie, "block": block})

    def record_genome_access(
        self,
        deistvie: str,
        *,
        block: Optional[str],
        zapis: Optional[ZapisBloka],
    ) -> None:
        blok_info: Optional[Dict[str, Any]] = None
        if zapis is not None:
            blok_info = {"nomer": zapis.nomer}
        self._genome_events.append(
            {
                "deistvie": deistvie,
                "block": block,
                "zapis": blok_info,
            }
        )

    def swarm_callback(
        self,
        komanda: str,
        dannye: Mapping[str, Any],
        *,
        block: Optional[str],
    ) -> None:
        self._swarm_events.append(
            {
                "komanda": komanda,
                "block": block,
                "dannye": dict(dannye),
            }
        )

    def snapshot(self) -> Mapping[str, Any]:
        return {
            "logs": [dict(zapis) for zapis in self._logs],
            "genome_events": [dict(zapis) for zapis in self._genome_events],
            "swarm_events": [dict(zapis) for zapis in self._swarm_events],
        }


@dataclass
class BlockFrame:
    """Элемент стека блоков KolibriScript."""

    name: str
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ExecutionContext:
    """Сохраняет состояние исполнения KolibriScript."""

    sim: KolibriSim
    effects: ExecutorEffects
    variables: MutableMapping[str, Any] = field(default_factory=dict)
    block_stack: List[BlockFrame] = field(default_factory=list)

    def push_block(self, name: str, **metadata: Any) -> BlockFrame:
        frame = BlockFrame(name=name, metadata=dict(metadata))
        self.block_stack.append(frame)
        return frame

    def pop_block(self) -> BlockFrame:
        if not self.block_stack:
            raise RuntimeError("стек блоков пуст при попытке выхода")
        return self.block_stack.pop()

    def current_block(self) -> Optional[str]:
        return self.block_stack[-1].name if self.block_stack else None

    def set_var(self, name: str, value: Any) -> None:
        self.variables[name] = value

    def get_var(self, name: str) -> Any:
        if name not in self.variables:
            raise KeyError(f"переменная '{name}' не определена")
        return self.variables[name]

    def _normalize(self, value: Any) -> Any:
        if isinstance(value, ZapisBloka):
            return {
                "nomer": value.nomer,
                "pred_hash": value.pred_hash,
                "itogovy_hash": value.itogovy_hash,
            }
        if isinstance(value, dict):
            return {k: self._normalize(value[k]) for k in sorted(value)}
        if isinstance(value, list):
            return [self._normalize(elem) for elem in value]
        if isinstance(value, tuple):
            return [self._normalize(elem) for elem in value]
        return value

    def snapshot(self) -> "ExecutionSnapshot":
        normalized_vars = {
            key: self._normalize(self.variables[key])
            for key in sorted(self.variables)
        }
        effects_snapshot = self._normalize(dict(self.effects.snapshot()))
        remaining_blocks = [frame.name for frame in self.block_stack]
        return ExecutionSnapshot(
            variables=normalized_vars,
            effects=effects_snapshot,
            block_stack=remaining_blocks,
            genome_length=len(self.sim.genom),
        )


@dataclass(eq=True)
class ExecutionSnapshot:
    """Сериализуемое представление результата исполнения."""

    variables: Mapping[str, Any]
    effects: Mapping[str, Any]
    block_stack: Sequence[str]
    genome_length: int


@dataclass
class KolibriSimAdapter:
    """Высокоуровневая обёртка над :class:`KolibriSim`."""

    sim: KolibriSim
    effects: ExecutorEffects

    def _last_block(self) -> Optional[ZapisBloka]:
        return self.sim.genom[-1] if self.sim.genom else None

    def teach(self, stimul: str, otvet: str, *, block: Optional[str]) -> None:
        self.sim.obuchit_svjaz(stimul, otvet)
        self.effects.log("TEACH", f"{stimul}->{otvet}", block=block)
        self.effects.record_genome_access("TEACH", block=block, zapis=self._last_block())

    def ask(self, stimul: str, *, block: Optional[str]) -> str:
        otvet = self.sim.sprosit(stimul)
        self.effects.log("ASK", f"{stimul}->{otvet}", block=block)
        self.effects.record_genome_access("ASK", block=block, zapis=self._last_block())
        return otvet

    def evolve(self, kontekst: str, *, block: Optional[str]) -> str:
        nazvanie = self.sim.evolyuciya_formul(kontekst)
        self.effects.log("EVOLVE", f"{nazvanie}@{kontekst}", block=block)
        self.effects.record_genome_access("FORMULA", block=block, zapis=self._last_block())
        return nazvanie

    def evaluate(self, nazvanie: str, uspeh: float, *, block: Optional[str]) -> float:
        znachenie = self.sim.ocenit_formulu(nazvanie, uspeh)
        self.effects.log("EVALUATE", f"{nazvanie}={znachenie:.3f}", block=block)
        self.effects.record_genome_access("FITNESS", block=block, zapis=self._last_block())
        return znachenie

    def genome_snapshot(self, *, limit: Optional[int], block: Optional[str]) -> List[Mapping[str, Any]]:
        blocks: Iterable[ZapisBloka]
        if limit is not None:
            blocks = self.sim.genom[-limit:]
        else:
            blocks = self.sim.genom
        snapshot = [{"nomer": blok.nomer} for blok in blocks]
        self.effects.record_genome_access("SNAPSHOT", block=block, zapis=None)
        return snapshot

    def get_formula(self, nazvanie: str, *, block: Optional[str]) -> Mapping[str, Any]:
        zapis = dict(self.sim.formuly[nazvanie])
        self.effects.log("FORMULA", f"{nazvanie}", block=block)
        return zapis

    def swarm(self, komanda: str, dannye: Mapping[str, Any], *, block: Optional[str]) -> None:
        self.effects.log("SWARM", komanda, block=block)
        self.effects.swarm_callback(komanda, dannye, block=block)


class Executor:
    """Интерпретатор упрощённых инструкций KolibriScript."""

    def __init__(
        self,
        sim: KolibriSim,
        *,
        effects: Optional[ExecutorEffects] = None,
    ) -> None:
        self.effects = effects or DefaultExecutorEffects()
        self.context = ExecutionContext(sim=sim, effects=self.effects)
        self.adapter = KolibriSimAdapter(sim, self.effects)

    # --- Вспомогательные методы -----------------------------------------
    def _resolve(self, value: Any) -> Any:
        if isinstance(value, dict):
            if set(value.keys()) == {"var"}:
                return self.context.get_var(str(value["var"]))
            return {k: self._resolve(v) for k, v in value.items()}
        if isinstance(value, list):
            return [self._resolve(elem) for elem in value]
        return value

    def _execute_instruction(self, instruction: Mapping[str, Any]) -> None:
        op = instruction.get("op")
        if not isinstance(op, str):
            raise ValueError("каждая инструкция должна содержать строковое поле 'op'")
        handler_name = f"_op_{op}"
        handler = getattr(self, handler_name, None)
        if handler is None:
            raise ValueError(f"неизвестная операция '{op}'")
        handler(instruction)

    # --- Операции сценария ---------------------------------------------
    def _op_set(self, instruction: Mapping[str, Any]) -> None:
        name = instruction.get("name")
        if not isinstance(name, str):
            raise ValueError("операция 'set' требует строкового имени переменной")
        value = self._resolve(instruction.get("value"))
        self.context.set_var(name, value)
        self.effects.log("SET", name, block=self.context.current_block())

    def _op_teach(self, instruction: Mapping[str, Any]) -> None:
        stimul = self._resolve(instruction.get("stimulus"))
        otvet = self._resolve(instruction.get("response"))
        self.adapter.teach(str(stimul), str(otvet), block=self.context.current_block())

    def _op_ask(self, instruction: Mapping[str, Any]) -> None:
        stimul = self._resolve(instruction.get("stimulus"))
        result = self.adapter.ask(str(stimul), block=self.context.current_block())
        store_as = instruction.get("store_as")
        if isinstance(store_as, str):
            self.context.set_var(store_as, result)

    def _op_evolve(self, instruction: Mapping[str, Any]) -> None:
        kontekst = self._resolve(instruction.get("context"))
        nazvanie = self.adapter.evolve(str(kontekst), block=self.context.current_block())
        store_as = instruction.get("store_as")
        if isinstance(store_as, str):
            self.context.set_var(store_as, nazvanie)

    def _op_evaluate(self, instruction: Mapping[str, Any]) -> None:
        nazvanie = self._resolve(instruction.get("formula"))
        fitness = self._resolve(instruction.get("fitness"))
        znachenie = self.adapter.evaluate(str(nazvanie), float(fitness), block=self.context.current_block())
        store_as = instruction.get("store_as")
        if isinstance(store_as, str):
            self.context.set_var(store_as, znachenie)

    def _op_get_formula(self, instruction: Mapping[str, Any]) -> None:
        nazvanie = self._resolve(instruction.get("name"))
        zapis = self.adapter.get_formula(str(nazvanie), block=self.context.current_block())
        store_as = instruction.get("store_as")
        if isinstance(store_as, str):
            self.context.set_var(store_as, zapis)

    def _op_genome_snapshot(self, instruction: Mapping[str, Any]) -> None:
        limit_raw = instruction.get("limit")
        limit = int(limit_raw) if isinstance(limit_raw, (int, float)) else None
        snapshot = self.adapter.genome_snapshot(limit=limit, block=self.context.current_block())
        store_as = instruction.get("store_as")
        if isinstance(store_as, str):
            self.context.set_var(store_as, snapshot)

    def _op_swarm(self, instruction: Mapping[str, Any]) -> None:
        komanda = instruction.get("command")
        if not isinstance(komanda, str):
            raise ValueError("операция 'swarm' требует строковой команды")
        payload_raw = instruction.get("payload", {})
        payload = self._resolve(payload_raw)
        if not isinstance(payload, Mapping):
            raise ValueError("payload роевой команды должен быть отображением")
        self.adapter.swarm(komanda, payload, block=self.context.current_block())

    def _op_log(self, instruction: Mapping[str, Any]) -> None:
        tip = instruction.get("tip", "INFO")
        if not isinstance(tip, str):
            raise ValueError("поле 'tip' должно быть строкой")
        soobshenie = instruction.get("message")
        if not isinstance(soobshenie, str):
            raise ValueError("поле 'message' должно быть строкой")
        self.effects.log(tip, soobshenie, block=self.context.current_block())

    def _op_block(self, instruction: Mapping[str, Any]) -> None:
        name = instruction.get("name")
        if not isinstance(name, str):
            raise ValueError("операция 'block' требует имя блока")
        body = instruction.get("body")
        if not isinstance(body, Sequence):
            raise ValueError("операция 'block' требует последовательность инструкций")
        self.context.push_block(name)
        try:
            for item in body:
                if not isinstance(item, Mapping):
                    raise ValueError("внутри блока должны быть инструкции-отображения")
                self._execute_instruction(item)
        finally:
            self.context.pop_block()

    # --- Публичный интерфейс -------------------------------------------
    def execute(self, script: Sequence[Mapping[str, Any]]) -> ExecutionSnapshot:
        self.context.push_block("__root__")
        try:
            for instruction in script:
                if not isinstance(instruction, Mapping):
                    raise ValueError("инструкция верхнего уровня должна быть отображением")
                self._execute_instruction(instruction)
        finally:
            self.context.pop_block()
        return self.context.snapshot()
