#include "kolibri/net.h"

#include <assert.h>
#include <math.h>
#include <string.h>

void test_net(void)
{
    uint8_t buffer[64];
    KolibriNetMessage message;

    size_t dlina = kn_message_encode_hello(buffer, sizeof(buffer), 42U);
    assert(dlina == 7U);
    assert(kn_message_decode(buffer, dlina, &message) == 0);
    assert(message.type == KOLIBRI_MSG_HELLO);
    assert(message.data.hello.node_id == 42U);

    KolibriFormula formula;
    formula.fitness = 0.875;
    formula.gene.length = 8U;
    for (size_t indeks = 0; indeks < formula.gene.length; ++indeks) {
        formula.gene.digits[indeks] = (uint8_t)(indeks % 10U);
    }
    dlina = kn_message_encode_formula(buffer, sizeof(buffer), 7U, &formula);
    assert(dlina == 3U + sizeof(uint32_t) + 1U + formula.gene.length + sizeof(uint64_t));
    assert(kn_message_decode(buffer, dlina, &message) == 0);
    assert(message.type == KOLIBRI_MSG_MIGRATE_RULE);
    assert(message.data.formula.node_id == 7U);
    assert(message.data.formula.length == formula.gene.length);
    assert(memcmp(message.data.formula.digits, formula.gene.digits,
            formula.gene.length) == 0);
    assert(fabs(message.data.formula.fitness - formula.fitness) < 1e-9);

    dlina = kn_message_encode_ack(buffer, sizeof(buffer), 0x5AU);
    assert(dlina == 4U);
    assert(kn_message_decode(buffer, dlina, &message) == 0);
    assert(message.type == KOLIBRI_MSG_ACK);
    assert(message.data.ack.status == 0x5AU);
}
