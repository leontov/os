"""Kolibri developer productivity toolkit.

This CLI bundles utilities that support the Phase 2 roadmap goal of
providing unified onboarding tooling for backend, frontend and research
teams. It intentionally keeps side effects explicit, allowing teams to
preview the generated assets before executing heavier workflows.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import textwrap
from dataclasses import dataclass
from pathlib import Path
from typing import List, Mapping, Optional, Sequence

APP_DESCRIPTION = (
    "Инструментарий разработчика Kolibri ИИ: генерация шаблонов и запуск "
    "pipelines с live-reload для ускорения онбординга команд."
)


@dataclass(frozen=True)
class TemplateFile:
    """Single file description for template generation."""

    relative_path: str
    content: str

    def render(self, root: Path, substitutions: Mapping[str, str], *, force: bool = False) -> Path:
        """Materialize the template at *root* applying substitutions."""

        target = root / self.relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and not force:
            raise FileExistsError(f"File already exists: {target}")
        payload = textwrap.dedent(self.content).lstrip("\n")
        for token, value in substitutions.items():
            payload = payload.replace(token, value)
        target.write_text(payload, encoding="utf-8")
        return target


@dataclass(frozen=True)
class TemplateBundle:
    """Collection of files that form a scaffold."""

    description: str
    files: Sequence[TemplateFile]

    def materialize(
        self, root: Path, substitutions: Mapping[str, str], *, force: bool = False
    ) -> List[Path]:
        created: List[Path] = []
        for entry in self.files:
            created.append(entry.render(root, substitutions, force=force))
        return created


BACKEND_TEMPLATE = TemplateBundle(
    description="Шаблон FastAPI-модуля с эндпоинтом и сервисным слоем.",
    files=(
        TemplateFile(
            "__init__.py",
            '"""Модуль Kolibri, созданный генератором."""\n',
        ),
        TemplateFile(
            "router.py",
            '''
            from fastapi import APIRouter

            from .service import KolibriModuleService


            def build_router(service: KolibriModuleService | None = None) -> APIRouter:
                """Create a router that exposes the module operations."""
                service = service or KolibriModuleService()
                router = APIRouter(prefix="/__SLUG__", tags=["__TAG__"])

                @router.get("/health", summary="Проверка состояния модуля")
                async def module_health() -> dict[str, str]:
                    return {"status": "ok", "module": service.name}

                @router.get("/insights", summary="Получить интеллектуальные инсайты")
                async def module_insights() -> dict[str, str]:
                    return service.produce_insights()

                return router
            '''
        ),
        TemplateFile(
            "service.py",
            '''
            from __future__ import annotations

            from dataclasses import dataclass


            @dataclass(slots=True)
            class KolibriModuleService:
                """Доменная логика модуля Kolibri."""

                name: str = "__NAME__"

                def produce_insights(self) -> dict[str, str]:
                    """Return a lightweight, explainable insight payload."""

                    return {
                        "module": self.name,
                        "insight": "__INSIGHT__",
                        "persona": "__PERSONA__",
                    }
            '''
        ),
    ),
)

FRONTEND_TEMPLATE = TemplateBundle(
    description="Шаблон React-компонента с подключением к observability.",
    files=(
        TemplateFile(
            "index.tsx",
            """
            import { useEffect, useState } from "react";

            interface Insight {
              module: string;
              insight: string;
              persona: string;
            }

            export function __COMPONENT__(props: { endpoint: string }) {
              const [insight, setInsight] = useState<Insight | null>(null);
              const [error, setError] = useState<string | null>(null);

              useEffect(() => {
                let cancelled = false;
                fetch(`${props.endpoint}/insights`)
                  .then((response) => {
                    if (!response.ok) {
                      throw new Error(`HTTP ${response.status}`);
                    }
                    return response.json();
                  })
                  .then((data: Insight) => {
                    if (!cancelled) setInsight(data);
                  })
                  .catch((err: unknown) => {
                    const message = err instanceof Error ? err.message : String(err);
                    if (!cancelled) setError(message);
                  });
                return () => {
                  cancelled = true;
                };
              }, [props.endpoint]);

              if (error) {
                return (
                  <div className="rounded border border-red-500 bg-red-950/70 p-4 text-sm text-red-200">
                    Ошибка получения данных: {error}
                  </div>
                );
              }

              if (!insight) {
                return (
                  <div className="animate-pulse text-slate-400">
                    Загружаем инсайты Kolibri…
                  </div>
                );
              }

              return (
                <section className="space-y-2">
                  <h2 className="text-lg font-semibold text-slate-100">
                    {insight.module}
                  </h2>
                  <p className="text-slate-300">{insight.insight}</p>
                  <span className="text-xs uppercase tracking-wide text-emerald-300">
                    Персона: {insight.persona}
                  </span>
                </section>
              );
            }
            """,
        ),
    ),
)


def _slugify(value: str) -> str:
    slug = "".join(ch if ch.isalnum() else "-" for ch in value.lower())
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-") or "module"


def _component_name(value: str) -> str:
    clean = "".join(part.capitalize() for part in _slugify(value).split("-"))
    return clean or "KolibriModule"


def _render_backend_template(destination: Path, *, name: str, force: bool = False) -> List[Path]:
    slug = _slugify(name)
    substitutions = {
        "__SLUG__": slug,
        "__TAG__": name,
        "__NAME__": name,
        "__INSIGHT__": "Лёгкая аналитика от Kolibri",
        "__PERSONA__": "Исследователь",
    }
    return BACKEND_TEMPLATE.materialize(destination, substitutions, force=force)


def _render_frontend_template(destination: Path, *, name: str, force: bool = False) -> List[Path]:
    component = _component_name(name)
    substitutions = {"__COMPONENT__": component}
    return FRONTEND_TEMPLATE.materialize(destination, substitutions, force=force)


def _diagnose_environment() -> dict[str, object]:
    tools: dict[str, object] = {"python": sys.version.split()[0]}
    for tool in ("node", "npm", "uvicorn", "pytest"):
        tools[tool] = shutil.which(tool) is not None
    return {
        "kolibri": {
            "vision": "Лёгкая точность для AGI Kolibri",
            "workspace": os.getcwd(),
        },
        "tools": tools,
    }


def _build_pipeline_command(target: str, extra: Optional[Sequence[str]] = None) -> List[str]:
    payload = list(extra or [])
    if target == "backend":
        return [
            "uvicorn",
            "backend.service.app:create_app",
            "--reload",
            "--factory",
        ] + payload
    if target == "frontend":
        return ["npm", "run", "dev"] + payload
    raise ValueError(f"Unsupported pipeline target: {target}")


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=APP_DESCRIPTION)
    subparsers = parser.add_subparsers(dest="command", required=True)

    backend_parser = subparsers.add_parser(
        "init-backend",
        help="Создать модуль FastAPI с интеллектуальными эндпоинтами.",
    )
    backend_parser.add_argument("destination", type=Path, help="Путь для нового модуля")
    backend_parser.add_argument(
        "--name",
        type=str,
        default="Kolibri Module",
        help="Человеко-читаемое имя модуля",
    )
    backend_parser.add_argument(
        "--force",
        action="store_true",
        help="Перезаписывать файлы, если уже существуют.",
    )

    frontend_parser = subparsers.add_parser(
        "init-frontend",
        help="Создать React-компонент для визуализации инсайтов.",
    )
    frontend_parser.add_argument("destination", type=Path, help="Путь для нового компонента")
    frontend_parser.add_argument(
        "--name",
        type=str,
        default="Kolibri Insight",
        help="Имя компонента для отображения",
    )
    frontend_parser.add_argument(
        "--force",
        action="store_true",
        help="Перезаписывать файлы, если уже существуют.",
    )

    pipeline_parser = subparsers.add_parser(
        "pipeline",
        help="Подготовить или запустить live-reload pipeline.",
    )
    pipeline_parser.add_argument(
        "target",
        choices=("backend", "frontend"),
        help="Компонент, для которого запускается pipeline",
    )
    pipeline_parser.add_argument(
        "--execute",
        action="store_true",
        help="Непосредственно запустить команду вместо вывода инструкции.",
    )
    pipeline_parser.add_argument(
        "extra",
        nargs=argparse.REMAINDER,
        help="Дополнительные аргументы, передаваемые целевой команде.",
    )

    doctor_parser = subparsers.add_parser(
        "doctor",
        help="Собрать диагностику окружения разработчика.",
    )
    doctor_parser.add_argument(
        "--json",
        action="store_true",
        help="Выводить результаты в формате JSON.",
    )

    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = create_parser()
    args = parser.parse_args(argv)

    if args.command == "init-backend":
        created = _render_backend_template(
            args.destination,
            name=args.name,
            force=args.force,
        )
        print(json.dumps({"created": [str(path) for path in created]}, ensure_ascii=False, indent=2))
        return 0

    if args.command == "init-frontend":
        created = _render_frontend_template(
            args.destination,
            name=args.name,
            force=args.force,
        )
        print(json.dumps({"created": [str(path) for path in created]}, ensure_ascii=False, indent=2))
        return 0

    if args.command == "pipeline":
        command = _build_pipeline_command(args.target, extra=args.extra)
        if args.execute:
            subprocess.run(command, check=True)
        else:
            print(
                json.dumps(
                    {
                        "target": args.target,
                        "command": command,
                        "hint": "Добавьте --execute для запуска live-reload конвейера",
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )
        return 0

    if args.command == "doctor":
        result = _diagnose_environment()
        if args.json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            print("Kolibri developer environment diagnostics:")
            tools = result.get("tools")
            if isinstance(tools, Mapping):
                for key, value in tools.items():
                    state = "✅" if bool(value) else "⚠️"
                    print(f" - {key}: {value} {state}")
        return 0

    parser.error("Unknown command")
    return 1


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main())
