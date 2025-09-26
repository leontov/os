#!/usr/bin/env bash
set -euo pipefail

# Скрипт сборки загрузочного ISO с микроядром Kolibri OS.

proekt_koren="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$proekt_koren/build/kernel" "$proekt_koren/build/iso/boot/grub"

CROSS_PREFIX="${CROSS_PREFIX:-i686-elf-}"
CC="${CC:-${CROSS_PREFIX}gcc}"
LD="${LD:-${CROSS_PREFIX}ld}"
AS="${AS:-nasm}"
GRUB_MKRESCUE="${GRUB_MKRESCUE:-grub-mkrescue}"

for instrument in "$CC" "$LD" "$AS" "$GRUB_MKRESCUE"; do
    if ! command -v "$instrument" >/dev/null 2>&1; then
        echo "[ОШИБКА] Не найден инструмент: $instrument" >&2
        exit 1
    fi
done

echo "[Kolibri OS] Компиляция ядра"
"$AS" -f elf32 "$proekt_koren/kernel/entry.asm" -o "$proekt_koren/build/kernel/entry.o"
"$AS" -f elf32 "$proekt_koren/kernel/interrupts.asm" -o "$proekt_koren/build/kernel/interrupts.o"
"$CC" -m32 -std=gnu99 -ffreestanding -fno-stack-protector -fno-pic -Wall -Wextra \
    -O2 -c "$proekt_koren/kernel/main.c" -o "$proekt_koren/build/kernel/main.o"

echo "[Kolibri OS] Компоновка"
"$LD" -m elf_i386 -T "$proekt_koren/kernel/link.ld" -o "$proekt_koren/build/kolibri.bin" \
    "$proekt_koren/build/kernel/entry.o" \
    "$proekt_koren/build/kernel/interrupts.o" \
    "$proekt_koren/build/kernel/main.o"

cp "$proekt_koren/build/kolibri.bin" "$proekt_koren/build/iso/boot/kolibri.bin"
cp "$proekt_koren/boot/grub/grub.cfg" "$proekt_koren/build/iso/boot/grub/grub.cfg"

echo "[Kolibri OS] Создание ISO"
"$GRUB_MKRESCUE" -o "$proekt_koren/build/kolibri.iso" "$proekt_koren/build/iso"

echo "[ГОТОВО] Образ доступен: build/kolibri.iso"
