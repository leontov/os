#include "kolibri/decimal.h"

#include <assert.h>
#include <stdint.h>
#include <string.h>

static void proverit_transduktor_obratimost(void)
{
    const unsigned char dannye[] = {0u, 1u, 2u, 10u, 99u, 128u, 255u};
    uint8_t bufer[64];
    kolibri_potok_cifr potok;
    kolibri_potok_cifr_init(&potok, bufer, sizeof(bufer));
    int kod = kolibri_transducirovat_utf8(&potok, dannye, sizeof(dannye));
    assert(kod == 0);
    unsigned char vosstanovlennye[16];
    size_t zapisano = 0;
    kod = kolibri_izluchit_utf8(&potok, vosstanovlennye, sizeof(vosstanovlennye), &zapisano);
    assert(kod == 0);
    assert(zapisano == sizeof(dannye));
    assert(memcmp(dannye, vosstanovlennye, sizeof(dannye)) == 0);
}

static void proverit_granicy_potoka(void)
{
    uint8_t bufer[3];
    kolibri_potok_cifr potok;
    kolibri_potok_cifr_init(&potok, bufer, sizeof(bufer));
    assert(kolibri_potok_cifr_push(&potok, 1) == 0);
    assert(kolibri_potok_cifr_push(&potok, 9) == 0);
    assert(kolibri_potok_cifr_push(&potok, 5) == 0);
    assert(kolibri_potok_cifr_push(&potok, 2) != 0);
    kolibri_potok_cifr_vernutsya(&potok);
    uint8_t cifra = 0;
    assert(kolibri_potok_cifr_chitat(&potok, &cifra) == 0 && cifra == 1);
    assert(kolibri_potok_cifr_chitat(&potok, &cifra) == 0 && cifra == 9);
    assert(kolibri_potok_cifr_chitat(&potok, &cifra) == 0 && cifra == 5);
    assert(kolibri_potok_cifr_chitat(&potok, &cifra) == 1);
}

static void proverit_kodirovanie_teksta(void)
{
    const char *text = "Kolibri";
    char zakodirovannyj[64];
    char raskodirovannyj[32];
    assert(kolibri_kodirovat_text(text, zakodirovannyj, sizeof(zakodirovannyj)) == 0);
    assert(kolibri_dekodirovat_text(zakodirovannyj, raskodirovannyj, sizeof(raskodirovannyj)) == 0);
    assert(strcmp(text, raskodirovannyj) == 0);
}

void test_decimal(void)
{
    proverit_transduktor_obratimost();
    proverit_granicy_potoka();
    proverit_kodirovanie_teksta();
}
