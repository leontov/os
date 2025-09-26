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

case "${1:-}" in
    up)
        cmake -S "$root_dir" -B "$build_dir" -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
        cmake --build "$build_dir"
        "$build_dir/kolibri_node"
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
