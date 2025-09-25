#ifndef KOLIBRI_FORMULA_H
#define KOLIBRI_FORMULA_H

#include "kolibri/random.h"

#include <stddef.h>

typedef struct {
    int a;
    int b;
    double fitness;
} KolibriFormula;

typedef struct {
    KolibriFormula formulas[16];
    size_t count;
    KolibriRng rng;
} KolibriFormulaPool;

void kf_pool_init(KolibriFormulaPool *pool, uint64_t seed);
void kf_pool_tick(KolibriFormulaPool *pool, const int *inputs, const int *targets, size_t len);
const KolibriFormula *kf_pool_best(const KolibriFormulaPool *pool);
int kf_formula_apply(const KolibriFormula *formula, int input);

#endif /* KOLIBRI_FORMULA_H */
