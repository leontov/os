#ifndef KOLIBRI_SWARM_H
#define KOLIBRI_SWARM_H

#include <stddef.h>
#include <stdint.h>
#include <time.h>

#ifdef __cplusplus
extern "C" {
#endif

#define KOLIBRI_SWARM_DIGITS 10
#define KOLIBRI_SWARM_ID_MAX 96
#define KOLIBRI_SWARM_ENDPOINT_MAX 192

typedef struct {
    char id[KOLIBRI_SWARM_ID_MAX];
    char endpoint[KOLIBRI_SWARM_ENDPOINT_MAX];
    double energy;
    double signature[KOLIBRI_SWARM_DIGITS];
    time_t last_activity;
    uint64_t exchange_count;
} KolibriSwarmNode;

typedef struct {
    char self_id[KOLIBRI_SWARM_ID_MAX];
    double self_energy;
    double signature[KOLIBRI_SWARM_DIGITS];
    uint64_t fractal_seed;
    time_t last_local_update;
    KolibriSwarmNode *nodes;
    size_t node_count;
    size_t node_capacity;
} KolibriSwarm;

int kolibri_swarm_init(KolibriSwarm *swarm, const char *self_id, size_t initial_capacity);
void kolibri_swarm_free(KolibriSwarm *swarm);
int kolibri_swarm_add_node(KolibriSwarm *swarm, const char *node_id, const char *endpoint);
void kolibri_swarm_record_local_activity(KolibriSwarm *swarm, const char *stimulus, double impact);
void kolibri_swarm_record_peer_activity(KolibriSwarm *swarm, const char *node_id, double impact, const char *stimulus);
const KolibriSwarmNode *kolibri_swarm_select_peer(const KolibriSwarm *swarm, double exploration_bias);
int kolibri_swarm_format_status(const KolibriSwarm *swarm, char *buffer, size_t buffer_size);

#ifdef __cplusplus
}
#endif

#endif /* KOLIBRI_SWARM_H */
