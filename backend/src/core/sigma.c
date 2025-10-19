#include "kolibri/sigma.h"

#include <ctype.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define K_SIGMA_DIGITS 10U
#define K_SIGMA_VERSION 1U
#define K_SIGMA_MAGIC "KSGM"

typedef struct {
    char    *token;
    uint32_t count;
} KSigmaToken;

typedef struct {
    KSigmaToken *tokens;
    size_t       token_count;
    size_t       token_cap;

    char  **syllables;
    size_t  syll_count;
    size_t  syll_cap;

    uint64_t total_count;
} KSigmaDigit;

typedef struct {
    KSigmaDigit digits[K_SIGMA_DIGITS];
    size_t      init_token_cap;
    size_t      init_syll_cap;
    float       breadth_limit;
    float       depth_limit;
    int         vote_mode;
} KSigmaState;

static float g_default_breadth = 1.0f;
static float g_default_depth   = 3.0f;
static int   g_default_vote    = K_SIGMA_VOTE_RESONANT;

static inline int allowed_emit(float b_used, float d_used, float b_add, float d_add) {
    return (b_used + b_add <= g_default_breadth + 1e-6f) &&
           (d_used + d_add <= g_default_depth   + 1e-6f);
}

static void sigma_digit_clear(KSigmaDigit *digit) {
    if (!digit) return;
    for (size_t i = 0; i < digit->token_count; ++i) {
        free(digit->tokens[i].token);
    }
    free(digit->tokens);
    digit->tokens = NULL;
    digit->token_count = 0U;
    digit->token_cap = 0U;

    for (size_t i = 0; i < digit->syll_count; ++i) {
        free(digit->syllables[i]);
    }
    free(digit->syllables);
    digit->syllables = NULL;
    digit->syll_count = 0U;
    digit->syll_cap = 0U;
    digit->total_count = 0U;
}

static void sigma_state_reset_limits(KSigmaState *st) {
    if (!st) return;
    st->breadth_limit = g_default_breadth;
    st->depth_limit = g_default_depth;
    st->vote_mode = g_default_vote;
}

uintptr_t k_state_new(uint32_t cap) {
    KSigmaState *state = calloc(1U, sizeof(KSigmaState));
    if (!state) return (uintptr_t)0U;
    state->init_token_cap = cap ? (size_t)cap : 8U;
    state->init_syll_cap  = 4U;
    sigma_state_reset_limits(state);
    return (uintptr_t)state;
}

void k_state_free(uintptr_t ptr) {
    if (!ptr) return;
    KSigmaState *state = (KSigmaState *)ptr;
    for (size_t i = 0; i < K_SIGMA_DIGITS; ++i) {
        sigma_digit_clear(&state->digits[i]);
    }
    free(state);
}

static uint32_t sigma_hash_word(const uint8_t *word, size_t len) {
    const uint32_t fnv_prime = 16777619U;
    uint32_t hash = 2166136261U;
    for (size_t i = 0; i < len; ++i) {
        hash ^= (uint32_t)word[i];
        hash *= fnv_prime;
    }
    return hash;
}

static inline uint8_t sigma_digit_from_hash(uint32_t hash) {
    return (uint8_t)(hash % K_SIGMA_DIGITS);
}

static int sigma_ensure_token_cap(KSigmaState *st, KSigmaDigit *digit, size_t need) {
    if (digit->token_cap >= need) return 0;
    size_t new_cap = digit->token_cap ? digit->token_cap : st->init_token_cap;
    while (new_cap < need) {
        new_cap = new_cap < (SIZE_MAX / 2U) ? new_cap * 2U : need;
        if (new_cap == need) break;
        if (new_cap < need) return -1;
    }
    KSigmaToken *tokens = realloc(digit->tokens, new_cap * sizeof(KSigmaToken));
    if (!tokens) return -1;
    digit->tokens = tokens;
    digit->token_cap = new_cap;
    return 0;
}

static int sigma_ensure_syll_cap(KSigmaState *st, KSigmaDigit *digit, size_t need) {
    if (digit->syll_cap >= need) return 0;
    size_t new_cap = digit->syll_cap ? digit->syll_cap : st->init_syll_cap;
    while (new_cap < need) {
        new_cap = new_cap < (SIZE_MAX / 2U) ? new_cap * 2U : need;
        if (new_cap == need) break;
        if (new_cap < need) return -1;
    }
    char **syll = realloc(digit->syllables, new_cap * sizeof(char *));
    if (!syll) return -1;
    digit->syllables = syll;
    digit->syll_cap = new_cap;
    return 0;
}

static KSigmaToken *sigma_find_token(const KSigmaDigit *digit, const uint8_t *word, size_t len) {
    for (size_t i = 0; i < digit->token_count; ++i) {
        const KSigmaToken *tk = &digit->tokens[i];
        if (strlen(tk->token) == len && memcmp(tk->token, word, len) == 0) {
            return &((KSigmaDigit *)digit)->tokens[i];
        }
    }
    return NULL;
}

static char *sigma_copy_word(const uint8_t *word, size_t len) {
    char *copy = malloc(len + 1U);
    if (!copy) return NULL;
    memcpy(copy, word, len);
    copy[len] = '\0';
    return copy;
}

static bool sigma_is_token_char(unsigned char c) {
    return (c & 0x80U) || isalnum(c) || c == '_' || c == '-' || c == '+';
}

static int sigma_observe_word(KSigmaState *state, const uint8_t *word, size_t len) {
    if (!len) return 0;
    uint32_t hash = sigma_hash_word(word, len);
    uint8_t digit_idx = sigma_digit_from_hash(hash);
    KSigmaDigit *digit = &state->digits[digit_idx];

    KSigmaToken *token = sigma_find_token(digit, word, len);
    if (token) {
        if (token->count < UINT32_MAX) {
            token->count += 1U;
        }
    } else {
        if (sigma_ensure_token_cap(state, digit, digit->token_count + 1U)) return -1;
        char *copy = sigma_copy_word(word, len);
        if (!copy) return -2;
        KSigmaToken *tk = &digit->tokens[digit->token_count++];
        tk->token = copy;
        tk->count = 1U;
    }
    digit->total_count += 1U;
    return 0;
}

int k_observe(uintptr_t ptr, const uint8_t *in, size_t n) {
    if (!ptr || (!in && n > 0U)) return -1;
    KSigmaState *state = (KSigmaState *)ptr;
    size_t pos = 0U;
    while (pos < n) {
        while (pos < n && !sigma_is_token_char((unsigned char)in[pos])) pos++;
        size_t start = pos;
        while (pos < n && sigma_is_token_char((unsigned char)in[pos])) pos++;
        if (pos > start) {
            if (sigma_observe_word(state, in + start, pos - start)) return -2;
        }
    }
    return 0;
}

static size_t sigma_pick_digit_from_prompt(const uint8_t *in, size_t n, KSigmaState *state, bool *have_digit) {
    *have_digit = false;
    if (in && n > 0U) {
        size_t pos = n;
        while (pos > 0U) {
            unsigned char c = in[pos - 1U];
            if (sigma_is_token_char(c)) {
                pos--;
            } else {
                break;
            }
        }
        size_t end = pos;
        while (pos > 0U) {
            unsigned char c = in[pos - 1U];
            if (!sigma_is_token_char(c)) break;
            pos--;
        }
        if (end > pos) {
            uint32_t hash = sigma_hash_word(in + pos, end - pos);
            *have_digit = true;
            return (size_t)sigma_digit_from_hash(hash);
        }
    }
    uint64_t best_total = 0U;
    size_t best_digit = 0U;
    for (size_t i = 0; i < K_SIGMA_DIGITS; ++i) {
        if (state->digits[i].total_count > best_total) {
            best_total = state->digits[i].total_count;
            best_digit = i;
        }
    }
    if (best_total > 0U) {
        *have_digit = true;
        return best_digit;
    }
    for (size_t i = 0; i < K_SIGMA_DIGITS; ++i) {
        if (state->digits[i].syll_count > 0U) {
            *have_digit = true;
            return i;
        }
    }
    return 0U;
}

static float sigma_token_score(const KSigmaToken *tk, int mode) {
    if (!tk) return 0.0f;
    float base = (float)tk->count;
    size_t len = strlen(tk->token);
    switch (mode) {
        case K_SIGMA_VOTE_RESONANT:
            base *= 1.0f + 0.1f * (float)(len > 0U ? len - 1U : 0U);
            break;
        case K_SIGMA_VOTE_COUNTERFACTUAL:
            base *= (tk->count > 1U) ? 0.85f : 1.1f;
            break;
        default:
            break;
    }
    return base;
}

static KSigmaToken *sigma_select_token(KSigmaDigit *digit, bool *used, int mode) {
    KSigmaToken *best = NULL;
    float best_score = 0.0f;
    for (size_t i = 0; i < digit->token_count; ++i) {
        if (used[i]) continue;
        KSigmaToken *candidate = &digit->tokens[i];
        float score = sigma_token_score(candidate, mode);
        if (!best || score > best_score) {
            best = candidate;
            best_score = score;
        }
    }
    if (!best) return NULL;
    size_t idx = (size_t)(best - digit->tokens);
    used[idx] = true;
    return best;
}

static int sigma_emit_word(uint8_t *out, size_t cap, size_t *written, const char *word, bool first) {
    size_t w = *written;
    size_t len = strlen(word);
    if (!first) {
        if (w + 1U >= cap) return -1;
        out[w++] = ' ';
    }
    if (w + len >= cap) return -1;
    memcpy(out + w, word, len);
    w += len;
    *written = w;
    return 0;
}

static int sigma_emit_syllable(uint8_t *out, size_t cap, size_t *written, KSigmaDigit *digit, size_t index, bool first) {
    if (digit->syll_count == 0U) return -1;
    size_t idx = index % digit->syll_count;
    const char *word = digit->syllables[idx];
    return sigma_emit_word(out, cap, written, word, first);
}

int k_decode(uintptr_t ptr,
             const uint8_t *in,
             size_t n,
             uint8_t *out,
             size_t cap,
             int temp_q8,
             int topk) {
    if (!ptr || !out || cap == 0U) return -1;
    KSigmaState *state = (KSigmaState *)ptr;
    sigma_state_reset_limits(state);
    bool have_digit = false;
    size_t digit_idx = sigma_pick_digit_from_prompt(in, n, state, &have_digit);
    if (!have_digit) {
        if (cap > 0U) out[0] = '\0';
        return 0;
    }
    KSigmaDigit *digit = &state->digits[digit_idx];
    int limit = topk > 0 ? topk : 1;
    if (limit > (int)digit->token_count) limit = (int)digit->token_count;
    if (limit <= 0) limit = digit->syll_count > 0 ? 1 : 0;

    float breadth = 0.0f;
    float depth = 0.0f;
    size_t written = 0U;
    if (cap > 0U) out[0] = '\0';

    bool *used = NULL;
    if (digit->token_count > 0U) {
        used = calloc(digit->token_count, sizeof(bool));
        if (!used) {
            if (cap > 0U) out[0] = '\0';
            return -4;
        }
    }

    int produced = 0;
    for (int step = 0; step < limit; ++step) {
        KSigmaToken *token = sigma_select_token(digit, used, state->vote_mode);
        if (!token) break;
        float b_add = 1.0f / (float)(token->count ? token->count : 1U);
        float d_add = 1.0f;
        if (!allowed_emit(breadth, depth, b_add, d_add)) {
            continue;
        }
        if (sigma_emit_word(out, cap, &written, token->token, produced == 0)) {
            free(used);
            return -2;
        }
        breadth += b_add;
        depth += d_add;
        produced++;
    }

    free(used);

    if (produced == 0 && digit->syll_count > 0U) {
        float b_add = 0.5f;
        float d_add = 0.5f;
        if (allowed_emit(breadth, depth, b_add, d_add)) {
            if (sigma_emit_syllable(out, cap, &written, digit, 0U, true)) return -3;
            breadth += b_add;
            depth += d_add;
            produced = 1;
        }
    }

    if (produced == 0) {
        if (cap > 0U) out[0] = '\0';
        return 0;
    }

    if (cap > written) out[written] = '\0';

    (void)temp_q8; /* температура пока не используется напрямую */
    return (int)written;
}

int k_digit_add_syll(uintptr_t ptr, uint8_t digit_index, const uint8_t *u8, uint16_t len) {
    if (!ptr || digit_index >= K_SIGMA_DIGITS || (!u8 && len > 0U)) return -1;
    KSigmaState *state = (KSigmaState *)ptr;
    KSigmaDigit *digit = &state->digits[digit_index];
    if (sigma_ensure_syll_cap(state, digit, digit->syll_count + 1U)) return -2;
    char *copy = sigma_copy_word(u8, len);
    if (!copy) return -3;
    digit->syllables[digit->syll_count++] = copy;
    return 0;
}

typedef struct {
    uint8_t *cursor;
    size_t   remaining;
    size_t   written;
} SigmaBuffer;

static int sigma_buf_write(SigmaBuffer *buf, const void *src, size_t len) {
    if (len > buf->remaining) return -1;
    memcpy(buf->cursor, src, len);
    buf->cursor += len;
    buf->remaining -= len;
    buf->written += len;
    return 0;
}

static int sigma_buf_write_u32(SigmaBuffer *buf, uint32_t value) {
    uint32_t le = value;
    return sigma_buf_write(buf, &le, sizeof(le));
}

static int sigma_buf_write_f32(SigmaBuffer *buf, float value) {
    return sigma_buf_write(buf, &value, sizeof(value));
}

int k_state_save(uintptr_t ptr, uint8_t *out, size_t cap) {
    if (!ptr || !out || cap == 0U) return -1;
    KSigmaState *state = (KSigmaState *)ptr;
    sigma_state_reset_limits(state);
    SigmaBuffer buf = { .cursor = out, .remaining = cap, .written = 0U };
    if (sigma_buf_write(&buf, K_SIGMA_MAGIC, 4U)) return -2;
    if (sigma_buf_write_u32(&buf, K_SIGMA_VERSION)) return -2;
    if (sigma_buf_write_f32(&buf, state->breadth_limit)) return -2;
    if (sigma_buf_write_f32(&buf, state->depth_limit)) return -2;
    if (sigma_buf_write_u32(&buf, (uint32_t)state->vote_mode)) return -2;

    for (size_t i = 0; i < K_SIGMA_DIGITS; ++i) {
        KSigmaDigit *digit = &state->digits[i];
        if (sigma_buf_write_u32(&buf, (uint32_t)digit->token_count)) return -2;
        for (size_t t = 0; t < digit->token_count; ++t) {
            KSigmaToken *tk = &digit->tokens[t];
            uint32_t len = (uint32_t)strlen(tk->token);
            if (sigma_buf_write_u32(&buf, len)) return -2;
            if (sigma_buf_write(&buf, tk->token, len)) return -2;
            if (sigma_buf_write_u32(&buf, tk->count)) return -2;
        }
        if (sigma_buf_write_u32(&buf, (uint32_t)digit->syll_count)) return -2;
        for (size_t s = 0; s < digit->syll_count; ++s) {
            uint32_t len = (uint32_t)strlen(digit->syllables[s]);
            if (sigma_buf_write_u32(&buf, len)) return -2;
            if (sigma_buf_write(&buf, digit->syllables[s], len)) return -2;
        }
        uint64_t total = digit->total_count;
        if (sigma_buf_write(&buf, &total, sizeof(total))) return -2;
    }

    if (buf.remaining > 0U) {
        out[buf.written] = 0U;
    }
    return (int)buf.written;
}

static int sigma_buf_read(SigmaBuffer *buf, void *dst, size_t len) {
    if (len > buf->remaining) return -1;
    memcpy(dst, buf->cursor, len);
    buf->cursor += len;
    buf->remaining -= len;
    buf->written += len;
    return 0;
}

static int sigma_buf_read_u32(SigmaBuffer *buf, uint32_t *value) {
    return sigma_buf_read(buf, value, sizeof(uint32_t));
}

static int sigma_buf_read_f32(SigmaBuffer *buf, float *value) {
    return sigma_buf_read(buf, value, sizeof(float));
}

int k_state_load(uintptr_t ptr, const uint8_t *in, size_t n) {
    if (!ptr || !in || n < 4U) return -1;
    KSigmaState *state = (KSigmaState *)ptr;
    SigmaBuffer buf = { .cursor = (uint8_t *)in, .remaining = n, .written = 0U };
    char magic[4];
    if (sigma_buf_read(&buf, magic, 4U)) return -2;
    if (memcmp(magic, K_SIGMA_MAGIC, 4U) != 0) return -3;
    uint32_t version = 0U;
    if (sigma_buf_read_u32(&buf, &version)) return -2;
    if (version != K_SIGMA_VERSION) return -4;
    float breadth = 0.0f, depth = 0.0f;
    uint32_t vote = 0U;
    if (sigma_buf_read_f32(&buf, &breadth)) return -2;
    if (sigma_buf_read_f32(&buf, &depth)) return -2;
    if (sigma_buf_read_u32(&buf, &vote)) return -2;

    for (size_t i = 0; i < K_SIGMA_DIGITS; ++i) {
        sigma_digit_clear(&state->digits[i]);
    }

    state->breadth_limit = breadth;
    state->depth_limit = depth;
    state->vote_mode = (int)vote;
    g_default_breadth = breadth;
    g_default_depth = depth;
    g_default_vote = (int)vote;

    for (size_t i = 0; i < K_SIGMA_DIGITS; ++i) {
        KSigmaDigit *digit = &state->digits[i];
        uint32_t token_count = 0U;
        if (sigma_buf_read_u32(&buf, &token_count)) return -2;
        if (sigma_ensure_token_cap(state, digit, token_count)) return -5;
        for (uint32_t t = 0U; t < token_count; ++t) {
            uint32_t len = 0U;
            if (sigma_buf_read_u32(&buf, &len)) return -2;
            size_t alloc = len ? (size_t)len : 1U;
            uint8_t *tmp = malloc(alloc);
            if (!tmp) return -5;
            if (sigma_buf_read(&buf, tmp, len)) {
                free(tmp);
                return -2;
            }
            if (sigma_ensure_token_cap(state, digit, digit->token_count + 1U)) {
                free(tmp);
                return -5;
            }
            char *copy = sigma_copy_word(tmp, len);
            free(tmp);
            if (!copy) return -5;
            uint32_t count = 0U;
            if (sigma_buf_read_u32(&buf, &count)) {
                free(copy);
                return -2;
            }
            KSigmaToken *tk = &digit->tokens[digit->token_count++];
            tk->token = copy;
            tk->count = count;
            digit->total_count += count;
        }
        uint32_t syll_count = 0U;
        if (sigma_buf_read_u32(&buf, &syll_count)) return -2;
        if (sigma_ensure_syll_cap(state, digit, syll_count)) return -5;
        for (uint32_t s = 0U; s < syll_count; ++s) {
            uint32_t len = 0U;
            if (sigma_buf_read_u32(&buf, &len)) return -2;
            size_t alloc = len ? (size_t)len : 1U;
            uint8_t *tmp = malloc(alloc);
            if (!tmp) return -5;
            if (sigma_buf_read(&buf, tmp, len)) {
                free(tmp);
                return -2;
            }
            char *copy = sigma_copy_word(tmp, len);
            free(tmp);
            if (!copy) return -5;
            digit->syllables[digit->syll_count++] = copy;
        }
        uint64_t total = 0U;
        if (sigma_buf_read(&buf, &total, sizeof(total))) return -2;
        digit->total_count = total;
    }

    return 0;
}

int k_profile(uintptr_t ptr, uint32_t what, uint8_t *out, size_t cap) {
    if (!ptr || !out || cap == 0U) return -1;
    KSigmaState *state = (KSigmaState *)ptr;
    sigma_state_reset_limits(state);
    if (what != K_SIGMA_PROFILE_DIGITS) return -2;
    size_t written = 0U;
    int rc = snprintf((char *)out, cap,
                      "{\"digits\":[%zu,%zu,%zu,%zu,%zu,%zu,%zu,%zu,%zu,%zu],\"breadth\":%.3f,\"depth\":%.3f,\"mode\":%d}",
                      state->digits[0].token_count,
                      state->digits[1].token_count,
                      state->digits[2].token_count,
                      state->digits[3].token_count,
                      state->digits[4].token_count,
                      state->digits[5].token_count,
                      state->digits[6].token_count,
                      state->digits[7].token_count,
                      state->digits[8].token_count,
                      state->digits[9].token_count,
                      state->breadth_limit,
                      state->depth_limit,
                      state->vote_mode);
    if (rc < 0 || (size_t)rc >= cap) return -3;
    written = (size_t)rc;
    if (written < cap) out[written] = '\0';
    return (int)written;
}

int k_set_constraints(float breadth, float depth) {
    if (breadth <= 0.0f || depth <= 0.0f) return -1;
    g_default_breadth = breadth;
    g_default_depth = depth;
    return 0;
}

int k_vote_mode(int mode) {
    int prev = g_default_vote;
    if (mode == K_SIGMA_VOTE_GREEDY || mode == K_SIGMA_VOTE_RESONANT || mode == K_SIGMA_VOTE_COUNTERFACTUAL) {
        g_default_vote = mode;
    }
    return prev;
}
