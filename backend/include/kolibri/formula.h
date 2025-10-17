#ifndef KOLIBRI_FORMULA_H
#define KOLIBRI_FORMULA_H

#include "kolibri/random.h"
#include "kolibri/symbol_table.h"

#include <stddef.h>
#include <stdint.h>

typedef struct {
    uint8_t digits[32];
    size_t length;
} KolibriGene;

#define KOLIBRI_ASSOC_QUESTION_MAX 256
#define KOLIBRI_ASSOC_ANSWER_MAX 512
#define KOLIBRI_ASSOC_DIGITS_MAX (KOLIBRI_ASSOC_ANSWER_MAX * KOLIBRI_SYMBOL_DIGITS)

typedef struct {
    int input_hash;
    int output_hash;
    char question[KOLIBRI_ASSOC_QUESTION_MAX];
    char answer[KOLIBRI_ASSOC_ANSWER_MAX];
    uint8_t question_digits[KOLIBRI_ASSOC_DIGITS_MAX];
    size_t question_digits_length;
    uint8_t answer_digits[KOLIBRI_ASSOC_DIGITS_MAX];
    size_t answer_digits_length;
    uint64_t timestamp;
    char source[64];
} KolibriAssociation;

#define KOLIBRI_FORMULA_MAX_ASSOCIATIONS 32
#define KOLIBRI_POOL_MAX_ASSOCIATIONS 64

typedef struct {
    KolibriGene gene;
    double fitness;
    double feedback;
    double invariant_drift_b;
    double invariant_drift_d;
    double phase;
    KolibriAssociation associations[KOLIBRI_FORMULA_MAX_ASSOCIATIONS];
    size_t association_count;
} KolibriFormula;

typedef struct {
    uint64_t generation_steps;
    uint64_t evaluation_calls;
    double last_generation_ms;
} KolibriPoolProfile;

typedef struct {
    KolibriFormula formulas[24];
    size_t count;
    KolibriRng rng;
    int inputs[64];
    int targets[64];
    size_t examples;
    KolibriAssociation associations[KOLIBRI_POOL_MAX_ASSOCIATIONS];
    size_t association_count;
    double lambda_b;
    double lambda_d;
    double target_b;
    double target_d;
    int use_custom_target_b;
    int use_custom_target_d;
    double coherence_gain;
    double temperature;
    size_t top_k;
    KolibriPoolProfile profile;
} KolibriFormulaPool;

void kf_pool_init(KolibriFormulaPool *pool, uint64_t seed);
void kf_pool_clear_examples(KolibriFormulaPool *pool);
int kf_pool_add_example(KolibriFormulaPool *pool, int input, int target);
int kf_pool_add_association(KolibriFormulaPool *pool,
                            KolibriSymbolTable *symbols,
                            const char *question,
                            const char *answer,
                            const char *source,
                            uint64_t timestamp);
void kf_pool_tick(KolibriFormulaPool *pool, size_t generations);
const KolibriFormula *kf_pool_best(const KolibriFormulaPool *pool);
int kf_formula_apply(const KolibriFormula *formula, int input, int *output);
size_t kf_formula_digits(const KolibriFormula *formula, uint8_t *out, size_t out_len);
int kf_formula_describe(const KolibriFormula *formula, char *buffer, size_t buffer_len);
int kf_pool_feedback(KolibriFormulaPool *pool, const KolibriGene *gene, double delta);
int kf_formula_lookup_answer(const KolibriFormula *formula, int input,
                             char *buffer, size_t buffer_len);
int kf_hash_from_text(const char *text);
void kf_pool_set_penalties(KolibriFormulaPool *pool, double lambda_b, double lambda_d);
void kf_pool_set_targets(KolibriFormulaPool *pool, double target_b, double target_d);
void kf_pool_set_coherence_gain(KolibriFormulaPool *pool, double gain);
void kf_pool_set_sampling(KolibriFormulaPool *pool, double temperature, size_t top_k);
const KolibriPoolProfile *kf_pool_profile(const KolibriFormulaPool *pool);


#endif /* KOLIBRI_FORMULA_H */
