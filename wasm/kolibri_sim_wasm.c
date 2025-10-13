#include "kolibri/sim.h"

#include <emscripten/emscripten.h>
#include <emscripten/html5.h>
#include <stddef.h>
#include <stdio.h>

static KolibriSim *g_sim = NULL;

EMSCRIPTEN_KEEPALIVE
int kolibri_sim_wasm_init(uint32_t seed) {
    KolibriSimConfig cfg = {
        .seed = seed,
        .hmac_key = "kolibri-hmac",
        .trace_path = NULL,
        .trace_include_genome = 0,
        .genome_path = NULL,
    };
    g_sim = kolibri_sim_create(&cfg);
    return g_sim ? 0 : -1;
}

EMSCRIPTEN_KEEPALIVE
int kolibri_sim_wasm_tick(void) {
    if (!g_sim) {
        return -1;
    }
    return kolibri_sim_tick(g_sim);
}

EMSCRIPTEN_KEEPALIVE
int kolibri_sim_wasm_get_logs(char *buffer, size_t capacity) {
    if (!g_sim || !buffer) {
        return -1;
    }
    KolibriSimLog logs[32];
    size_t count = 0U;
    size_t offset = 0U;
    if (kolibri_sim_get_logs(g_sim, logs, 32U, &count, &offset) != 0) {
        return -1;
    }
    size_t written = 0U;
    for (size_t i = 0; i < count; ++i) {
        int len = snprintf(buffer + written, capacity - written, "%s\t%s\n",
                           logs[i].tip ? logs[i].tip : "",
                           logs[i].soobshenie ? logs[i].soobshenie : "");
        if (len < 0 || written + (size_t)len >= capacity) {
            break;
        }
        written += (size_t)len;
    }
    return (int)written;
}

EMSCRIPTEN_KEEPALIVE
void kolibri_sim_wasm_reset(uint32_t seed) {
    if (!g_sim) {
        return;
    }
    KolibriSimConfig cfg = {
        .seed = seed,
        .hmac_key = "kolibri-hmac",
        .trace_path = NULL,
        .trace_include_genome = 0,
        .genome_path = NULL,
    };
    kolibri_sim_reset(g_sim, &cfg);
}

EMSCRIPTEN_KEEPALIVE
void kolibri_sim_wasm_free(void) {
    kolibri_sim_destroy(g_sim);
    g_sim = NULL;
}
