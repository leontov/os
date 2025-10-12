#ifndef KOLIBRI_FORMULA_H
#define KOLIBRI_FORMULA_H

#include "kolibri/random.h"

#include <stddef.h>
#include <stdint.h>

typedef struct {
    uint8_t digits[32];
    size_t length;
} KolibriGene;

typedef struct {
    int input_hash;
    int output_hash;
    char question[256];
    char answer[512];
} KolibriAssociation;

#define KOLIBRI_FORMULA_MAX_ASSOCIATIONS 32
#define KOLIBRI_POOL_MAX_ASSOCIATIONS 64

typedef struct {
    KolibriGene gene;
    double fitness;
    double feedback;
    KolibriAssociation associations[KOLIBRI_FORMULA_MAX_ASSOCIATIONS];
    size_t association_count;
} KolibriFormula;

typedef struct {
    KolibriFormula formulas[24];
    size_t count;
    KolibriRng rng;
    int inputs[64];
    int targets[64];
    size_t examples;
    KolibriAssociation associations[KOLIBRI_POOL_MAX_ASSOCIATIONS];
    size_t association_count;
} KolibriFormulaPool;

void kf_pool_init(KolibriFormulaPool *pool, uint64_t seed);
void kf_pool_clear_examples(KolibriFormulaPool *pool);
int kf_pool_add_example(KolibriFormulaPool *pool, int input, int target);
int kf_pool_add_association(KolibriFormulaPool *pool, const char *question,
                            const char *answer);
void kf_pool_tick(KolibriFormulaPool *pool, size_t generations);
const KolibriFormula *kf_pool_best(const KolibriFormulaPool *pool);
int kf_formula_apply(const KolibriFormula *formula, int input, int *output);
size_t kf_formula_digits(const KolibriFormula *formula, uint8_t *out, size_t out_len);
int kf_formula_describe(const KolibriFormula *formula, char *buffer, size_t buffer_len);
int kf_pool_feedback(KolibriFormulaPool *pool, const KolibriGene *gene, double delta);
int kf_formula_lookup_answer(const KolibriFormula *formula, int input,
                             char *buffer, size_t buffer_len);
int kf_hash_from_text(const char *text);


#endif /* KOLIBRI_FORMULA_H */
