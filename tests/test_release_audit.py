from __future__ import annotations

import json
import stat
import subprocess
from pathlib import Path

from scripts import release_audit


def _make_executable(path: Path) -> None:
    mode = path.stat().st_mode
    path.chmod(mode | stat.S_IXUSR)


def _bootstrap_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "kolibri"
    (repo / "docs").mkdir(parents=True)
    (repo / "scripts").mkdir(parents=True)
    (repo / "build" / "wasm").mkdir(parents=True)
    (repo / "build" / "release").mkdir(parents=True)

    (repo / "README.md").write_text("Kolibri\n", encoding="utf-8")
    (repo / "LICENSE").write_text("license\n", encoding="utf-8")
    (repo / "CHANGELOG.md").write_text("## 0.1.0\n", encoding="utf-8")
    (repo / "docs" / "release_notes.md").write_text(
        "## 0.1.0\n", encoding="utf-8"
    )
    (repo / "docs" / "release_process.md").write_text(
        "## Steps\n", encoding="utf-8"
    )

    package_release = repo / "scripts" / "package_release.sh"
    package_release.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    _make_executable(package_release)

    run_all = repo / "scripts" / "run_all.sh"
    run_all.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    _make_executable(run_all)

    (repo / "build" / "wasm" / "kolibri.wasm").write_bytes(b"wasm")
    (repo / "build" / "kolibri.iso").write_bytes(b"iso")
    (repo / "build" / "release" / "kolibri.tar.gz").write_bytes(b"data")

    subprocess.run(["git", "init"], cwd=repo, check=True, stdout=subprocess.DEVNULL)
    subprocess.run(
        ["git", "config", "user.name", "kolibri"],
        cwd=repo,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    subprocess.run(
        ["git", "config", "user.email", "kolibri@example.com"],
        cwd=repo,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True, stdout=subprocess.DEVNULL)
    subprocess.run(
        ["git", "commit", "-m", "init"],
        cwd=repo,
        check=True,
        stdout=subprocess.DEVNULL,
    )

    return repo


def test_resolve_test_commands_defaults():
    assert release_audit.resolve_test_commands(None) == release_audit.DEFAULT_TEST_COMMANDS


def test_resolve_test_commands_custom():
    commands = release_audit.resolve_test_commands(["pytest -q", "ninja -C build"])
    assert commands == [["pytest", "-q"], ["ninja", "-C", "build"]]


def test_perform_checks_success(tmp_path: Path):
    repo = _bootstrap_repo(tmp_path)
    config = release_audit.AuditConfig(
        require_artifacts=True,
        require_clean_git=True,
        require_release_archive=True,
    )
    results = release_audit.perform_checks(config, repo_root=repo)
    assert all(res.ok or res.warning for res in results)
    assert all(res.category for res in results)


def test_perform_checks_missing_iso(tmp_path: Path):
    repo = _bootstrap_repo(tmp_path)
    (repo / "build" / "kolibri.iso").unlink()
    config = release_audit.AuditConfig(require_artifacts=True)
    results = release_audit.perform_checks(config, repo_root=repo)
    iso_results = [res for res in results if "kolibri.iso" in res.name]
    assert iso_results and all(not res.ok for res in iso_results)


def test_git_clean_detection(tmp_path: Path):
    repo = _bootstrap_repo(tmp_path)
    clean = release_audit.check_git_clean(repo, strict=True)
    assert clean.ok

    (repo / "new.txt").write_text("1", encoding="utf-8")
    dirty_warn = release_audit.check_git_clean(repo, strict=False)
    assert not dirty_warn.ok and dirty_warn.warning

    dirty_fail = release_audit.check_git_clean(repo, strict=True)
    assert not dirty_fail.ok and not dirty_fail.warning


def test_json_output(tmp_path: Path):
    repo = _bootstrap_repo(tmp_path)
    config = release_audit.AuditConfig()
    results = release_audit.perform_checks(config, repo_root=repo)
    ok, warn, hard_fail, exit_failures = release_audit.summarize(
        results, fail_on_warning=False
    )
    output = tmp_path / "audit.json"
    payload = {
        "results": [res.to_dict() for res in results],
        "summary": {
            "ok": ok,
            "warnings": warn,
            "failures": hard_fail,
            "effective_failures": exit_failures,
        },
    }
    output.write_text(json.dumps(payload), encoding="utf-8")
    loaded = json.loads(output.read_text(encoding="utf-8"))
    assert loaded["summary"]["ok"] == ok

