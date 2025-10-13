/*
 * Kolibri Knowledge Relay: replicate TEACH/USER_FEEDBACK from knowledge genome
 * to node genomes, re-signing with node HMAC keys.
 */

#include "kolibri/genome.h"

#include <dirent.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int ends_with(const char *s, const char *suffix) {
  size_t ls = strlen(s), lsf = strlen(suffix);
  return ls >= lsf && strcmp(s + (ls - lsf), suffix) == 0;
}

static int is_genome_file(const char *name) { return ends_with(name, ".dat"); }

static void relay_event_to_target(const char *target_path, const unsigned char *key,
                                  size_t key_len, const char *event_type,
                                  const char *payload) {
  KolibriGenome g;
  if (kg_open(&g, target_path, key, key_len) != 0) {
    fprintf(stderr, "[relay] open target failed: %s\n", target_path);
    return;
  }
  if (kg_append(&g, event_type, payload, NULL) != 0) {
    fprintf(stderr, "[relay] append failed: %s\n", target_path);
  }
  kg_close(&g);
}

static int load_key_from_file(const char *path, unsigned char *out, size_t *out_len) {
  FILE *f = fopen(path, "rb");
  if (!f) return -1;
  size_t total = fread(out, 1, KOLIBRI_HMAC_KEY_SIZE, f);
  fclose(f);
  if (total == 0) return -1;
  *out_len = total;
  return 0;
}

int main(int argc, char **argv) {
  const char *source_path = ".kolibri/knowledge_genome.dat";
  const char *targets_dir = "build/cluster";
  const char *target_key_path = "build/cluster/swarm.key";
  const char *target_key_inline = NULL;
  const char *offset_path = ".kolibri/knowledge_relay.offset";

  for (int i = 1; i < argc; ++i) {
    if (strcmp(argv[i], "--source") == 0 && i + 1 < argc) {
      source_path = argv[++i];
      continue;
    }
    if (strcmp(argv[i], "--targets-dir") == 0 && i + 1 < argc) {
      targets_dir = argv[++i];
      continue;
    }
    if (strcmp(argv[i], "--target-key") == 0 && i + 1 < argc) {
      target_key_path = argv[++i];
      continue;
    }
    if (strcmp(argv[i], "--target-key-inline") == 0 && i + 1 < argc) {
      target_key_inline = argv[++i];
      continue;
    }
    if (strcmp(argv[i], "--offset") == 0 && i + 1 < argc) {
      offset_path = argv[++i];
      continue;
    }
    if (strcmp(argv[i], "--help") == 0) {
      printf("Usage: %s [--source PATH] [--targets-dir DIR] [--target-key FILE] [--offset FILE]\n", argv[0]);
      return 0;
    }
  }

  unsigned char target_key[KOLIBRI_HMAC_KEY_SIZE];
  size_t target_key_len = 0U;
  if (target_key_inline && target_key_inline[0] != '\0') {
    size_t len = strlen(target_key_inline);
    if (len > sizeof(target_key)) len = sizeof(target_key);
    memcpy(target_key, target_key_inline, len);
    target_key_len = len;
  } else {
    if (load_key_from_file(target_key_path, target_key, &target_key_len) != 0) {
      fprintf(stderr, "[relay] failed to load target key: %s\n", target_key_path);
      return 1;
    }
  }

  FILE *src = fopen(source_path, "rb");
  if (!src) {
    fprintf(stderr, "[relay] cannot open source %s: %s\n", source_path, strerror(errno));
    return 1;
  }

  unsigned long long start_index = 0ULL;
  FILE *ofs = fopen(offset_path, "r");
  if (ofs) {
    if (fscanf(ofs, "%llu", &start_index) != 1) {
      start_index = 0ULL;
    }
    fclose(ofs);
  }

  /* Iterate over fixed-size blocks */
  unsigned char bytes[KOLIBRI_BLOCK_SIZE];
  unsigned long long processed = 0ULL;

  /* Skip blocks below start_index by reading and counting */
  while (fread(bytes, 1, KOLIBRI_BLOCK_SIZE, src) == KOLIBRI_BLOCK_SIZE) {
    /* Deserialize minimal fields: index, event_type, payload */
    unsigned long long idx = 0ULL;
    for (int i = 0; i < 8; ++i) {
      idx = (idx << 8) | (unsigned long long)bytes[i];
    }
    if (idx < start_index) {
      continue;
    }

    char event_type[KOLIBRI_EVENT_TYPE_SIZE + 1];
    char payload[KOLIBRI_PAYLOAD_SIZE + 1];
    memset(event_type, 0, sizeof(event_type));
    memset(payload, 0, sizeof(payload));
    memcpy(event_type, bytes + 16 + KOLIBRI_HASH_SIZE * 2, KOLIBRI_EVENT_TYPE_SIZE);
    memcpy(payload, bytes + 16 + KOLIBRI_HASH_SIZE * 2 + KOLIBRI_EVENT_TYPE_SIZE, KOLIBRI_PAYLOAD_SIZE);
    event_type[KOLIBRI_EVENT_TYPE_SIZE] = '\0';
    payload[KOLIBRI_PAYLOAD_SIZE] = '\0';

    /* Filter events */
    if (strncmp(event_type, "TEACH", 5) != 0 && strncmp(event_type, "USER_FEEDBACK", 13) != 0) {
      start_index = idx + 1ULL;
      continue;
    }

    /* Broadcast to all genomes in targets_dir */
    DIR *dir = opendir(targets_dir);
    if (!dir) {
      fprintf(stderr, "[relay] cannot open targets-dir %s\n", targets_dir);
      break;
    }
    struct dirent *ent;
    while ((ent = readdir(dir)) != NULL) {
      if (ent->d_name[0] == '.') continue;
      if (!is_genome_file(ent->d_name)) continue;
      char path[512];
      snprintf(path, sizeof(path), "%s/%s", targets_dir, ent->d_name);
      relay_event_to_target(path, target_key, target_key_len, event_type, payload);
    }
    closedir(dir);

    start_index = idx + 1ULL;
    processed += 1ULL;
  }

  fclose(src);

  ofs = fopen(offset_path, "w");
  if (ofs) {
    fprintf(ofs, "%llu\n", start_index);
    fclose(ofs);
  }

  printf("[relay] processed %llu events\n", processed);
  return 0;
}
