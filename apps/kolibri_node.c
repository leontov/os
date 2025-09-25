/*
 * Copyright (c) 2025 Кочуров Владислав Евгеньевич
 */

#include "kolibri/decimal.h"
#include "kolibri/formula.h"
#include "kolibri/genome.h"

#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static uint64_t parse_seed(int argc, char **argv) {
  for (int i = 1; i < argc - 1; ++i) {
    if (strcmp(argv[i], "--seed") == 0) {
      return (uint64_t)strtoull(argv[i + 1], NULL, 10);
    }
  }
  return 20250923ULL;
}

static void demo_decimal_layer(void) {
  const char *sample = "Kolibri";
  size_t encoded_len = k_encode_text_length(strlen(sample));
  char encoded[64];
  char decoded[32];
  if (encoded_len > sizeof(encoded) ||
      k_encode_text(sample, encoded, sizeof(encoded)) != 0) {
    fprintf(stderr, "Failed to encode sample text\n");
    return;
  }
  if (k_decode_text(encoded, decoded, sizeof(decoded)) != 0) {
    fprintf(stderr, "Failed to decode sample text\n");
    return;
  }
  printf("[Decimal] '%s' -> %s -> '%s'\n", sample, encoded, decoded);
}

static void demo_genome(void) {
  KolibriGenome genome;
  const unsigned char key[] = "kolibri-secret-key";
  if (kg_open(&genome, "genome.dat", key, sizeof(key) - 1) != 0) {
    fprintf(stderr, "Unable to open genome.dat\n");
    return;
  }

  ReasonBlock block;
  if (kg_append(&genome, "BOOT", "Kolibri node initialized", &block) == 0) {
    printf("[Genome] Appended block #%" PRIu64 "\n", block.index);
  } else {
    fprintf(stderr, "[Genome] Failed to append block\n");
  }

  kg_close(&genome);
}

static void demo_formula(uint64_t seed) {
  KolibriFormulaPool pool;
  kf_pool_init(&pool, seed);

  const int inputs[] = {0, 1, 2, 3};
  const int targets[] = {1, 3, 5, 7};

  for (int i = 0; i < 16; ++i) {
    kf_pool_tick(&pool, inputs, targets, sizeof(inputs) / sizeof(inputs[0]));
  }

  const KolibriFormula *best = kf_pool_best(&pool);
  if (best) {
    printf("[Formula] Best a=%d b=%d fitness=%.3f\n", best->a, best->b,
           best->fitness);
    printf("[Formula] f(4) = %d\n", kf_formula_apply(best, 4));
  }
}

int main(int argc, char **argv) {
  uint64_t seed = parse_seed(argc, argv);
  printf("Kolibri node starting with seed=%" PRIu64 "\n", seed);

  demo_decimal_layer();
  demo_genome();
  demo_formula(seed);

  printf("Kolibri node shutdown\n");
  return 0;
}
