#ifndef KOLIBRI_SIGMA_H
#define KOLIBRI_SIGMA_H

#include <stddef.h>
#include <stdint.h>

/* Публичный API для KOLIBRI-Σ */

#ifdef __cplusplus
extern "C" {
#endif

uintptr_t k_state_new(uint32_t cap);
void      k_state_free(uintptr_t state);

int k_observe(uintptr_t state, const uint8_t *in, size_t n);

int k_decode(uintptr_t state,
             const uint8_t *in,
             size_t n,
             uint8_t *out,
             size_t cap,
             int temp_q8,
             int topk);

int k_digit_add_syll(uintptr_t state, uint8_t digit, const uint8_t *u8, uint16_t len);

int k_state_save(uintptr_t state, uint8_t *out, size_t cap);
int k_state_load(uintptr_t state, const uint8_t *in, size_t n);

int k_profile(uintptr_t state, uint32_t what, uint8_t *out, size_t cap);

int k_set_constraints(float breadth, float depth);
int k_vote_mode(int mode);

#ifdef __cplusplus
}
#endif

/* Значения для what параметра k_profile */
#define K_SIGMA_PROFILE_DIGITS 0U

/* Режимы голосования */
#define K_SIGMA_VOTE_GREEDY          0
#define K_SIGMA_VOTE_RESONANT        1
#define K_SIGMA_VOTE_COUNTERFACTUAL  2

#endif /* KOLIBRI_SIGMA_H */
