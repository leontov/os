#include "kolibri/decimal.h"

#include <assert.h>
#include <string.h>

void test_decimal(void) {
  const char *text = "Kolibri";
  char encoded[64];
  char decoded[32];
  int rc = k_encode_text(text, encoded, sizeof(encoded));
  assert(rc == 0);
  rc = k_decode_text(encoded, decoded, sizeof(decoded));
  assert(rc == 0);
  assert(strcmp(text, decoded) == 0);
}
