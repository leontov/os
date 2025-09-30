#ifndef KOLIBRI_SERVER_H
#define KOLIBRI_SERVER_H

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define KOLIBRI_SERVER_DEFAULT_REST_PORT 8080U
#define KOLIBRI_SERVER_DEFAULT_GRPC_PORT 7000U

typedef struct {
    bool enable_rest;
    bool enable_grpc;
    uint16_t rest_port;
    uint16_t grpc_port;
} KolibriServerConfig;

int kolibri_server_run(const KolibriServerConfig *config);

#ifdef __cplusplus
}
#endif

#endif /* KOLIBRI_SERVER_H */
