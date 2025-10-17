#!/usr/bin/env python3
"""Генерация SBOM для kolibri.wasm.

Скрипт создаёт JSON с контрольной суммой, размерами и перечнем экспортов
ядра KOLIBRI-Σ. Используется в CI и release-пайплайнах.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Dict, List

DEFAULT_OUTPUT = "build/wasm/kolibri.wasm.sbom.json"
DEFAULT_MODULE = "build/wasm/kolibri.wasm"
EXPORTS: List[str] = [
    "_k_state_new",
    "_k_state_free",
    "_k_state_save",
    "_k_state_load",
    "_k_observe",
    "_k_decode",
    "_k_digit_add_syll",
    "_k_profile",
    "_kolibri_bridge_init",
    "_kolibri_bridge_reset",
    "_kolibri_bridge_execute",
    "_malloc",
    "_free",
]


def sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8192), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def collect_metadata(module: Path) -> Dict[str, object]:
    size = module.stat().st_size if module.exists() else 0
    checksum = sha256(module) if module.exists() else "0" * 64
    source_hash = sha256(Path("wasm/kolibri_core.c")) if Path("wasm/kolibri_core.c").exists() else "0" * 64
    return {
        "module": str(module),
        "size_bytes": size,
        "sha256": checksum,
        "source_sha256": source_hash,
        "exports": EXPORTS,
        "spec": "docs/KOLIBRI-Sigma-Core-Spec-v1.0-draft.md",
        "toolchain": {
            "emcc": os.environ.get("EMCC", "emcc"),
            "flags": [
                "-O3",
                "-std=gnu11",
                "-msimd128",
                "-sSTANDALONE_WASM=1",
                "-sSIDE_MODULE=0",
                "-sALLOW_MEMORY_GROWTH=1",
            ],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate SBOM for kolibri.wasm")
    parser.add_argument("module", nargs="?", default=DEFAULT_MODULE, help="Путь до wasm-модуля")
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="Файл для записи SBOM")
    args = parser.parse_args()

    module_path = Path(args.module)
    metadata = collect_metadata(module_path)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(f"[sbom] saved {output_path} (module: {module_path})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
