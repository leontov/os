#include "kolibri/decimal.h"
#include "kolibri/random.h"

#include <assert.h>
#include <stdint.h>
#include <string.h>

static void proverit_transduktor_obratimost(void) {
    const unsigned char dannye[] = {0U, 1U, 2U, 10U, 99U, 128U, 255U};
    uint8_t bufer[64];
    kolibri_potok_cifr potok;
    kolibri_potok_cifr_init(&potok, bufer, sizeof(bufer));
    int kod = kolibri_transducirovat_utf8(&potok, dannye, sizeof(dannye));
    assert(kod == 0);
    unsigned char vosstanovlennye[16];
    size_t zapisano = 0;
    kod = kolibri_izluchit_utf8(&potok, vosstanovlennye,
                                sizeof(vosstanovlennye), &zapisano);
    assert(kod == 0);
    assert(zapisano == sizeof(dannye));
    assert(memcmp(dannye, vosstanovlennye, sizeof(dannye)) == 0);
}

static void proverit_granicy_potoka(void) {
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

static void proverit_kodirovanie_teksta(void) {
    const char *text = "Kolibri";
    char zakodirovannyj[64];
    char raskodirovannyj[32];
    assert(kolibri_kodirovat_text(text, zakodirovannyj,
                                  sizeof(zakodirovannyj)) == 0);
    assert(kolibri_dekodirovat_text(zakodirovannyj, raskodirovannyj,
                                    sizeof(raskodirovannyj)) == 0);
    assert(strcmp(text, raskodirovannyj) == 0);
}

static void proverit_sluchajnye_posledovatelnosti(void) {
    KolibriRng generator;
    k_rng_seed(&generator, 123456789ULL);
    for (size_t iteraciya = 0; iteraciya < 128U; ++iteraciya) {
        size_t dlina = (size_t)(k_rng_next(&generator) % 33U);
        unsigned char vhod[64];
        for (size_t indeks = 0; indeks < dlina; ++indeks) {
            vhod[indeks] = (unsigned char)(k_rng_next(&generator) & 0xFFU);
        }
        uint8_t cifry[192];
        kolibri_potok_cifr potok;
        kolibri_potok_cifr_init(&potok, cifry, sizeof(cifry));
        assert(kolibri_transducirovat_utf8(&potok, vhod, dlina) == 0);
        unsigned char vyhod[64];
        size_t zapisano = 0;
        assert(kolibri_izluchit_utf8(&potok, vyhod, sizeof(vyhod), &zapisano) ==
               0);
        assert(zapisano == dlina);
        assert(memcmp(vyhod, vhod, dlina) == 0);
    }
}

void test_decimal(void) {
    proverit_transduktor_obratimost();
    proverit_granicy_potoka();
    proverit_kodirovanie_teksta();
    proverit_sluchajnye_posledovatelnosti();
}
