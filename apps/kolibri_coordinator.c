/*
 * Kolibri Coordinator: collects best formulas from nodes and rebroadcasts.
 */

#include "kolibri/formula.h"
#include "kolibri/net.h"

#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/time.h>
#include <time.h>

typedef struct {
  char host[64];
  uint16_t port;
} Target;

typedef struct {
  Target *items;
  size_t count;
  size_t capacity;
} TargetList;

static void targets_init(TargetList *list) {
  list->items = NULL;
  list->count = 0U;
  list->capacity = 0U;
}

static void targets_push(TargetList *list, const char *host, uint16_t port) {
  if (list->count == list->capacity) {
    size_t new_cap = list->capacity ? list->capacity * 2U : 8U;
    Target *new_items = (Target *)realloc(list->items, new_cap * sizeof(Target));
    if (!new_items) {
      fprintf(stderr, "[coord] alloc targets failed\n");
      exit(1);
    }
    list->items = new_items;
    list->capacity = new_cap;
  }
  Target *t = &list->items[list->count++];
  strncpy(t->host, host, sizeof(t->host) - 1);
  t->host[sizeof(t->host) - 1] = '\0';
  t->port = port;
}

static volatile sig_atomic_t running = 1;

static void handle_sig(int sig) {
  (void)sig;
  running = 0;
}

static uint64_t now_ms(void) {
#if defined(CLOCK_MONOTONIC)
  struct timespec ts;
  if (clock_gettime(CLOCK_MONOTONIC, &ts) == 0) {
    return (uint64_t)ts.tv_sec * 1000ULL + (uint64_t)ts.tv_nsec / 1000000ULL;
  }
#endif
  struct timeval tv;
  gettimeofday(&tv, NULL);
  return (uint64_t)tv.tv_sec * 1000ULL + (uint64_t)(tv.tv_usec / 1000ULL);
}

int main(int argc, char **argv) {
  uint16_t listen_port = 4099U;
  TargetList targets;
  targets_init(&targets);

  /* Defaults: localhost base-port/count via flags */
  uint16_t base_port = 0U;
  int count = 0;

  for (int i = 1; i < argc; ++i) {
    if (strcmp(argv[i], "--listen") == 0 && i + 1 < argc) {
      listen_port = (uint16_t)strtoul(argv[++i], NULL, 10);
      continue;
    }
    if (strcmp(argv[i], "--node") == 0 && i + 1 < argc) {
      const char *arg = argv[++i];
      const char *colon = strchr(arg, ':');
      if (colon) {
        char host[64];
        size_t host_len = (size_t)(colon - arg);
        if (host_len >= sizeof(host)) host_len = sizeof(host) - 1U;
        memcpy(host, arg, host_len);
        host[host_len] = '\0';
        uint16_t port = (uint16_t)strtoul(colon + 1, NULL, 10);
        targets_push(&targets, host, port);
      } else {
        targets_push(&targets, "127.0.0.1", (uint16_t)strtoul(arg, NULL, 10));
      }
      continue;
    }
    if (strcmp(argv[i], "--base-port") == 0 && i + 1 < argc) {
      base_port = (uint16_t)strtoul(argv[++i], NULL, 10);
      continue;
    }
    if (strcmp(argv[i], "--count") == 0 && i + 1 < argc) {
      count = atoi(argv[++i]);
      continue;
    }
    if (strcmp(argv[i], "--help") == 0) {
      printf("Usage: %s [--listen PORT] [--node HOST:PORT]... [--base-port P --count N]\n", argv[0]);
      return 0;
    }
  }

  if (targets.count == 0 && base_port > 0 && count > 0) {
    for (int i = 0; i < count; ++i) {
      targets_push(&targets, "127.0.0.1", (uint16_t)(base_port + i));
    }
  }

  if (targets.count == 0) {
    fprintf(stderr, "[coord] no targets specified\n");
    return 1;
  }

  KolibriNetListener listener;
  if (kn_listener_start(&listener, listen_port) != 0) {
    fprintf(stderr, "[coord] failed to listen on %u\n", listen_port);
    return 1;
  }

  signal(SIGINT, handle_sig);
  signal(SIGTERM, handle_sig);

  KolibriFormula best;
  memset(&best, 0, sizeof(best));
  double best_fitness = -1e9;
  uint64_t last_broadcast = now_ms();
  const uint32_t interval_ms = 2000U;

  printf("[coord] listening on %u; targets=%zu\n", listen_port, targets.count);

  while (running) {
    KolibriNetMessage msg;
    int rc = kn_listener_poll(&listener, 200U, &msg);
    if (rc > 0) {
      if (msg.type == KOLIBRI_MSG_MIGRATE_RULE) {
        KolibriFormula incoming;
        memset(&incoming, 0, sizeof(incoming));
        incoming.gene.length = msg.data.formula.length;
        if (incoming.gene.length > sizeof(incoming.gene.digits)) {
          incoming.gene.length = sizeof(incoming.gene.digits);
        }
        memcpy(incoming.gene.digits, msg.data.formula.digits, incoming.gene.length);
        incoming.fitness = msg.data.formula.fitness;
        incoming.feedback = 0.0;

        if (incoming.fitness > best_fitness) {
          best = incoming;
          best_fitness = incoming.fitness;
          printf("[coord] updated best: fitness=%.3f len=%u\n", best_fitness, (unsigned)best.gene.length);
        }
      }
    }

    uint64_t now = now_ms();
    if (best_fitness > -1e8 && (now - last_broadcast) >= interval_ms) {
      for (size_t i = 0; i < targets.count; ++i) {
        if (kn_share_formula(targets.items[i].host, targets.items[i].port, 0U, &best) == 0) {
          /* ok */
        }
      }
      last_broadcast = now;
    }
  }

  kn_listener_close(&listener);
  printf("[coord] shutdown\n");
  return 0;
}

