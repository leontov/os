/*
 * Copyright (c) 2025 Кочуров Владислав Евгеньевич
 */

#include "kolibri/formula.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

static int random_coeff(KolibriFormulaPool *pool) {
  uint64_t raw = k_rng_next(&pool->rng);
  return (int)(raw % 19) - 9;
}

static void randomize_formula(KolibriFormulaPool *pool,
                              KolibriFormula *formula) {
  formula->a = random_coeff(pool);
  formula->b = random_coeff(pool);
  formula->fitness = 0.0;
}

static void evaluate_formula(KolibriFormula *formula, const int *inputs,
                             const int *targets, size_t len) {
  double total_error = 0.0;
  for (size_t i = 0; i < len; ++i) {
    int prediction = formula->a * inputs[i] + formula->b;
    int error = targets[i] - prediction;
    total_error += fabs((double)error);
  }
  formula->fitness = 1.0 / (1.0 + total_error);
}

static void mutate_formula(KolibriFormulaPool *pool, KolibriFormula *formula) {
  int choice = (int)(k_rng_next(&pool->rng) % 2);
  if (choice == 0) {
    formula->a += (int)(k_rng_next(&pool->rng) % 3) - 1;
  } else {
    formula->b += (int)(k_rng_next(&pool->rng) % 3) - 1;
  }
}

static int compare_formula(const void *lhs, const void *rhs) {
  const KolibriFormula *a = (const KolibriFormula *)lhs;
  const KolibriFormula *b = (const KolibriFormula *)rhs;
  if (a->fitness < b->fitness) {
    return 1;
  }
  if (a->fitness > b->fitness) {
    return -1;
  }
  return 0;
}

void kf_pool_init(KolibriFormulaPool *pool, uint64_t seed) {
  if (!pool) {
    return;
  }
  pool->count = sizeof(pool->formulas) / sizeof(pool->formulas[0]);
  k_rng_seed(&pool->rng, seed);
  for (size_t i = 0; i < pool->count; ++i) {
    randomize_formula(pool, &pool->formulas[i]);
  }
}

void kf_pool_tick(KolibriFormulaPool *pool, const int *inputs,
                  const int *targets, size_t len) {
  if (!pool || !inputs || !targets || len == 0) {
    return;
  }

  for (size_t i = 0; i < pool->count; ++i) {
    evaluate_formula(&pool->formulas[i], inputs, targets, len);
  }

  qsort(pool->formulas, pool->count, sizeof(KolibriFormula), compare_formula);

  size_t survivors = pool->count / 2;
  for (size_t i = survivors; i < pool->count; ++i) {
    pool->formulas[i] = pool->formulas[i - survivors];
    mutate_formula(pool, &pool->formulas[i]);
  }
}

const KolibriFormula *kf_pool_best(const KolibriFormulaPool *pool) {
  if (!pool || pool->count == 0) {
    return NULL;
  }
  return &pool->formulas[0];
}

int kf_formula_apply(const KolibriFormula *formula, int input) {
  if (!formula) {
    return 0;
  }
  return formula->a * input + formula->b;
}
