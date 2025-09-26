#include "kolibri/formula.h"

#include <assert.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

static void obuchit_linejnuju_zadachu(KolibriFormulaPool *pool)
{
    for (int indeks = 0; indeks < 4; ++indeks) {
        int vhod = indeks;
        int cel = 2 * indeks + 1;
        assert(kf_pool_add_example(pool, vhod, cel) == 0);
    }
}

static void proverit_determinizm(void)
{
    KolibriFormulaPool pervyj;
    KolibriFormulaPool vtoroj;
    kf_pool_init(&pervyj, 2025U);
    kf_pool_init(&vtoroj, 2025U);
    obuchit_linejnuju_zadachu(&pervyj);
    obuchit_linejnuju_zadachu(&vtoroj);
    kf_pool_tick(&pervyj, 64U);
    kf_pool_tick(&vtoroj, 64U);
    const KolibriFormula *luchshaja_pervaja = kf_pool_best(&pervyj);
    const KolibriFormula *luchshaja_vtoraja = kf_pool_best(&vtoroj);
    uint8_t cifry_pervye[32];
    uint8_t cifry_vtorye[32];
    size_t dlina_pervaya = kf_formula_digits(luchshaja_pervaja, cifry_pervye, sizeof(cifry_pervye));
    size_t dlina_vtoraya = kf_formula_digits(luchshaja_vtoraja, cifry_vtorye, sizeof(cifry_vtorye));
    assert(dlina_pervaya == dlina_vtoraya);
    assert(memcmp(cifry_pervye, cifry_vtorye, dlina_pervaya) == 0);
}

static void proverit_podkreplenie(void)
{
    KolibriFormulaPool pool;
    kf_pool_init(&pool, 321U);
    obuchit_linejnuju_zadachu(&pool);
    kf_pool_tick(&pool, 64U);
    const KolibriFormula *luchshaja = kf_pool_best(&pool);
    assert(luchshaja != NULL);
    KolibriGene kopiya = luchshaja->gene;
    double bazovaja_ocenka = luchshaja->fitness;
    assert(kf_pool_feedback(&pool, &kopiya, 0.3) == 0);
    const KolibriFormula *posle_nagrazhdeniya = kf_pool_best(&pool);
    assert(posle_nagrazhdeniya != NULL);
    assert(posle_nagrazhdeniya->fitness >= bazovaja_ocenka);
    assert(kf_pool_feedback(&pool, &kopiya, -0.8) == 0);
    const KolibriFormula *posle_shtrafa = kf_pool_best(&pool);
    assert(posle_shtrafa != NULL);
    assert(posle_shtrafa->fitness >= 0.0);
}

void test_formula(void)
{
    KolibriFormulaPool pool;
    kf_pool_init(&pool, 77U);
    obuchit_linejnuju_zadachu(&pool);
    const KolibriFormula *iskhodnaja = kf_pool_best(&pool);
    int bazovaja_pogreshnost = 0;
    for (int indeks = 0; indeks < 4; ++indeks) {
        int lokalnyj = 0;
        assert(kf_formula_apply(iskhodnaja, indeks, &lokalnyj) == 0);
        bazovaja_pogreshnost += abs((2 * indeks + 1) - lokalnyj);
    }
    kf_pool_tick(&pool, 128U);
    const KolibriFormula *luchshaja = kf_pool_best(&pool);
    assert(luchshaja != NULL);
    int prognoz = 0;
    assert(kf_formula_apply(luchshaja, 4, &prognoz) == 0);
    int pogreshnost = 0;
    for (int indeks = 0; indeks < 4; ++indeks) {
        int lokalnyj = 0;
        assert(kf_formula_apply(luchshaja, indeks, &lokalnyj) == 0);
        pogreshnost += abs((2 * indeks + 1) - lokalnyj);
    }
    assert(pogreshnost <= bazovaja_pogreshnost);
    proverit_determinizm();
    proverit_podkreplenie();
}
