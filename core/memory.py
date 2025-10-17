"""Векторное хранилище памяти для KolibriSim."""

from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass
from typing import Iterable, List, Sequence

try:  # pragma: no cover - необязательный ускоритель
    from annoy import AnnoyIndex  # type: ignore
except Exception:  # pragma: no cover - модуль может отсутствовать
    AnnoyIndex = None  # type: ignore[misc,assignment]


_TOKEN_RE = re.compile(r"\w+", re.UNICODE)


def _tokenize(tekst: str) -> List[str]:
    """Разбивает строку на детерминированный набор токенов."""

    return _TOKEN_RE.findall(tekst.lower())


def _hash_token(token: str) -> int:
    """Получает детерминированный хеш токена."""

    digest = hashlib.sha256(token.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big", signed=False)


def _normalizovat(vector: List[float]) -> List[float]:
    """Нормализует вектор по длине, избегая деления на ноль."""

    dlina = math.sqrt(sum(znachenie * znachenie for znachenie in vector))
    if dlina == 0.0:
        return vector
    return [znachenie / dlina for znachenie in vector]


def vstraivat_tekst(tekst: str, dimension: int) -> List[float]:
    """Преобразует текст в числовое представление фиксированной длины."""

    tokens = _tokenize(tekst)
    vector = [0.0] * dimension
    if not tokens:
        return vector
    for token in tokens:
        indeks = _hash_token(token) % dimension
        vector[indeks] += 1.0
    return _normalizovat(vector)


@dataclass
class MemoryEntry:
    """Единица памяти, связывающая стимул, ответ и вектор."""

    stimul: str
    otvet: str
    embedding: List[float]


@dataclass
class SearchResult:
    """Результат поиска по памяти."""

    stimul: str
    otvet: str
    score: float


class MemoryIndex:
    """Коллекция векторов с поиском ближайших соседей."""

    def __init__(
        self,
        *,
        dimension: int = 64,
        similarity_threshold: float = 0.75,
        num_trees: int = 10,
    ) -> None:
        self.dimension = dimension
        self.similarity_threshold = similarity_threshold
        self._entries: List[MemoryEntry] = []
        self._num_trees = num_trees
        self._annoy = self._sozdaj_annoy()
        self._annoy_built = False

    def _sozdaj_annoy(self):  # type: ignore[no-untyped-def]
        """Создаёт Annoy-индекс, если библиотека доступна."""

        if AnnoyIndex is None:
            return None
        try:
            return AnnoyIndex(self.dimension, "angular")
        except Exception:  # pragma: no cover - защитный контур
            return None

    def __len__(self) -> int:
        return len(self._entries)

    def dobavit(self, stimul: str, otvet: str) -> None:
        """Добавляет пару стимул/ответ в индекс."""

        embedding = vstraivat_tekst(stimul, self.dimension)
        zapis = MemoryEntry(stimul=stimul, otvet=otvet, embedding=embedding)
        self._entries.append(zapis)
        if self._annoy is not None:
            self._annoy.add_item(len(self._entries) - 1, embedding)
            self._annoy_built = False

    def poiski(self, stimul: str, limit: int = 3) -> List[SearchResult]:
        """Находит несколько ближайших соседей по косинусной близости."""

        if not self._entries:
            return []
        zapros = vstraivat_tekst(stimul, self.dimension)
        kandidaty = self._poisk_kandidatov(zapros, limit)
        rezultaty: List[SearchResult] = []
        for indeks in kandidaty:
            entry = self._entries[indeks]
            score = self._cosine_similarity(zapros, entry.embedding)
            if score >= self.similarity_threshold:
                rezultaty.append(SearchResult(entry.stimul, entry.otvet, score))
        rezultaty.sort(key=lambda res: res.score, reverse=True)
        return rezultaty[:limit]

    def _poisk_kandidatov(self, zapros: List[float], limit: int) -> Sequence[int]:
        """Возвращает индексы кандидатов через Annoy либо полный перебор."""

        if self._annoy is None:
            return self._brute_force(zapros, limit)
        if not self._annoy_built:
            if len(self._entries) == 1:
                self._annoy_built = True
            else:
                self._annoy.build(self._num_trees)  # pragma: no cover
                self._annoy_built = True
        try:
            indeksy = self._annoy.get_nns_by_vector(zapros, limit, include_distances=False)
            return indeksy
        except Exception:  # pragma: no cover - деградация при ошибке библиотеки
            return self._brute_force(zapros, limit)

    def _brute_force(self, zapros: List[float], limit: int) -> Sequence[int]:
        """Линейный поиск кандидатов по сходству."""

        scores = [self._cosine_similarity(zapros, entry.embedding) for entry in self._entries]
        top = sorted(range(len(self._entries)), key=lambda idx: scores[idx], reverse=True)
        return top[:limit]

    @staticmethod
    def _cosine_similarity(v1: Iterable[float], v2: Iterable[float]) -> float:
        return sum(a * b for a, b in zip(v1, v2))


__all__ = [
    "MemoryEntry",
    "MemoryIndex",
    "SearchResult",
    "vstraivat_tekst",
]
