#ifndef KOLIBRI_RUNTIME_H
#define KOLIBRI_RUNTIME_H

#include "kolibri/decimal.h"
#include "kolibri/formula.h"
#include "kolibri/genome.h"

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define KOLIBRI_RUNTIME_MEMORY_CAPACITY 8192U

typedef struct {
    uint64_t seed;
    uint32_t node_id;
    bool verify_genome;
    char genome_path[260];
} KolibriRuntimeOptions;

typedef struct {
    KolibriRuntimeOptions options;
    KolibriGenome genome;
    bool genome_ready;
    KolibriFormulaPool pool;
    uint8_t memory_buffer[KOLIBRI_RUNTIME_MEMORY_CAPACITY];
    k_digit_stream memory;
    KolibriGene last_gene;
    bool last_gene_valid;
    int last_question;
    int last_answer;
} KolibriRuntime;

void kolibri_runtime_options_init(KolibriRuntimeOptions *options);
int kolibri_runtime_start(KolibriRuntime *runtime, const KolibriRuntimeOptions *options);
void kolibri_runtime_stop(KolibriRuntime *runtime);
int kolibri_runtime_verify_genome(const KolibriRuntimeOptions *options);

int kolibri_runtime_record_event(KolibriRuntime *runtime, const char *event, const char *payload);
void kolibri_runtime_store_text(KolibriRuntime *runtime, const char *text);
void kolibri_runtime_reset_last_answer(KolibriRuntime *runtime);

int kolibri_runtime_add_example(KolibriRuntime *runtime, int input, int target);
int kolibri_runtime_tick(KolibriRuntime *runtime, size_t generations);
int kolibri_runtime_ask(KolibriRuntime *runtime, int question, int *answer_out,
                        char *description, size_t description_len);
int kolibri_runtime_feedback(KolibriRuntime *runtime, double delta, const char *rating);

const KolibriFormula *kolibri_runtime_best_formula(const KolibriRuntime *runtime);
int kolibri_runtime_describe_formula(const KolibriFormula *formula, char *buffer,
                                     size_t buffer_len);

size_t kolibri_runtime_example_count(const KolibriRuntime *runtime);
bool kolibri_runtime_has_last_answer(const KolibriRuntime *runtime);

#endif /* KOLIBRI_RUNTIME_H */
