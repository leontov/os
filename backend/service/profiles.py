"""User profile management primitives for the Kolibri service."""
from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Mapping, Optional, Tuple

from fastapi import HTTPException, status
from pydantic import BaseModel, Field

__all__ = [
    "ProfileSettings",
    "ProfileMetrics",
    "Profile",
    "ProfileCreatePayload",
    "ProfileSettingsUpdate",
    "ProfileUpdatePayload",
    "ProfileLanguagesUpdate",
    "ProfileListResponse",
    "InMemoryProfileStore",
    "get_profile_store",
    "reset_profile_store",
]


class ProfileSettings(BaseModel):
    """Customisable per-profile settings."""

    theme: str = Field(default="system", description="Preferred UI theme")
    timezone: str = Field(default="Europe/Moscow", description="IANA timezone identifier")
    notifications_enabled: bool = Field(default=True, description="Receive proactive Kolibri notifications")
    default_language: Optional[str] = Field(default=None, description="Primary assistant language")


class ProfileMetrics(BaseModel):
    """Operational analytics captured for a profile."""

    latency_ms: float = Field(default=1800.0, ge=0.0)
    latency_trend: str = Field(default="-8%")
    throughput_per_minute: int = Field(default=64, ge=0)
    throughput_trend: str = Field(default="+5%")
    nps: int = Field(default=72)
    nps_trend: str = Field(default="+3")
    recommendation: str = Field(default="Запланируйте UX-интервью для уточнения потребностей клиентов")


class Profile(BaseModel):
    """Representation of a user workspace profile."""

    id: str
    name: str
    role: str
    languages: List[str] = Field(default_factory=list)
    settings: ProfileSettings = Field(default_factory=ProfileSettings)
    metrics: ProfileMetrics = Field(default_factory=ProfileMetrics)
    created_at: float
    updated_at: float


class ProfileCreatePayload(BaseModel):
    """Payload for provisioning a new profile."""

    name: str = Field(min_length=1, max_length=120)
    role: str = Field(min_length=1, max_length=120)
    languages: List[str] = Field(default_factory=list)
    settings: Optional[ProfileSettings] = None
    metrics: Optional[ProfileMetrics] = None


class ProfileSettingsUpdate(BaseModel):
    """Partial update for profile settings."""

    theme: Optional[str] = None
    timezone: Optional[str] = None
    notifications_enabled: Optional[bool] = None
    default_language: Optional[str] = None


class ProfileUpdatePayload(BaseModel):
    """Payload for updating an existing profile."""

    name: Optional[str] = None
    role: Optional[str] = None
    languages: Optional[List[str]] = None
    settings: Optional[ProfileSettingsUpdate] = None
    metrics: Optional[ProfileMetrics] = None


class ProfileLanguagesUpdate(BaseModel):
    """Payload for changing the language preferences only."""

    languages: List[str] = Field(default_factory=list)


class ProfileListResponse(BaseModel):
    """Response envelope for profile listings."""

    items: List[Profile]


_DEFAULT_PROFILE_BLUEPRINTS: Tuple[Mapping[str, object], ...] = (
    {
        "slug": "product",
        "name": "Продуктовые инициативы",
        "role": "Product lead",
        "languages": ["ru", "en"],
        "settings": ProfileSettings(default_language="ru"),
        "metrics": ProfileMetrics(
            latency_ms=1450.0,
            latency_trend="-12%",
            throughput_per_minute=72,
            throughput_trend="+8%",
            nps=78,
            nps_trend="+5",
            recommendation="Сфокусируйтесь на фичах для удержания ключевых аккаунтов",
        ),
    },
    {
        "slug": "support",
        "name": "Клиентская поддержка",
        "role": "Support manager",
        "languages": ["ru"],
        "settings": ProfileSettings(default_language="ru", notifications_enabled=False),
        "metrics": ProfileMetrics(
            latency_ms=2100.0,
            latency_trend="-4%",
            throughput_per_minute=54,
            throughput_trend="+3%",
            nps=69,
            nps_trend="+2",
            recommendation="Расширьте базу знаний для снижения нагрузки на команду",
        ),
    },
)


@dataclass
class InMemoryProfileStore:
    """Thread-safe in-memory storage for subject profiles."""

    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    _storage: Dict[str, Dict[str, Profile]] = field(default_factory=dict)

    async def list(self, subject: str) -> List[Profile]:
        async with self._lock:
            profiles = list(self._ensure_subject(subject).values())
            return [profile.model_copy(deep=True) for profile in profiles]

    async def get(self, subject: str, profile_id: str) -> Profile:
        async with self._lock:
            profiles = self._ensure_subject(subject)
            profile = profiles.get(profile_id)
            if profile is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Профиль не найден")
            return profile.model_copy(deep=True)

    async def create(self, subject: str, payload: ProfileCreatePayload) -> Profile:
        async with self._lock:
            profiles = self._ensure_subject(subject)
            name = payload.name.strip()
            role = payload.role.strip()
            if not name:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Название профиля не может быть пустым")
            if not role:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Роль профиля не может быть пустой")

            profile_id = uuid.uuid4().hex
            languages = self._normalise_languages(payload.languages)
            settings = payload.settings or ProfileSettings()
            metrics = payload.metrics or ProfileMetrics()
            settings, languages = self._sync_settings(settings, languages)

            now = time.time()
            profile = Profile(
                id=profile_id,
                name=name,
                role=role,
                languages=languages,
                settings=settings,
                metrics=metrics,
                created_at=now,
                updated_at=now,
            )
            profiles[profile_id] = profile
            return profile.model_copy(deep=True)

    async def update(self, subject: str, profile_id: str, payload: ProfileUpdatePayload) -> Profile:
        async with self._lock:
            profiles = self._ensure_subject(subject)
            profile = profiles.get(profile_id)
            if profile is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Профиль не найден")

            name = profile.name
            role = profile.role
            if payload.name is not None:
                candidate = payload.name.strip()
                if not candidate:
                    raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Название профиля не может быть пустым")
                name = candidate
            if payload.role is not None:
                candidate = payload.role.strip()
                if not candidate:
                    raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Роль профиля не может быть пустой")
                role = candidate

            languages = profile.languages
            if payload.languages is not None:
                languages = self._normalise_languages(payload.languages)

            settings = profile.settings
            if payload.settings is not None:
                merged = settings.model_dump()
                overrides = payload.settings.model_dump(exclude_unset=True)
                merged.update(
                    {
                        key: value
                        for key, value in overrides.items()
                        if value is not None or key == "notifications_enabled"
                    }
                )
                settings = ProfileSettings(**merged)

            metrics = profile.metrics
            if payload.metrics is not None:
                metrics_data = metrics.model_dump()
                overrides = payload.metrics.model_dump(exclude_unset=True)
                metrics_data.update(overrides)
                metrics = ProfileMetrics(**metrics_data)

            settings, languages = self._sync_settings(settings, languages)

            updated_profile = Profile(
                id=profile.id,
                name=name,
                role=role,
                languages=languages,
                settings=settings,
                metrics=metrics,
                created_at=profile.created_at,
                updated_at=time.time(),
            )
            profiles[profile_id] = updated_profile
            return updated_profile.model_copy(deep=True)

    async def update_languages(
        self,
        subject: str,
        profile_id: str,
        languages: Iterable[str],
    ) -> Profile:
        async with self._lock:
            profiles = self._ensure_subject(subject)
            profile = profiles.get(profile_id)
            if profile is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Профиль не найден")

            updated_languages = self._normalise_languages(languages)
            settings = profile.settings
            if updated_languages:
                default_language = settings.default_language
                if not default_language or default_language not in updated_languages:
                    settings = ProfileSettings(**{**settings.model_dump(), "default_language": updated_languages[0]})
            else:
                settings = ProfileSettings(**{**settings.model_dump(), "default_language": None})

            settings, synced_languages = self._sync_settings(settings, updated_languages)

            updated_profile = Profile(
                id=profile.id,
                name=profile.name,
                role=profile.role,
                languages=synced_languages,
                settings=settings,
                metrics=profile.metrics,
                created_at=profile.created_at,
                updated_at=time.time(),
            )
            profiles[profile_id] = updated_profile
            return updated_profile.model_copy(deep=True)

    async def delete(self, subject: str, profile_id: str) -> None:
        async with self._lock:
            profiles = self._ensure_subject(subject)
            if profile_id not in profiles:
                raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Профиль не найден")
            if len(profiles) <= 1:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Нельзя удалить последний профиль")
            del profiles[profile_id]

    def _ensure_subject(self, subject: str) -> Dict[str, Profile]:
        profiles = self._storage.setdefault(subject, {})
        if not profiles:
            now = time.time()
            for blueprint in _DEFAULT_PROFILE_BLUEPRINTS:
                identifier = uuid.uuid5(uuid.NAMESPACE_URL, f"{subject}:{blueprint['slug']}").hex
                settings = blueprint["settings"].model_copy(deep=True)  # type: ignore[assignment]
                metrics = blueprint["metrics"].model_copy(deep=True)  # type: ignore[assignment]
                languages = list(blueprint["languages"])  # type: ignore[arg-type]
                settings, languages = self._sync_settings(settings, languages)
                profiles[identifier] = Profile(
                    id=identifier,
                    name=str(blueprint["name"]),
                    role=str(blueprint["role"]),
                    languages=languages,
                    settings=settings,
                    metrics=metrics,
                    created_at=now,
                    updated_at=now,
                )
        return profiles

    @staticmethod
    def _normalise_languages(languages: Optional[Iterable[str]]) -> List[str]:
        normalised: List[str] = []
        seen: set[str] = set()
        for value in languages or []:
            candidate = value.strip().lower()
            if not candidate:
                continue
            if len(candidate) > 16:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Код языка не должен превышать 16 символов",
                )
            if candidate not in seen:
                seen.add(candidate)
                normalised.append(candidate)
        return normalised

    @staticmethod
    def _sync_settings(settings: ProfileSettings, languages: List[str]) -> Tuple[ProfileSettings, List[str]]:
        default_language = (settings.default_language or "").strip().lower()
        if default_language and default_language not in languages:
            languages = [default_language] + [language for language in languages if language != default_language]
        elif not default_language and languages:
            settings = ProfileSettings(**{**settings.model_dump(), "default_language": languages[0]})
        else:
            settings = ProfileSettings(**settings.model_dump())
        return settings, languages


_STORE: Optional[InMemoryProfileStore] = None


def get_profile_store() -> InMemoryProfileStore:
    global _STORE
    if _STORE is None:
        _STORE = InMemoryProfileStore()
    return _STORE


def reset_profile_store() -> None:
    global _STORE
    _STORE = None
