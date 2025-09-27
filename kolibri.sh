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
build_dir="$root_dir/build"

hmac_key_path="$root_dir/root.key"

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

case "${1:-}" in
    up)
        cmake -S "$root_dir" -B "$build_dir" -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
        cmake --build "$build_dir"
        ensure_hmac_key
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
