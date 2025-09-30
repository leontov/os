#!/usr/bin/env python3
"""Автоматическое склеивание конфликтов git с базовыми эвристиками Kolibri."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, List

KONFLIKT_START = "<<<<<<<"
KONFLIKT_DELIM = "======="
KONFLIKT_END = ">>>>>>>"


class GitCommandError(RuntimeError):
    """Исключение, описывающее неудачную команду git."""

    def __init__(self, cmd: List[str], result: subprocess.CompletedProcess[str]):
        soobshchenie = (
            f"Команда git {' '.join(cmd)} завершилась с кодом {result.returncode}.\n"
            f"stdout:\n{result.stdout}\n"
            f"stderr:\n{result.stderr}"
        )
        super().__init__(soobshchenie)
        self.cmd = cmd
        self.returncode = result.returncode
        self.stdout = result.stdout
        self.stderr = result.stderr


def run_git(args: List[str], repo_root: Path, *, check: bool = True) -> subprocess.CompletedProcess[str]:
    """Запускает git-команду и возвращает результат, поднимая ошибку при неуспехе."""

    okruzhenie = os.environ.copy()
    okruzhenie.setdefault("GIT_EDITOR", "true")
    okruzhenie.setdefault("GIT_MERGE_AUTOEDIT", "no")
    okruzhenie.setdefault("GIT_TERMINAL_PROMPT", "0")
    okruzhenie.setdefault("GIT_PAGER", "cat")
    rezultat = subprocess.run(
        ["git", *args],
        cwd=repo_root,
        text=True,
        capture_output=True,
        check=False,
        env=okruzhenie,
    )
    if check and rezultat.returncode != 0:
        raise GitCommandError(args, rezultat)
    return rezultat


def razobrat_konflikt(lines: List[str]) -> List[str]:
    """Объединяет конфликтные блоки, оставляя обе версии без маркеров."""
    rezultat: List[str] = []
    ours: List[str] = []
    theirs: List[str] = []
    sostoyanie = "normal"
    for stroka in lines:
        if stroka.startswith(KONFLIKT_START):
            sostoyanie = "ours"
            ours = []
            theirs = []
            continue
        if stroka.startswith(KONFLIKT_DELIM):
            sostoyanie = "theirs"
            continue
        if stroka.startswith(KONFLIKT_END):
            rezultat.extend(ours)
            if rezultat and rezultat[-1] != "\n":
                rezultat.append("\n")
            rezultat.extend(theirs)
            sostoyanie = "normal"
            continue
        if sostoyanie == "ours":
            ours.append(stroka)
        elif sostoyanie == "theirs":
            theirs.append(stroka)
        else:
            rezultat.append(stroka)
    return rezultat


def obrabotat_fajl(path: Path, root: Path) -> Dict[str, object]:
    """Читает файл, устраняет конфликтные маркеры и возвращает отчёт."""
    soderzhimoe = path.read_text(encoding="utf-8")
    otnositelnyj = str(path.relative_to(root))
    if KONFLIKT_START not in soderzhimoe:
        return {"file": otnositelnyj, "status": "clean"}
    stroki = soderzhimoe.splitlines(keepends=True)
    novye = razobrat_konflikt(stroki)
    path.write_text("".join(novye), encoding="utf-8")
    return {"file": otnositelnyj, "status": "resolved"}


def nayti_fajly(root: Path) -> List[Path]:
    """Возвращает список файлов в конфликте согласно git."""

    rezultat = run_git(["diff", "--name-only", "--diff-filter=U"], root)
    fajly = [stroka.strip() for stroka in rezultat.stdout.splitlines() if stroka.strip()]
    return [root / fajl for fajl in fajly]


def postroit_otchet(root: Path, fajly: List[Path]) -> Dict[str, object]:
    """Формирует итоговый отчёт по всем обработанным файлам."""
    rezultaty: List[Dict[str, object]] = []
    for fajl in fajly:
        try:
            rezultaty.append(obrabotat_fajl(fajl, root))
        except UnicodeDecodeError:
            rezultaty.append({"file": str(fajl.relative_to(root)), "status": "skipped"})
    return {"files": rezultaty}


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description="Автоконфликт Kolibri")
    parser.add_argument("--base", required=True, help="базовая ветка/коммит для ребейза")
    parser.add_argument("--head", required=True, help="рабочая ветка с конфликтами")
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("build/conflict-report.json"),
        help="путь для JSON-отчёта",
    )
    args = parser.parse_args(argv)
    try:
        koren = Path(
            run_git(["rev-parse", "--show-toplevel"], Path.cwd()).stdout.strip()
        )
        report_path = args.report
        if report_path and not report_path.is_absolute():
            report_path = koren / report_path
        merge_base = run_git(["merge-base", args.base, args.head], koren).stdout.strip()
        run_git(["checkout", args.head], koren)

        otchet_fajlov: List[Dict[str, object]] = []
        rezultat_rebase = run_git(["rebase", args.base], koren, check=False)
        if rezultat_rebase.returncode not in (0, 1):
            raise GitCommandError(["rebase", args.base], rezultat_rebase)

        if rezultat_rebase.returncode == 1:
            while True:
                fajly_v_konflikte = nayti_fajly(koren)
                chastichnyj_otchet = postroit_otchet(koren, fajly_v_konflikte)
                otchet_fajlov.extend(chastichnyj_otchet["files"])
                razreshennye = [
                    zapis["file"]
                    for zapis in chastichnyj_otchet["files"]
                    if zapis["status"] == "resolved"
                ]
                problemnye = [
                    zapis["file"]
                    for zapis in chastichnyj_otchet["files"]
                    if zapis["status"] != "clean"
                ]
                if not razreshennye and problemnye:
                    raise RuntimeError(
                        "Обнаружены файлы, которые не удалось обработать автоматически: "
                        + ", ".join(problemnye)
                    )
                if razreshennye:
                    run_git(["add", *razreshennye], koren)
                rezultat_continue = run_git(["rebase", "--continue"], koren, check=False)
                if rezultat_continue.returncode == 0:
                    break
                if rezultat_continue.returncode == 1:
                    continue
                raise GitCommandError(["rebase", "--continue"], rezultat_continue)

        otchet = {"base": args.base, "head": args.head, "merge_base": merge_base, "files": otchet_fajlov}
        if report_path:
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_path.write_text(
                json.dumps(otchet, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        print(json.dumps(otchet, ensure_ascii=False, indent=2))
        return 0
    except GitCommandError as oshibka:
        print(oshibka, file=sys.stderr)
        return oshibka.returncode or 1
    except Exception as oshibka:
        print(oshibka, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
