#include "kolibri/sigma.h"

#include <assert.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

static void test_sigma_learn_and_decode(void) {
    uintptr_t st = k_state_new(0);
    assert(st != 0U);

    const char *sample = "alpha beta alpha delta";
    assert(k_observe(st, (const uint8_t *)sample, strlen(sample)) == 0);

    uint8_t buffer[128];
    int produced = k_decode(st, (const uint8_t *)"alpha", 5U, buffer, sizeof(buffer), 0, 3);
    assert(produced >= 0);
    if (produced > 0) {
        buffer[produced] = '\0';
        assert(strstr((char *)buffer, "alpha") != NULL);
    }

    assert(k_set_constraints(0.5f, 1.0f) == 0);
    produced = k_decode(st, NULL, 0U, buffer, sizeof(buffer), 0, 2);
    assert(produced >= 0);
    k_set_constraints(1.0f, 3.0f);

    assert(k_digit_add_syll(st, 0U, (const uint8_t *)"zo", 2U) == 0);

    uint8_t snapshot[1024];
    int snap = k_state_save(st, snapshot, sizeof(snapshot));
    assert(snap > 0);

    uintptr_t st2 = k_state_new(0);
    assert(st2 != 0U);
    assert(k_state_load(st2, snapshot, (size_t)snap) == 0);

    uint8_t profile[256];
    int prof = k_profile(st2, K_SIGMA_PROFILE_DIGITS, profile, sizeof(profile));
    assert(prof > 0);
    profile[prof] = '\0';
    assert(strstr((char *)profile, "\"digits\"") != NULL);

    k_state_free(st);
    k_state_free(st2);
}

void test_sigma(void) {
    test_sigma_learn_and_decode();
}
