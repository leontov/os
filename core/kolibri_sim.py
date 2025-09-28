"""Модуль высокоуровневой симуляции узла «Колибри» для Python-тестов."""

from __future__ import annotations

import ast
import dataclasses
import json
import random
import time
import hashlib
import hmac
from pathlib import Path
from typing import Dict, List, Mapping, Optional, TypedDict, cast


class ZhurnalZapis(TypedDict):
    tip: str
    soobshenie: str
    metka: float


class ZhurnalSnapshot(TypedDict):
    offset: int
    zapisi: List[ZhurnalZapis]


class FormulaZapis(TypedDict):
    kod: str
    fitness: float
    parents: List[str]
    context: str


class MetricEntry(TypedDict):
    minute: int
    formula: str
    fitness: float
    genome: int


class SoakResult(TypedDict):
    events: int
    metrics: List[MetricEntry]


class SoakState(TypedDict, total=False):
    events: int
    metrics: List[MetricEntry]


def preobrazovat_tekst_v_cifry(tekst: str) -> str:
    """Переводит UTF-8 текст в поток десятичных цифр по правилам Kolibri."""
    baity = tekst.encode("utf-8")
    return "".join(f"{bajt:03d}" for bajt in baity)


def vosstanovit_tekst_iz_cifr(cifry: str) -> str:
    """Восстанавливает строку из десятичного представления."""
    if len(cifry) % 3 != 0:
        raise ValueError("длина цепочки цифр должна делиться на три")
    baity = bytearray(int(cifry[ind:ind + 3]) for ind in range(0, len(cifry), 3))
    return baity.decode("utf-8")


def dec_hash(cifry: str) -> str:
    """Формирует десятичный хеш SHA-256, устойчивый к платформенным различиям."""
    digest = hashlib.sha256(cifry.encode("utf-8")).digest()
    return "".join(str(bajt % 10) for bajt in digest)


def dolzhen_zapustit_repl(peremennye: Mapping[str, str], est_tty: bool) -> bool:
    """Проверяет, следует ли запускать REPL: нужен флаг KOLIBRI_REPL=1 и наличие TTY."""
    return peremennye.get("KOLIBRI_REPL") == "1" and est_tty


@dataclasses.dataclass
class ZapisBloka:
    """Хранит блок цифрового генома, включая ссылки на предыдущие состояния."""

    nomer: int
    pred_hash: str
    payload: str
    hmac_summa: str
    itogovy_hash: str


def _poschitat_hmac(klyuch: bytes, pred_hash: str, payload: str) -> str:
    """Возвращает HMAC-SHA256 в десятичном представлении."""
    soobshenie = (pred_hash + payload).encode("utf-8")
    hex_kod = hmac.new(klyuch, soobshenie, hashlib.sha256).hexdigest()
    return preobrazovat_tekst_v_cifry(hex_kod)


class KolibriSim:
    """Минималистичная симуляция узла Kolibri для сценариев CI и unit-тестов."""

    def __init__(self, zerno: int = 0, hmac_klyuch: Optional[bytes] = None) -> None:
        self.zerno = zerno
        self.generator = random.Random(zerno)
        self.hmac_klyuch = hmac_klyuch or b"kolibri-hmac"
        self.zhurnal: List[ZhurnalZapis] = []

        self.predel_zhurnala = 256
        self._zhurnal_sdvig = 0

        self.znanija: Dict[str, str] = {}
        self.formuly: Dict[str, FormulaZapis] = {}
        self.populyaciya: List[str] = []
        self.predel_populyacii = 24
        self.genom: List[ZapisBloka] = []
        self._sozdanie_bloka("GENESIS", {"seed": zerno})

    # --- Вспомогательные методы ---
    def _sozdanie_bloka(self, tip: str, dannye: Mapping[str, object]) -> ZapisBloka:
        """Кодирует событие в цифровой геном и возвращает созданный блок."""
        zapis = {
            "tip": tip,
            "dannye": dict(dannye),
            "metka": len(self.genom),
        }
        payload = preobrazovat_tekst_v_cifry(json.dumps(zapis, ensure_ascii=False, sort_keys=True))
        pred_hash = self.genom[-1].itogovy_hash if self.genom else dec_hash("kolibri-genesis")
        hmac_summa = _poschitat_hmac(self._poluchit_klyuch(), pred_hash, payload)
        itogovy_hash = dec_hash(payload + hmac_summa + pred_hash)
        blok = ZapisBloka(len(self.genom), pred_hash, payload, hmac_summa, itogovy_hash)
        self.genom.append(blok)
        return blok

    def _poluchit_klyuch(self) -> bytes:
        """Гарантирует наличие HMAC-ключа в байтовом виде."""
        if isinstance(self.hmac_klyuch, str):
            self.hmac_klyuch = self.hmac_klyuch.encode("utf-8")
        return self.hmac_klyuch

    def _registrirovat(self, tip: str, soobshenie: str) -> None:
        """Добавляет запись в оперативный журнал действий."""
        zapis: ZhurnalZapis = {
            "tip": tip,
            "soobshenie": soobshenie,
            "metka": time.time(),
        }
        self.zhurnal.append(zapis)
        if len(self.zhurnal) > self.predel_zhurnala:
            sdvig = len(self.zhurnal) - self.predel_zhurnala
            del self.zhurnal[:sdvig]
            self._zhurnal_sdvig += sdvig
        self._sozdanie_bloka(tip, zapis)

    # --- Базовые операции обучения ---
    def obuchit_svjaz(self, stimul: str, otvet: str) -> None:
        """Добавляет ассоциацию в память и фиксирует событие в геноме."""
        self.znanija[stimul] = otvet
        self._registrirovat("TEACH", f"{stimul}->{otvet}")

    def sprosit(self, stimul: str) -> str:
        """Возвращает ответ из памяти или многоточие, если знания нет."""
        otvet = self.znanija.get(stimul, "...")
        self._registrirovat("ASK", f"{stimul}->{otvet}")
        return otvet

    def dobrovolnaya_otpravka(self, komanda: str, argument: str) -> str:
        """Обрабатывает команды чата KolibriScript, используя русские ключевые слова."""
        komanda = komanda.strip().lower()
        if komanda == "стимул":
            return self.sprosit(argument)
        if komanda == "серия":
            chislo = max(0, min(9, int(argument) if argument.isdigit() else 0))
            posledovatelnost = "".join(str((ind + chislo) % 10) for ind in range(10))
            self._registrirovat("SERIES", posledovatelnost)
            return posledovatelnost
        if komanda == "число":
            cifry = "".join(symb for symb in argument if symb.isdigit())
            self._registrirovat("NUMBER", cifry)
            return cifry or "0"
        if komanda == "выражение":
            znachenie = self._bezopasnoe_vychislenie(argument)
            rezultat = str(znachenie)
            self._registrirovat("EXPR", rezultat)
            return rezultat
        raise ValueError(f"неизвестная команда: {komanda}")

    def _bezopasnoe_vychislenie(self, vyrazhenie: str) -> int:
        """Вычисляет арифметическое выражение через AST, исключая опасные конструкции."""
        uzel = ast.parse(vyrazhenie, mode="eval")
        return int(self._evaluate_ast(uzel.body))

    def _evaluate_ast(self, uzel: ast.AST) -> int:
        """Рекурсивный интерпретатор арифметических выражений для команд REPL."""
        if isinstance(uzel, ast.BinOp) and isinstance(uzel.op, (ast.Add, ast.Sub, ast.Mult, ast.Pow)):
            levy = self._evaluate_ast(uzel.left)
            pravy = self._evaluate_ast(uzel.right)
            if isinstance(uzel.op, ast.Add):
                return levy + pravy
            if isinstance(uzel.op, ast.Sub):
                return levy - pravy
            if isinstance(uzel.op, ast.Mult):
                return levy * pravy
            return levy ** pravy
        if isinstance(uzel, ast.UnaryOp) and isinstance(uzel.op, (ast.UAdd, ast.USub)):
            znachenie = self._evaluate_ast(uzel.operand)
            return znachenie if isinstance(uzel.op, ast.UAdd) else -znachenie
        if isinstance(uzel, ast.Constant) and isinstance(uzel.value, (int, float)):
            return int(uzel.value)
        raise ValueError("поддерживаются только простые арифметические выражения")

    # --- Эволюция формул ---
    def evolyuciya_formul(self, kontekst: str) -> str:
        """Создаёт новую формулу, базируясь на имеющихся родителях."""
        rod_stroki = list(self.formuly.keys())
        roditeli = self.generator.sample(rod_stroki, k=min(2, len(rod_stroki))) if rod_stroki else []
        mnozhitel = self.generator.randint(1, 9)
        smeshchenie = self.generator.randint(0, 9)
        kod = f"f(x)={mnozhitel}*x+{smeshchenie}"
        nazvanie = f"F{len(self.formuly) + 1:04d}"
        zapis: FormulaZapis = {
            "kod": kod,
            "fitness": 0.0,
            "parents": roditeli,
            "context": kontekst,
        }
        self.formuly[nazvanie] = zapis
        self.populyaciya.append(nazvanie)
        if len(self.populyaciya) > self.predel_populyacii:
            self.populyaciya.pop(0)
        self._registrirovat("FORMULA", f"{nazvanie}:{kod}")
        return nazvanie

    def ocenit_formulu(self, nazvanie: str, uspeh: float) -> float:
        """Обновляет фитнес формулы и возвращает новое значение."""
        zapis = self.formuly[nazvanie]
        tekushchij = zapis["fitness"]
        novoe_znachenie = 0.6 * uspeh + 0.4 * tekushchij
        zapis["fitness"] = novoe_znachenie
        self._registrirovat("FITNESS", f"{nazvanie}:{novoe_znachenie:.3f}")
        return novoe_znachenie

    def zapustit_turniry(self, kolichestvo: int) -> None:
        """Имитация нескольких раундов эволюции с неизменной численностью популяции."""
        for _ in range(kolichestvo):
            nazvanie = self.evolyuciya_formul("tournament")
            self.ocenit_formulu(nazvanie, self.generator.random())

    # --- Цифровой геном и синхронизация ---
    def proverit_genom(self) -> bool:
        """Проверяет целостность генома и корректность HMAC-цепочки."""
        pred_hash = dec_hash("kolibri-genesis")
        for blok in self.genom:
            if blok.pred_hash != pred_hash:
                return False
            ozhidaemyj_hmac = _poschitat_hmac(self._poluchit_klyuch(), pred_hash, blok.payload)
            if blok.hmac_summa != ozhidaemyj_hmac:
                return False
            ozhidaemyj_hash = dec_hash(blok.payload + blok.hmac_summa + pred_hash)
            if blok.itogovy_hash != ozhidaemyj_hash:
                return False
            pred_hash = blok.itogovy_hash
        return True

    def poluchit_genom_slovar(self) -> List[Dict[str, str]]:
        """Возвращает список словарей для сериализации генома."""
        return [dataclasses.asdict(blok) for blok in self.genom]

    def sinhronizaciya(self, sostoyanie: Mapping[str, str]) -> int:
        """Импортирует отсутствующие знания и возвращает счётчик новых связей."""
        dobavleno = 0
        for stimul, otvet in sostoyanie.items():
            if stimul not in self.znanija:
                self.znanija[stimul] = otvet
                dobavleno += 1
        self._registrirovat("SYNC", f"imported={dobavleno}")
        return dobavleno

    def poluchit_canvas(self, glubina: int = 3) -> List[List[int]]:
        """Формирует числовое представление фрактальной памяти для визуализации."""
        osnova = "".join(preobrazovat_tekst_v_cifry(znachenie) for znachenie in self.znanija.values())
        if not osnova:
            osnova = "0123456789"
        sloi: List[List[int]] = []
        for uroven in range(glubina):
            start = (uroven * 10) % len(osnova)
            segment = osnova[start:start + 10]
            if len(segment) < 10:
                segment = (segment + osnova)[:10]
            sloi.append([int(simbol) for simbol in segment])
        return sloi

    def vzjat_sostoyanie(self) -> Dict[str, str]:
        """Возвращает копию текущих знаний для синхронизации."""
        return dict(self.znanija)

    def ustanovit_predel_zhurnala(self, predel: int) -> None:
        """Задаёт максимальный размер журнала и немедленно усечает избыток."""
        if predel < 1:
            raise ValueError("предельный размер журнала должен быть положительным")
        self.predel_zhurnala = predel
        if len(self.zhurnal) > predel:
            sdvig = len(self.zhurnal) - predel
            del self.zhurnal[:sdvig]
            self._zhurnal_sdvig += sdvig

    def poluchit_zhurnal(self) -> ZhurnalSnapshot:
        """Возвращает снимок журнала с информацией о отброшенных записях."""
        return {"offset": self._zhurnal_sdvig, "zapisi": list(self.zhurnal)}

    def massiv_cifr(self, kolichestvo: int) -> List[int]:
        """Генерирует детерминированную последовательность цифр на основе зерна."""
        return [self.generator.randint(0, 9) for _ in range(kolichestvo)]

    def zapustit_soak(self, minuti: int, sobytiya_v_minutu: int = 4) -> SoakResult:
        """Имитация длительного прогона: создаёт формулы и записи генома."""
        nachalnyj_razmer = len(self.genom)
        metrika: List[MetricEntry] = []
        for minuta in range(minuti):
            nazvanie = self.evolyuciya_formul("soak")
            rezultat = self.ocenit_formulu(nazvanie, self.generator.random())
            metrika.append({
                "minute": minuta,
                "formula": nazvanie,
                "fitness": rezultat,
                "genome": len(self.genom),
            })
            for _ in range(max(1, sobytiya_v_minutu - 1)):
                stimul = f"stim-{minuta}-{_}"
                otvet = f"resp-{self.generator.randint(0, 999)}"
                self.obuchit_svjaz(stimul, otvet)
        return {
            "events": len(self.genom) - nachalnyj_razmer,
            "metrics": metrika,
        }


def sohranit_sostoyanie(path: Path, sostoyanie: Mapping[str, object]) -> None:
    """Сохраняет состояние в JSON с переводом текстов в цифровой слой."""
    serializovannoe = {
        k: preobrazovat_tekst_v_cifry(json.dumps(v, ensure_ascii=False, sort_keys=True))
        for k, v in sostoyanie.items()
    }
    path.write_text(json.dumps(serializovannoe, ensure_ascii=False, sort_keys=True), encoding="utf-8")


def zagruzit_sostoyanie(path: Path) -> Dict[str, object]:
    """Загружает состояние из цифровой формы и восстанавливает структуру."""
    if not path.exists():
        return {}
    dannye = json.loads(path.read_text(encoding="utf-8"))
    rezultat: Dict[str, object] = {}
    for k, v in dannye.items():
        tekst = vosstanovit_tekst_iz_cifr(v)
        rezultat[k] = json.loads(tekst)
    return rezultat


def obnovit_soak_state(path: Path, sim: KolibriSim, minuti: int) -> SoakState:
    """Читает, дополняет и сохраняет состояние длительных прогонов."""
    tekuschee_raw = zagruzit_sostoyanie(path)
    tekuschee: SoakState = cast(SoakState, tekuschee_raw)
    itogi = sim.zapustit_soak(minuti)

    metrics: List[MetricEntry]
    metrics_obj = tekuschee_raw.get("metrics")
    if isinstance(metrics_obj, list):
        metrics: List[MetricEntry] = cast(List[MetricEntry], metrics_obj)
    else:
        metrics = []
        tekuschee["metrics"] = metrics
    metrics.extend(itogi["metrics"])

    events_obj = tekuschee_raw.get("events")
    events_prev = events_obj if isinstance(events_obj, int) else 0
    tekuschee["events"] = events_prev + itogi["events"]
    sohranit_sostoyanie(path, tekuschee)
    return tekuschee


__all__ = [
    "KolibriSim",
    "ZapisBloka",
    "preobrazovat_tekst_v_cifry",
    "vosstanovit_tekst_iz_cifr",
    "dec_hash",
    "dolzhen_zapustit_repl",
    "MetricEntry",
    "SoakResult",
    "SoakState",

    "ZhurnalSnapshot",

    "sohranit_sostoyanie",
    "zagruzit_sostoyanie",
    "obnovit_soak_state",
]
