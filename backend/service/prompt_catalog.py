"""Prompt catalog management for Kolibri backend."""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple


@dataclass(frozen=True)
class PromptTemplate:
    """Prompt exposed to clients."""

    id: str
    intent: str
    title: str
    body: str
    tags: Tuple[str, ...]


@dataclass(frozen=True)
class _RawPrompt:
    id: str
    intent: str
    title: Dict[str, str]
    body: Dict[str, str]
    tags: Tuple[str, ...]


@dataclass(frozen=True)
class PromptVariant:
    settings: Dict[str, float | str]
    prompts: Tuple[_RawPrompt, ...]


class PromptCatalog:
    """In-memory prompt catalog with A/B variants."""

    def __init__(self, intents: Dict[str, Dict[str, PromptVariant]]) -> None:
        self._intents = intents

    def get_prompts(
        self,
        intent: str,
        variant: str,
        *,
        language: str,
    ) -> Tuple[List[PromptTemplate], Dict[str, float | str]]:
        variants = self._intents.get(intent.lower())
        if not variants:
            return [], {}

        selected = variants.get(variant.lower()) or variants.get("a")
        if not selected:
            return [], {}

        prompts = [
            PromptTemplate(
                id=template.id,
                intent=intent,
                title=_select_locale(template.title, language),
                body=_select_locale(template.body, language),
                tags=template.tags,
            )
            for template in selected.prompts
        ]
        return prompts, dict(selected.settings)


def _select_locale(options: Dict[str, str], language: str) -> str:
    if not options:
        return ""
    normalised = language.lower()
    if normalised in options:
        return options[normalised]
    if "en" in options:
        return options["en"]
    return next(iter(options.values()))


def _load_prompt_catalog(path: Path) -> Dict[str, Dict[str, PromptVariant]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    intents_payload = payload.get("intents", [])
    intents: Dict[str, Dict[str, PromptVariant]] = {}

    for entry in intents_payload:
        intent_key = str(entry.get("intent", "")).strip().lower()
        if not intent_key:
            continue
        variants_payload = entry.get("variants", {})
        variant_bucket: Dict[str, PromptVariant] = {}
        for variant_key, variant_value in variants_payload.items():
            if not isinstance(variant_value, dict):
                continue
            prompts_payload = variant_value.get("prompts", [])
            settings_raw = variant_value.get("settings", {})
            prompts: list[_RawPrompt] = []
            for prompt in prompts_payload:
                prompt_id = str(prompt.get("id", "")).strip()
                title = prompt.get("title", {}) or {}
                body = prompt.get("body", {}) or {}
                tags = tuple(str(tag).strip() for tag in prompt.get("tags", []) if str(tag).strip())
                if not prompt_id or not title or not body:
                    continue
                prompts.append(
                    _RawPrompt(
                        id=prompt_id,
                        intent=intent_key,
                        title={str(key).lower(): str(value) for key, value in title.items()},
                        body={str(key).lower(): str(value) for key, value in body.items()},
                        tags=tags,
                    )
                )
            variant_bucket[variant_key.lower()] = PromptVariant(
                settings={str(key): value for key, value in settings_raw.items()},
                prompts=tuple(prompts),
            )
        if variant_bucket:
            intents[intent_key] = variant_bucket
    return intents


def load_prompt_catalog() -> PromptCatalog:
    data_path = Path(__file__).with_name("data") / "prompt_catalog.json"
    if not data_path.exists():
        raise FileNotFoundError(f"Prompt catalog not found: {data_path}")
    intents = _load_prompt_catalog(data_path)
    return PromptCatalog(intents)


def select_variant(identifier: str) -> str:
    """Deterministically select an A/B variant for a given identifier."""

    digest = hashlib.sha1(identifier.encode("utf-8")).digest()
    return "a" if digest[0] < 128 else "b"


PROMPT_CATALOG = load_prompt_catalog()

__all__ = [
    "PromptTemplate",
    "PromptCatalog",
    "PROMPT_CATALOG",
    "select_variant",
]
