#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<USAGE
Usage: $0 <command>

Commands:
  up      Build and launch the Kolibri node executable.
  build   Configure and build the Kolibri binaries.
USAGE
}

root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

if [ -f "$root_dir/.env" ]; then
    # shellcheck disable=SC1090
    set -a
    source "$root_dir/.env"
    set +a
fi
build_dir="$root_dir/build"
hmac_key_path="$root_dir/root.key"
frontend_dir="$root_dir/frontend"
background_pids=()

cleanup() {
    local exit_code=${1:-$?}

    if [ ${#background_pids[@]} -gt 0 ]; then
        for pid in "${background_pids[@]}"; do
            if [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1; then
                kill "$pid" >/dev/null 2>&1 || true
                wait "$pid" >/dev/null 2>&1 || true
            fi
        done
    fi

    return $exit_code
}

trap 'exit_code=$?; cleanup $exit_code; exit $exit_code' EXIT

generate_hmac_key() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex 32
        return
    fi
    if command -v hexdump >/dev/null 2>&1; then
        hexdump -ve '1/1 "%02x"' -n 32 /dev/urandom
        return
    fi
    python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
}

ensure_hmac_key() {
    if [ -f "$hmac_key_path" ]; then
        return
    fi
    echo "[Kolibri] создаю новый HMAC-ключ в $hmac_key_path"
    generate_hmac_key >"$hmac_key_path"
}

ensure_frontend_prerequisites() {
    if ! command -v npm >/dev/null 2>&1; then
        echo "[Kolibri] npm не найден. Установите Node.js и npm для сборки фронтенда." >&2
        exit 1
    fi
}

install_frontend_dependencies() {
    local lockfile="$frontend_dir/package-lock.json"
    local stamp="$frontend_dir/node_modules/.kolibri-ci-stamp"

    if [ -f "$stamp" ] && [ "$lockfile" -ot "$stamp" ]; then
        return
    fi

    echo "[Kolibri] устанавливаю зависимости фронтенда"
    npm --prefix "$frontend_dir" ci
    touch "$stamp"
}

ensure_frontend_wasm() {
    local wasm_path="$build_dir/wasm/kolibri.wasm"
    if [ -f "$wasm_path" ]; then
        return
    fi
    echo "[Kolibri] kolibri.wasm не найден, запускаю scripts/build_wasm.sh"
    "$root_dir/scripts/build_wasm.sh"
}

build_frontend() {
    ensure_frontend_prerequisites
    install_frontend_dependencies
    ensure_frontend_wasm
    echo "[Kolibri] собираю фронтенд"
    npm --prefix "$frontend_dir" run build
}

start_inference_service() {
    if [ "${KOLIBRI_ENABLE_INFERENCE:-1}" = "0" ]; then
        echo "[Kolibri] сервис инференса отключён переменной KOLIBRI_ENABLE_INFERENCE"
        return
    fi

    if ! python3 - <<'PY' >/dev/null 2>&1
import importlib
import sys
sys.exit(0 if importlib.util.find_spec("uvicorn") else 1)
PY
    then
        echo "[Kolibri] uvicorn не установлен. Установите Python-зависимости (pip install -r requirements.txt)." >&2
        exit 1
    fi

    local host="${KOLIBRI_INFERENCE_HOST:-127.0.0.1}"
    local port="${KOLIBRI_INFERENCE_PORT:-8070}"
    local log_level="${KOLIBRI_INFERENCE_LOG_LEVEL:-info}"
    local reload_flag="${KOLIBRI_INFERENCE_RELOAD:-0}"
    local workers="${KOLIBRI_INFERENCE_WORKERS:-1}"

    echo "[Kolibri] запускаю сервис инференса на ${host}:${port}"

    local -a uvicorn_args
    uvicorn_args=("apps.kolibri_inference:app" "--host" "$host" "--port" "$port" "--log-level" "$log_level")

    if [ "$reload_flag" != "0" ]; then
        uvicorn_args+=("--reload")
    else
        uvicorn_args+=("--workers" "$workers")
    fi

    python3 -m uvicorn "${uvicorn_args[@]}" &
    background_pids+=("$!")
}

case "${1:-}" in
    up)
        cmake -S "$root_dir" -B "$build_dir" -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
        cmake --build "$build_dir"
        build_frontend
        ensure_hmac_key
        start_inference_service
        "$build_dir/kolibri_node" --hmac-key "$hmac_key_path"
        ;;
    build)
        cmake -S "$root_dir" -B "$build_dir" -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
        cmake --build "$build_dir"
        ;;
    ""|-h|--help)
        usage
        ;;
    *)
        echo "Unknown command: $1" >&2
        usage
        exit 1
        ;;
esac
