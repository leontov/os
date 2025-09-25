/*
 * Copyright (c) 2025 Кочуров Владислав Евгеньевич
 */

#include "kolibri/decimal.h"

#include <ctype.h>
#include <stdio.h>

size_t k_encode_text_length(size_t input_len) { return input_len * 3 + 1; }

size_t k_decode_text_length(size_t digits_len) {
  if (digits_len % 3 != 0) {
    return 0;
  }
  return digits_len / 3 + 1;
}

int k_encode_text(const char *input, char *out, size_t out_len) {
  if (!input || !out) {
    return -1;
  }

  size_t i = 0;
  for (; input[i] != '\0'; ++i) {
    if (out_len < (i + 1) * 3 + 1) {
      return -1;
    }
    unsigned char value = (unsigned char)input[i];
    int written = snprintf(out + i * 3, out_len - i * 3, "%03u", value);
    if (written != 3) {
      return -1;
    }
  }
  out[i * 3] = '\0';
  return 0;
}

int k_decode_text(const char *digits, char *out, size_t out_len) {
  if (!digits || !out) {
    return -1;
  }

  size_t len = 0;
  while (digits[len] != '\0') {
    if (!isdigit((unsigned char)digits[len])) {
      return -1;
    }
    ++len;
  }

  if (len % 3 != 0) {
    return -1;
  }

  size_t required = len / 3 + 1;
  if (out_len < required) {
    return -1;
  }

  for (size_t i = 0; i < len / 3; ++i) {
    unsigned int value = 0;
    int consumed = sscanf(digits + i * 3, "%03u", &value);
    if (consumed != 1 || value > 255) {
      return -1;
    }
    out[i] = (char)value;
  }
  out[len / 3] = '\0';
  return 0;
}
