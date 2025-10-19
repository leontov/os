/*
 * Copyright (c) 2025 Кочуров Владислав Евгеньевич
 */

#include "kolibri/formula.h"

#include "kolibri/decimal.h"
#include "kolibri/symbol_table.h"

#include <ctype.h>
#include <limits.h>
#include <math.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#if defined(__GNUC__) || defined(__clang__)
#define KOLIBRI_FORCE_INLINE static inline __attribute__((always_inline))
#else
#define KOLIBRI_FORCE_INLINE static inline
#endif

#if defined(__GNUC__) || defined(__clang__)
#define KOLIBRI_ATOMIC_STORE_U64(ptr, value) __atomic_store_n((ptr), (uint64_t)(value), __ATOMIC_RELAXED)
#define KOLIBRI_ATOMIC_ADD_U64(ptr, value) __atomic_add_fetch((ptr), (uint64_t)(value), __ATOMIC_RELAXED)
#else
#define KOLIBRI_ATOMIC_STORE_U64(ptr, value) (*(ptr) = (uint64_t)(value))
#define KOLIBRI_ATOMIC_ADD_U64(ptr, value) ((*(ptr) += (uint64_t)(value)))
#endif

#if defined(KOLIBRI_CF_BEAM_LANES)
#define KOLIBRI_BEAM_MAX_LANES (KOLIBRI_CF_BEAM_LANES)
#elif defined(KOLIBRI_USE_PTHREADS)
#define KOLIBRI_BEAM_MAX_LANES 8U
#else
#define KOLIBRI_BEAM_MAX_LANES 4U
#endif

#if (KOLIBRI_BEAM_MAX_LANES) < 4U
#undef KOLIBRI_BEAM_MAX_LANES
#define KOLIBRI_BEAM_MAX_LANES 4U
#endif

#if (KOLIBRI_BEAM_MAX_LANES) > 8U
#undef KOLIBRI_BEAM_MAX_LANES
#define KOLIBRI_BEAM_MAX_LANES 8U
#endif

#if defined(KOLIBRI_USE_WASM_SIMD) && defined(__wasm_simd128__)
#include <wasm_simd128.h>
#define KOLIBRI_HAS_WASM_SIMD 1

KOLIBRI_FORCE_INLINE size_t kolibri_popcount16(uint32_t mask) {
#if defined(__has_builtin)
#if __has_builtin(__builtin_popcount)
    return (size_t)__builtin_popcount(mask);
#endif
#endif
#if defined(__GNUC__)
    return (size_t)__builtin_popcount(mask);
#else
    size_t count = 0U;
    while (mask != 0U) {
        count += (size_t)(mask & 1U);
        mask >>= 1U;
    }
    return count;
#endif
}
#endif

#define KOLIBRI_FORMULA_CAPACITY (sizeof(((KolibriFormulaPool *)0)->formulas) / sizeof(KolibriFormula))
#define KOLIBRI_DIGIT_MAX 9U
#define KOLIBRI_ASSOC_TEXT_LIMIT (sizeof(((KolibriAssociation *)0)->question))

/* ---------------------------- Утилиты ----------------------------- */

KOLIBRI_FORCE_INLINE uint8_t random_digit(KolibriFormulaPool *pool) {
    return (uint8_t)(k_rng_next(&pool->rng) % 10ULL);
}

KOLIBRI_FORCE_INLINE void gene_randomize(KolibriFormulaPool *pool, KolibriGene *gene) {
    gene->length = sizeof(gene->digits);
    for (size_t i = 0; i < gene->length; ++i) {
        gene->digits[i] = random_digit(pool);
    }
}

KOLIBRI_FORCE_INLINE int gene_copy(const KolibriGene *src, KolibriGene *dst) {
    if (!src || !dst) {
        return -1;
    }
    if (src->length > sizeof(dst->digits)) {
        return -1;
    }
    dst->length = src->length;
    memcpy(dst->digits, src->digits, src->length);
    return 0;
}

static uint32_t fnv1a32(const char *text) {
    const unsigned char *bytes = (const unsigned char *)(text ? text : "");
    uint32_t hash = 2166136261u;
    while (*bytes) {
        hash ^= (uint32_t)(*bytes++);
        hash *= 16777619u;
    }
    return hash;
}

static int kolibri_hash_to_int(uint32_t hash) {
    /* Ограничиваем диапазон 32-битного хеша до int */
    hash &= 0x7FFFFFFFu;
    if (hash > (uint32_t)INT_MAX) {
        hash = (uint32_t)(hash % INT_MAX);
    }
    return (int)hash;
}

static int utf8_is_continuation(unsigned char byte) {
    return (byte & 0xC0U) == 0x80U;
}

static size_t kolibri_utf8_decode_next(const unsigned char *text,
                                       size_t length,
                                       size_t offset,
                                       uint32_t *out_codepoint) {
    if (!text || !out_codepoint || offset >= length) {
        return 0U;
    }
    unsigned char lead = text[offset];
    if (lead < 0x80U) {
        *out_codepoint = (uint32_t)lead;
        return 1U;
    }
    if ((lead & 0xE0U) == 0xC0U) {
        if (offset + 1U >= length) {
            return 0U;
        }
        unsigned char b1 = text[offset + 1U];
        if (!utf8_is_continuation(b1)) {
            return 0U;
        }
        uint32_t codepoint = ((uint32_t)(lead & 0x1FU) << 6) | (uint32_t)(b1 & 0x3FU);
        if (codepoint < 0x80U) {
            return 0U;
        }
        *out_codepoint = codepoint;
        return 2U;
    }
    if ((lead & 0xF0U) == 0xE0U) {
        if (offset + 2U >= length) {
            return 0U;
        }
        unsigned char b1 = text[offset + 1U];
        unsigned char b2 = text[offset + 2U];
        if (!utf8_is_continuation(b1) || !utf8_is_continuation(b2)) {
            return 0U;
        }
        uint32_t codepoint = ((uint32_t)(lead & 0x0FU) << 12) |
                             ((uint32_t)(b1 & 0x3FU) << 6) |
                             (uint32_t)(b2 & 0x3FU);
        if (codepoint < 0x800U || (codepoint >= 0xD800U && codepoint <= 0xDFFFU)) {
            return 0U;
        }
        *out_codepoint = codepoint;
        return 3U;
    }
    if ((lead & 0xF8U) == 0xF0U) {
        if (offset + 3U >= length) {
            return 0U;
        }
        unsigned char b1 = text[offset + 1U];
        unsigned char b2 = text[offset + 2U];
        unsigned char b3 = text[offset + 3U];
        if (!utf8_is_continuation(b1) || !utf8_is_continuation(b2) || !utf8_is_continuation(b3)) {
            return 0U;
        }
        uint32_t codepoint = ((uint32_t)(lead & 0x07U) << 18) |
                             ((uint32_t)(b1 & 0x3FU) << 12) |
                             ((uint32_t)(b2 & 0x3FU) << 6) |
                             (uint32_t)(b3 & 0x3FU);
        if (codepoint < 0x10000U || codepoint > 0x10FFFFU) {
            return 0U;
        }
        *out_codepoint = codepoint;
        return 4U;
    }
    return 0U;
}

int kf_hash_from_text(const char *text) {
    return kolibri_hash_to_int(fnv1a32(text));
}

static void association_reset(KolibriAssociation *assoc) {
    if (!assoc) {
        return;
    }
    assoc->input_hash = 0;
    assoc->output_hash = 0;
    assoc->question[0] = '\0';
    assoc->answer[0] = '\0';
    assoc->question_digits_length = 0U;
    assoc->answer_digits_length = 0U;
    assoc->timestamp = 0U;
    assoc->source[0] = '\0';
}

static void association_set(KolibriAssociation *assoc,
                            KolibriSymbolTable *symbols,
                            const char *question,
                            const char *answer,
                            const char *source,
                            uint64_t timestamp) {
    if (!assoc) {
        return;
    }
    association_reset(assoc);
    if (question) {
        strncpy(assoc->question, question, sizeof(assoc->question) - 1U);
    }
    if (answer) {
        strncpy(assoc->answer, answer, sizeof(assoc->answer) - 1U);
    }
    if (source) {
        strncpy(assoc->source, source, sizeof(assoc->source) - 1U);
    }
    assoc->timestamp = timestamp;
    assoc->input_hash = kolibri_hash_to_int(fnv1a32(assoc->question));
    assoc->output_hash = kolibri_hash_to_int(fnv1a32(assoc->answer));
    if (symbols) {
        const unsigned char *qbytes = (const unsigned char *)assoc->question;
        size_t qlen = strlen(assoc->question);
        size_t qpos = 0U;
        while (qpos < qlen && assoc->question_digits_length + KOLIBRI_SYMBOL_DIGITS <= KOLIBRI_ASSOC_DIGITS_MAX) {
            uint32_t codepoint = 0U;
            size_t consumed = kolibri_utf8_decode_next(qbytes, qlen, qpos, &codepoint);
            if (consumed == 0U) {
                codepoint = (uint32_t)qbytes[qpos];
                consumed = 1U;
            }
            uint8_t digits[KOLIBRI_SYMBOL_DIGITS];
            if (kolibri_symbol_encode(symbols, codepoint, digits) == 0) {
                memcpy(&assoc->question_digits[assoc->question_digits_length], digits, KOLIBRI_SYMBOL_DIGITS);
                assoc->question_digits_length += KOLIBRI_SYMBOL_DIGITS;
            }
            qpos += consumed;
        }
        const unsigned char *abytes = (const unsigned char *)assoc->answer;
        size_t alen = strlen(assoc->answer);
        size_t apos = 0U;
        while (apos < alen && assoc->answer_digits_length + KOLIBRI_SYMBOL_DIGITS <= KOLIBRI_ASSOC_DIGITS_MAX) {
            uint32_t codepoint = 0U;
            size_t consumed = kolibri_utf8_decode_next(abytes, alen, apos, &codepoint);
            if (consumed == 0U) {
                codepoint = (uint32_t)abytes[apos];
                consumed = 1U;
            }
            uint8_t digits[KOLIBRI_SYMBOL_DIGITS];
            if (kolibri_symbol_encode(symbols, codepoint, digits) == 0) {
                memcpy(&assoc->answer_digits[assoc->answer_digits_length], digits, KOLIBRI_SYMBOL_DIGITS);
                assoc->answer_digits_length += KOLIBRI_SYMBOL_DIGITS;
            }
            apos += consumed;
        }
    }
}

static int association_equals(const KolibriAssociation *a, const KolibriAssociation *b) {
    if (!a || !b) {
        return 0;
    }
    return a->input_hash == b->input_hash && strcmp(a->question, b->question) == 0;
}

static int encode_text_digits(const char *text, uint8_t *out, size_t out_len) {
    if (!text || !out) {
        return 0;
    }
    size_t required = k_encode_text_length(strlen(text));
    if (required > out_len) {
        return 0;
    }
    if (k_encode_text(text, (char *)out, out_len) != 0) {
        return 0;
    }
    return (int)strlen((const char *)out);
}

/* -------------------------- Прогноз формулы ------------------------ */

static int decode_signed(const KolibriGene *gene, size_t offset, int *value) {
    if (!gene || !value) {
        return -1;
    }
    if (offset + 3 >= gene->length) {
        return -1;
    }
    int sign = gene->digits[offset] % 2 == 0 ? 1 : -1;
    int magnitude = (int)(gene->digits[offset + 1] * 10 + gene->digits[offset + 2]);
    *value = sign * magnitude;
    return 0;
}

static int decode_operation(const KolibriGene *gene, size_t offset, int *operation) {
    if (!gene || !operation) {
        return -1;
    }
    if (offset >= gene->length) {
        return -1;
    }
    *operation = (int)(gene->digits[offset] % 4U);
    return 0;
}

static int decode_bias(const KolibriGene *gene, size_t offset, int *bias) {
    if (!gene || !bias) {
        return -1;
    }
    if (offset + 2 >= gene->length) {
        return -1;
    }
    int sign = gene->digits[offset] % 2 == 0 ? 1 : -1;
    int magnitude = (int)(gene->digits[offset + 1] * 10 + gene->digits[offset + 2]);
    *bias = sign * magnitude;
    return 0;
}

static int formula_predict_numeric(const KolibriFormula *formula, int input, int *output) {
    if (!formula || !output) {
        return -1;
    }
    int operation = 0;
    int slope = 0;
    int bias = 0;
    int auxiliary = 0;
    if (decode_operation(&formula->gene, 0, &operation) != 0 ||
        decode_signed(&formula->gene, 1, &slope) != 0 ||
        decode_bias(&formula->gene, 4, &bias) != 0 ||
        decode_signed(&formula->gene, 7, &auxiliary) != 0) {
        return -1;
    }
    long long result = 0;
    switch (operation) {
    case 0:
        result = (long long)slope * (long long)input + bias;
        break;
    case 1:
        result = (long long)slope * (long long)input - bias;
        break;
    case 2: {
        long long divisor = auxiliary == 0 ? 1 : auxiliary;
        result = ((long long)slope * (long long)input) % divisor;
        result += bias;
        break;
    }
    case 3:
        result = (long long)slope * (long long)input * (long long)input + bias;
        break;
    default:
        result = bias;
        break;
    }
    if (result > 2147483647LL) {
        result = 2147483647LL;
    }
    if (result < -2147483648LL) {
        result = -2147483648LL;
    }
    *output = (int)result;
    return 0;
}

static double complexity_penalty(const KolibriGene *gene) {
    double penalty = 0.0;
    for (size_t i = 0; i < gene->length; ++i) {
        if (gene->digits[i] == 0) {
            continue;
        }
        penalty += 0.001 * (double)(gene->digits[i]);
    }
    return penalty;
}

typedef struct {
    double base_score;
    double drift_b;
    double drift_d;
    double phase;
} KolibriEvaluation;

static double compute_gene_diversity(const KolibriGene *gene) {
    if (!gene || gene->length == 0) {
        return 0.0;
    }
    int seen[10] = {0};
    size_t unique = 0U;
    for (size_t i = 0; i < gene->length; ++i) {
        uint8_t digit = gene->digits[i] % 10U;
        if (!seen[digit]) {
            seen[digit] = 1;
            unique += 1U;
        }
    }
    return (double)unique / 10.0;
}

static double compute_gene_phase(const KolibriGene *gene) {
    if (!gene) {
        return 0.0;
    }
    uint32_t hash = 2166136261u;
    for (size_t i = 0; i < gene->length; ++i) {
        hash ^= (uint32_t)(gene->digits[i] + 1U);
        hash *= 16777619u;
    }
    double angle_deg = (double)(hash % 360U);
    return angle_deg * 0.017453292519943295; /* pi / 180 */
}

static double topo_coherence(const KolibriGene *lhs, const KolibriGene *rhs) {
    if (!lhs || !rhs || lhs->length == 0 || rhs->length == 0) {
        return 0.0;
    }
    size_t limit = lhs->length < rhs->length ? lhs->length : rhs->length;
    if (limit == 0) {
        return 0.0;
    }
    size_t matches = 0U;
    size_t i = 0U;
#if defined(KOLIBRI_HAS_WASM_SIMD)
    if (limit >= 16U) {
        const uint8_t *lhs_digits = lhs->digits;
        const uint8_t *rhs_digits = rhs->digits;
        for (; i + 16U <= limit; i += 16U) {
            v128_t lhs_vec = wasm_v128_load(lhs_digits + i);
            v128_t rhs_vec = wasm_v128_load(rhs_digits + i);
            v128_t cmp = wasm_i8x16_eq(lhs_vec, rhs_vec);
            uint32_t mask = (uint32_t)wasm_i8x16_bitmask(cmp);
            matches += kolibri_popcount16(mask);
        }
    }
#endif
    for (; i < limit; ++i) {
        if (lhs->digits[i] == rhs->digits[i]) {
            matches += 1U;
        }
    }
    return (double)matches / (double)limit;
}

static double clamp_score(double value) {
    if (value < 0.0) {
        return 0.0;
    }
    if (value > 1.0) {
        return 1.0;
    }
    return value;
}

static KolibriEvaluation evaluate_formula_metrics(const KolibriFormula *formula,
                                                  const KolibriFormulaPool *pool) {
    KolibriEvaluation eval = {0.0, 0.0, 0.0, 0.0};
    if (!formula || !pool) {
        return eval;
    }

    eval.phase = compute_gene_phase(&formula->gene);

    if (pool->examples == 0) {
        return eval;
    }

    double total_error = 0.0;
    double sum_predictions = 0.0;
    double sum_targets = 0.0;
    for (size_t i = 0; i < pool->examples; ++i) {
        int prediction = 0;
        if (formula_predict_numeric(formula, pool->inputs[i], &prediction) != 0) {
            eval.base_score = 0.0;
            return eval;
        }
        int diff = pool->targets[i] - prediction;
        total_error += fabs((double)diff);
        sum_predictions += (double)prediction;
        sum_targets += (double)pool->targets[i];
    }

    double penalty = complexity_penalty(&formula->gene);
    eval.base_score = 1.0 / (1.0 + total_error + penalty);

    double mean_prediction = sum_predictions / (double)pool->examples;
    double mean_target = sum_targets / (double)pool->examples;
    double baseline_b = pool->use_custom_target_b ? pool->target_b : mean_target;
    double baseline_d = pool->use_custom_target_d ? pool->target_d : 0.5;

    if (!isfinite(baseline_b)) {
        baseline_b = mean_target;
    }
    if (!isfinite(baseline_d)) {
        baseline_d = 0.5;
    }
    if (baseline_d < 0.0) {
        baseline_d = 0.0;
    }
    if (baseline_d > 1.0) {
        baseline_d = 1.0;
    }

    double diversity = compute_gene_diversity(&formula->gene);
    eval.drift_b = fabs(mean_prediction - baseline_b);
    eval.drift_d = fabs(diversity - baseline_d);
    return eval;
}

static void apply_feedback_bonus(KolibriFormula *formula, double *fitness) {
    if (!formula || !fitness) {
        return;
    }
    double adjusted = *fitness + formula->feedback;
    *fitness = clamp_score(adjusted);
}

typedef struct {
    KolibriFormula *formula;
    KolibriEvaluation evaluation;
    double score;
} KolibriBeamLane;

static void evaluate_beam_group(KolibriFormulaPool *pool, KolibriBeamLane *lanes, size_t lane_count) {
    if (!pool || !lanes || lane_count == 0U) {
        return;
    }

    for (size_t i = 0; i < lane_count; ++i) {
        lanes[i].evaluation = evaluate_formula_metrics(lanes[i].formula, pool);
        double penalty = pool->lambda_b * fmax(0.0, lanes[i].evaluation.drift_b) +
                         pool->lambda_d * fmax(0.0, lanes[i].evaluation.drift_d);
        double score = lanes[i].evaluation.base_score - penalty;
        if (score < 0.0) {
            score = 0.0;
        }
        apply_feedback_bonus(lanes[i].formula, &score);
        lanes[i].score = score;
    }

    if (pool->coherence_gain != 0.0) {
        for (size_t i = 0; i < lane_count; ++i) {
            double adjustment = 0.0;
            for (size_t j = 0; j < lane_count; ++j) {
                if (i == j) {
                    continue;
                }
                double phase_diff = lanes[j].evaluation.phase - lanes[i].evaluation.phase;
                double coherence = topo_coherence(&lanes[i].formula->gene, &lanes[j].formula->gene);
                adjustment += pool->coherence_gain * cos(phase_diff) * coherence;
            }
            lanes[i].score += adjustment;
        }
    }

    for (size_t i = 0; i < lane_count; ++i) {
        lanes[i].score = clamp_score(lanes[i].score);
        lanes[i].formula->fitness = lanes[i].score;
        lanes[i].formula->invariant_drift_b = lanes[i].evaluation.drift_b;
        lanes[i].formula->invariant_drift_d = lanes[i].evaluation.drift_d;
        lanes[i].formula->phase = lanes[i].evaluation.phase;
    }
}

static void mutate_gene(KolibriFormulaPool *pool, KolibriGene *gene) {
    if (!gene) {
        return;
    }
    if (!pool || gene->length == 0U) {
        return;
    }

    double temperature = pool->temperature;
    if (!isfinite(temperature) || temperature <= 0.0) {
        temperature = 1.0;
    }
    if (temperature < 0.1) {
        temperature = 0.1;
    }
    if (temperature > 2.0) {
        temperature = 2.0;
    }

    size_t mutations = (size_t)llrint(temperature * 2.0);
    if (mutations == 0U) {
        mutations = 1U;
    }
    if (mutations > gene->length) {
        mutations = gene->length;
    }

    for (size_t i = 0; i < mutations; ++i) {
        size_t index = (size_t)(k_rng_next(&pool->rng) % gene->length);
        uint8_t delta = random_digit(pool);
        gene->digits[index] = delta;
    }
}

static void crossover(KolibriFormulaPool *pool, const KolibriGene *parent_a, const KolibriGene *parent_b, KolibriGene *child) {
    (void)pool;
    if (!parent_a || !parent_b || !child) {
        return;
    }
    size_t split = parent_a->length / 2;
    child->length = parent_a->length;
    for (size_t i = 0; i < child->length; ++i) {
        if (i < split) {
            child->digits[i] = parent_a->digits[i];
        } else {
            child->digits[i] = parent_b->digits[i];
        }
    }
}

static int compare_formulas(const void *lhs, const void *rhs) {
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

static void reproduce(KolibriFormulaPool *pool) {
    size_t elite = pool->count / 3U;
    if (elite == 0) {
        elite = 1;
    }
    size_t parent_pool = pool->top_k;
    if (parent_pool == 0U || parent_pool > pool->count) {
        parent_pool = pool->count;
    }
    if (parent_pool < elite) {
        parent_pool = elite;
    }

    for (size_t i = elite; i < pool->count; ++i) {
        size_t parent_a_index = (size_t)(k_rng_next(&pool->rng) % parent_pool);
        size_t parent_b_index = (size_t)(k_rng_next(&pool->rng) % parent_pool);
        if (parent_pool > 1U && parent_a_index == parent_b_index) {
            parent_b_index = (parent_b_index + 1U) % parent_pool;
        }
        KolibriGene child;
        crossover(pool, &pool->formulas[parent_a_index].gene,
                  &pool->formulas[parent_b_index].gene, &child);
        mutate_gene(pool, &child);
        gene_copy(&child, &pool->formulas[i].gene);
        pool->formulas[i].fitness = 0.0;
        pool->formulas[i].feedback = 0.0;
        pool->formulas[i].invariant_drift_b = 0.0;
        pool->formulas[i].invariant_drift_d = 0.0;
        pool->formulas[i].phase = 0.0;
        pool->formulas[i].association_count = 0;
    }
}

static void copy_dataset_into_formula(const KolibriFormulaPool *pool, KolibriFormula *formula) {
    if (!pool || !formula) {
        return;
    }
    size_t limit = pool->association_count;
    if (limit > KOLIBRI_FORMULA_MAX_ASSOCIATIONS) {
        limit = KOLIBRI_FORMULA_MAX_ASSOCIATIONS;
    }
    formula->association_count = limit;
    for (size_t i = 0; i < limit; ++i) {
        formula->associations[i] = pool->associations[i];
    }
    formula->invariant_drift_b = 0.0;
    formula->invariant_drift_d = 0.0;
}

static double evaluate_association_fitness(const KolibriFormulaPool *pool) {
    if (!pool || pool->association_count == 0) {
        return 0.0;
    }
    return 1.0; /* Полное соответствие ассоциациям */
}

/* ---------------------- Публичные функции ------------------------- */

void kf_pool_init(KolibriFormulaPool *pool, uint64_t seed) {
    if (!pool) {
        return;
    }
    pool->count = KOLIBRI_FORMULA_CAPACITY;
    pool->examples = 0;
    pool->association_count = 0;
    pool->lambda_b = 0.0;
    pool->lambda_d = 0.0;
    pool->target_b = 0.0;
    pool->target_d = 0.5;
    pool->use_custom_target_b = 0;
    pool->use_custom_target_d = 0;
    pool->coherence_gain = 0.0;
    pool->temperature = 1.0;
    pool->top_k = pool->count;
    KOLIBRI_ATOMIC_STORE_U64(&pool->profile.generation_steps, 0ULL);
    KOLIBRI_ATOMIC_STORE_U64(&pool->profile.evaluation_calls, 0ULL);
    pool->profile.generation_steps = 0ULL;
    pool->profile.evaluation_calls = 0ULL;
    pool->profile.last_generation_ms = 0.0;
    k_rng_seed(&pool->rng, seed);
    for (size_t i = 0; i < pool->count; ++i) {
        gene_randomize(pool, &pool->formulas[i].gene);
        pool->formulas[i].fitness = 0.0;
        pool->formulas[i].feedback = 0.0;
        pool->formulas[i].invariant_drift_b = 0.0;
        pool->formulas[i].invariant_drift_d = 0.0;
        pool->formulas[i].phase = 0.0;
        pool->formulas[i].association_count = 0;
    }
    for (size_t i = 0; i < KOLIBRI_POOL_MAX_ASSOCIATIONS; ++i) {
        association_reset(&pool->associations[i]);
    }
}

void kf_pool_clear_examples(KolibriFormulaPool *pool) {
    if (!pool) {
        return;
    }
    pool->examples = 0;
    pool->association_count = 0;
    KOLIBRI_ATOMIC_STORE_U64(&pool->profile.generation_steps, 0ULL);
    KOLIBRI_ATOMIC_STORE_U64(&pool->profile.evaluation_calls, 0ULL);
    pool->profile.generation_steps = 0ULL;
    pool->profile.evaluation_calls = 0ULL;
    pool->profile.last_generation_ms = 0.0;
    for (size_t i = 0; i < KOLIBRI_POOL_MAX_ASSOCIATIONS; ++i) {
        association_reset(&pool->associations[i]);
    }
}

int kf_pool_add_example(KolibriFormulaPool *pool, int input, int target) {
    if (!pool) {
        return -1;
    }
    if (pool->examples >= sizeof(pool->inputs) / sizeof(pool->inputs[0])) {
        return -1;
    }
    pool->inputs[pool->examples] = input;
    pool->targets[pool->examples] = target;
    pool->examples++;
    return 0;
}

int kf_pool_add_association(KolibriFormulaPool *pool,
                            KolibriSymbolTable *symbols,
                            const char *question,
                            const char *answer,
                            const char *source,
                            uint64_t timestamp) {
    if (!pool || !question || !answer) {
        return -1;
    }
    KolibriAssociation assoc;
    association_set(&assoc, symbols, question, answer, source, timestamp);

    /* Обновляем существующую запись, если такой вопрос уже был */
    for (size_t i = 0; i < pool->association_count; ++i) {
        if (pool->associations[i].input_hash == assoc.input_hash &&
            strcmp(pool->associations[i].question, assoc.question) == 0) {
            pool->associations[i] = assoc;
            return kf_pool_add_example(pool, assoc.input_hash, assoc.output_hash);
        }
    }

    if (pool->association_count >= KOLIBRI_POOL_MAX_ASSOCIATIONS) {
        /* вытесняем самое старое знание */
        memmove(&pool->associations[0], &pool->associations[1],
                (KOLIBRI_POOL_MAX_ASSOCIATIONS - 1U) * sizeof(KolibriAssociation));
        pool->associations[KOLIBRI_POOL_MAX_ASSOCIATIONS - 1U] = assoc;
        return kf_pool_add_example(pool, assoc.input_hash, assoc.output_hash);
    }

    pool->associations[pool->association_count++] = assoc;
    return kf_pool_add_example(pool, assoc.input_hash, assoc.output_hash);
}

void kf_pool_tick(KolibriFormulaPool *pool, size_t generations) {
    if (!pool || pool->count == 0) {
        return;
    }

    if (generations == 0) {
        generations = 1;
    }

    clock_t start_clock = clock();
    uint64_t evaluations = 0ULL;

    for (size_t g = 0; g < generations; ++g) {
        size_t index = 0;
        while (index < pool->count) {
            KolibriBeamLane lanes[KOLIBRI_BEAM_MAX_LANES];
            size_t lane_count = 0U;
            while (lane_count < KOLIBRI_BEAM_MAX_LANES && index < pool->count) {
                lanes[lane_count].formula = &pool->formulas[index];
                lanes[lane_count].score = 0.0;
                lanes[lane_count].evaluation.base_score = 0.0;
                ++lane_count;
                ++index;
            }
            evaluate_beam_group(pool, lanes, lane_count);
        }
        evaluations += (uint64_t)pool->count;
        qsort(pool->formulas, pool->count, sizeof(KolibriFormula), compare_formulas);
        reproduce(pool);
    }

    size_t index = 0;
    while (index < pool->count) {
        KolibriBeamLane lanes[KOLIBRI_BEAM_MAX_LANES];
        size_t lane_count = 0U;
        while (lane_count < KOLIBRI_BEAM_MAX_LANES && index < pool->count) {
            lanes[lane_count].formula = &pool->formulas[index];
            lanes[lane_count].score = 0.0;
            lanes[lane_count].evaluation.base_score = 0.0;
            ++lane_count;
            ++index;
        }
        evaluate_beam_group(pool, lanes, lane_count);
    }
    evaluations += (uint64_t)pool->count;

    qsort(pool->formulas, pool->count, sizeof(KolibriFormula), compare_formulas);

    if (pool->association_count > 0) {
        double assoc_fitness = evaluate_association_fitness(pool);
        size_t limit = pool->count < 3 ? pool->count : 3;
        for (size_t i = 0; i < limit; ++i) {
            copy_dataset_into_formula(pool, &pool->formulas[i]);
            pool->formulas[i].fitness = assoc_fitness;
            pool->formulas[i].invariant_drift_b = 0.0;
            pool->formulas[i].invariant_drift_d = 0.0;
        }
        qsort(pool->formulas, pool->count, sizeof(KolibriFormula), compare_formulas);
    }

    clock_t end_clock = clock();
    if (start_clock != (clock_t)-1 && end_clock != (clock_t)-1 && end_clock >= start_clock) {
        double elapsed = ((double)(end_clock - start_clock) * 1000.0) / (double)CLOCKS_PER_SEC;
        pool->profile.last_generation_ms = elapsed;
    }
    KOLIBRI_ATOMIC_ADD_U64(&pool->profile.generation_steps, generations);
    KOLIBRI_ATOMIC_ADD_U64(&pool->profile.evaluation_calls, evaluations);
    pool->profile.generation_steps += generations;
    pool->profile.evaluation_calls += evaluations;
}

const KolibriFormula *kf_pool_best(const KolibriFormulaPool *pool) {
    if (!pool || pool->count == 0) {
        return NULL;
    }
    return &pool->formulas[0];
}

int kf_formula_lookup_answer(const KolibriFormula *formula, int input,
                             char *buffer, size_t buffer_len) {
    if (!formula || !buffer || buffer_len == 0) {
        return -1;
    }
    for (size_t i = 0; i < formula->association_count; ++i) {
        const KolibriAssociation *assoc = &formula->associations[i];
        if (assoc->input_hash == input && buffer) {
            strncpy(buffer, assoc->answer, buffer_len - 1U);
            buffer[buffer_len - 1U] = '\0';
            return 0;
        }
    }
    return -1;
}

int kf_formula_apply(const KolibriFormula *formula, int input, int *output) {
    if (!formula || !output) {
        return -1;
    }
    for (size_t i = 0; i < formula->association_count; ++i) {
        const KolibriAssociation *assoc = &formula->associations[i];
        if (assoc->input_hash == input) {
            *output = assoc->output_hash;
            return 0;
        }
    }
    return formula_predict_numeric(formula, input, output);
}

static size_t encode_associations_digits(const KolibriFormula *formula, uint8_t *out, size_t out_len) {
    if (!formula || !out) {
        return 0;
    }
    if (formula->association_count == 0) {
        return 0;
    }
    char json_buffer[1024];
    size_t offset = 0;
    offset += snprintf(json_buffer + offset, sizeof(json_buffer) - offset, "{\"associations\":[");
    for (size_t i = 0; i < formula->association_count && offset < sizeof(json_buffer); ++i) {
        const KolibriAssociation *assoc = &formula->associations[i];
        const char *q = assoc->question;
        const char *a = assoc->answer;
        if (!q) {
            q = "";
        }
        if (!a) {
            a = "";
        }
        offset += snprintf(json_buffer + offset, sizeof(json_buffer) - offset,
                           "%s{\"q\":\"%s\",\"a\":\"%s\"}",
                           i == 0 ? "" : ",",
                           q, a);
    }
    if (offset >= sizeof(json_buffer)) {
        return 0;
    }
    offset += snprintf(json_buffer + offset, sizeof(json_buffer) - offset, "]}");
    if (offset >= sizeof(json_buffer)) {
        return 0;
    }
    size_t digits_len = (size_t)encode_text_digits(json_buffer, out, out_len);
    return digits_len;
}

size_t kf_formula_digits(const KolibriFormula *formula, uint8_t *out, size_t out_len) {
    if (!formula || !out) {
        return 0;
    }
    size_t written = 0;
    if (formula->gene.length <= out_len) {
        memcpy(out, formula->gene.digits, formula->gene.length);
        written = formula->gene.length;
    }
    size_t remaining = out_len - written;
    if (remaining > 32 && formula->association_count > 0) {
        written += encode_associations_digits(formula, out + written, remaining);
    }
    return written;
}

int kf_formula_describe(const KolibriFormula *formula, char *buffer, size_t buffer_len) {
    if (!formula || !buffer || buffer_len == 0) {
        return -1;
    }
    if (formula->association_count > 0) {
        const KolibriAssociation *assoc = &formula->associations[0];
        int written = snprintf(buffer, buffer_len,
                               "ассоциаций=%zu пример: '%s' -> '%s' фитнес=%.6f",
                               formula->association_count, assoc->question,
                               assoc->answer, formula->fitness);
        if (written < 0 || (size_t)written >= buffer_len) {
            return -1;
        }
        return 0;
    }

    int operation = 0;
    int slope = 0;
    int bias = 0;
    int auxiliary = 0;
    if (decode_operation(&formula->gene, 0, &operation) != 0 ||
        decode_signed(&formula->gene, 1, &slope) != 0 ||
        decode_bias(&formula->gene, 4, &bias) != 0 ||
        decode_signed(&formula->gene, 7, &auxiliary) != 0) {
        return -1;
    }
    const char *operation_name = NULL;
    switch (operation) {
    case 0:
        operation_name = "линейная";
        break;
    case 1:
        operation_name = "инверсная";
        break;
    case 2:
        operation_name = "остаточная";
        break;
    case 3:
        operation_name = "квадратичная";
        break;
    default:
        operation_name = "неизвестная";
        break;
    }
    int written = snprintf(buffer, buffer_len,
                           "тип=%s k=%d b=%d aux=%d фитнес=%.6f",
                           operation_name, slope, bias, auxiliary, formula->fitness);
    if (written < 0 || (size_t)written >= buffer_len) {
        return -1;
    }
    return 0;
}

static void adjust_feedback(KolibriFormula *formula, double delta) {
    if (!formula) {
        return;
    }
    formula->feedback += delta;
    if (formula->feedback > 1.0) {
        formula->feedback = 1.0;
    }
    if (formula->feedback < -1.0) {
        formula->feedback = -1.0;
    }
    formula->fitness += delta;
    if (formula->fitness < 0.0) {
        formula->fitness = 0.0;
    }
    if (formula->fitness > 1.0) {
        formula->fitness = 1.0;
    }
}

int kf_pool_feedback(KolibriFormulaPool *pool, const KolibriGene *gene, double delta) {
    if (!pool || !gene || pool->count == 0) {
        return -1;
    }
    for (size_t i = 0; i < pool->count; ++i) {
        if (pool->formulas[i].gene.length != gene->length) {
            continue;
        }
        if (memcmp(pool->formulas[i].gene.digits, gene->digits, gene->length) != 0) {
            continue;
        }
        adjust_feedback(&pool->formulas[i], delta);
        size_t index = i;
        if (delta > 0.0) {
            while (index > 0 && pool->formulas[index].fitness > pool->formulas[index - 1].fitness) {
                KolibriFormula tmp = pool->formulas[index - 1];
                pool->formulas[index - 1] = pool->formulas[index];
                pool->formulas[index] = tmp;
                index--;
            }
        } else if (delta < 0.0) {
            while (index + 1 < pool->count &&
                   pool->formulas[index].fitness < pool->formulas[index + 1].fitness) {
                KolibriFormula tmp = pool->formulas[index + 1];
                pool->formulas[index + 1] = pool->formulas[index];
                pool->formulas[index] = tmp;
                index++;
            }
        }
        return 0;
    }
    return -1;
}

void kf_pool_set_penalties(KolibriFormulaPool *pool, double lambda_b, double lambda_d) {
    if (!pool) {
        return;
    }
    if (!isfinite(lambda_b) || lambda_b < 0.0) {
        lambda_b = 0.0;
    }
    if (!isfinite(lambda_d) || lambda_d < 0.0) {
        lambda_d = 0.0;
    }
    pool->lambda_b = lambda_b;
    pool->lambda_d = lambda_d;
}

void kf_pool_set_targets(KolibriFormulaPool *pool, double target_b, double target_d) {
    if (!pool) {
        return;
    }
    if (isfinite(target_b)) {
        pool->target_b = target_b;
        pool->use_custom_target_b = 1;
    } else {
        pool->use_custom_target_b = 0;
    }
    if (isfinite(target_d)) {
        pool->target_d = target_d;
        pool->use_custom_target_d = 1;
    } else {
        pool->use_custom_target_d = 0;
    }
}

void kf_pool_set_coherence_gain(KolibriFormulaPool *pool, double gain) {
    if (!pool) {
        return;
    }
    if (!isfinite(gain) || gain < 0.0) {
        pool->coherence_gain = 0.0;
    } else {
        pool->coherence_gain = gain;
    }
}

void kf_pool_set_sampling(KolibriFormulaPool *pool, double temperature, size_t top_k) {
    if (!pool) {
        return;
    }

    if (!isfinite(temperature) || temperature <= 0.0) {
        temperature = 1.0;
    }
    if (temperature < 0.1) {
        temperature = 0.1;
    }
    if (temperature > 2.0) {
        temperature = 2.0;
    }
    pool->temperature = temperature;

    size_t capacity = sizeof(pool->formulas) / sizeof(pool->formulas[0]);
    if (top_k == 0U || top_k > capacity) {
        top_k = capacity;
    }
    pool->top_k = top_k;
}

const KolibriPoolProfile *kf_pool_profile(const KolibriFormulaPool *pool) {
    if (!pool) {
        return NULL;
    }
    return &pool->profile;
}
