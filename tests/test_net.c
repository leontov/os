#include "kolibri/net.h"

#include <assert.h>
#include <math.h>
#include <string.h>

void test_net(void) {
  uint8_t buffer[64];
  KolibriNetMessage message;

  size_t len = kn_message_encode_hello(buffer, sizeof(buffer), 42U);
  assert(len == 7U);
  assert(kn_message_decode(buffer, len, &message) == 0);
  assert(message.type == KOLIBRI_MSG_HELLO);
  assert(message.data.hello.node_id == 42U);


  KolibriFormula formula;
  formula.fitness = 0.875;
  formula.gene.length = 8;
  for (size_t i = 0; i < formula.gene.length; ++i) {
    formula.gene.digits[i] = (uint8_t)(i % 10U);
  }
  len = kn_message_encode_formula(buffer, sizeof(buffer), 7U, &formula);
  assert(len == 3U + sizeof(uint32_t) + 1U + formula.gene.length + sizeof(uint64_t));
  assert(kn_message_decode(buffer, len, &message) == 0);
  assert(message.type == KOLIBRI_MSG_MIGRATE_RULE);
  assert(message.data.formula.node_id == 7U);
  assert(message.data.formula.length == formula.gene.length);
  assert(memcmp(message.data.formula.digits, formula.gene.digits,
                formula.gene.length) == 0);

  KolibriFormula formula = {.a = 3, .b = -2, .fitness = 0.875};
  len = kn_message_encode_formula(buffer, sizeof(buffer), 7U, &formula);
  assert(len == 3U + sizeof(uint32_t) * 3 + sizeof(uint64_t));
  assert(kn_message_decode(buffer, len, &message) == 0);
  assert(message.type == KOLIBRI_MSG_MIGRATE_RULE);
  assert(message.data.formula.node_id == 7U);
  assert(message.data.formula.a == formula.a);
  assert(message.data.formula.b == formula.b);

  assert(fabs(message.data.formula.fitness - formula.fitness) < 1e-9);

  len = kn_message_encode_ack(buffer, sizeof(buffer), 0x5AU);
  assert(len == 4U);
  assert(kn_message_decode(buffer, len, &message) == 0);
  assert(message.type == KOLIBRI_MSG_ACK);
  assert(message.data.ack.status == 0x5AU);
}
