/*
 * Ядро Kolibri OS: инициализация процессора, прерываний и VGA-лога.
 */

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "kolibri/formula.h"
#include "kolibri/genome.h"
#include "kolibri/net.h"
#include "kolibri/random.h"

#define VGA_ADRES ((volatile uint16_t *)0xB8000U)
#define VGA_SHIRINA 80U
#define VGA_VYSOTA 25U
#define VGA_CVET 0x0FU

#define PIC1_PORT_KOMANDA 0x20U
#define PIC1_PORT_DANNYE 0x21U
#define PIC2_PORT_KOMANDA 0xA0U
#define PIC2_PORT_DANNYE 0xA1U
#define PIC_KOMANDA_RESET 0x11U
#define PIC_KOMANDA_EOI 0x20U

#define PIT_PORT_KANAL0 0x40U
#define PIT_PORT_KOMANDA 0x43U

struct gdt_zapis {
    uint16_t limit_nizkij;
    uint16_t baza_nizkaja;
    uint8_t baza_seredina;
    uint8_t dostup;
    uint8_t granica;
    uint8_t baza_verh;
} __attribute__((packed));

struct gdt_registr {
    uint16_t limit;
    uint32_t baza;
} __attribute__((packed));

struct idt_zapis {
    uint16_t baza_nizkaja;
    uint16_t selektor;
    uint8_t zero;
    uint8_t flagi;
    uint16_t baza_verh;
} __attribute__((packed));

struct idt_registr {
    uint16_t limit;
    uint32_t baza;
} __attribute__((packed));

static volatile uint16_t *vga_okno = VGA_ADRES;
static size_t vga_poziciya = 0U;
static struct gdt_zapis gdt_tablica[3];
static struct idt_zapis idt_tablica[256];
static uint64_t schetchik_tickov = 0ULL;

static KolibriFormulaPool kernel_pool;

struct KolibriBootConfig {
    uint32_t seed;
    uint32_t node_id;
    uint16_t listen_port;
    uint16_t reserved;
};

extern void isr_timer(void);
extern void isr_keyboard(void);

/* Выполняет запись байта в аппаратный порт. */
static inline void zapisat_port8(uint16_t port, uint8_t znachenie) {
    __asm__ __volatile__("outb %0, %1" : : "a"(znachenie), "Nd"(port));
}

/* Считывает байт из аппаратного порта. */
static inline uint8_t chtat_port8(uint16_t port) {
    uint8_t rezultat;
    __asm__ __volatile__("inb %1, %0" : "=a"(rezultat) : "Nd"(port));
    return rezultat;
}

/* Очищает текстовый VGA-буфер. */
static void vga_ochistit(void) {
    for (size_t indeks = 0; indeks < VGA_SHIRINA * VGA_VYSOTA; ++indeks) {
        vga_okno[indeks] = (uint16_t)VGA_CVET << 8;
    }
    vga_poziciya = 0U;
}

/* Выводит одиночный символ на экран. */
static void vga_pechat_simvol(char simvol) {
    if (simvol == '\n') {
        size_t stroka = vga_poziciya / VGA_SHIRINA;
        vga_poziciya = (stroka + 1U) * VGA_SHIRINA;
    } else {
        vga_okno[vga_poziciya++] = ((uint16_t)VGA_CVET << 8) | (uint8_t)simvol;
    }
    if (vga_poziciya >= VGA_SHIRINA * VGA_VYSOTA) {
        vga_poziciya = 0U;
    }
}

/* Выводит строку, оканчивающуюся нулём. */
static void vga_pechat_stroku(const char *stroka) {
    if (!stroka) {
        return;
    }
    while (*stroka) {
        vga_pechat_simvol(*stroka++);
    }
}

/* Выводит беззнаковое число в десятичном виде. */
static void vga_pechat_chislo_u32(uint32_t znachenie) {
    char buffer[11];
    size_t index = sizeof(buffer) - 1U;
    buffer[index] = '\0';
    do {
        buffer[--index] = (char)('0' + (znachenie % 10U));
        znachenie /= 10U;
    } while (znachenie != 0U && index > 0U);
    vga_pechat_stroku(&buffer[index]);
}

/* Выводит строку и число: вспомогательный форматтер. */
static void vga_pechat_paru(const char *metka, uint32_t znachenie) {
    vga_pechat_stroku(metka);
    vga_pechat_chislo_u32(znachenie);
    vga_pechat_stroku("\n");
}

static void kolibri_print_gene(const KolibriGene *gene) {
    vga_pechat_stroku("digits: ");
    if (!gene) {
        vga_pechat_stroku("<none>\n");
        return;
    }
    for (size_t i = 0; i < gene->length; ++i) {
        vga_pechat_chislo_u32(gene->digits[i]);
        if (i + 1U < gene->length) {
            vga_pechat_stroku(" ");
        }
    }
    vga_pechat_stroku("\n");
}

static void kolibri_autopilot(const struct KolibriBootConfig *cfg) {
    uint32_t seed = cfg ? cfg->seed : 20250923U;
    vga_pechat_stroku("[Kolibri] init RNG\n");
    kf_pool_init(&kernel_pool, (uint64_t)seed);
    kf_pool_clear_examples(&kernel_pool);

    vga_pechat_stroku("[Kolibri] seed examples\n");
    const int inputs[] = {0, 1, 2, 3};
    const int targets[] = {1, 3, 5, 7};
    for (size_t i = 0; i < sizeof(inputs) / sizeof(inputs[0]); ++i) {
        (void)kf_pool_add_example(&kernel_pool, inputs[i], targets[i]);
    }

    vga_pechat_stroku("[Kolibri] evolve\n");
    kf_pool_tick(&kernel_pool, 32);

    const KolibriFormula *best = kf_pool_best(&kernel_pool);
    if (!best) {
        vga_pechat_stroku("[Kolibri] pool empty\n");
        return;
    }

    char description[128];
    if (kf_formula_describe(best, description, sizeof(description)) == 0) {
        vga_pechat_stroku("[Kolibri] best: ");
        vga_pechat_stroku(description);
        vga_pechat_stroku("\n");
    }
    kolibri_print_gene(&best->gene);

    int preview = 0;
    if (kf_formula_apply(best, 4, &preview) == 0) {
        vga_pechat_stroku("f(4)=");
        vga_pechat_chislo_u32((uint32_t)preview);
        vga_pechat_stroku("\n");
    }

    if (cfg && cfg->listen_port != 0U) {
        vga_pechat_stroku("[Kolibri] swarm bootstrap\n");
        (void)cfg; /* реальный сетевой стек будет подключен позже */
    }
}

/* Создаёт запись GDT с заданными параметрами. */
static void zapolnit_gdt_zapis(struct gdt_zapis *zapis, uint32_t baza,
                               uint32_t limit, uint8_t dostup,
                               uint8_t granica) {
    zapis->limit_nizkij = (uint16_t)(limit & 0xFFFFU);
    zapis->baza_nizkaja = (uint16_t)(baza & 0xFFFFU);
    zapis->baza_seredina = (uint8_t)((baza >> 16U) & 0xFFU);
    zapis->dostup = dostup;
    zapis->granica = (uint8_t)(((limit >> 16U) & 0x0FU) | (granica & 0xF0U));
    zapis->baza_verh = (uint8_t)((baza >> 24U) & 0xFFU);
}

/* Настраивает таблицу GDT и активирует новые селекторы. */
static void nastroit_gdt(void) {
    struct gdt_registr reg;
    zapolnit_gdt_zapis(&gdt_tablica[0], 0U, 0U, 0U, 0U);
    zapolnit_gdt_zapis(&gdt_tablica[1], 0U, 0xFFFFFU, 0x9AU, 0xC0U);
    zapolnit_gdt_zapis(&gdt_tablica[2], 0U, 0xFFFFFU, 0x92U, 0xC0U);

    reg.limit = sizeof(gdt_tablica) - 1U;
    reg.baza = (uint32_t)&gdt_tablica;

    __asm__ __volatile__("lgdt %0" : : "m"(reg));
    __asm__ __volatile__("mov $0x10, %%ax\n"
                         "mov %%ax, %%ds\n"
                         "mov %%ax, %%es\n"
                         "mov %%ax, %%fs\n"
                         "mov %%ax, %%gs\n"
                         "mov %%ax, %%ss\n"
                         "jmp $0x08, $gdt_flush_label\n"
                         "gdt_flush_label:"
                         :
                         :
                         : "ax");
}

/* Создаёт запись IDT с указанным обработчиком. */
static void zapolnit_idt_zapis(int nomer, uint32_t baza, uint16_t selektor,
                               uint8_t flagi) {
    struct idt_zapis *zapis = &idt_tablica[nomer];
    zapis->baza_nizkaja = (uint16_t)(baza & 0xFFFFU);
    zapis->selektor = selektor;
    zapis->zero = 0U;
    zapis->flagi = flagi;
    zapis->baza_verh = (uint16_t)((baza >> 16U) & 0xFFFFU);
}

/* Настраивает IDT и подключает обработчики таймера и клавиатуры. */
static void nastroit_idt(void) {
    for (int indeks = 0; indeks < 256; ++indeks) {
        zapolnit_idt_zapis(indeks, 0U, 0x08U, 0x8EU);
    }
    zapolnit_idt_zapis(32, (uint32_t)isr_timer, 0x08U, 0x8EU);
    zapolnit_idt_zapis(33, (uint32_t)isr_keyboard, 0x08U, 0x8EU);

    struct idt_registr reg;
    reg.limit = sizeof(idt_tablica) - 1U;
    reg.baza = (uint32_t)&idt_tablica;
    __asm__ __volatile__("lidt %0" : : "m"(reg));
}

/* Отсылает сигнал End Of Interrupt контроллерам PIC. */
static void poslati_eoi(uint8_t nomer_irq) {
    if (nomer_irq >= 8U) {
        zapisat_port8(PIC2_PORT_KOMANDA, PIC_KOMANDA_EOI);
    }
    zapisat_port8(PIC1_PORT_KOMANDA, PIC_KOMANDA_EOI);
}

/* Перенастраивает PIC на векторы 32-47. */
static void nastroit_pic(void) {
    uint8_t mask1 = chtat_port8(PIC1_PORT_DANNYE);
    uint8_t mask2 = chtat_port8(PIC2_PORT_DANNYE);

    zapisat_port8(PIC1_PORT_KOMANDA, PIC_KOMANDA_RESET);
    zapisat_port8(PIC2_PORT_KOMANDA, PIC_KOMANDA_RESET);
    zapisat_port8(PIC1_PORT_DANNYE, 0x20U);
    zapisat_port8(PIC2_PORT_DANNYE, 0x28U);
    zapisat_port8(PIC1_PORT_DANNYE, 0x04U);
    zapisat_port8(PIC2_PORT_DANNYE, 0x02U);
    zapisat_port8(PIC1_PORT_DANNYE, 0x01U);
    zapisat_port8(PIC2_PORT_DANNYE, 0x01U);

    zapisat_port8(PIC1_PORT_DANNYE, mask1 & ~0x03U);
    zapisat_port8(PIC2_PORT_DANNYE, mask2 & ~0x00U);
}

/* Настраивает программируемый таймер на частоту 100 Гц. */
static void nastroit_pit(void) {
    uint16_t delitel = 1193180U / 100U;
    zapisat_port8(PIT_PORT_KOMANDA, 0x36U);
    zapisat_port8(PIT_PORT_KANAL0, (uint8_t)(delitel & 0xFFU));
    zapisat_port8(PIT_PORT_KANAL0, (uint8_t)((delitel >> 8U) & 0xFFU));
}

/* Формирует шестнадцатеричную строку из байта. */
static void preobrazovat_bajt_v_hex(uint8_t znachenie, char *vyhod) {
    const char *simvoly = "0123456789ABCDEF";
    vyhod[0] = simvoly[(znachenie >> 4U) & 0x0FU];
    vyhod[1] = simvoly[znachenie & 0x0FU];
    vyhod[2] = '\0';
}

/* Обработчик аппаратного таймера. */
void obrabotat_tajmer(void) {
    ++schetchik_tickov;
    if (schetchik_tickov % 100ULL == 0ULL) {
        vga_pechat_stroku("[TICK]\n");
    }
    poslati_eoi(0U);
}

/* Обработчик прерывания клавиатуры PS/2. */
void obrabotat_klaviaturu(void) {
    uint8_t kod = chtat_port8(0x60U);
    char buf[3];
    preobrazovat_bajt_v_hex(kod, buf);
    vga_pechat_stroku("[KEY ] 0x");
    vga_pechat_stroku(buf);
    vga_pechat_stroku("\n");
    poslati_eoi(1U);
}

/* Точка входа ядра Kolibri OS после загрузчика GRUB. */
void kolibri_kernel_main(uint32_t multiboot_magic, uint32_t multiboot_info) {
    (void)multiboot_info;
    vga_ochistit();
    vga_pechat_stroku("Kolibri OS ядро запущено\n");
    if (multiboot_magic != 0x36D76289U) {
        vga_pechat_stroku("[ОШИБКА] загрузчик не соответствует Multiboot2\n");
        for (;;) {
            __asm__ __volatile__("hlt");
        }
    }

    nastroit_gdt();
    nastroit_idt();
    nastroit_pic();
    nastroit_pit();

    vga_pechat_stroku("Прерывания активируются...\n");
    __asm__ __volatile__("sti");

    const struct KolibriBootConfig *config = (const struct KolibriBootConfig *)0x00008000U;
    kolibri_autopilot(config);

    for (;;) {
        __asm__ __volatile__("hlt");
    }
}
