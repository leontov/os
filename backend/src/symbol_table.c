#include "kolibri/symbol_table.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int kolibri_symbol_table_find(const KolibriSymbolTable *table,
                                     char symbol) {
    if (!table) {
        return -1;
    }
    for (size_t i = 0; i < table->count; ++i) {
        if (table->entries[i].symbol == symbol) {
            return (int)i;
        }
    }
    return -1;
}

static int kolibri_symbol_table_find_digits(const KolibriSymbolTable *table,
                                            const uint8_t digits[KOLIBRI_SYMBOL_DIGITS]) {
    if (!table || !digits) {
        return -1;
    }
    for (size_t i = 0; i < table->count; ++i) {
        if (memcmp(table->entries[i].digits, digits, KOLIBRI_SYMBOL_DIGITS) == 0) {
            return (int)i;
        }
    }
    return -1;
}

static uint64_t decode_u64_be_symbol(const unsigned char *data) {
    uint64_t value = 0;
    for (int i = 0; i < 8; ++i) {
        value = (value << 8) | (uint64_t)data[i];
    }
    return value;
}

static void symbol_deserialize(const unsigned char *bytes, ReasonBlock *block) {
    memset(block, 0, sizeof(*block));
    block->index = decode_u64_be_symbol(bytes);
    block->timestamp = decode_u64_be_symbol(bytes + 8);
    memcpy(block->prev_hash, bytes + 16, KOLIBRI_HASH_SIZE);
    memcpy(block->hmac, bytes + 16 + KOLIBRI_HASH_SIZE, KOLIBRI_HASH_SIZE);
    memcpy(block->event_type, bytes + 16 + KOLIBRI_HASH_SIZE * 2, KOLIBRI_EVENT_TYPE_SIZE);
    memcpy(block->payload, bytes + 16 + KOLIBRI_HASH_SIZE * 2 + KOLIBRI_EVENT_TYPE_SIZE, KOLIBRI_PAYLOAD_SIZE);
}

static void kolibri_symbol_table_log_add(KolibriSymbolTable *table,
                                         char symbol,
                                         const uint8_t digits[KOLIBRI_SYMBOL_DIGITS]) {
    if (!table || !table->genome) {
        return;
    }
    char payload[KOLIBRI_PAYLOAD_SIZE];
    memset(payload, 0, sizeof(payload));
    unsigned int ascii = (unsigned int)(unsigned char)symbol;
    int written = snprintf(payload,
                           sizeof(payload),
                           "%03u%u%u%u",
                           ascii,
                           digits[0],
                           digits[1],
                           digits[2]);
    if (written <= 0 || (size_t)written >= sizeof(payload)) {
        return;
    }
    kg_append(table->genome, "SYMBOL_MAP", payload, NULL);
}

static void kolibri_symbol_table_add_entry(KolibriSymbolTable *table,
                                           char symbol,
                                           const uint8_t digits[KOLIBRI_SYMBOL_DIGITS],
                                           int log_event) {
    if (!table || table->count >= KOLIBRI_SYMBOL_MAX) {
        return;
    }
    KolibriSymbolEntry *entry = &table->entries[table->count++];
    entry->symbol = symbol;
    memcpy(entry->digits, digits, KOLIBRI_SYMBOL_DIGITS);
    table->version += 1U;
    if (log_event) {
        kolibri_symbol_table_log_add(table, symbol, digits);
    }
}

void kolibri_symbol_table_init(KolibriSymbolTable *table, KolibriGenome *genome) {
    if (!table) {
        return;
    }
    memset(table, 0, sizeof(*table));
    table->genome = genome;
}

void kolibri_symbol_table_load(KolibriSymbolTable *table) {
    if (!table || !table->genome || !table->genome->file) {
        return;
    }
    KolibriGenome *ctx = table->genome;
    long original_pos = ftell(ctx->file);
    if (original_pos < 0) {
        original_pos = 0;
    }
    if (fseek(ctx->file, 0, SEEK_SET) != 0) {
        return;
    }
    unsigned char bytes[KOLIBRI_BLOCK_SIZE];
    while (fread(bytes, 1, KOLIBRI_BLOCK_SIZE, ctx->file) == KOLIBRI_BLOCK_SIZE) {
        ReasonBlock block;
        symbol_deserialize(bytes, &block);
        if (strncmp(block.event_type, "SYMBOL_MAP", KOLIBRI_EVENT_TYPE_SIZE) != 0) {
            continue;
        }
        char payload[KOLIBRI_PAYLOAD_SIZE + 1];
        memcpy(payload, block.payload, KOLIBRI_PAYLOAD_SIZE);
        payload[KOLIBRI_PAYLOAD_SIZE] = '\0';
        unsigned int ascii = 0;
        unsigned int d0 = 0, d1 = 0, d2 = 0;
        if (sscanf(payload, "%03u%1u%1u%1u", &ascii, &d0, &d1, &d2) != 4) {
            continue;
        }
        char symbol = (char)(unsigned char)ascii;
        uint8_t digits[KOLIBRI_SYMBOL_DIGITS] = { (uint8_t)d0, (uint8_t)d1, (uint8_t)d2 };
        if (kolibri_symbol_table_find(table, symbol) >= 0) {
            continue;
        }
        kolibri_symbol_table_add_entry(table, symbol, digits, 0);
    }
    fseek(ctx->file, original_pos, SEEK_SET);
}

static void kolibri_symbol_table_next_digits(KolibriSymbolTable *table,
                                             uint8_t out_digits[KOLIBRI_SYMBOL_DIGITS]) {
    size_t index = table->count;
    /* простое последовательное распределение */
    out_digits[0] = (uint8_t)((index / 100U) % 10U);
    out_digits[1] = (uint8_t)((index / 10U) % 10U);
    out_digits[2] = (uint8_t)(index % 10U);
}

int kolibri_symbol_encode(KolibriSymbolTable *table, char symbol, uint8_t out_digits[KOLIBRI_SYMBOL_DIGITS]) {
    if (!table || !out_digits) {
        return -1;
    }
    int index = kolibri_symbol_table_find(table, symbol);
    if (index >= 0) {
        memcpy(out_digits, table->entries[index].digits, KOLIBRI_SYMBOL_DIGITS);
        return 0;
    }
    uint8_t digits[KOLIBRI_SYMBOL_DIGITS];
    kolibri_symbol_table_next_digits(table, digits);
    kolibri_symbol_table_add_entry(table, symbol, digits, 1);
    memcpy(out_digits, digits, KOLIBRI_SYMBOL_DIGITS);
    return 0;
}

int kolibri_symbol_decode(const KolibriSymbolTable *table, const uint8_t digits[KOLIBRI_SYMBOL_DIGITS], char *out_symbol) {
    if (!table || !digits || !out_symbol) {
        return -1;
    }
    int index = kolibri_symbol_table_find_digits(table, digits);
    if (index < 0) {
        return -1;
    }
    *out_symbol = table->entries[index].symbol;
    return 0;
}
