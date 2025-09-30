"""Векторная память KolibriSim для быстрого поиска знаний."""

from __future__ import annotations

import hashlib
import math
import threading
from dataclasses import dataclass
from typing import Dict, Iterable, Optional, Tuple


def _normalizovat_tekst(tekst: str) -> str:
    """Приводит текст к базовой форме для генерации признаков."""
    return " ".join(tekst.strip().lower().split())


def _generirovat_ngrammy(tekst: str, dlinna: int = 3) -> Iterable[str]:
    """Формирует поток символьных n-грамм, устойчивых к пробелам."""
    tekst = _normalizovat_tekst(tekst)
    if not tekst:
        return []
    if len(tekst) <= dlinna:
        return [tekst]
    return [tekst[ind:ind + dlinna] for ind in range(len(tekst) - dlinna + 1)]


@dataclass
class VektorZapominanie:
    """Хранит предвычисленный вектор и связанный ответ."""

    stimul: str
    otvet: str
    embedding: Tuple[float, ...]


class ProstyjVektorizer:
    """Компактный хеш-векторизатор без внешних зависимостей."""

    def __init__(self, razmernost: int = 128) -> None:
        if razmernost <= 0:
            raise ValueError("размерность эмбеддинга должна быть положительной")
        self.razmernost = razmernost

    def vektorizovat(self, tekst: str) -> Tuple[float, ...]:
        """Преобразует строку в фиксированный вектор в евклидовом пространстве."""
        komponenty = [0.0] * self.razmernost
        for ngramma in _generirovat_ngrammy(tekst):
            # md5 используется только для детерминированного распределения признаков
            hexdigest = hashlib.md5(ngramma.encode("utf-8")).hexdigest()
            indeks = int(hexdigest[:8], 16) % self.razmernost
            sign = 1 if int(hexdigest[8], 16) % 2 == 0 else -1
            komponenty[indeks] += sign
        return tuple(komponenty)

    def kosinus(self, levyj: Tuple[float, ...], pravyj: Tuple[float, ...]) -> float:
        """Возвращает косинусное сходство двух векторов."""
        if len(levyj) != len(pravyj):
            raise ValueError("векторы должны иметь одинаковую размерность")
        skalyar = sum(a * b for a, b in zip(levyj, pravyj))
        norma_lev = math.sqrt(sum(a * a for a in levyj))
        norma_prav = math.sqrt(sum(b * b for b in pravyj))
        if norma_lev == 0.0 or norma_prav == 0.0:
            return 0.0
        return skalyar / (norma_lev * norma_prav)


class VektorPamjat:
    """Память документов с поддержкой поиска по косинусной близости."""

    def __init__(self, *, razmernost: int = 128, porog: float = 0.6) -> None:
        self._vektorizer = ProstyjVektorizer(razmernost)
        self._porog = porog
        self._blokirovka = threading.Lock()
        self._zapominaniya: Dict[str, VektorZapominanie] = {}

    def dobavit(self, stimul: str, otvet: str) -> None:
        """Добавляет или обновляет знание в векторной памяти."""
        embedding = self._vektorizer.vektorizovat(stimul)
        zapis = VektorZapominanie(stimul=stimul, otvet=otvet, embedding=embedding)
        with self._blokirovka:
            self._zapominaniya[stimul] = zapis

    def udalit(self, stimul: str) -> None:
        """Удаляет знание из памяти, если оно присутствует."""
        with self._blokirovka:
            self._zapominaniya.pop(stimul, None)

    def poisk(self, zapros: str) -> Optional[Tuple[str, str, float]]:
        """Возвращает наиболее подходящее знание и схожесть."""
        embedding_zaprosa = self._vektorizer.vektorizovat(zapros)
        luchshij: Optional[Tuple[str, str, float]] = None
        with self._blokirovka:
            for zapis in self._zapominaniya.values():
                skhodstvo = self._vektorizer.kosinus(embedding_zaprosa, zapis.embedding)
                if skhodstvo < self._porog:
                    continue
                if luchshij is None or skhodstvo > luchshij[2]:
                    luchshij = (zapis.stimul, zapis.otvet, skhodstvo)
        return luchshij

    def vse_dokumenty(self) -> Dict[str, str]:
        """Возвращает копию текущей базы знаний."""
        with self._blokirovka:
            return {stimul: zapis.otvet for stimul, zapis in self._zapominaniya.items()}


__all__ = ["VektorPamjat", "ProstyjVektorizer", "VektorZapominanie"]
