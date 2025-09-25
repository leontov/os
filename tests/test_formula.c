#include "kolibri/formula.h"

#include <assert.h>
#include <stdlib.h>

void test_formula(void) {
  KolibriFormulaPool pool;
  kf_pool_init(&pool, 42);

  const int inputs[] = {0, 1, 2, 3};
  const int targets[] = {1, 3, 5, 7};

  for (int i = 0; i < 32; ++i) {
    kf_pool_tick(&pool, inputs, targets, sizeof(inputs) / sizeof(inputs[0]));
  }

  const KolibriFormula *best = kf_pool_best(&pool);
  assert(best != NULL);
  assert(abs(best->a - 2) <= 1);
  assert(abs(best->b - 1) <= 1);
}
