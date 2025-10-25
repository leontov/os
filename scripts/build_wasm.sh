#!/usr/bin/env bash
set -euo pipefail

# Скрипт компиляции ядра Kolibri-Sigma в WebAssembly.
# Собирает формализованное ядро (арена памяти, обратимые скетчи,
# DAAWG, микро-VM и резонансное голосование) и проверяет,
# что итоговый модуль укладывается в бюджет < 1 МБ.

proekt_koren="$(cd "$(dirname "$0")/.." && pwd)"
vyhod_dir="${KOLIBRI_WASM_OUTPUT_DIR:-$proekt_koren/build/wasm}"
mkdir -p "$vyhod_dir"

vyhod_wasm="$vyhod_dir/kolibri.wasm"
vremennaja_map="$vyhod_dir/kolibri.map"
vremennaja_js="$vyhod_dir/kolibri.js"

otchet_path="$vyhod_dir/kolibri.wasm.report.json"

emscripten_cache_dir="${KOLIBRI_WASM_CACHE_DIR:-$proekt_koren/build/emscripten_cache}"
mkdir -p "$emscripten_cache_dir"
export EM_CACHE="$emscripten_cache_dir"

emcc_dostupen=0
docker_dostupen=0
stub_flag=0
stub_prichina=""
otchet_sozdan=0
emcc_sanity_output=""
emcc_sanity_class=""

prepare_em_config() {
    if [[ -n "${KOLIBRI_WASM_EM_CONFIG:-}" ]]; then
        EM_CONFIG="${KOLIBRI_WASM_EM_CONFIG}"
    fi

    if [[ -z "${EM_CONFIG:-}" ]]; then
        local config_dir="${KOLIBRI_WASM_CONFIG_DIR:-$proekt_koren/build/emscripten_config}"
        mkdir -p "$config_dir"
        EM_CONFIG="$config_dir/.emscripten"
    else
        mkdir -p "$(dirname "$EM_CONFIG")"
    fi

    export EM_CONFIG

    local resolved_emcc=""
    if resolved_emcc="$(command -v "$EMCC" 2>/dev/null)"; then
        :
    fi

    local emsdk_root=""
    case "$resolved_emcc" in
        */upstream/emscripten/emcc)
            emsdk_root="${resolved_emcc%/upstream/emscripten/emcc}"
            ;;
    esac

    local llvm_root=""
    local binaryen_root=""
    local emscripten_path=""
    local node_path="${EMSDK_NODE:-}"

    if [[ -n "$emsdk_root" ]]; then
        llvm_root="$emsdk_root/upstream/bin"
        binaryen_root="$emsdk_root/upstream"
        emscripten_path="$emsdk_root/upstream/emscripten"

        if [[ -z "$node_path" || ! -x "$node_path" ]]; then
            if [[ -x "$emsdk_root/node/current/bin/node" ]]; then
                node_path="$emsdk_root/node/current/bin/node"
            elif command -v find >/dev/null 2>&1; then
                local discovered=""
                discovered="$(find "$emsdk_root/node" -maxdepth 3 -type f -name node 2>/dev/null | head -n1 || true)"
                if [[ -n "$discovered" ]]; then
                    node_path="$discovered"
                fi
            fi
        fi

        export EM_LLVM_ROOT="$llvm_root"
        export EM_BINARYEN_ROOT="$binaryen_root"
        export LLVM_ROOT="$llvm_root"
        export BINARYEN_ROOT="$binaryen_root"

        if [[ -n "$node_path" ]]; then
            export NODE_JS="$node_path"
            export EM_NODE_JS="$node_path"
            export EMSDK_NODE="$node_path"
        fi

        if [[ -n "$llvm_root" ]]; then
            local path_prefixes=("$llvm_root")
            if [[ -n "$emscripten_path" ]]; then
                path_prefixes+=("$emscripten_path")
            fi
            for prefix in "${path_prefixes[@]}"; do
                case ":$PATH:" in
                    *":$prefix:") ;;
                    *) PATH="$prefix:$PATH" ;;
                esac
            done
            export PATH
        fi
    fi

    if [[ ! -f "$EM_CONFIG" ]] && [[ -n "$resolved_emcc" ]]; then
        if EM_CONFIG="$EM_CONFIG" "$resolved_emcc" --generate-config >/dev/null 2>&1; then
            echo "[Kolibri] Создан конфиг Emscripten: $EM_CONFIG"
        else
            echo "[ПРЕДУПРЕЖДЕНИЕ] Не удалось автоматически сгенерировать конфиг Emscripten ($EM_CONFIG)." >&2
        fi
    fi

    if [[ -f "$EM_CONFIG" ]] && grep -q '^FROZEN_CACHE = True' "$EM_CONFIG"; then
        if command -v python3 >/dev/null 2>&1; then
            python3 - "$EM_CONFIG" <<'PY'
import re
import sys
from pathlib import Path

config_path = Path(sys.argv[1])
text = config_path.read_text(encoding="utf-8")
updated = re.sub(r'^FROZEN_CACHE = True\b', 'FROZEN_CACHE = False', text, count=1, flags=re.MULTILINE)
if text != updated:
    config_path.write_text(updated, encoding="utf-8")
PY
        else
            local tmp_config="$EM_CONFIG.tmp"
            if sed 's/^FROZEN_CACHE = True/FROZEN_CACHE = False/' "$EM_CONFIG" >"$tmp_config"; then
                mv "$tmp_config" "$EM_CONFIG"
            else
                rm -f "$tmp_config"
            fi
        fi
    fi

    if [[ -n "$llvm_root" ]] && [[ -f "$EM_CONFIG" ]] && command -v python3 >/dev/null 2>&1; then
        python3 - "$EM_CONFIG" "$llvm_root" "$binaryen_root" "$node_path" <<'PY'
import sys
from pathlib import Path

config_path = Path(sys.argv[1])
llvm_root = sys.argv[2]
binaryen_root = sys.argv[3]
node_path = sys.argv[4]

def update_line(lines, key, value):
    target = f"{key} = '{value}'\n"
    for idx, line in enumerate(lines):
        if line.startswith(f"{key} ="):
            if line != target:
                lines[idx] = target
            return True
    lines.append(target)
    return True

lines = config_path.read_text(encoding="utf-8").splitlines(keepends=True)
update_line(lines, "LLVM_ROOT", llvm_root)
update_line(lines, "BINARYEN_ROOT", binaryen_root)
if node_path:
    update_line(lines, "NODE_JS", node_path)

config_path.write_text("".join(lines), encoding="utf-8")
PY
    elif [[ -n "$llvm_root" ]] && [[ -f "$EM_CONFIG" ]] && command -v sed >/dev/null 2>&1; then
        sed -i.bak \
            -e "s|^LLVM_ROOT = .*|LLVM_ROOT = '$llvm_root'|" \
            -e "s|^BINARYEN_ROOT = .*|BINARYEN_ROOT = '$binaryen_root'|" \
            "$EM_CONFIG" 2>/dev/null || true
        if [[ -n "$node_path" ]]; then
            sed -i.bak -e "s|^NODE_JS = .*|NODE_JS = '$node_path'|" "$EM_CONFIG" 2>/dev/null || true
        fi
        rm -f "$EM_CONFIG.bak"
    fi
}

proverit_emcc_sanity() {
    emcc_sanity_output=""
    emcc_sanity_class=""

    if ! command -v "$EMCC" >/dev/null 2>&1; then
        return 1
    fi

    local tmpdir
    if tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/kolibri-emcc-XXXXXX" 2>/dev/null)" && [[ -n "$tmpdir" ]]; then
        :
    else
        tmpdir="$vyhod_dir/.emcc-sanity"
        rm -rf "$tmpdir"
        mkdir -p "$tmpdir"
    fi

    local src="$tmpdir/sanity.c"
    local wasm_out="$tmpdir/sanity.wasm"
    local log_file="$tmpdir/sanity.log"

    cat >"$src" <<'EOF'
#include <stdint.h>

static uint32_t kolibri_stub(void) {
    return 0;
}

int main(void) {
    return (int)kolibri_stub();
}
EOF

    if "$EMCC" -sSTANDALONE_WASM=1 -sSIDE_MODULE=0 --no-entry -O0 "$src" -o "$wasm_out" >"$log_file" 2>&1; then
        rm -rf "$tmpdir"
        return 0
    fi

    emcc_sanity_output="$(cat "$log_file" 2>/dev/null || true)"
    if [[ "$emcc_sanity_output" == *"LLVM has not been built with the WebAssembly backend"* ]]; then
        emcc_sanity_class="missing-wasm-backend"
    elif [[ "$emcc_sanity_output" == *"emscripten:ERROR"* || "$emcc_sanity_output" == *"error:"* ]]; then
        emcc_sanity_class="generic-error"
    fi

    rm -rf "$tmpdir"
    return 1
}

prepare_em_config() {
    if [[ -n "${KOLIBRI_WASM_EM_CONFIG:-}" ]]; then
        EM_CONFIG="${KOLIBRI_WASM_EM_CONFIG}"
    fi

    if [[ -z "${EM_CONFIG:-}" ]]; then
        local config_dir="${KOLIBRI_WASM_CONFIG_DIR:-$proekt_koren/build/emscripten_config}"
        mkdir -p "$config_dir"
        EM_CONFIG="$config_dir/.emscripten"
    else
        mkdir -p "$(dirname "$EM_CONFIG")"
    fi

    export EM_CONFIG

    local resolved_emcc=""
    if resolved_emcc="$(command -v "$EMCC" 2>/dev/null)"; then
        :
    fi

    local emsdk_root=""
    case "$resolved_emcc" in
        */upstream/emscripten/emcc)
            emsdk_root="${resolved_emcc%/upstream/emscripten/emcc}"
            ;;
    esac

    local llvm_root=""
    local binaryen_root=""
    local emscripten_path=""
    local node_path="${EMSDK_NODE:-}"

    if [[ -n "$emsdk_root" ]]; then
        llvm_root="$emsdk_root/upstream/bin"
        binaryen_root="$emsdk_root/upstream"
        emscripten_path="$emsdk_root/upstream/emscripten"

        if [[ -z "$node_path" || ! -x "$node_path" ]]; then
            if [[ -x "$emsdk_root/node/current/bin/node" ]]; then
                node_path="$emsdk_root/node/current/bin/node"
            elif command -v find >/dev/null 2>&1; then
                local discovered=""
                discovered="$(find "$emsdk_root/node" -maxdepth 3 -type f -name node 2>/dev/null | head -n1 || true)"
                if [[ -n "$discovered" ]]; then
                    node_path="$discovered"
                fi
            fi
        fi

        export EM_LLVM_ROOT="$llvm_root"
        export EM_BINARYEN_ROOT="$binaryen_root"
        export LLVM_ROOT="$llvm_root"
        export BINARYEN_ROOT="$binaryen_root"

        if [[ -n "$node_path" ]]; then
            export NODE_JS="$node_path"
            export EM_NODE_JS="$node_path"
            export EMSDK_NODE="$node_path"
        fi

        if [[ -n "$llvm_root" ]]; then
            local path_prefixes=("$llvm_root")
            if [[ -n "$emscripten_path" ]]; then
                path_prefixes+=("$emscripten_path")
            fi
            for prefix in "${path_prefixes[@]}"; do
                case ":$PATH:" in
                    *":$prefix:") ;;
                    *) PATH="$prefix:$PATH" ;;
                esac
            done
            export PATH
        fi
    fi

    if [[ ! -f "$EM_CONFIG" ]] && [[ -n "$resolved_emcc" ]]; then
        if EM_CONFIG="$EM_CONFIG" "$resolved_emcc" --generate-config >/dev/null 2>&1; then
    if [[ ! -f "$EM_CONFIG" ]] && command -v "$EMCC" >/dev/null 2>&1; then
        if EM_CONFIG="$EM_CONFIG" "$EMCC" --generate-config >/dev/null 2>&1; then
            echo "[Kolibri] Создан конфиг Emscripten: $EM_CONFIG"
        else
            echo "[ПРЕДУПРЕЖДЕНИЕ] Не удалось автоматически сгенерировать конфиг Emscripten ($EM_CONFIG)." >&2
        fi
    fi

    if [[ -f "$EM_CONFIG" ]] && grep -q '^FROZEN_CACHE = True' "$EM_CONFIG"; then
        if command -v python3 >/dev/null 2>&1; then
            python3 - "$EM_CONFIG" <<'PY'
import re
import sys
from pathlib import Path

config_path = Path(sys.argv[1])
text = config_path.read_text(encoding="utf-8")
updated = re.sub(r'^FROZEN_CACHE = True\b', 'FROZEN_CACHE = False', text, count=1, flags=re.MULTILINE)
if text != updated:
    config_path.write_text(updated, encoding="utf-8")
PY
        else
            local tmp_config="$EM_CONFIG.tmp"
            if sed 's/^FROZEN_CACHE = True/FROZEN_CACHE = False/' "$EM_CONFIG" >"$tmp_config"; then
                mv "$tmp_config" "$EM_CONFIG"
            else
                rm -f "$tmp_config"
            fi
        fi
    fi

    if [[ -n "$llvm_root" ]] && [[ -f "$EM_CONFIG" ]] && command -v python3 >/dev/null 2>&1; then
        python3 - "$EM_CONFIG" "$llvm_root" "$binaryen_root" "$node_path" <<'PY'
    local resolved_emcc=""
    if resolved_emcc="$(command -v "$EMCC" 2>/dev/null)"; then
        local emsdk_root=""
        case "$resolved_emcc" in
            */upstream/emscripten/emcc)
                emsdk_root="${resolved_emcc%/upstream/emscripten/emcc}"
                ;;
        esac

        if [[ -n "$emsdk_root" ]]; then
            local llvm_root="$emsdk_root/upstream/bin"
            local binaryen_root="$emsdk_root/upstream"
            local node_path="${EMSDK_NODE:-}"

            if [[ -z "$node_path" || ! -x "$node_path" ]]; then
                if [[ -x "$emsdk_root/node/current/bin/node" ]]; then
                    node_path="$emsdk_root/node/current/bin/node"
                elif command -v find >/dev/null 2>&1; then
                    local discovered=""
                    discovered="$(find "$emsdk_root/node" -maxdepth 3 -type f -name node 2>/dev/null | head -n1 || true)"
                    if [[ -n "$discovered" ]]; then
                        node_path="$discovered"
                    fi
                fi
            fi

            export EM_LLVM_ROOT="$llvm_root"
            export EM_BINARYEN_ROOT="$binaryen_root"
            if [[ -n "$node_path" ]]; then
                export NODE_JS="$node_path"
                export EM_NODE_JS="$node_path"
                export EMSDK_NODE="$node_path"
            fi

            if [[ -f "$EM_CONFIG" ]] && command -v python3 >/dev/null 2>&1; then
                python3 - "$EM_CONFIG" "$llvm_root" "$binaryen_root" "$node_path" <<'PY'
import sys
from pathlib import Path

config_path = Path(sys.argv[1])
llvm_root = sys.argv[2]
binaryen_root = sys.argv[3]
node_path = sys.argv[4]

def update_line(lines, key, value):
    target = f"{key} = '{value}'\n"
    for idx, line in enumerate(lines):
        if line.startswith(f"{key} ="):
            if line != target:
                lines[idx] = target
            return True
    lines.append(target)
    return True

lines = config_path.read_text(encoding="utf-8").splitlines(keepends=True)
update_line(lines, "LLVM_ROOT", llvm_root)
update_line(lines, "BINARYEN_ROOT", binaryen_root)
if node_path:
    update_line(lines, "NODE_JS", node_path)

config_path.write_text("".join(lines), encoding="utf-8")
PY
    elif [[ -n "$llvm_root" ]] && [[ -f "$EM_CONFIG" ]] && command -v sed >/dev/null 2>&1; then
        sed -i.bak \
            -e "s|^LLVM_ROOT = .*|LLVM_ROOT = '$llvm_root'|" \
            -e "s|^BINARYEN_ROOT = .*|BINARYEN_ROOT = '$binaryen_root'|" \
            "$EM_CONFIG" 2>/dev/null || true
        if [[ -n "$node_path" ]]; then
            sed -i.bak -e "s|^NODE_JS = .*|NODE_JS = '$node_path'|" "$EM_CONFIG" 2>/dev/null || true
        fi
        rm -f "$EM_CONFIG.bak"
            elif [[ -f "$EM_CONFIG" ]]; then
                if command -v sed >/dev/null 2>&1; then
                    sed -i.bak \
                        -e "s|^LLVM_ROOT = .*|LLVM_ROOT = '$llvm_root'|" \
                        -e "s|^BINARYEN_ROOT = .*|BINARYEN_ROOT = '$binaryen_root'|" \
                        "$EM_CONFIG" 2>/dev/null || true
                    if [[ -n "$node_path" ]]; then
                        sed -i.bak -e "s|^NODE_JS = .*|NODE_JS = '$node_path'|" "$EM_CONFIG" 2>/dev/null || true
                    fi
                    rm -f "$EM_CONFIG.bak"
                fi
            fi
        fi
    fi
}

json_otchet() {
    local status="$1"
    local reason="$2"
    local size_bytes="$3"
    local stub="$4"

    if command -v python3 >/dev/null 2>&1; then
        python3 - "$otchet_path" <<'PY'
import json
import os
import sys

status = os.environ.get("KOLIBRI_WASM_REPORT_STATUS", "unknown")
reason = os.environ.get("KOLIBRI_WASM_REPORT_REASON", "")
size = int(os.environ.get("KOLIBRI_WASM_REPORT_SIZE", "0"))
stub = bool(int(os.environ.get("KOLIBRI_WASM_REPORT_STUB", "0")))
timestamp = os.environ.get("KOLIBRI_WASM_REPORT_TIMESTAMP", "")
emcc = bool(int(os.environ.get("KOLIBRI_WASM_REPORT_EMCC", "0")))
docker = bool(int(os.environ.get("KOLIBRI_WASM_REPORT_DOCKER", "0")))
invoked_via_docker = bool(int(os.environ.get("KOLIBRI_WASM_REPORT_INVOKED_DOCKER", "0")))

payload = {
    "status": status,
    "reason": reason,
    "timestamp": timestamp,
    "stub": stub,
    "size_bytes": size,
    "emcc_available": emcc,
    "docker_available": docker,
    "invoked_via_docker": invoked_via_docker,
    "output": os.environ.get("KOLIBRI_WASM_REPORT_OUTPUT", ""),
}

with open(sys.argv[1], "w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
PY
        return
    fi

    cat >"$otchet_path" <<EOF
status: $status
reason: $reason
timestamp: ${KOLIBRI_WASM_REPORT_TIMESTAMP:-}
stub: $stub
size_bytes: $size_bytes
emcc_available: $emcc_dostupen
docker_available: $docker_dostupen
invoked_via_docker: ${KOLIBRI_WASM_INVOKED_VIA_DOCKER:-0}
output: $vyhod_wasm
EOF
}

zapisat_otchet() {
    local status="$1"
    local reason="$2"
    local size_bytes="$3"
    local stub="$4"
    local now=""

    if command -v date >/dev/null 2>&1; then
        now="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true)"
    fi

    KOLIBRI_WASM_REPORT_STATUS="$status" \
    KOLIBRI_WASM_REPORT_REASON="$reason" \
    KOLIBRI_WASM_REPORT_SIZE="$size_bytes" \
    KOLIBRI_WASM_REPORT_STUB="$stub" \
    KOLIBRI_WASM_REPORT_TIMESTAMP="$now" \
    KOLIBRI_WASM_REPORT_EMCC="$emcc_dostupen" \
    KOLIBRI_WASM_REPORT_DOCKER="$docker_dostupen" \
    KOLIBRI_WASM_REPORT_INVOKED_DOCKER="${KOLIBRI_WASM_INVOKED_VIA_DOCKER:-0}" \
    KOLIBRI_WASM_REPORT_OUTPUT="$vyhod_wasm" \
        json_otchet "$status" "$reason" "$size_bytes" "$stub"
    otchet_sozdan=1
}

on_exit() {
    local status=$?
    if (( status != 0 )) && (( otchet_sozdan == 0 )); then
        zapisat_otchet "error" "Сборка kolibri.wasm завершилась с ошибкой (код ${status})" 0 "$stub_flag"
    fi
}

trap on_exit EXIT

opredelit_razmer() {
    local file="$1"

    if command -v python3 >/dev/null 2>&1; then
        python3 - "$file" <<'PY'
import os
import sys

path = sys.argv[1]
print(os.path.getsize(path))
PY
        return 0
    fi

    if command -v stat >/dev/null 2>&1; then
        if stat -c '%s' "$file" >/dev/null 2>&1; then
            stat -c '%s' "$file"
            return 0
        fi
        if stat -f '%z' "$file" >/dev/null 2>&1; then
            stat -f '%z' "$file"
            return 0
        fi
    fi

    if command -v wc >/dev/null 2>&1; then
        wc -c <"$file" | tr -d ' ' \
            || wc -c "${file}" | awk '{print $1}'
        return 0
    fi

    echo 0
    return 0
}

EMCC="${EMCC:-emcc}"
sozdat_zaglushku=0
sobranov_docker=0
allow_stub_success=0
bootstrap_enabled=1
bootstrap_attempted=0

if [[ "${KOLIBRI_WASM_DISABLE_BOOTSTRAP:-0}" =~ ^(1|true|TRUE|on|ON|yes|YES)$ ]]; then
    bootstrap_enabled=0
fi

if [[ "${KOLIBRI_WASM_ALLOW_STUB_SUCCESS:-0}" =~ ^(1|true|TRUE|on|ON|yes|YES)$ ]]; then
    allow_stub_success=1
fi

bootstrap_emsdk() {
    if (( bootstrap_attempted )); then
        return 1
    fi
    bootstrap_attempted=1

    local version="${KOLIBRI_WASM_EMSDK_VERSION:-3.1.61}"
    local emsdk_home="${KOLIBRI_WASM_EMSDK_DIR:-$proekt_koren/build/emsdk}"
    local emsdk_env="$emsdk_home/emsdk_env.sh"
    local emcc_path="$emsdk_home/upstream/emscripten/emcc"

    if [[ -x "$emcc_path" ]]; then
        if [[ -f "$emsdk_env" ]]; then
            # shellcheck disable=SC1090
            source "$emsdk_env" >/dev/null 2>&1 || true
        fi
        export EMSDK="$emsdk_home"
        EMCC="$emcc_path"
        echo "[Kolibri] Используется локальный emsdk: $EMCC"
        return 0
    fi

    if ! (( bootstrap_enabled )); then
        return 1
    fi

    if ! command -v python3 >/dev/null 2>&1; then
        echo "[ПРЕДУПРЕЖДЕНИЕ] Невозможно загрузить emsdk: python3 недоступен." >&2
        return 1
    fi

    if ! command -v tar >/dev/null 2>&1; then
        echo "[ПРЕДУПРЕЖДЕНИЕ] Невозможно загрузить emsdk: утилита tar недоступна." >&2
        return 1
    fi

    local download_dir="${KOLIBRI_WASM_DOWNLOAD_DIR:-$proekt_koren/build/_downloads}"
    local tarball="$download_dir/emsdk-${version}.tar.gz"
    local extracted="$download_dir/emsdk-${version}"

    mkdir -p "$download_dir"

    if [[ ! -f "$tarball" ]]; then
        echo "[Kolibri] Скачиваю emsdk ${version} из GitHub..."
        if ! python3 - "$tarball" "$version" <<'PY'; then
import sys
import urllib.request
import urllib.error

target, version = sys.argv[1:3]
url = f"https://github.com/emscripten-core/emsdk/archive/refs/tags/{version}.tar.gz"

try:
    with urllib.request.urlopen(url) as response, open(target, "wb") as handle:
        while True:
            chunk = response.read(1 << 20)
            if not chunk:
                break
            handle.write(chunk)
except urllib.error.URLError as exc:
    raise SystemExit(f"download failed: {exc}")
PY
            echo "[ПРЕДУПРЕЖДЕНИЕ] Не удалось скачать emsdk ${version}." >&2
            rm -f "$tarball"
            return 1
        fi
    fi

    rm -rf "$extracted"
    if ! tar -xzf "$tarball" -C "$download_dir"; then
        echo "[ПРЕДУПРЕЖДЕНИЕ] Не удалось распаковать $tarball." >&2
        rm -rf "$extracted"
        return 1
    fi

    if [[ ! -d "$extracted" ]]; then
        echo "[ПРЕДУПРЕЖДЕНИЕ] Структура архива emsdk неожиданна: нет каталога $extracted." >&2
        return 1
    fi

    mkdir -p "$(dirname "$emsdk_home")"
    rm -rf "$emsdk_home"
    mv "$extracted" "$emsdk_home"

    if [[ ! -f "$emsdk_home/emsdk.py" ]]; then
        echo "[ПРЕДУПРЕЖДЕНИЕ] Скачанный emsdk неполный." >&2
        return 1
    fi

    echo "[Kolibri] Устанавливаю emsdk ${version} в $emsdk_home"
    (cd "$emsdk_home" && python3 ./emsdk.py install "$version") || {
        echo "[ПРЕДУПРЕЖДЕНИЕ] Установка emsdk ${version} завершилась ошибкой." >&2
        return 1
    }

    (cd "$emsdk_home" && python3 ./emsdk.py activate "$version") || {
        echo "[ПРЕДУПРЕЖДЕНИЕ] Активация emsdk ${version} завершилась ошибкой." >&2
        return 1
    }

    if [[ -f "$emsdk_env" ]]; then
        # shellcheck disable=SC1090
        source "$emsdk_env" >/dev/null 2>&1 || true
    fi

    if [[ -x "$emcc_path" ]]; then
        export EMSDK="$emsdk_home"
        EMCC="$emcc_path"
        echo "[Kolibri] emsdk ${version} установлен локально: $EMCC"
        return 0
    fi

    echo "[ПРЕДУПРЕЖДЕНИЕ] После установки emsdk emcc не найден." >&2
    return 1
}

vychislit_sha256_stroku() {
    local file="$1"

    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$file"
        return 0
    fi

    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$file"
        return 0
    fi

    if command -v python3 >/dev/null 2>&1; then
        python3 - "$file" <<'PY'
import hashlib
import os
import sys

path = sys.argv[1]
with open(path, "rb") as handle:
    digest = hashlib.sha256(handle.read()).hexdigest()

print(f"{digest}  {os.path.basename(path)}")
PY
        return 0
    fi

    return 1
}

zapisat_sha256() {
    local file="$1"
    local target="$2"

    if vychislit_sha256_stroku "$file" >"$target.tmp"; then
        mv "$target.tmp" "$target"
        return 0
    fi

    rm -f "$target.tmp"
    cat >"$target" <<EOF
sha256 недоступна: отсутствуют утилиты sha256sum/shasum и python3
EOF
    echo "[ПРЕДУПРЕЖДЕНИЕ] Не удалось вычислить SHA256 для $file: отсутствуют необходимые утилиты." >&2
    return 1
}

sozdat_stub_wasm() {
    if command -v python3 >/dev/null 2>&1; then
        python3 - "$vyhod_wasm" <<'PY'
import os
import sys


def u32(value):
    out = bytearray()
    while True:
        byte = value & 0x7F
        value >>= 7
        if value:
            out.append(byte | 0x80)
        else:
            out.append(byte)
            break
    return bytes(out)


def s32(value):
    out = bytearray()
    more = True
    while more:
        byte = value & 0x7F
        value >>= 7
        sign_bit = byte & 0x40
        done = ((value == 0 and sign_bit == 0) or (value == -1 and sign_bit != 0))
        if not done:
            byte |= 0x80
        out.append(byte & 0xFF)
        more = not done
    return bytes(out)


def encode_vec(items):
    return u32(len(items)) + b"".join(items)


def encode_section(section_id, payload):
    return bytes([section_id]) + u32(len(payload)) + payload


def func_body(code_bytes):
    return u32(len(code_bytes)) + code_bytes


def build_stub():
    params_i32 = 0x7F
    result_i32 = 0x7F

    functypes = [
        bytes([0x60]) + u32(0) + u32(1) + bytes([params_i32]),
        bytes([0x60]) + u32(3) + bytes([params_i32, params_i32, params_i32]) + u32(1) + bytes([params_i32]),
        bytes([0x60]) + u32(1) + bytes([params_i32]) + u32(1) + bytes([params_i32]),
        bytes([0x60]) + u32(2) + bytes([params_i32, params_i32]) + u32(1) + bytes([params_i32]),
        bytes([0x60]) + u32(1) + bytes([params_i32]) + u32(0),
        bytes([0x60]) + u32(0) + u32(0),
        bytes([0x60]) + u32(7) + bytes([params_i32] * 7) + u32(1) + bytes([params_i32]),
    ]

    section_type = encode_section(1, encode_vec(functypes))

    func_types = [0, 0, 1, 2, 0, 3, 4, 5, 2, 4, 6]
    section_func = encode_section(3, u32(len(func_types)) + b"".join(u32(t) for t in func_types))

    mem_type = bytes([0x00]) + u32(1)
    section_mem = encode_section(5, encode_vec([mem_type]))

    def export_entry(name, kind, index):
        name_bytes = name.encode("utf-8")
        return u32(len(name_bytes)) + name_bytes + bytes([kind]) + u32(index)

    names = [
        ("memory", 2, 0),
        ("_kolibri_bridge_init", 0, 0),
        ("kolibri_bridge_init", 0, 0),
        ("_kolibri_bridge_reset", 0, 1),
        ("kolibri_bridge_reset", 0, 1),
        ("_kolibri_bridge_configure", 0, 10),
        ("kolibri_bridge_configure", 0, 10),
        ("_kolibri_bridge_execute", 0, 2),
        ("kolibri_bridge_execute", 0, 2),
        ("_kolibri_bridge_has_simd", 0, 0),
        ("kolibri_bridge_has_simd", 0, 0),
        ("_kolibri_bridge_lane_width", 0, 0),
        ("kolibri_bridge_lane_width", 0, 0),
        ("_kolibri_sim_wasm_init", 0, 3),
        ("kolibri_sim_wasm_init", 0, 3),
        ("_kolibri_sim_wasm_tick", 0, 4),
        ("kolibri_sim_wasm_tick", 0, 4),
        ("_kolibri_sim_wasm_get_logs", 0, 5),
        ("kolibri_sim_wasm_get_logs", 0, 5),
        ("_kolibri_sim_wasm_reset", 0, 6),
        ("kolibri_sim_wasm_reset", 0, 6),
        ("_kolibri_sim_wasm_free", 0, 7),
        ("kolibri_sim_wasm_free", 0, 7),
        ("_malloc", 0, 8),
        ("malloc", 0, 8),
        ("_free", 0, 9),
        ("free", 0, 9),
        ("_k_state_new", 0, 0),
        ("k_state_new", 0, 0),
        ("_k_state_free", 0, 1),
        ("k_state_free", 0, 1),
        ("_k_state_save", 0, 2),
        ("k_state_save", 0, 2),
        ("_k_state_load", 0, 3),
        ("k_state_load", 0, 3),
        ("_k_observe", 0, 4),
        ("k_observe", 0, 4),
        ("_k_decode", 0, 5),
        ("k_decode", 0, 5),
        ("_k_digit_add_syll", 0, 6),
        ("k_digit_add_syll", 0, 6),
        ("_k_profile", 0, 7),
        ("k_profile", 0, 7),
        ("_kolibri_bridge_init", 0, 8),
        ("kolibri_bridge_init", 0, 8),
        ("_kolibri_bridge_reset", 0, 9),
        ("kolibri_bridge_reset", 0, 9),
        ("_kolibri_bridge_execute", 0, 10),
        ("kolibri_bridge_execute", 0, 10),
        ("_malloc", 0, 11),
        ("malloc", 0, 11),
        ("_free", 0, 12),
        ("free", 0, 12),
    ]

    section_export = encode_section(7, encode_vec([export_entry(*n) for n in names]))

    def body_return(value):
        return func_body(bytes([0x00, 0x41]) + s32(value) + bytes([0x0b]))

    bodies = [
        body_return(-1),
        body_return(-1),
        body_return(-1),
        body_return(-1),
        body_return(-1),
        body_return(-1),
        func_body(bytes([0x00, 0x0b])),
        func_body(bytes([0x00, 0x0b])),
        body_return(0),
        func_body(bytes([0x00, 0x0b])),
        body_return(-1),
    ]
    bodies = []
    for index, func_type in enumerate(func_types):
        if func_type in (0, 2, 4, 5, 6):
            bodies.append(body_return(0))
        else:
            bodies.append(func_body(bytes([0x00, 0x0b])))

    section_code = encode_section(10, u32(len(bodies)) + b"".join(bodies))

    return b"\x00asm" + b"\x01\x00\x00\x00" + section_type + section_func + section_mem + section_export + section_code


def main():
    target = sys.argv[1]
    with open(target, "wb") as handle:
        handle.write(build_stub())


if __name__ == "__main__":
    main()
PY
    else
        printf '%b' '\x00\x61\x73\x6d\x01\x00\x00\x00\x01\x29\x07\x60\x00\x01\x7f\x60\x03\x7f\x7f\x7f\x01\x7f\x60\x01\x7f\x01\x7f\x60\x02\x7f\x7f\x01\x7f\x60\x01\x7f\x00\x60\x00\x00\x60\x07\x7f\x7f\x7f\x7f\x7f\x7f\x7f\x01\x7f\x03\x0c\x0b\x00\x00\x01\x02\x00\x03\x04\x05\x02\x04\x06\x05\x03\x01\x00\x01\x07\xf1\x03\x17\x06\x6d\x65\x6d\x6f\x72\x79\x02\x00\x14\x5f\x6b\x6f\x6c\x69\x62\x72\x69\x5f\x62\x72\x69\x64\x67\x65\x5f\x69\x6e\x69\x74\x00\x00\x13\x6b\x6f\x6c\x69\x62\x72\x69\x5f\x62\x72\x69\x64\x67\x65\x5f\x69\x6e\x69\x74\x00\x00\x15\x5f\x6b\x6f\x6c\x69\x62\x72\x69\x5f\x62\x72\x69\x64\x67\x65\x5f\x72\x65\x73\x65\x74\x00\x01\x14\x6b\x6f\x6c\x69\x62\x72\x69\x5f\x62\x72\x69\x64\x67\x65\x5f\x72\x65\x73\x65\x74\x00\x01\x19\x5f\x6b\x6f\x6c\x69\x62\x72\x69\x5f\x62\x72\x69\x64\x67\x65\x5f\x63\x6f\x6e\x66\x69\x67\x75\x72\x65\x00\x0a\x18\x6b\x6f\x6c\x69\x62\x72\x69\x5f\x62\x72\x69\x64\x67\x65\x5f\x63\x6f\x6e\x66\x69\x67\x75\x72\x65\x00\x0a\x17\x5f\x6b\x6f\x6c\x69\x62\x72\x69\x5f\x62\x72\x69\x64\x67\x65\x5f\x65\x78\x65\x63\x75\x74\x65\x00\x02\x16\x6b\x6f\x6c\x69\x62\x72\x69\x5f\x62\x72\x69\x64\x67\x65\x5f\x65\x78\x65\x63\x75\x74\x65\x00\x02\x16\x5f\x6b\x6f\x6c\x69\x62\x72\x69\x5f\x73\x69\x6d\x5f\x77\x61\x73\x6d\x5f\x69\x6e\x69\x74\x00\x03\x15\x6b\x6f\x6c\x69\x62\x72\x69\x5f\x73\x69\x6d\x5f\x77\x61\x73\x6d\x5f\x69\x6e\x69\x74\x00\x03\x16\x5f\x6b\x6f\x6c\x69\x62\x72\x69\x5f\x73\x69\x6d\x5f\x77\x61\x73\x6d\x5f\x74\x69\x63\x6b\x00\x04\x15\x6b\x6f\x6c\x69\x62\x72\x69\x5f\x73\x69\x6d\x5f\x77\x61\x73\x6d\x5f\x74\x69\x63\x6b\x00\x04\x1a\x5f\x6b\x6f\x6c\x69\x62\x72\x69\x5f\x73\x69\x6d\x5f\x77\x61\x73\x6d\x5f\x67\x65\x74\x5f\x6c\x6f\x67\x73\x00\x05\x19\x6b\x6f\x6c\x69\x62\x72\x69\x5f\x73\x69\x6d\x5f\x77\x61\x73\x6d\x5f\x67\x65\x74\x5f\x6c\x6f\x67\x73\x00\x05\x17\x5f\x6b\x6f\x6c\x69\x62\x72\x69\x5f\x73\x69\x6d\x5f\x77\x61\x73\x6d\x5f\x72\x65\x73\x65\x74\x00\x06\x16\x6b\x6f\x6c\x69\x62\x72\x69\x5f\x73\x69\x6d\x5f\x77\x61\x73\x6d\x5f\x72\x65\x73\x65\x74\x00\x06\x16\x5f\x6b\x6f\x6c\x69\x62\x72\x69\x5f\x73\x69\x6d\x5f\x77\x61\x73\x6d\x5f\x66\x72\x65\x65\x00\x07\x15\x6b\x6f\x6c\x69\x62\x72\x69\x5f\x73\x69\x6d\x5f\x77\x61\x73\x6d\x5f\x66\x72\x65\x65\x00\x07\x07\x5f\x6d\x61\x6c\x6c\x6f\x63\x00\x08\x06\x6d\x61\x6c\x6c\x6f\x63\x00\x08\x05\x5f\x66\x72\x65\x65\x00\x09\x04\x66\x72\x65\x65\x00\x09\x0a\x32\x0b\x04\x00\x41\x7f\x0b\x04\x00\x41\x7f\x0b\x04\x00\x41\x7f\x0b\x04\x00\x41\x7f\x0b\x04\x00\x41\x7f\x0b\x04\x00\x41\x7f\x0b\x02\x00\x0b\x02\x00\x0b\x04\x00\x41\x00\x0b\x02\x00\x0b\x04\x00\x41\x7f\x0b' >"$vyhod_wasm"
    fi

    cat >"$vyhod_dir/kolibri.wasm.txt" <<'EOF_INFO'
kolibri.wasm: заглушка (WebAssembly ядро недоступно)
Эта заглушка экспортирует минимальные функции моста, которые всегда
возвращают ошибку и не выполняют KolibriScript. Она нужна лишь для
диагностики и предотвращения сбоев интерфейса.
Установите Emscripten или Docker и повторно запустите scripts/build_wasm.sh,
чтобы получить полноценный модуль kolibri.wasm.
EOF_INFO
    zapisat_sha256 "$vyhod_wasm" "$vyhod_dir/kolibri.wasm.sha256"
    rm -f "$vremennaja_js" "$vremennaja_map"
    echo "[ПРЕДУПРЕЖДЕНИЕ] kolibri.wasm заменён заглушкой. Установите Emscripten или Docker для полноценной сборки." >&2
}

ensure_emcc() {
    while true; do
        if command -v "$EMCC" >/dev/null 2>&1; then
            emcc_dostupen=1
            prepare_em_config
            if proverit_emcc_sanity; then
                return 0
            fi

            local sanity_message="$emcc_sanity_output"
            if (( bootstrap_enabled )) && bootstrap_emsdk; then
                continue
            fi

            local condensed="$(printf '%s' "$sanity_message" | tr '\r\n' ' ' | sed 's/[[:space:]]\+/ /g' 2>/dev/null | cut -c1-200)"
            if [[ "$emcc_sanity_class" == "missing-wasm-backend" ]]; then
                condensed+="; установите или активируйте toolchain Emscripten"
            fi
            if [[ -z "$condensed" ]]; then
                condensed="Проверка emcc не пройдена."
            else
                condensed="Проверка emcc не пройдена: ${condensed}"
            fi

            if (( allow_stub_success )); then
                sozdat_zaglushku=1
                stub_prichina="$condensed"
                echo "[ПРЕДУПРЕЖДЕНИЕ] $condensed" >&2
                return 0
            fi

            echo "[ОШИБКА] emcc не прошёл проверку: требуется корректный инструмент WebAssembly." >&2
            if [[ -n "$sanity_message" ]]; then
                echo "$sanity_message" >&2
            fi
            return 1
        fi

        if (( bootstrap_enabled )) && bootstrap_emsdk; then
            continue
        fi

        if [[ "${KOLIBRI_WASM_INVOKED_VIA_DOCKER:-0}" == "1" ]]; then
            echo "[ОШИБКА] Не найден emcc внутри Docker-окружения. Проверьте образ ${KOLIBRI_WASM_DOCKER_IMAGE:-emscripten/emsdk:3.1.61}." >&2
            stub_prichina="Не найден emcc внутри docker-окружения"
            return 1
        fi

        if (( allow_stub_success )); then
            sozdat_zaglushku=1
            if [[ -z "$stub_prichina" ]]; then
                stub_prichina="emcc не найден, заглушка разрешена (KOLIBRI_WASM_ALLOW_STUB_SUCCESS)"
            fi
            return 0
        fi

        if command -v docker >/dev/null 2>&1; then
            docker_dostupen=1
            docker_image="${KOLIBRI_WASM_DOCKER_IMAGE:-emscripten/emsdk:3.1.61}"
            echo "[Kolibri] emcc не найден. Пытаюсь собрать kolibri.wasm через Docker (${docker_image})."
            docker run --rm \
                -v "$proekt_koren":/project \
                -w /project/scripts \
                -e KOLIBRI_WASM_INVOKED_VIA_DOCKER=1 \
                -e KOLIBRI_WASM_INCLUDE_GENOME \
                -e KOLIBRI_WASM_GENERATE_MAP \
                "$docker_image" \
                bash -lc "./build_wasm.sh"
            local docker_status=$?
            if (( docker_status == 0 )); then
                sobranov_docker=1
            else
                echo "[ОШИБКА] Сборка kolibri.wasm внутри Docker завершилась с ошибкой." >&2
                if (( allow_stub_success )); then
                    sozdat_zaglushку=1
                    stub_prichina="Сборка через Docker не удалась, заглушка разрешена (KOLIBRI_WASM_ALLOW_STUB_SUCCESS)"
                    return 0
                fi
            fi
            return $docker_status
        fi

        sozdat_zaglushку=1
        if [[ -z "$stub_prichina" ]]; then
            stub_prichina="emcc не найден и Docker недоступен"
        fi
        return 0
    done
}

ensure_emcc || exit 1

if (( sozdat_zaglushku )); then
    if [[ -n "${KOLIBRI_WASM_PREBUILT_PATH:-}" ]]; then
        local_prebuilt="${KOLIBRI_WASM_PREBUILT_PATH}"
        if [[ -f "$local_prebuilt" ]]; then
            cp "$local_prebuilt" "$vyhod_wasm"
            zapisat_sha256 "$vyhod_wasm" "$vyhod_dir/kolibri.wasm.sha256"
            cat >"$vyhod_dir/kolibri.wasm.txt" <<EOF_INFO
kolibri.wasm: предсобранный артефакт
Источник: ${local_prebuilt}
EOF_INFO
            stub_flag=0
            razmer_prebuilt=$(opredelit_razmer "$vyhod_wasm")
            zapisat_otchet "prebuilt" "Использован kolibri.wasm из KOLIBRI_WASM_PREBUILT_PATH" "$razmer_prebuilt" "$stub_flag"
            rm -f "$vremennaja_js" "$vremennaja_map"
            echo "[Kolibri] Использован kolibri.wasm из ${local_prebuilt}"
            exit 0
        else
            echo "[ПРЕДУПРЕЖДЕНИЕ] KOLIBRI_WASM_PREBUILT_PATH задан, но файл не найден: ${local_prebuilt}" >&2
        fi
    fi

    stub_flag=1
    sozdat_stub_wasm
    razmer_stub=$(opredelit_razmer "$vyhod_wasm")
    zapisat_otchet "stub" "${stub_prichina:-kolibri.wasm собран как заглушка}" "$razmer_stub" "$stub_flag"
    if [[ "${KOLIBRI_WASM_ALLOW_STUB_SUCCESS:-0}" =~ ^(1|true|TRUE|on|ON|yes|YES)$ ]]; then
        exit 0
    fi
    exit 2
fi

if (( sobranov_docker )) && [[ "${KOLIBRI_WASM_INVOKED_VIA_DOCKER:-0}" != "1" ]] && ! command -v "$EMCC" >/dev/null 2>&1; then
    # Docker fallback уже собрал артефакт, на хосте больше делать нечего.
    exit 0
fi

prepare_em_config

istochniki=(
    "$proekt_koren/wasm/kolibri_core.c"
)

exports=(
    "_k_state_new"
    "_k_state_free"
    "_k_state_save"
    "_k_state_load"
    "_k_observe"
    "_k_decode"
    "_k_digit_add_syll"
    "_k_profile"
    "_kolibri_bridge_init"
    "_kolibri_bridge_reset"
    "_kolibri_bridge_configure"
    "_kolibri_bridge_execute"
    "_kolibri_bridge_has_simd"
    "_kolibri_bridge_lane_width"
    "_malloc"
    "_free"
)

export_list=""
if (( ${#exports[@]} > 0 )); then
    printf -v export_list '"%s",' "${exports[@]}"
    export_list=${export_list%,}
fi

flags=(
    -O3
    -std=gnu11
    -msimd128
    -sSTANDALONE_WASM=1
    -sSIDE_MODULE=0
    -sALLOW_MEMORY_GROWTH=1
    -sEXPORTED_RUNTIME_METHODS='[]'
    -sDEFAULT_LIBRARY_FUNCS_TO_INCLUDE='[]'
    -sEXPORTED_FUNCTIONS="[$export_list]"
    --no-entry
    -I"$proekt_koren/backend/include"
    -DKOLIBRI_USE_WASM_SIMD=1
    -o "$vyhod_wasm"
)

if [[ "${KOLIBRI_WASM_GENERATE_MAP:-0}" == "1" ]]; then
    flags+=(--emit-symbol-map)
fi

"$EMCC" "${istochniki[@]}" "${flags[@]}"

razmer=$(opredelit_razmer "$vyhod_wasm")
if (( razmer > 1024 * 1024 )); then
    printf '[ОШИБКА] kolibri.wasm превышает бюджет: %.2f МБ\n' "$(awk -v b="$razmer" 'BEGIN {printf "%.2f", b/1048576}')" >&2
    exit 1
fi

ekport_info="$vyhod_dir/kolibri.wasm.txt"
cat >"$ekport_info" <<EOF_INFO
kolibri.wasm: $(awk -v b="$razmer" 'BEGIN {printf "%.2f МБ", b/1048576}')
Эта сборка содержит ядро KOLIBRI-Σ: арена памяти, обратимые скетчи,
компактный DAAWG, микро-VM с резонансным голосованием и аудит профиля.
Модуль автономен и готов к офлайн-запуску в PWA.
EOF_INFO

zapisat_sha256 "$vyhod_wasm" "$vyhod_dir/kolibri.wasm.sha256"

zapisat_otchet "success" "kolibri.wasm успешно собран" "$razmer" "$stub_flag"

rm -f "$vremennaja_js" "$vremennaja_map"

echo "[ГОТОВО] kolibri.wasm собрано: $vyhod_wasm"
