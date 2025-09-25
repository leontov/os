#ifndef KOLIBRI_DECIMAL_H
#define KOLIBRI_DECIMAL_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

size_t k_encode_text_length(size_t input_len);
size_t k_decode_text_length(size_t digits_len);
int k_encode_text(const char *input, char *out, size_t out_len);
int k_decode_text(const char *digits, char *out, size_t out_len);

#ifdef __cplusplus
}
#endif

#endif /* KOLIBRI_DECIMAL_H */
