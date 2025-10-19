/*
 * Copyright (c) 2025 Кочуров Владислав Евгеньевич
 */

#include "kolibri/genome.h"

#include "kolibri/decimal.h"

#include <openssl/hmac.h>
#include <openssl/sha.h>

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

#define KOLIBRI_HMAC_INPUT_SIZE                                                \
  (KOLIBRI_BLOCK_SIZE - KOLIBRI_HASH_SIZE)

static void reset_context(KolibriGenome *ctx) {
  if (!ctx) {
    return;
  }
  ctx->file = NULL;
  memset(ctx->last_hash, 0, sizeof(ctx->last_hash));
  memset(ctx->last_block, 0, sizeof(ctx->last_block));
  memset(ctx->hmac_key, 0, sizeof(ctx->hmac_key));
  ctx->hmac_key_len = 0;
  memset(ctx->path, 0, sizeof(ctx->path));
  ctx->next_index = 0;
  ctx->has_last_block = 0;
}

static void encode_u64_be(uint64_t value, unsigned char *out) {
  for (int i = 0; i < 8; ++i) {
    out[i] = (unsigned char)((value >> (56 - (i * 8))) & 0xFFU);
  }
}

static uint64_t decode_u64_be(const unsigned char *data) {
  uint64_t value = 0;
  for (int i = 0; i < 8; ++i) {
    value = (value << 8) | (uint64_t)data[i];
  }
  return value;
}

static void serialize_block(const ReasonBlock *block, unsigned char *out) {
  encode_u64_be(block->index, out);
  encode_u64_be(block->timestamp, out + 8);
  memcpy(out + 16, block->prev_hash, KOLIBRI_HASH_SIZE);
  memcpy(out + 16 + KOLIBRI_HASH_SIZE, block->hmac, KOLIBRI_HASH_SIZE);
  memcpy(out + 16 + KOLIBRI_HASH_SIZE * 2, block->event_type,
         KOLIBRI_EVENT_TYPE_SIZE);
  memcpy(out + 16 + KOLIBRI_HASH_SIZE * 2 + KOLIBRI_EVENT_TYPE_SIZE,
         block->payload, KOLIBRI_PAYLOAD_SIZE);
}

static void deserialize_block(const unsigned char *data, ReasonBlock *block) {
  memset(block, 0, sizeof(*block));
  block->index = decode_u64_be(data);
  block->timestamp = decode_u64_be(data + 8);
  memcpy(block->prev_hash, data + 16, KOLIBRI_HASH_SIZE);
  memcpy(block->hmac, data + 16 + KOLIBRI_HASH_SIZE, KOLIBRI_HASH_SIZE);
  memcpy(block->event_type, data + 16 + KOLIBRI_HASH_SIZE * 2,
         KOLIBRI_EVENT_TYPE_SIZE);
  memcpy(block->payload,
         data + 16 + KOLIBRI_HASH_SIZE * 2 + KOLIBRI_EVENT_TYPE_SIZE,
         KOLIBRI_PAYLOAD_SIZE);
}

static void build_hmac_message(const ReasonBlock *block, unsigned char *out) {
  encode_u64_be(block->index, out);
  encode_u64_be(block->timestamp, out + 8);
  memcpy(out + 16, block->prev_hash, KOLIBRI_HASH_SIZE);
  memcpy(out + 16 + KOLIBRI_HASH_SIZE, block->event_type,
         KOLIBRI_EVENT_TYPE_SIZE);
  memcpy(out + 16 + KOLIBRI_HASH_SIZE + KOLIBRI_EVENT_TYPE_SIZE, block->payload,
         KOLIBRI_PAYLOAD_SIZE);
}

static int payload_is_digits(const char *payload) {
  if (!payload) {
    return 0;
  }
  for (size_t i = 0; i < KOLIBRI_PAYLOAD_SIZE; ++i) {
    char ch = payload[i];
    if (ch == '\0') {
      return 1;
    }
    if (ch < '0' || ch > '9') {
      return 0;
    }
  }
  return 0;
}

static uint64_t current_time_ns(void) {
#if defined(CLOCK_REALTIME)
  struct timespec ts;
  if (clock_gettime(CLOCK_REALTIME, &ts) == 0) {
    return (uint64_t)ts.tv_sec * 1000000000ULL + (uint64_t)ts.tv_nsec;
  }
#endif
  time_t seconds = time(NULL);
  if (seconds < 0) {
    seconds = 0;
  }
  return (uint64_t)seconds * 1000000000ULL;
}

static int parse_and_verify_block(const unsigned char *bytes,
                                  const unsigned char *key, size_t key_len,
                                  uint64_t expected_index,
                                  const unsigned char *expected_prev,
                                  ReasonBlock *out_block,
                                  unsigned char *out_hash) {
  ReasonBlock block;
  deserialize_block(bytes, &block);

  if (!memchr(block.event_type, '\0', KOLIBRI_EVENT_TYPE_SIZE) ||
      !memchr(block.payload, '\0', KOLIBRI_PAYLOAD_SIZE)) {
    return -1;
  }

  if (block.index != expected_index) {
    return -1;
  }

  if (memcmp(block.prev_hash, expected_prev, KOLIBRI_HASH_SIZE) != 0) {
    return -1;
  }

  unsigned char message[KOLIBRI_HMAC_INPUT_SIZE];
  build_hmac_message(&block, message);

  unsigned char computed[KOLIBRI_HASH_SIZE];
  unsigned int hmac_len = 0;
  unsigned char *result =
      HMAC(EVP_sha256(), key, (int)key_len, message, sizeof(message), computed,
           &hmac_len);
  if (!result || hmac_len != KOLIBRI_HASH_SIZE) {
    return -1;
  }

  if (memcmp(computed, block.hmac, KOLIBRI_HASH_SIZE) != 0) {
    return -1;
  }

  if (out_block) {
    *out_block = block;
  }

  if (out_hash) {
    if (!SHA256(bytes, KOLIBRI_BLOCK_SIZE, out_hash)) {
      return -1;
    }
  }

  return 0;
}

int kg_open(KolibriGenome *ctx, const char *path, const unsigned char *key,
            size_t key_len) {
  if (!ctx || !path || !key || key_len == 0 ||
      key_len > sizeof(ctx->hmac_key)) {
    return -1;
  }

  reset_context(ctx);

  FILE *file = fopen(path, "r+b");
  if (!file) {
    file = fopen(path, "w+b");
    if (!file) {
      return -1;
    }
  }

  ctx->file = file;
  strncpy(ctx->path, path, sizeof(ctx->path) - 1);
  memcpy(ctx->hmac_key, key, key_len);
  ctx->hmac_key_len = key_len;

  unsigned char expected_prev[KOLIBRI_HASH_SIZE];
  memset(expected_prev, 0, sizeof(expected_prev));
  uint64_t expected_index = 0;

  unsigned char bytes[KOLIBRI_BLOCK_SIZE];
  size_t read = 0;
  while ((read = fread(bytes, 1, KOLIBRI_BLOCK_SIZE, ctx->file)) ==
         KOLIBRI_BLOCK_SIZE) {
    unsigned char block_hash[KOLIBRI_HASH_SIZE];
    ReasonBlock block;
    if (parse_and_verify_block(bytes, key, key_len, expected_index,
                               expected_prev, &block, block_hash) != 0) {
      kg_close(ctx);
      return -1;
    }

    memcpy(ctx->last_hash, block.hmac, KOLIBRI_HASH_SIZE);
    memcpy(ctx->last_block, bytes, KOLIBRI_BLOCK_SIZE);
    ctx->has_last_block = 1;
    memcpy(expected_prev, block_hash, KOLIBRI_HASH_SIZE);
    expected_index = block.index + 1;
  }

  if (read != 0) {
    kg_close(ctx);
    return -1;
  }

  if (ferror(ctx->file)) {
    kg_close(ctx);
    return -1;
  }

  ctx->next_index = expected_index;

  if (fseek(ctx->file, 0, SEEK_END) != 0) {
    kg_close(ctx);
    return -1;
  }

  return 0;
}

void kg_close(KolibriGenome *ctx) {
  if (!ctx) {
    return;
  }
  if (ctx->file) {
    fclose(ctx->file);
    ctx->file = NULL;
  }
  memset(ctx->last_hash, 0, sizeof(ctx->last_hash));
  memset(ctx->last_block, 0, sizeof(ctx->last_block));
  memset(ctx->hmac_key, 0, sizeof(ctx->hmac_key));
  ctx->hmac_key_len = 0;
  memset(ctx->path, 0, sizeof(ctx->path));
  ctx->next_index = 0;
  ctx->has_last_block = 0;
}

int kg_encode_payload(const char *utf8, char *out, size_t out_len) {
  if (!out || out_len == 0) {
    return -1;
  }
  memset(out, 0, out_len);
  if (!utf8 || utf8[0] == '\0') {
    return 0;
  }
  size_t required = k_encode_text_length(strlen(utf8));
  if (required > out_len) {
    return -1;
  }
  return k_encode_text(utf8, out, out_len);
}

int kg_append(KolibriGenome *ctx, const char *event_type, const char *payload,
              ReasonBlock *out_block) {
  if (!ctx || !ctx->file || !event_type) {
    return -1;
  }

  const char *digits = payload ? payload : "";
  if (!payload_is_digits(digits)) {
    return -1;
  }

  size_t event_len = strnlen(event_type, KOLIBRI_EVENT_TYPE_SIZE);
  if (event_len >= KOLIBRI_EVENT_TYPE_SIZE) {
    return -1;
  }

  ReasonBlock block;
  memset(&block, 0, sizeof(block));

  block.index = ctx->next_index;
  block.timestamp = current_time_ns();

  if (ctx->has_last_block) {
    if (!SHA256(ctx->last_block, KOLIBRI_BLOCK_SIZE, block.prev_hash)) {
      return -1;
    }
  } else {
    memset(block.prev_hash, 0, KOLIBRI_HASH_SIZE);
  }

  memcpy(block.event_type, event_type, event_len);
  size_t payload_len = strnlen(digits, KOLIBRI_PAYLOAD_SIZE);
  if (payload_len >= KOLIBRI_PAYLOAD_SIZE) {
    return -1;
  }
  memcpy(block.payload, digits, payload_len);

  unsigned char message[KOLIBRI_HMAC_INPUT_SIZE];
  build_hmac_message(&block, message);

  unsigned int hmac_len = 0;
  if (!HMAC(EVP_sha256(), ctx->hmac_key, (int)ctx->hmac_key_len, message,
            sizeof(message), block.hmac, &hmac_len) ||
      hmac_len != KOLIBRI_HASH_SIZE) {
    return -1;
  }

  unsigned char bytes[KOLIBRI_BLOCK_SIZE];
  serialize_block(&block, bytes);

  if (fwrite(bytes, 1, KOLIBRI_BLOCK_SIZE, ctx->file) != KOLIBRI_BLOCK_SIZE) {
    return -1;
  }

  if (fflush(ctx->file) != 0) {
    return -1;
  }

  memcpy(ctx->last_hash, block.hmac, KOLIBRI_HASH_SIZE);
  memcpy(ctx->last_block, bytes, KOLIBRI_BLOCK_SIZE);
  ctx->has_last_block = 1;
  ctx->next_index = block.index + 1;

  if (out_block) {
    *out_block = block;
  }

  return 0;
}

int kg_verify_file(const char *path, const unsigned char *key,
                   size_t key_len) {
  if (!path || !key || key_len == 0 || key_len > KOLIBRI_HMAC_KEY_SIZE) {
    return -1;
  }

  FILE *file = fopen(path, "rb");
  if (!file) {
    if (errno == ENOENT) {
      return 1;
    }
    return -1;
  }

  unsigned char expected_prev[KOLIBRI_HASH_SIZE];
  memset(expected_prev, 0, sizeof(expected_prev));
  uint64_t expected_index = 0;

  unsigned char bytes[KOLIBRI_BLOCK_SIZE];
  size_t read = 0;
  while ((read = fread(bytes, 1, KOLIBRI_BLOCK_SIZE, file)) ==
         KOLIBRI_BLOCK_SIZE) {
    unsigned char block_hash[KOLIBRI_HASH_SIZE];
    if (parse_and_verify_block(bytes, key, key_len, expected_index,
                               expected_prev, NULL, block_hash) != 0) {
      fclose(file);
      return -1;
    }
    memcpy(expected_prev, block_hash, KOLIBRI_HASH_SIZE);
    expected_index += 1;
  }

  if (read != 0) {
    fclose(file);
    return -1;
  }

  if (ferror(file)) {
    fclose(file);
    return -1;
  }

  fclose(file);
  return 0;
}
