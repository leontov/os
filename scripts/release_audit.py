#!/usr/bin/env python3
"""Kolibri release readiness audit helper.

This utility performs a battery of consistency checks before packaging a release.
It verifies that core documents exist, contain key markers, validates recent
artifacts, and can optionally execute the project's recommended validation
commands. The script now emits machine-readable reports and enforces stricter
release hygiene (clean Git state, fresh archives) when requested.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TEST_COMMANDS = [
    ["pytest", "-q"],
    ["ruff", "check", "."],
    ["pyright"],
    ["ctest", "--test-dir", "build"],
]

WASM_SIZE_LIMIT_BYTES = 1_000_000  # aligns with release documentation guidance


@dataclass
class CheckResult:
    name: str
    ok: bool
    message: str
    warning: bool = False
    category: str = "general"

    def severity_label(self) -> str:
        if self.ok:
            return "OK"
        if self.warning:
            return "WARN"
        return "FAIL"

    def to_dict(self) -> dict[str, object]:
        return {
            "name": self.name,
            "ok": self.ok,
            "message": self.message,
            "warning": self.warning,
            "category": self.category,
            "severity": self.severity_label(),
        }


@dataclass(frozen=True)
class AuditConfig:
    require_artifacts: bool = False
    require_clean_git: bool = False
    require_release_archive: bool = False


class AuditFailure(Exception):
    pass


def _category_for_path(repo_root: Path, path: Path) -> str:
    try:
        relative = path.relative_to(repo_root)
    except ValueError:
        return "general"

    if not relative.parts:
        return "general"
    head = relative.parts[0]
    if head == "docs":
        return "docs"
    if head == "scripts":
        return "scripts"
    if head == "build":
        return "artifacts"
    if head in {"apps", "backend", "frontend", "core"}:
        return "sources"
    return "repo"


def _file_exists(path: Path, *, category: str) -> CheckResult:
    if path.exists():
        return CheckResult(str(path), True, "found", category=category)
    return CheckResult(str(path), False, "missing", category=category)


def _file_not_empty(path: Path, *, category: str) -> CheckResult:
    if not path.exists():
        return CheckResult(str(path), False, "missing", category=category)
    if path.is_file() and path.stat().st_size > 0:
        return CheckResult(str(path), True, "non-empty", category=category)
    return CheckResult(str(path), False, "empty", category=category)


def _path_is_executable(path: Path, *, category: str) -> CheckResult:
    if not path.exists():
        return CheckResult(str(path), False, "missing", category=category)
    if path.stat().st_mode & 0o111:
        return CheckResult(str(path), True, "executable", category=category)
    return CheckResult(str(path), False, "not executable", category=category)


def _check_heading(path: Path, prefix: str, *, category: str) -> CheckResult:
    if not path.exists():
        return CheckResult(str(path), False, "missing", category=category)
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith(prefix):
            return CheckResult(
                str(path),
                True,
                f"contains heading starting with '{prefix}'",
                category=category,
            )
    return CheckResult(
        str(path),
        False,
        f"no heading starting with '{prefix}'",
        category=category,
    )


def _check_wasm(path: Path, strict: bool) -> CheckResult:
    if not path.exists():
        return CheckResult(
            str(path),
            False,
            "artifact not found",
            warning=not strict,
            category="artifacts",
        )
    size = path.stat().st_size
    if size <= WASM_SIZE_LIMIT_BYTES:
        return CheckResult(
            str(path),
            True,
            f"size {size} B <= {WASM_SIZE_LIMIT_BYTES} B",
            category="artifacts",
        )
    return CheckResult(
        str(path),
        False,
        f"size {size} B exceeds limit {WASM_SIZE_LIMIT_BYTES} B",
        category="artifacts",
    )


def check_release_archives(repo_root: Path, strict: bool) -> CheckResult:
    release_dir = repo_root / "build" / "release"
    if not release_dir.exists():
        return CheckResult(
            str(release_dir),
            False,
            "release directory not found",
            warning=not strict,
            category="artifacts",
        )

    archives = sorted(release_dir.glob("*.tar.gz"))
    if not archives:
        return CheckResult(
            "release archives",
            False,
            "no tar.gz archives detected",
            warning=not strict,
            category="artifacts",
        )

    latest = max(archives, key=lambda path: path.stat().st_mtime)
    size = latest.stat().st_size
    if size <= 0:
        return CheckResult(
            str(latest),
            False,
            "latest archive is empty",
            category="artifacts",
        )
    return CheckResult(
        str(latest),
        True,
        f"latest archive size {size} B",
        category="artifacts",
    )


def check_git_clean(repo_root: Path, strict: bool) -> CheckResult:
    try:
        completed = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=repo_root,
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        return CheckResult(
            "git status",
            False,
            "git executable not found",
            warning=not strict,
            category="git",
        )
    except subprocess.CalledProcessError as exc:
        return CheckResult(
            "git status",
            False,
            f"git status failed with code {exc.returncode}",
            warning=not strict,
            category="git",
        )

    pending = [line for line in completed.stdout.splitlines() if line.strip()]
    if pending:
        message = f"working tree has {len(pending)} pending change(s)"
        return CheckResult(
            "git status",
            False,
            message,
            warning=not strict,
            category="git",
        )
    return CheckResult("git status", True, "working tree clean", category="git")


def _run_command(cmd: List[str], cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    display = " ".join(part or "" for part in cmd)
    print(f"[run] {display}")
    return subprocess.run([p for p in cmd if p], cwd=cwd, check=True, text=True)


def perform_checks(config: AuditConfig, repo_root: Path = REPO_ROOT) -> List[CheckResult]:
    results: List[CheckResult] = []
    required_files = [
        repo_root / "README.md",
        repo_root / "LICENSE",
        repo_root / "CHANGELOG.md",
        repo_root / "docs" / "release_notes.md",
        repo_root / "docs" / "release_process.md",
        repo_root / "scripts" / "package_release.sh",
        repo_root / "scripts" / "run_all.sh",
    ]

    for path in required_files:
        category = _category_for_path(repo_root, path)
        results.append(_file_exists(path, category=category))
        if path.suffix in {".md", ""}:
            results.append(_file_not_empty(path, category=category))

    results.append(
        _path_is_executable(
            repo_root / "scripts" / "package_release.sh",
            category="scripts",
        )
    )
    results.append(
        _path_is_executable(
            repo_root / "scripts" / "run_all.sh",
            category="scripts",
        )
    )

    results.append(
        _check_heading(
            repo_root / "docs" / "release_notes.md",
            "## ",
            category="docs",
        )
    )
    results.append(
        _check_heading(
            repo_root / "docs" / "release_process.md",
            "## ",
            category="docs",
        )
    )

    wasm_result = _check_wasm(
        repo_root / "build" / "wasm" / "kolibri.wasm",
        strict=config.require_artifacts,
    )
    results.append(wasm_result)

    iso_path = repo_root / "build" / "kolibri.iso"
    if iso_path.exists():
        results.append(
            CheckResult(
                str(iso_path),
                True,
                "artifact present",
                category="artifacts",
            )
        )
    else:
        results.append(
            CheckResult(
                str(iso_path),
                False,
                "artifact not found",
                warning=not config.require_artifacts,
                category="artifacts",
            )
        )

    results.append(check_release_archives(repo_root, config.require_release_archive))
    results.append(check_git_clean(repo_root, config.require_clean_git))

    return results


def summarize(
    results: Iterable[CheckResult], *, fail_on_warning: bool
) -> tuple[int, int, int, int]:
    ok = warn = hard_fail = 0
    for res in results:
        label = res.severity_label()
        category = f"{res.category}: " if res.category else ""
        print(f"[{label}] {category}{res.name} — {res.message}")
        if res.ok:
            ok += 1
        elif res.warning:
            warn += 1
        else:
            hard_fail += 1

    exit_failures = hard_fail + (warn if fail_on_warning else 0)
    return ok, warn, hard_fail, exit_failures


def resolve_test_commands(custom: list[str] | None) -> list[list[str]]:
    if not custom:
        return DEFAULT_TEST_COMMANDS
    import shlex

    commands: list[list[str]] = []
    for item in custom:
        pieces = shlex.split(item)
        if pieces:
            commands.append(pieces)
    return commands


def run_tests(commands: list[list[str]]) -> None:
    for cmd in commands:
        if not cmd:
            continue
        tool = shutil.which(cmd[0])
        if tool is None:
            print(f"[skip] {cmd[0]} not found in PATH")
            continue
        try:
            _run_command(cmd, cwd=REPO_ROOT)
        except subprocess.CalledProcessError as exc:
            raise AuditFailure(f"command {' '.join(cmd)} failed with exit code {exc.returncode}") from exc


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Kolibri release audit helper")
    parser.add_argument(
        "--run-tests",
        action="store_true",
        help="run standard validation commands after static checks",
    )
    parser.add_argument(
        "--tests",
        nargs="*",
        help=(
            "custom commands to run when --run-tests is used; separate individual "
            "commands with '--'."
        ),
    )
    parser.add_argument(
        "--require-artifacts",
        action="store_true",
        help="fail if release artifacts in build/ are missing",
    )
    parser.add_argument(
        "--require-clean",
        action="store_true",
        help="fail when the Git working tree is not clean",
    )
    parser.add_argument(
        "--require-release-archive",
        action="store_true",
        help="fail when build/release does not contain a tar.gz archive",
    )
    parser.add_argument(
        "--fail-on-warnings",
        action="store_true",
        help="treat warning-level findings as failures",
    )
    parser.add_argument(
        "--json-output",
        type=Path,
        help="write audit results to the specified JSON file",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])

    config = AuditConfig(
        require_artifacts=args.require_artifacts,
        require_clean_git=args.require_clean,
        require_release_archive=args.require_release_archive,
    )
    results = perform_checks(config)
    ok, warn, hard_fail, exit_failures = summarize(
        results,
        fail_on_warning=args.fail_on_warnings,
    )
    print(f"Summary: {ok} ok, {warn} warnings, {hard_fail} failures")

    if args.json_output:
        payload = {
            "results": [res.to_dict() for res in results],
            "summary": {
                "ok": ok,
                "warnings": warn,
                "failures": hard_fail,
                "effective_failures": exit_failures,
            },
            "config": {
                "require_artifacts": args.require_artifacts,
                "require_clean_git": args.require_clean,
                "require_release_archive": args.require_release_archive,
                "fail_on_warnings": args.fail_on_warnings,
            },
        }
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    if exit_failures:
        return 1

    if args.run_tests:
        commands = resolve_test_commands(args.tests)
        try:
            run_tests(commands)
        except AuditFailure as exc:
            print(f"[error] {exc}")
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
