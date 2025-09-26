#!/usr/bin/env bash
set -euo pipefail

# Комплексный оркестратор Kolibri: собирает ядро, запускает тесты,
# формирует артефакты ISO/WASM и, по желанию, стартует локальный рой.
# Все сообщения предназначены для разработчика и приводятся на русском языке.

function pokazat_pomosh() {
    cat <<'USAGE'
Использование: ./scripts/run_all.sh [опции]

Основной цикл выполняет:
  1. Конфигурацию CMake и сборку ядра.
  2. Юнит-тесты через ctest.
  3. Генерацию kolibri.wasm (если не отключено).
  4. Сборку kolibri.iso (если не отключено).
  5. Запуск локального роя (по запросу).

Опции:
  --skip-wasm         Пропустить стадию сборки kolibri.wasm.
  --skip-iso          Пропустить стадию сборки kolibri.iso.
  --skip-tests        Пропустить ctest (используйте осознанно).
  --cluster-size N    Запустить локальный рой из N узлов по завершении сборки.
  --cluster-duration S    Задать длительность работы роя в секундах (по умолчанию 120).
  --cluster-base-port P   Базовый порт для роя (по умолчанию 4100).
  -h, --help          Показать эту справку и выйти.

Примеры:
  ./scripts/run_all.sh
  ./scripts/run_all.sh --skip-wasm --cluster-size 3 --cluster-duration 0
USAGE
}

skip_wasm=0
skip_iso=0
skip_tests=0
cluster_size=0
cluster_duration=120
cluster_base_port=4100

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-wasm)
            skip_wasm=1
            shift
            ;;
        --skip-iso)
            skip_iso=1
            shift
            ;;
        --skip-tests)
            skip_tests=1
            shift
            ;;
        --cluster-size)
            [[ $# -ge 2 ]] || { echo "[ОШИБКА] Для --cluster-size требуется аргумент." >&2; exit 1; }
            cluster_size="$2"
            shift 2
            ;;
        --cluster-duration)
            [[ $# -ge 2 ]] || { echo "[ОШИБКА] Для --cluster-duration требуется аргумент." >&2; exit 1; }
            cluster_duration="$2"
            shift 2
            ;;
        --cluster-base-port)
            [[ $# -ge 2 ]] || { echo "[ОШИБКА] Для --cluster-base-port требуется аргумент." >&2; exit 1; }
            cluster_base_port="$2"
            shift 2
            ;;
        -h|--help)
            pokazat_pomosh
            exit 0
            ;;
        *)
            echo "[ОШИБКА] Неизвестный параметр: $1" >&2
            echo "Используйте --help для справки." >&2
            exit 1
            ;;
    esac
done

if ! [[ "$cluster_size" =~ ^[0-9]+$ ]] || ! [[ "$cluster_duration" =~ ^[0-9]+$ ]] || ! [[ "$cluster_base_port" =~ ^[0-9]+$ ]]; then
    echo "[ОШИБКА] Значения для размеров, длительности и порта должны быть целыми числами." >&2
    exit 1
fi

kornevoy_dir="$(cd "$(dirname "$0")/.." && pwd)"
build_dir="$kornevoy_dir/build"
mkdir -p "$build_dir"

warn=()

# 1. CMake конфигурация и сборка
cmake -S "$kornevoy_dir" -B "$build_dir"
cmake --build "$build_dir" -j

# 2. Тесты
if (( skip_tests )); then
    echo "[ПРОПУСК] Юнит-тесты отключены ключом --skip-tests."
else
    ctest --test-dir "$build_dir" --output-on-failure
fi

# 3. kolibri.wasm (опционально)
if (( skip_wasm )); then
    echo "[ПРОПУСК] Сборка kolibri.wasm отключена ключом --skip-wasm."
else
    if ! "$kornevoy_dir/scripts/build_wasm.sh"; then
        warn+=("Сборка kolibri.wasm")
    fi
fi

# 4. kolibri.iso (опционально)
if (( skip_iso )); then
    echo "[ПРОПУСК] Сборка kolibri.iso отключена ключом --skip-iso."
else
    if ! "$kornevoy_dir/scripts/build_iso.sh"; then
        warn+=("Сборка kolibri.iso")
    fi
fi

# 5. Локальный рой (по желанию)
if (( cluster_size > 0 )); then
    cluster_cmd=("$kornevoy_dir/scripts/run_cluster.sh" -n "$cluster_size" -b "$cluster_base_port" -d "$cluster_duration")
    if ! "${cluster_cmd[@]}"; then
        warn+=("Запуск локального роя")
    fi
fi

if (( ${#warn[@]} == 0 )); then
    echo "[ИТОГ] Все стадии завершены успешно."
else
    echo "[ИТОГ] Основной цикл завершён с предупреждениями:" >&2
    for w in "${warn[@]}"; do
        echo " - $w" >&2
    done
fi
