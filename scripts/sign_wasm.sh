#!/usr/bin/env bash
set -euo pipefail

module_path=${1:-build/wasm/kolibri.wasm}
signature_path=${2:-${module_path}.sig}
key_hex=${KOLIBRI_WASM_SIGNING_KEY:-}

if [[ -z "$key_hex" ]]; then
    echo "[sign] Переменная KOLIBRI_WASM_SIGNING_KEY не задана." >&2
    echo "[sign] Экспортируйте 32-байтовый ключ в hex и повторите." >&2
    exit 1
fi

if [[ ! -f "$module_path" ]]; then
    echo "[sign] Файл $module_path не найден." >&2
    exit 1
fi

python3 - "$module_path" "$signature_path" "$key_hex" <<'PY'
import binascii
import hashlib
import hmac
import sys
from pathlib import Path

module = Path(sys.argv[1])
signature = Path(sys.argv[2])
key = sys.argv[3]

try:
    key_bytes = binascii.unhexlify(key)
except binascii.Error as exc:  # noqa: PERF203
    raise SystemExit(f"invalid signing key: {exc}")

if len(key_bytes) not in {16, 24, 32}:
    raise SystemExit("signing key must be 16/24/32 bytes in hex")

h = hmac.new(key_bytes, digestmod=hashlib.sha256)
with module.open("rb") as handle:
    for chunk in iter(lambda: handle.read(8192), b""):
        h.update(chunk)

signature.write_text(h.hexdigest() + "\n", encoding="utf-8")
print(f"[sign] signature saved to {signature}")
PY
