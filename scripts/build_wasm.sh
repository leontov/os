#!/usr/bin/env bash
set -euo pipefail

# Скрипт компиляции ядра Kolibri в WebAssembly.
# По умолчанию собирает вычислительное ядро (десятичный слой,
# эволюцию формул и генератор случайных чисел) и проверяет,
# что итоговый модуль укладывается в бюджет < 1 МБ.

proekt_koren="$(cd "$(dirname "$0")/.." && pwd)"
vyhod_dir="$proekt_koren/build/wasm"
mkdir -p "$vyhod_dir"

EMCC="${EMCC:-emcc}"
if ! command -v "$EMCC" >/dev/null 2>&1; then
    echo "[ОШИБКА] Не найден emcc. Установите Emscripten или задайте путь через переменную EMCC." >&2
    exit 1
fi

istochniki=(
    "$proekt_koren/backend/src/decimal.c"
    "$proekt_koren/backend/src/formula.c"
    "$proekt_koren/backend/src/random.c"
)

if [[ "${KOLIBRI_WASM_INCLUDE_GENOME:-0}" == "1" ]]; then
    istochniki+=("$proekt_koren/backend/src/genome.c")
fi

vyhod_wasm="$vyhod_dir/kolibri.wasm"
vremennaja_map="$vyhod_dir/kolibri.map"
vremennaja_js="$vyhod_dir/kolibri.js"

flags=(
    -Os
    -std=gnu99
    -s STANDALONE_WASM=1
    -s SIDE_MODULE=0
    -s ALLOW_MEMORY_GROWTH=0
    -s EXPORTED_RUNTIME_METHODS='["cwrap","getValue","setValue","UTF8ToString","stringToUTF8","lengthBytesUTF8"]'
    -s EXPORTED_FUNCTIONS='["_kolibri_potok_cifr_init","_kolibri_potok_cifr_sbros","_kolibri_potok_cifr_vernutsya","_kolibri_potok_cifr_push","_kolibri_potok_cifr_chitat","_kolibri_potok_cifr_ostalos","_kolibri_transducirovat_utf8","_kolibri_izluchit_utf8","_kolibri_dlina_kodirovki_teksta","_kolibri_dlina_dekodirovki_teksta","_kolibri_kodirovat_text","_kolibri_dekodirovat_text","_kolibri_potok_cifr_zapisat_chislo","_kolibri_potok_cifr_schitat_chislo","_kf_pool_init","_kf_pool_clear_examples","_kf_pool_add_example","_kf_pool_tick","_kf_pool_best","_kf_formula_apply","_kf_formula_digits","_kf_formula_describe","_kf_pool_feedback","_k_rng_seed","_k_rng_next","_k_rng_next_double"]'
    -s DEFAULT_LIBRARY_FUNCS_TO_INCLUDE='[]'
    --no-entry
    -I"$proekt_koren/backend/include"
    -o "$vyhod_wasm"
)

if [[ "${KOLIBRI_WASM_GENERATE_MAP:-0}" == "1" ]]; then
    flags+=(--emit-symbol-map)
fi

"$EMCC" "${istochniki[@]}" "${flags[@]}"

razmer=$(stat -c '%s' "$vyhod_wasm")
if (( razmer > 1024 * 1024 )); then
    printf '[ОШИБКА] kolibri.wasm превышает бюджет: %.2f МБ\n' "$(awk -v b="$razmer" 'BEGIN {printf "%.2f", b/1048576}')" >&2
    exit 1
fi

ekport_info="$vyhod_dir/kolibri.wasm.txt"
cat >"$ekport_info" <<EOF_INFO
kolibri.wasm: $(awk -v b="$razmer" 'BEGIN {printf "%.2f МБ", b/1048576}')
Эта сборка включает вычислительное ядро (десятичные трансдукции,
эволюцию формул и генератор случайных чисел). Для включения цифрового
генома запустите скрипт с KOLIBRI_WASM_INCLUDE_GENOME=1 и добавьте
поддержку HMAC в окружении.
EOF_INFO

sha256sum "$vyhod_wasm" > "$vyhod_dir/kolibri.wasm.sha256"

rm -f "$vremennaja_js" "$vremennaja_map"

echo "[ГОТОВО] kolibri.wasm собрано: $vyhod_wasm"
