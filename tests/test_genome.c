#include "kolibri/genome.h"

#include <assert.h>
#include <openssl/hmac.h>
#include <openssl/sha.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static uint64_t read_u64_be(const unsigned char *data) {
  uint64_t value = 0;
  for (int i = 0; i < 8; ++i) {
    value = (value << 8) | (uint64_t)data[i];
  }
  return value;
}

static void build_hmac_message(const unsigned char *block_bytes,
                               unsigned char *out_message) {
  memcpy(out_message, block_bytes, 16); /* index + timestamp */
  memcpy(out_message + 16, block_bytes + 16, KOLIBRI_HASH_SIZE);
  memcpy(out_message + 16 + KOLIBRI_HASH_SIZE,
         block_bytes + 16 + KOLIBRI_HASH_SIZE * 2,
         KOLIBRI_EVENT_TYPE_SIZE);
  memcpy(out_message + 16 + KOLIBRI_HASH_SIZE + KOLIBRI_EVENT_TYPE_SIZE,
         block_bytes + 16 + KOLIBRI_HASH_SIZE * 2 + KOLIBRI_EVENT_TYPE_SIZE,
         KOLIBRI_PAYLOAD_SIZE);
}

static void assert_payload_digits(const char *digits) {
  size_t len = strnlen(digits, KOLIBRI_PAYLOAD_SIZE);
  for (size_t i = 0; i < len; ++i) {
    assert(digits[i] >= '0' && digits[i] <= '9');
  }
}

void test_genome(void) {
  char template[] = "/tmp/kolibri_genomeXXXXXX";
  int fd = mkstemp(template);
  assert(fd != -1);
  close(fd);

  KolibriGenome genome;
  const unsigned char key[] = "test-key";
  int rc = kg_open(&genome, template, key, sizeof(key) - 1);
  assert(rc == 0);

  char payload1[KOLIBRI_PAYLOAD_SIZE];
  char payload2[KOLIBRI_PAYLOAD_SIZE];
  char payload3[KOLIBRI_PAYLOAD_SIZE];
  assert(kg_encode_payload("payload", payload1, sizeof(payload1)) == 0);
  assert(kg_encode_payload("second", payload2, sizeof(payload2)) == 0);
  assert(kg_encode_payload("third", payload3, sizeof(payload3)) == 0);
  assert_payload_digits(payload1);
  assert_payload_digits(payload2);
  assert_payload_digits(payload3);

  ReasonBlock block1;
  rc = kg_append(&genome, "TEST", payload1, &block1);
  assert(rc == 0);
  assert(block1.index == 0);
  assert(block1.timestamp > 1000000000000ULL);

  ReasonBlock block2;
  rc = kg_append(&genome, "TEST", payload2, &block2);
  assert(rc == 0);
  assert(block2.index == 1);

  rc = kg_append(&genome, "TEST", "notdigits", NULL);
  assert(rc == -1);

  ReasonBlock block3;
  rc = kg_append(&genome, "TEST", payload3, &block3);
  assert(rc == 0);
  assert(block3.index == 2);

  kg_close(&genome);

  FILE *f = fopen(template, "rb");
  assert(f != NULL);
  int seek_rc = fseek(f, 0, SEEK_END);
  assert(seek_rc == 0);
  long size = ftell(f);
  assert(size == 3L * (long)KOLIBRI_BLOCK_SIZE);
  seek_rc = fseek(f, 0, SEEK_SET);
  assert(seek_rc == 0);

  unsigned char *buffer = (unsigned char *)calloc(3U, KOLIBRI_BLOCK_SIZE);
  assert(buffer != NULL);
  size_t read = fread(buffer, 1, 3U * KOLIBRI_BLOCK_SIZE, f);
  assert(read == 3U * KOLIBRI_BLOCK_SIZE);
  fclose(f);

  const unsigned char *raw1 = buffer;
  const unsigned char *raw2 = buffer + KOLIBRI_BLOCK_SIZE;
  const unsigned char *raw3 = buffer + KOLIBRI_BLOCK_SIZE * 2U;

  assert(read_u64_be(raw1) == 0U);
  assert(read_u64_be(raw2) == 1U);
  assert(read_u64_be(raw3) == 2U);

  for (size_t i = 0; i < KOLIBRI_HASH_SIZE; ++i) {
    assert(raw1[16 + i] == 0U);
  }

  assert(strcmp((const char *)(raw1 + 16 + KOLIBRI_HASH_SIZE * 2), "TEST") == 0);
  assert(strcmp((const char *)(raw2 + 16 + KOLIBRI_HASH_SIZE * 2), "TEST") == 0);
  assert(strcmp((const char *)(raw3 + 16 + KOLIBRI_HASH_SIZE * 2), "TEST") == 0);
  assert(strcmp((const char *)(raw1 + 16 + KOLIBRI_HASH_SIZE * 2 +
                               KOLIBRI_EVENT_TYPE_SIZE),
                 payload1) == 0);
  assert(strcmp((const char *)(raw2 + 16 + KOLIBRI_HASH_SIZE * 2 +
                               KOLIBRI_EVENT_TYPE_SIZE),
                 payload2) == 0);
  assert(strcmp((const char *)(raw3 + 16 + KOLIBRI_HASH_SIZE * 2 +
                               KOLIBRI_EVENT_TYPE_SIZE),
                 payload3) == 0);

  unsigned char hash1[KOLIBRI_HASH_SIZE];
  unsigned char hash2[KOLIBRI_HASH_SIZE];
  assert(SHA256(raw1, KOLIBRI_BLOCK_SIZE, hash1) != NULL);
  assert(SHA256(raw2, KOLIBRI_BLOCK_SIZE, hash2) != NULL);
  assert(memcmp(raw2 + 16, hash1, KOLIBRI_HASH_SIZE) == 0);
  assert(memcmp(raw3 + 16, hash2, KOLIBRI_HASH_SIZE) == 0);

  unsigned char message[KOLIBRI_BLOCK_SIZE - KOLIBRI_HASH_SIZE];
  unsigned char computed[KOLIBRI_HASH_SIZE];
  unsigned int hmac_len = 0;
  build_hmac_message(raw3, message);
  unsigned char *hmac_result = HMAC(EVP_sha256(), key, sizeof(key) - 1, message,
                                    sizeof(message), computed, &hmac_len);
  assert(hmac_result != NULL);
  assert(hmac_len == KOLIBRI_HASH_SIZE);
  assert(memcmp(raw3 + 16 + KOLIBRI_HASH_SIZE, computed, KOLIBRI_HASH_SIZE) == 0);

  free(buffer);

  rc = kg_verify_file(template, key, sizeof(key) - 1);
  assert(rc == 0);

  f = fopen(template, "r+b");
  assert(f != NULL);
  seek_rc = fseek(f, (long)KOLIBRI_BLOCK_SIZE + 120L, SEEK_SET);
  assert(seek_rc == 0);
  int byte = fgetc(f);
  assert(byte != EOF);
  seek_rc = fseek(f, (long)KOLIBRI_BLOCK_SIZE + 120L, SEEK_SET);
  assert(seek_rc == 0);
  fputc((byte == 0x30) ? 0x31 : 0x30, f);
  fclose(f);

  rc = kg_verify_file(template, key, sizeof(key) - 1);
  assert(rc == -1);

  remove(template);

  rc = kg_verify_file(template, key, sizeof(key) - 1);
  assert(rc == 1);
}
