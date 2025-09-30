#include "kolibri_runtime.h"

#include <stdio.h>
#include <string.h>

static const unsigned char KOLIBRI_HMAC_KEY[] = "kolibri-secret-key";

void kolibri_runtime_options_init(KolibriRuntimeOptions *options) {
    if (!options) {
        return;
    }
    options->seed = 20250923ULL;
    options->node_id = 1U;
    options->verify_genome = false;
    strncpy(options->genome_path, "genome.dat", sizeof(options->genome_path) - 1U);
    options->genome_path[sizeof(options->genome_path) - 1U] = '\0';
}

int kolibri_runtime_verify_genome(const KolibriRuntimeOptions *options) {
    if (!options) {
        return -1;
    }
    return kg_verify_file(options->genome_path, KOLIBRI_HMAC_KEY,
                          sizeof(KOLIBRI_HMAC_KEY) - 1U);
}

static int kolibri_runtime_open_genome(KolibriRuntime *runtime) {
    if (!runtime) {
        return -1;
    }
    if (runtime->options.verify_genome) {
        int status = kolibri_runtime_verify_genome(&runtime->options);
        if (status == 1) {
            printf("[Геном] существующий журнал отсутствует, создаём новый\n");
        } else if (status != 0) {
            fprintf(stderr, "[Геном] проверка целостности провалена\n");
            return -1;
        } else {
            printf("[Геном] целостность подтверждена\n");
        }
    }
    if (kg_open(&runtime->genome, runtime->options.genome_path, KOLIBRI_HMAC_KEY,
                sizeof(KOLIBRI_HMAC_KEY) - 1U) != 0) {
        fprintf(stderr, "[Геном] не удалось открыть %s\n", runtime->options.genome_path);
        return -1;
    }
    runtime->genome_ready = true;
    kolibri_runtime_record_event(runtime, "BOOT", "узел активирован");
    return 0;
}

int kolibri_runtime_start(KolibriRuntime *runtime, const KolibriRuntimeOptions *options) {
    if (!runtime || !options) {
        return -1;
    }
    memset(runtime, 0, sizeof(*runtime));
    runtime->options = *options;
    kolibri_runtime_reset_last_answer(runtime);
    k_digit_stream_init(&runtime->memory, runtime->memory_buffer,
                        sizeof(runtime->memory_buffer));
    kf_pool_init(&runtime->pool, runtime->options.seed);
    if (kolibri_runtime_open_genome(runtime) != 0) {
        return -1;
    }
    return 0;
}

void kolibri_runtime_stop(KolibriRuntime *runtime) {
    if (!runtime) {
        return;
    }
    if (runtime->genome_ready) {
        kg_close(&runtime->genome);
        runtime->genome_ready = false;
    }
}

int kolibri_runtime_record_event(KolibriRuntime *runtime, const char *event,
                                 const char *payload) {
    if (!runtime || !runtime->genome_ready) {
        return -1;
    }
    if (kg_append(&runtime->genome, event, payload ? payload : "", NULL) != 0) {
        fprintf(stderr, "[Геном] не удалось записать событие %s\n", event ? event : "");
        return -1;
    }
    return 0;
}

void kolibri_runtime_store_text(KolibriRuntime *runtime, const char *text) {
    if (!runtime || !text) {
        return;
    }
    uint8_t digits[384];
    k_digit_stream local;
    k_digit_stream_init(&local, digits, sizeof(digits));
    size_t len = strlen(text);
    if (len > 120U) {
        len = 120U;
    }
    if (k_transduce_utf8(&local, (const unsigned char *)text, len) != 0) {
        return;
    }
    for (size_t i = 0; i < local.length; ++i) {
        if (k_digit_stream_push(&runtime->memory, local.digits[i]) != 0) {
            break;
        }
    }
}

void kolibri_runtime_reset_last_answer(KolibriRuntime *runtime) {
    if (!runtime) {
        return;
    }
    runtime->last_gene_valid = false;
    runtime->last_question = 0;
    runtime->last_answer = 0;
    memset(&runtime->last_gene, 0, sizeof(runtime->last_gene));
}

int kolibri_runtime_add_example(KolibriRuntime *runtime, int input, int target) {
    if (!runtime) {
        return -1;
    }
    return kf_pool_add_example(&runtime->pool, input, target);
}

int kolibri_runtime_tick(KolibriRuntime *runtime, size_t generations) {
    if (!runtime) {
        return -1;
    }
    if (generations == 0) {
        return 0;
    }
    kf_pool_tick(&runtime->pool, generations);
    kolibri_runtime_record_event(runtime, "EVOLVE", "цикл выполнен");
    kolibri_runtime_reset_last_answer(runtime);
    return 0;
}

int kolibri_runtime_ask(KolibriRuntime *runtime, int question, int *answer_out,
                        char *description, size_t description_len) {
    if (!runtime) {
        return -1;
    }
    const KolibriFormula *best = kf_pool_best(&runtime->pool);
    if (!best) {
        return 1;
    }
    int result = 0;
    if (kf_formula_apply(best, question, &result) != 0) {
        return -1;
    }
    if (answer_out) {
        *answer_out = result;
    }
    runtime->last_gene = best->gene;
    runtime->last_gene_valid = true;
    runtime->last_question = question;
    runtime->last_answer = result;
    if (description && description_len > 0) {
        if (kolibri_runtime_describe_formula(best, description, description_len) != 0) {
            description[0] = '\0';
        }
    }
    kolibri_runtime_record_event(runtime, "ASK", "вопрос обработан");
    return 0;
}

int kolibri_runtime_feedback(KolibriRuntime *runtime, double delta, const char *rating) {
    if (!runtime) {
        return -1;
    }
    if (!runtime->last_gene_valid) {
        return 1;
    }
    if (kf_pool_feedback(&runtime->pool, &runtime->last_gene, delta) != 0) {
        kolibri_runtime_reset_last_answer(runtime);
        return -1;
    }
    char payload[128];
    snprintf(payload, sizeof(payload), "rating=%s input=%d output=%d delta=%.3f",
             rating ? rating : "unknown", runtime->last_question, runtime->last_answer, delta);
    kolibri_runtime_record_event(runtime, "USER_FEEDBACK", payload);
    return 0;
}

const KolibriFormula *kolibri_runtime_best_formula(const KolibriRuntime *runtime) {
    if (!runtime) {
        return NULL;
    }
    return kf_pool_best(&runtime->pool);
}

int kolibri_runtime_describe_formula(const KolibriFormula *formula, char *buffer,
                                     size_t buffer_len) {
    if (!formula || !buffer || buffer_len == 0) {
        return -1;
    }
    if (kf_formula_describe(formula, buffer, buffer_len) == 0) {
        return 0;
    }
    uint8_t digits[32];
    size_t len = kf_formula_digits(formula, digits, sizeof(digits));
    if (len == 0) {
        buffer[0] = '\0';
        return -1;
    }
    size_t offset = 0;
    for (size_t i = 0; i < len && offset + 1 < buffer_len; ++i) {
        buffer[offset++] = (char)('0' + (digits[i] % 10U));
    }
    buffer[offset] = '\0';
    return 0;
}

size_t kolibri_runtime_example_count(const KolibriRuntime *runtime) {
    if (!runtime) {
        return 0;
    }
    return runtime->pool.examples;
}

bool kolibri_runtime_has_last_answer(const KolibriRuntime *runtime) {
    if (!runtime) {
        return false;
    }
    return runtime->last_gene_valid;
}
