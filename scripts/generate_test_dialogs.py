#!/usr/bin/env python3
"""Generate synthetic Kolibri dialogues and scenarios for CI reporting."""

from __future__ import annotations

import argparse
import json
import random
import sys
import textwrap
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, TypedDict
from urllib import request

BackendName = Literal["stub", "http"]


class DialogueTurn(TypedDict):
    role: Literal["user", "assistant"]
    content: str


class DialogueEntry(TypedDict):
    title: str
    summary: str
    steps: List[DialogueTurn]


class ScenarioEntry(TypedDict):
    name: str
    description: str
    steps: List[str]
    success_criteria: str


class DialogBundle(TypedDict):
    generated_at: str
    backend: BackendName
    model: str
    count: int
    dialogues: List[DialogueEntry]
    scenarios: List[ScenarioEntry]


@dataclass
class GenerationConfig:
    backend: BackendName
    count: int
    seed: int
    model: str
    llm_url: Optional[str] = None
    system_prompt: Optional[str] = None


_STUB_TOPICS = [
    "Внедрение KolibriScript",
    "Диагностика wasm-ядра",
    "Отладка демо-сценария",
    "Подготовка отчёта по рою",
    "Интервью по продукту Kolibri OS",
]


_STUB_SUCCESS = [
    "Ассистент выдал пошаговый план действий",
    "Получены метрики и рекомендации",
    "Пользователь подтвердил воспроизводимость",
]


def _random_sentence(rng: random.Random, subject: str) -> str:
    verbs = ["опиши", "предложи", "объясни", "проанализируй", "подсказать"]
    endings = [
        "подробно",
        "по шагам",
        "с примерами",
        "в ключевых пунктах",
    ]
    return f"{rng.choice(verbs)} {subject.lower()} {rng.choice(endings)}".capitalize()


def _build_stub_dialogue(rng: random.Random, topic: str, index: int) -> DialogueEntry:
    user_prompt = _random_sentence(rng, topic)
    assistant_intro = textwrap.dedent(
        f"""Колибри приветствует пользователя и уточняет детали задачи по теме "{topic}"."""
    ).strip()
    steps: List[DialogueTurn] = [
        {"role": "user", "content": user_prompt},
        {
            "role": "assistant",
            "content": (
                f"Здравствуйте! Давайте разберёмся с темой «{topic}». "
                "Вот краткий план: 1) Сбор требований 2) Подготовка окружения 3) Анализ результатов."
            ),
        },
    ]
    steps.append(
        {
            "role": "user",
            "content": f"Отлично, давай подробнее про шаг {rng.randint(2, 3)}.",
        }
    )
    steps.append(
        {
            "role": "assistant",
            "content": (
                f"Для шага {index + 1} по теме «{topic}» подготовьте чек-лист и сохраните метрики. "
                "Если что-то идёт не так, отметьте это в отчёте bug report."
            ),
        }
    )
    return {
        "title": f"CI диалог #{index + 1}",
        "summary": assistant_intro,
        "steps": steps,
    }


def _build_stub_scenario(rng: random.Random, topic: str) -> ScenarioEntry:
    return {
        "name": f"Проверка сценария: {topic}",
        "description": (
            "Автоматически сгенерированный сценарий для smoke-проверки Kolibri OS. "
            f"Фокус: {topic.lower()}."
        ),
        "steps": [
            "Открыть приложение Kolibri",
            f"Задать ассистенту вопрос по теме {topic.lower()}",
            "Зафиксировать ответ и создать отчёт об ошибке, если требуется",
        ],
        "success_criteria": rng.choice(_STUB_SUCCESS),
    }


def _generate_stub_bundle(cfg: GenerationConfig) -> DialogBundle:
    rng = random.Random(cfg.seed)
    topics = rng.sample(_STUB_TOPICS, k=min(cfg.count, len(_STUB_TOPICS)))
    if len(topics) < cfg.count:
        topics.extend(rng.choices(_STUB_TOPICS, k=cfg.count - len(topics)))
    dialogues = [_build_stub_dialogue(rng, topic, index) for index, topic in enumerate(topics)]
    scenarios = [_build_stub_scenario(rng, topic) for topic in topics]
    return {
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        "backend": cfg.backend,
        "model": cfg.model,
        "count": cfg.count,
        "dialogues": dialogues,
        "scenarios": scenarios,
    }


def _call_llm_http(url: str, model: str, prompt: str, system_prompt: Optional[str]) -> str:
    body: Dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "stream": False,
    }
    if system_prompt:
        body["system"] = system_prompt
    data = json.dumps(body).encode("utf-8")
    req = request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with request.urlopen(req, timeout=45) as response:
        payload = response.read().decode("utf-8")
    parsed = json.loads(payload)
    if isinstance(parsed, dict):
        if isinstance(parsed.get("response"), str):
            return parsed["response"]
        if parsed.get("choices"):
            first = parsed["choices"][0]
            if isinstance(first, dict) and isinstance(first.get("text"), str):
                return first["text"]
    raise RuntimeError("LLM ответ не содержит текст")


def _generate_via_http(cfg: GenerationConfig) -> DialogBundle:
    if not cfg.llm_url:
        raise ValueError("Для backend=http требуется URL LLM")
    prompt = textwrap.dedent(
        """
        Сгенерируй JSON c ключами "dialogues" и "scenarios". Каждый диалог должен включать
        не менее трёх шагов с ролями "user" и "assistant". Сценарии должны содержать
        поля name, description, steps (строковый массив) и success_criteria.
        """
    ).strip()
    raw = _call_llm_http(cfg.llm_url, cfg.model, prompt, cfg.system_prompt)
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:  # noqa: B904
        raise RuntimeError("LLM вернул невалидный JSON") from exc
    dialogues = parsed.get("dialogues") or []
    scenarios = parsed.get("scenarios") or []
    bundle: DialogBundle = {
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        "backend": cfg.backend,
        "model": cfg.model,
        "count": len(dialogues),
        "dialogues": dialogues,
        "scenarios": scenarios,
    }
    return bundle


def generate_bundle(cfg: GenerationConfig) -> DialogBundle:
    if cfg.backend == "stub":
        return _generate_stub_bundle(cfg)
    try:
        return _generate_via_http(cfg)
    except Exception as error:  # noqa: BLE001
        print(f"[kolibri-dialogs] HTTP генерация не удалась: {error}. Используем stub.", file=sys.stderr)
        fallback_cfg = GenerationConfig(backend="stub", count=cfg.count, seed=cfg.seed, model=cfg.model)
        return _generate_stub_bundle(fallback_cfg)


def save_bundle(bundle: DialogBundle, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate Kolibri test dialogues via LLM or stub")
    parser.add_argument("--backend", choices=["stub", "http"], default="stub", help="Источник генерации")
    parser.add_argument("--count", type=int, default=3, help="Сколько диалогов сформировать")
    parser.add_argument("--seed", type=int, default=42, help="Сид для детерминированности stub")
    parser.add_argument("--model", default="kolibri-dialog-stub", help="Имя модели")
    parser.add_argument("--llm-url", default=None, help="HTTP endpoint для backend=http")
    parser.add_argument(
        "--system-prompt",
        default="Колибри CI: верни краткий JSON для smoke-тестов.",
        help="Дополнительный системный промпт",
    )
    parser.add_argument("--output", default="logs/ci_dialogs.json", help="Куда сохранить результат")
    return parser.parse_args(argv)


def main(argv: List[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    cfg = GenerationConfig(
        backend=args.backend,
        count=max(1, args.count),
        seed=args.seed,
        model=args.model,
        llm_url=args.llm_url,
        system_prompt=args.system_prompt,
    )
    bundle = generate_bundle(cfg)
    output_path = Path(args.output)
    save_bundle(bundle, output_path)
    print(f"[kolibri-dialogs] Сохранено {len(bundle['dialogues'])} диалогов в {output_path}")
    if bundle.get("scenarios"):
        print(f"[kolibri-dialogs] Сценариев: {len(bundle['scenarios'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
