/*
 * Copyright (c) 2025 Кочуров Владислав Евгеньевич
 */

#include "kolibri/decimal.h"
#include "kolibri/formula.h"
#include "kolibri/genome.h"
#include "kolibri/net.h"

#include <inttypes.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
  uint64_t seed;
  uint32_t node_id;
  bool listen_enabled;
  uint16_t listen_port;
  bool peer_enabled;
  char peer_host[64];
  uint16_t peer_port;
  bool verify_genome;
  char genome_path[260];
} KolibriNodeOptions;

static void options_init(KolibriNodeOptions *options) {
  options->seed = 20250923ULL;
  options->node_id = 1U;
  options->listen_enabled = false;
  options->listen_port = 4050U;
  options->peer_enabled = false;
  options->peer_host[0] = '\0';
  options->peer_port = 4050U;
  options->verify_genome = false;
  strncpy(options->genome_path, "genome.dat", sizeof(options->genome_path) - 1);
  options->genome_path[sizeof(options->genome_path) - 1] = '\0';
}

static void parse_options(int argc, char **argv, KolibriNodeOptions *options) {
  options_init(options);
  for (int i = 1; i < argc; ++i) {
    if (strcmp(argv[i], "--seed") == 0 && i + 1 < argc) {
      options->seed = (uint64_t)strtoull(argv[i + 1], NULL, 10);
      ++i;
      continue;
    }
    if (strcmp(argv[i], "--node-id") == 0 && i + 1 < argc) {
      options->node_id = (uint32_t)strtoul(argv[i + 1], NULL, 10);
      ++i;
      continue;
    }
    if (strcmp(argv[i], "--listen") == 0 && i + 1 < argc) {
      options->listen_enabled = true;
      options->listen_port = (uint16_t)strtoul(argv[i + 1], NULL, 10);
      ++i;
      continue;
    }
    if (strcmp(argv[i], "--peer") == 0 && i + 1 < argc) {
      const char *endpoint = argv[i + 1];
      const char *colon = strchr(endpoint, ':');
      if (colon) {
        size_t host_len = (size_t)(colon - endpoint);
        if (host_len >= sizeof(options->peer_host)) {
          host_len = sizeof(options->peer_host) - 1U;
        }
        memcpy(options->peer_host, endpoint, host_len);
        options->peer_host[host_len] = '\0';
        options->peer_port = (uint16_t)strtoul(colon + 1, NULL, 10);
        options->peer_enabled = true;
      }
      ++i;
      continue;
    }
    if (strcmp(argv[i], "--genome") == 0 && i + 1 < argc) {
      strncpy(options->genome_path, argv[i + 1],
              sizeof(options->genome_path) - 1);
      options->genome_path[sizeof(options->genome_path) - 1] = '\0';
      ++i;
      continue;
    }
    if (strcmp(argv[i], "--verify-genome") == 0) {
      options->verify_genome = true;
      continue;
    }
  }
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

static int demo_genome(const KolibriNodeOptions *options) {
  if (!options) {
    return -1;
  }

  const unsigned char key[] = "kolibri-secret-key";

  if (options->verify_genome) {
    int verify = kg_verify_file(options->genome_path, key, sizeof(key) - 1);
    if (verify == 1) {
      printf("[Genome] No existing ledger at %s, nothing to verify\n",
             options->genome_path);
    } else if (verify != 0) {
      fprintf(stderr, "[Genome] Integrity check failed for %s\n",
              options->genome_path);
      return -1;
    } else {
      printf("[Genome] Verified %s\n", options->genome_path);
    }
  }

  KolibriGenome genome;
  if (kg_open(&genome, options->genome_path, key, sizeof(key) - 1) != 0) {
    fprintf(stderr, "Unable to open %s\n", options->genome_path);
    return -1;
  }

  ReasonBlock block;
  if (kg_append(&genome, "BOOT", "Kolibri node initialized", &block) == 0) {
    printf("[Genome] Appended block #%" PRIu64 " to %s\n", block.index,
           options->genome_path);
  } else {
    fprintf(stderr, "[Genome] Failed to append block\n");
    kg_close(&genome);
    return -1;
  }

  kg_close(&genome);
  return 0;
}

static void demo_formula(uint64_t seed, KolibriFormulaPool *out_pool) {
  KolibriFormulaPool pool;
  kf_pool_init(&pool, seed);

  const int inputs[] = {0, 1, 2, 3};
  const int targets[] = {1, 3, 5, 7};

  for (int i = 0; i < 16; ++i) {
    kf_pool_tick(&pool, inputs, targets, sizeof(inputs) / sizeof(inputs[0]));
  }

  if (out_pool) {
    *out_pool = pool;
  }

  const KolibriFormula *best = kf_pool_best(out_pool ? out_pool : &pool);
  if (best) {
    printf("[Formula] Best a=%d b=%d fitness=%.3f\n", best->a, best->b,
           best->fitness);
    printf("[Formula] f(4) = %d\n", kf_formula_apply(best, 4));
  }
}

int main(int argc, char **argv) {
  KolibriNodeOptions options;
  parse_options(argc, argv, &options);

  printf("Kolibri node starting with seed=%" PRIu64 " node=%u\n", options.seed,
         options.node_id);

  KolibriNetListener listener;
  listener.socket_fd = -1;
  if (options.listen_enabled) {
    if (kn_listener_start(&listener, options.listen_port) == 0) {
      printf("[Swarm] Listening on port %u\n", options.listen_port);
    } else {
      fprintf(stderr, "[Swarm] Failed to bind port %u\n", options.listen_port);
      options.listen_enabled = false;
    }
  }

  demo_decimal_layer();
  if (demo_genome(&options) != 0) {
    return 1;
  }
  KolibriFormulaPool pool;
  demo_formula(options.seed, &pool);

  const KolibriFormula *best = kf_pool_best(&pool);
  if (best && options.peer_enabled) {
    printf("[Swarm] Sharing formula with %s:%u\n", options.peer_host,
           options.peer_port);
    if (kn_share_formula(options.peer_host, options.peer_port, options.node_id,
                         best) == 0) {
      printf("[Swarm] Share complete\n");
    } else {
      fprintf(stderr, "[Swarm] Share failed\n");
    }
  }

  if (options.listen_enabled) {
    printf("[Swarm] Awaiting incoming messages...\n");
    KolibriNetMessage message;
    int res = kn_listener_poll(&listener, 2000U, &message);
    if (res == 1) {
      switch (message.type) {
      case KOLIBRI_MSG_HELLO:
        printf("[Swarm] HELLO from node %u\n", message.data.hello.node_id);
        break;
      case KOLIBRI_MSG_MIGRATE_RULE:
        printf("[Swarm] Received formula from node %u a=%d b=%d fitness=%.3f\n",
               message.data.formula.node_id, message.data.formula.a,
               message.data.formula.b, message.data.formula.fitness);
        break;
      case KOLIBRI_MSG_ACK:
        printf("[Swarm] ACK status=%u\n", message.data.ack.status);
        break;
      }
    } else if (res == 0) {
      printf("[Swarm] No incoming swarm traffic\n");
    } else {
      fprintf(stderr, "[Swarm] Listener error\n");
    }
    kn_listener_close(&listener);
  }

  printf("Kolibri node shutdown\n");
  return 0;
}
