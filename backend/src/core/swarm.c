#include "kolibri/swarm.h"

#include <ctype.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <stdio.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

static uint64_t swarm_hash(const char *text) {
    const unsigned char *cursor = (const unsigned char *)text;
    uint64_t hash = 1469598103934665603ULL;
    if (!cursor) {
        return hash;
    }
    while (*cursor) {
        hash ^= (uint64_t)(*cursor++);
        hash *= 1099511628211ULL;
    }
    return hash ? hash : 0xA5A5A5A5A5A5ULL;
}

static double clamp_unit(double value) {
    if (value < 0.0) {
        return 0.0;
    }
    if (value > 1.0) {
        return 1.0;
    }
    return value;
}

static double logistic_next(double x, double r) {
    double next = r * x * (1.0 - x);
    if (!isfinite(next) || next <= 0.0 || next >= 1.0) {
        next = fmod(fabs(next), 1.0);
        if (next <= 0.0 || next >= 1.0) {
            next = 0.5;
        }
    }
    return next;
}

static void compute_signature_from_seed(uint64_t seed, double signature[KOLIBRI_SWARM_DIGITS]) {
    double x = ((double)((seed & 0xFFFFFFULL) + 1ULL)) / 16777217.0;
    if (x <= 0.0 || x >= 1.0) {
        x = 0.5;
    }
    for (size_t i = 0; i < KOLIBRI_SWARM_DIGITS; ++i) {
        double modifier = (double)((seed >> (i * 5)) & 0x1FULL);
        double r = 3.56995 + modifier * 0.0075;
        x = logistic_next(x, r);
        signature[i] = clamp_unit(x);
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        x = logistic_next(signature[i], 3.77 + fmod((double)(seed & 0xFFULL), 0.2));
    }
}

static void compute_signature(const char *text, double signature[KOLIBRI_SWARM_DIGITS]) {
    uint64_t seed = swarm_hash(text);
    compute_signature_from_seed(seed, signature);
}

static KolibriSwarmNode *find_node(KolibriSwarm *swarm, const char *node_id) {
    if (!swarm || !node_id) {
        return NULL;
    }
    for (size_t i = 0; i < swarm->node_count; ++i) {
        if (strncmp(swarm->nodes[i].id, node_id, KOLIBRI_SWARM_ID_MAX) == 0) {
            return &swarm->nodes[i];
        }
    }
    return NULL;
}

int kolibri_swarm_init(KolibriSwarm *swarm, const char *self_id, size_t initial_capacity) {
    if (!swarm) {
        return -1;
    }
    memset(swarm, 0, sizeof(*swarm));
    if (!self_id || *self_id == '\0') {
        strncpy(swarm->self_id, "kolibri-local", sizeof(swarm->self_id) - 1U);
    } else {
        strncpy(swarm->self_id, self_id, sizeof(swarm->self_id) - 1U);
    }
    swarm->self_id[sizeof(swarm->self_id) - 1U] = '\0';
    swarm->self_energy = 0.5;
    swarm->fractal_seed = swarm_hash(swarm->self_id);
    swarm->last_local_update = time(NULL);
    compute_signature(swarm->self_id, swarm->signature);
    if (initial_capacity == 0U) {
        initial_capacity = 4U;
    }
    swarm->nodes = (KolibriSwarmNode *)calloc(initial_capacity, sizeof(KolibriSwarmNode));
    if (!swarm->nodes) {
        return -1;
    }
    swarm->node_capacity = initial_capacity;
    swarm->node_count = 0U;
    return 0;
}

void kolibri_swarm_free(KolibriSwarm *swarm) {
    if (!swarm) {
        return;
    }
    free(swarm->nodes);
    swarm->nodes = NULL;
    swarm->node_capacity = 0U;
    swarm->node_count = 0U;
    swarm->self_id[0] = '\0';
    swarm->self_energy = 0.0;
    swarm->fractal_seed = 0U;
    swarm->last_local_update = 0;
    for (size_t i = 0; i < KOLIBRI_SWARM_DIGITS; ++i) {
        swarm->signature[i] = 0.0;
    }
}

int kolibri_swarm_add_node(KolibriSwarm *swarm, const char *node_id, const char *endpoint) {
    if (!swarm || !node_id || !endpoint || *endpoint == '\0') {
        return -1;
    }
    KolibriSwarmNode *existing = find_node(swarm, node_id);
    if (existing) {
        strncpy(existing->endpoint, endpoint, sizeof(existing->endpoint) - 1U);
        existing->endpoint[sizeof(existing->endpoint) - 1U] = '\0';
        return 0;
    }
    if (swarm->node_count >= swarm->node_capacity) {
        size_t new_capacity = swarm->node_capacity ? swarm->node_capacity * 2U : 4U;
        KolibriSwarmNode *resized = (KolibriSwarmNode *)realloc(swarm->nodes, new_capacity * sizeof(KolibriSwarmNode));
        if (!resized) {
            return -1;
        }
        for (size_t i = swarm->node_capacity; i < new_capacity; ++i) {
            memset(&resized[i], 0, sizeof(KolibriSwarmNode));
        }
        swarm->nodes = resized;
        swarm->node_capacity = new_capacity;
    }
    KolibriSwarmNode *node = &swarm->nodes[swarm->node_count++];
    memset(node, 0, sizeof(*node));
    strncpy(node->id, node_id, sizeof(node->id) - 1U);
    node->id[sizeof(node->id) - 1U] = '\0';
    strncpy(node->endpoint, endpoint, sizeof(node->endpoint) - 1U);
    node->endpoint[sizeof(node->endpoint) - 1U] = '\0';
    node->energy = 0.5;
    node->exchange_count = 0U;
    node->last_activity = 0;
    compute_signature(node->id[0] ? node->id : node->endpoint, node->signature);
    return 0;
}

static void update_signature_with_pulse(double signature[KOLIBRI_SWARM_DIGITS],
                                        const double pulse[KOLIBRI_SWARM_DIGITS],
                                        double influence) {
    const double base_weight = 0.82;
    const double pulse_weight = 1.0 - base_weight;
    for (size_t i = 0; i < KOLIBRI_SWARM_DIGITS; ++i) {
        double adjusted = signature[i] * base_weight + pulse[i] * pulse_weight + influence;
        signature[i] = clamp_unit(adjusted);
    }
}

void kolibri_swarm_record_local_activity(KolibriSwarm *swarm, const char *stimulus, double impact) {
    if (!swarm) {
        return;
    }
    double pulse[KOLIBRI_SWARM_DIGITS];
    if (stimulus && *stimulus) {
        compute_signature(stimulus, pulse);
    } else {
        compute_signature_from_seed(swarm->fractal_seed + swarm->node_count + 1U, pulse);
    }
    double influence = fmin(fmax(impact, -1.0), 1.0) * 0.02;
    update_signature_with_pulse(swarm->signature, pulse, influence);
    swarm->self_energy = clamp_unit(swarm->self_energy * 0.96 + 0.5 * 0.04 + impact * 0.04);
    swarm->fractal_seed += (uint64_t)(fabs(impact) * 997.0) + 1U;
    swarm->last_local_update = time(NULL);
}

void kolibri_swarm_record_peer_activity(KolibriSwarm *swarm, const char *node_id, double impact, const char *stimulus) {
    if (!swarm || !node_id) {
        return;
    }
    KolibriSwarmNode *node = find_node(swarm, node_id);
    if (!node) {
        return;
    }
    double pulse[KOLIBRI_SWARM_DIGITS];
    if (stimulus && *stimulus) {
        compute_signature(stimulus, pulse);
    } else {
        compute_signature(node->id, pulse);
    }
    double influence = fmin(fmax(impact, -1.0), 1.0) * 0.015;
    update_signature_with_pulse(node->signature, pulse, influence);
    node->energy = clamp_unit(node->energy * 0.92 + 0.5 * 0.08 + impact * 0.08);
    node->last_activity = time(NULL);
    if (node->exchange_count < UINT64_MAX) {
        node->exchange_count += 1U;
    }
}

const KolibriSwarmNode *kolibri_swarm_select_peer(const KolibriSwarm *swarm, double exploration_bias) {
    if (!swarm || swarm->node_count == 0U) {
        return NULL;
    }
    double exploration[KOLIBRI_SWARM_DIGITS];
    uint64_t explorer_seed = swarm->fractal_seed + (uint64_t)(fabs(exploration_bias) * 131071.0);
    compute_signature_from_seed(explorer_seed, exploration);
    const KolibriSwarmNode *best = NULL;
    double best_score = -1e12;
    time_t now = time(NULL);
    for (size_t i = 0; i < swarm->node_count; ++i) {
        const KolibriSwarmNode *node = &swarm->nodes[i];
        double alignment = 0.0;
        double fractal = 0.0;
        for (size_t j = 0; j < KOLIBRI_SWARM_DIGITS; ++j) {
            alignment += node->signature[j] * swarm->signature[j];
            fractal += exploration[j] * node->signature[j];
        }
        double recency = 1.0;
        if (node->last_activity > 0 && now > node->last_activity) {
            double delta = difftime(now, node->last_activity);
            recency = 1.0 / (1.0 + delta / 120.0);
        }
        double score = alignment * 0.55 + node->energy * 0.25 + fractal * 0.15 + recency * 0.05;
        if (exploration_bias > 0.5) {
            score += exploration_bias * fractal * 0.05;
        }
        if (!best || score > best_score) {
            best = node;
            best_score = score;
        }
    }
    return best;
}

static void escape_json_string(const char *input, char *output, size_t output_size) {
    if (!output || output_size == 0U) {
        return;
    }
    size_t index = 0U;
    if (!input) {
        output[0] = '\0';
        return;
    }
    while (*input && index + 2 < output_size) {
        unsigned char ch = (unsigned char)*input++;
        if (ch == '"' || ch == '\\') {
            if (index + 2 < output_size) {
                output[index++] = '\\';
                output[index++] = (char)ch;
            }
        } else if (ch < 0x20) {
            if (index + 6 < output_size) {
                output[index++] = '\\';
                output[index++] = 'u';
                output[index++] = '0';
                output[index++] = '0';
                static const char hex[] = "0123456789ABCDEF";
                output[index++] = hex[(ch >> 4) & 0xF];
                output[index++] = hex[ch & 0xF];
            }
        } else {
            output[index++] = (char)ch;
        }
    }
    output[index] = '\0';
}

int kolibri_swarm_format_status(const KolibriSwarm *swarm, char *buffer, size_t buffer_size) {
    if (!swarm || !buffer || buffer_size == 0U) {
        return -1;
    }
    buffer[0] = '\0';
    char escaped_id[KOLIBRI_SWARM_ID_MAX * 2];
    escape_json_string(swarm->self_id, escaped_id, sizeof(escaped_id));
    size_t offset = 0U;
    int written = snprintf(buffer + offset,
                           buffer_size - offset,
                           "{\"nodeId\":\"%s\",\"energy\":%.6f,\"signature\":[",
                           escaped_id,
                           swarm->self_energy);
    if (written < 0 || (size_t)written >= buffer_size - offset) {
        return -1;
    }
    offset += (size_t)written;
    for (size_t i = 0; i < KOLIBRI_SWARM_DIGITS; ++i) {
        written = snprintf(buffer + offset,
                           buffer_size - offset,
                           "%s%.6f",
                           (i == 0U) ? "" : ",",
                           swarm->signature[i]);
        if (written < 0 || (size_t)written >= buffer_size - offset) {
            return -1;
        }
        offset += (size_t)written;
    }
    written = snprintf(buffer + offset, buffer_size - offset, "],\"peers\":[");
    if (written < 0 || (size_t)written >= buffer_size - offset) {
        return -1;
    }
    offset += (size_t)written;
    for (size_t i = 0; i < swarm->node_count; ++i) {
        const KolibriSwarmNode *node = &swarm->nodes[i];
        char escaped_node_id[KOLIBRI_SWARM_ID_MAX * 2];
        char escaped_endpoint[KOLIBRI_SWARM_ENDPOINT_MAX * 2];
        escape_json_string(node->id, escaped_node_id, sizeof(escaped_node_id));
        escape_json_string(node->endpoint, escaped_endpoint, sizeof(escaped_endpoint));
        written = snprintf(buffer + offset,
                           buffer_size - offset,
                           "%s{\"id\":\"%s\",\"endpoint\":\"%s\",\"energy\":%.6f,\"lastActivity\":%lld,\"exchangeCount\":%llu,\"signature\":[",
                           (i == 0U) ? "" : ",",
                           escaped_node_id,
                           escaped_endpoint,
                           node->energy,
                           (long long)(node->last_activity > 0 ? (long long)node->last_activity : 0LL),
                           (unsigned long long)node->exchange_count);
        if (written < 0 || (size_t)written >= buffer_size - offset) {
            return -1;
        }
        offset += (size_t)written;
        for (size_t j = 0; j < KOLIBRI_SWARM_DIGITS; ++j) {
            written = snprintf(buffer + offset,
                               buffer_size - offset,
                               "%s%.6f",
                               (j == 0U) ? "" : ",",
                               node->signature[j]);
            if (written < 0 || (size_t)written >= buffer_size - offset) {
                return -1;
            }
            offset += (size_t)written;
        }
        written = snprintf(buffer + offset, buffer_size - offset, "]}");
        if (written < 0 || (size_t)written >= buffer_size - offset) {
            return -1;
        }
        offset += (size_t)written;
    }
    written = snprintf(buffer + offset,
                       buffer_size - offset,
                       "],\"fractalSeed\":%llu,\"lastLocalUpdate\":%lld}",
                       (unsigned long long)swarm->fractal_seed,
                       (long long)(swarm->last_local_update > 0 ? (long long)swarm->last_local_update : 0LL));
    if (written < 0 || (size_t)written >= buffer_size - offset) {
        return -1;
    }
    offset += (size_t)written;
    if (offset < buffer_size) {
        buffer[offset] = '\0';
    } else {
        buffer[buffer_size - 1U] = '\0';
    }
    return 0;
}
