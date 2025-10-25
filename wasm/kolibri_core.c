#include <math.h>
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#if __STDC_VERSION__ >= 201112L
#include <stdalign.h>
#else
#define alignof(type) __alignof__(type)
#endif

#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE __attribute__((used))
#endif

#define K_DIGIT_COUNT 10
#define K_MAX_LEVELS 4
#define K_VM_STACK_MAX 32
#define K_VM_PROGRAM_MAX 64
#define K_WINDOW 128
#define K_MAX_TOKEN 128
#define K_SAVE_VERSION 1u
#define K_PAGE_SIZE 4096u
#define K_DEFAULT_B_LIMIT 240.0
#define K_DEFAULT_D_LIMIT 160.0
#define K_MIN_TOPK 1
#define K_MAX_TOPK 10
#define K_MAX_PROFILE 4096

/* -------------------------- Bump arena allocator -------------------------- */

typedef struct KArenaPage {
    uint8_t *data;
    size_t capacity;
    size_t offset;
    struct KArenaPage *next;
} KArenaPage;

typedef struct {
    KArenaPage *head;
    KArenaPage *current;
    size_t page_size;
    size_t fragmentation;
} KArena;

static KArenaPage *k_arena_page_create(size_t page_size) {
    KArenaPage *page = (KArenaPage *)malloc(sizeof(KArenaPage));
    if (!page) {
        return NULL;
    }
    page->data = (uint8_t *)malloc(page_size);
    if (!page->data) {
        free(page);
        return NULL;
    }
    page->capacity = page_size;
    page->offset = 0u;
    page->next = NULL;
    return page;
}

static void k_arena_init(KArena *arena, size_t page_size) {
    arena->head = NULL;
    arena->current = NULL;
    arena->page_size = page_size ? page_size : K_PAGE_SIZE;
    arena->fragmentation = 0u;
}

static void k_arena_dispose(KArena *arena) {
    KArenaPage *page = arena->head;
    while (page) {
        KArenaPage *next = page->next;
        free(page->data);
        free(page);
        page = next;
    }
    arena->head = NULL;
    arena->current = NULL;
    arena->fragmentation = 0u;
}

static void k_arena_reset(KArena *arena) {
    KArenaPage *page = arena->head;
    while (page) {
        page->offset = 0u;
        page = page->next;
    }
    arena->current = arena->head;
}

static void *k_arena_alloc(KArena *arena, size_t size, size_t alignment) {
    if (alignment == 0u) {
        alignment = sizeof(void *);
    }
    if (!arena->current) {
        arena->head = k_arena_page_create(arena->page_size);
        arena->current = arena->head;
        if (!arena->current) {
            return NULL;
        }
    }

    KArenaPage *page = arena->current;
    size_t aligned_offset = (page->offset + alignment - 1u) & ~(alignment - 1u);
    if (aligned_offset + size > page->capacity) {
        arena->fragmentation += (uint32_t)(page->capacity - page->offset);
        if (!page->next) {
            page->next = k_arena_page_create(arena->page_size);
            if (!page->next) {
                return NULL;
            }
        }
        arena->current = page->next;
        page = arena->current;
        page->offset = 0u;
        aligned_offset = 0u;
    }

    void *ptr = page->data + aligned_offset;
    page->offset = aligned_offset + size;
    return ptr;
}

/* -------------------------- Reversible sketches -------------------------- */

typedef struct {
    uint64_t state;
    uint64_t checksum;
} KSketch;

static uint64_t k_rotl64(uint64_t value, uint32_t amount) {
    return (value << amount) | (value >> (64u - amount));
}

static void k_sketch_init(KSketch *sk, uint64_t seed) {
    sk->state = seed ? seed : 0x9e3779b97f4a7c15ull;
    sk->checksum = sk->state ^ 0xa5a5a5a5a5a5a5a5ull;
}

static void k_sketch_update(KSketch *sk, const uint8_t *data, size_t len) {
    for (size_t i = 0; i < len; ++i) {
        uint64_t byte = (uint64_t)data[i];
        sk->state ^= k_rotl64(byte + 0x51edce6full, (uint32_t)(i % 31u));
        sk->state = k_rotl64(sk->state, 7u) + 0x9e3779b97f4a7c15ull;
        sk->checksum ^= k_rotl64(sk->state, (uint32_t)((sk->state >> 58u) & 0x1fu));
    }
}

static uint64_t k_sketch_compose(uint64_t a, uint64_t b) {
    return k_rotl64(a, 17u) ^ k_rotl64(b, 29u) ^ (a + 0x632be59bd9b4e019ull * b);
}

static uint64_t k_sketch_hint(const KSketch *sk, uint64_t salt) {
    return k_rotl64(sk->checksum, 11u) ^ (sk->state + salt * 0x100000001b3ull);
}

/* ----------------------------- Random helpers ----------------------------- */

static uint64_t k_splitmix64(uint64_t *state) {
    uint64_t z = (*state += 0x9e3779b97f4a7c15ull);
    z = (z ^ (z >> 30u)) * 0xbf58476d1ce4e5b9ull;
    z = (z ^ (z >> 27u)) * 0x94d049bb133111ebull;
    return z ^ (z >> 31u);
}

static float k_random_float(uint64_t *state) {
    return (float)((k_splitmix64(state) >> 8u) * (1.0 / (double)(1ull << 56u)));
}

static uint32_t k_random_u32(uint64_t *state, uint32_t bound) {
    uint64_t threshold = ((uint64_t)(-(int64_t)bound)) % bound;
    for (;;) {
        uint64_t r = k_splitmix64(state);
        if (r >= threshold) {
            return (uint32_t)(r % bound);
        }
    }
}

/* --------------------------- Directed acyclic DAWG ------------------------ */

typedef struct KDaawgNode KDaawgNode;

typedef struct {
    uint32_t symbol;
    uint32_t frequency;
    uint8_t flags;
    uint8_t padding[3];
    KDaawgNode *target;
} KDaawgEdge;

struct KDaawgNode {
    uint32_t id;
    uint32_t depth;
    uint32_t frequency;
    uint32_t signature;
    uint16_t child_count;
    uint16_t child_capacity;
    uint8_t is_attractor;
    uint8_t boundary_flags;
    uint8_t reserved[2];
    KDaawgEdge *children;
    uint64_t sketch;
};

typedef struct {
    uint64_t signature;
    KDaawgNode *node;
} KDaawgBucket;

typedef struct {
    KArena arena;
    KDaawgNode *root;
    KDaawgBucket *dedupe;
    size_t dedupe_capacity;
    size_t node_count;
    size_t edge_count;
} KDaawg;

static uint64_t k_daawg_signature(const KDaawgNode *node) {
    uint64_t sig = ((uint64_t)node->frequency << 32u) ^ (uint64_t)node->child_count;
    for (uint16_t i = 0; i < node->child_count; ++i) {
        const KDaawgEdge *edge = &node->children[i];
        sig = k_sketch_compose(sig ^ (edge->symbol * 0x9e3779b1u), edge->target ? edge->target->sketch : 0u);
        sig ^= ((uint64_t)edge->frequency << (i & 31u));
    }
    return sig;
}

static void k_daawg_init(KDaawg *graph) {
    k_arena_init(&graph->arena, K_PAGE_SIZE);
    graph->root = NULL;
    graph->dedupe = NULL;
    graph->dedupe_capacity = 0u;
    graph->node_count = 0u;
    graph->edge_count = 0u;
}

static void k_daawg_dispose(KDaawg *graph) {
    if (graph->dedupe) {
        free(graph->dedupe);
        graph->dedupe = NULL;
    }
    k_arena_dispose(&graph->arena);
    graph->root = NULL;
    graph->dedupe_capacity = 0u;
    graph->node_count = 0u;
    graph->edge_count = 0u;
}

static KDaawgNode *k_daawg_new_node(KDaawg *graph, uint32_t depth) {
    KDaawgNode *node = (KDaawgNode *)k_arena_alloc(&graph->arena, sizeof(KDaawgNode), alignof(KDaawgNode));
    if (!node) {
        return NULL;
    }
    node->id = (uint32_t)graph->node_count++;
    node->depth = depth;
    node->frequency = 0u;
    node->signature = 0u;
    node->child_count = 0u;
    node->child_capacity = 0u;
    node->is_attractor = 0u;
    node->boundary_flags = 0u;
    node->children = NULL;
    node->sketch = 0u;
    return node;
}

static bool k_daawg_nodes_equivalent(const KDaawgNode *lhs, const KDaawgNode *rhs) {
    if (lhs->frequency != rhs->frequency || lhs->child_count != rhs->child_count) {
        return false;
    }
    if (lhs->is_attractor != rhs->is_attractor || lhs->boundary_flags != rhs->boundary_flags) {
        return false;
    }
    for (uint16_t i = 0; i < lhs->child_count; ++i) {
        const KDaawgEdge *le = &lhs->children[i];
        const KDaawgEdge *re = &rhs->children[i];
        if (le->symbol != re->symbol || le->frequency != re->frequency || le->flags != re->flags) {
            return false;
        }
        if (le->target != re->target) {
            return false;
        }
    }
    return true;
}

static KDaawgNode *k_daawg_dedupe(KDaawg *graph, KDaawgNode *node) {
    if (!graph->dedupe) {
        graph->dedupe_capacity = 1024u;
        graph->dedupe = (KDaawgBucket *)calloc(graph->dedupe_capacity, sizeof(KDaawgBucket));
        if (!graph->dedupe) {
            return node;
        }
    }

    uint64_t signature = k_daawg_signature(node);
    node->signature = (uint32_t)(signature & 0xffffffffu);
    size_t mask = graph->dedupe_capacity - 1u;
    size_t index = (size_t)(signature & mask);
    for (;;) {
        KDaawgBucket *bucket = &graph->dedupe[index];
        if (!bucket->node) {
            bucket->node = node;
            bucket->signature = signature;
            return node;
        }
        if (bucket->signature == signature && k_daawg_nodes_equivalent(bucket->node, node)) {
            return bucket->node;
        }
        index = (index + 1u) & mask;
    }
}

static int k_daawg_reserve_children(KDaawgNode *node, KArena *arena, uint16_t capacity) {
    if (node->child_capacity >= capacity) {
        return 0;
    }
    KDaawgEdge *next = (KDaawgEdge *)k_arena_alloc(arena, sizeof(KDaawgEdge) * capacity, alignof(KDaawgEdge));
    if (!next) {
        return -1;
    }
    if (node->child_count) {
        memcpy(next, node->children, sizeof(KDaawgEdge) * node->child_count);
    }
    node->children = next;
    node->child_capacity = capacity;
    return 0;
}

static KDaawgEdge *k_daawg_get_child(KDaawgNode *node, uint32_t symbol) {
    for (uint16_t i = 0; i < node->child_count; ++i) {
        if (node->children[i].symbol == symbol) {
            return &node->children[i];
        }
    }
    return NULL;
}

static KDaawgEdge *k_daawg_add_child(KDaawg *graph, KDaawgNode *node, uint32_t symbol) {
    if (node->child_count == node->child_capacity) {
        uint16_t next_capacity = node->child_capacity ? (uint16_t)(node->child_capacity * 2u) : 2u;
        if (next_capacity < node->child_capacity) {
            next_capacity = (uint16_t)(node->child_capacity + 4u);
        }
        if (k_daawg_reserve_children(node, &graph->arena, next_capacity) != 0) {
            return NULL;
        }
    }
    KDaawgEdge *edge = &node->children[node->child_count++];
    edge->symbol = symbol;
    edge->frequency = 0u;
    edge->flags = 0u;
    edge->target = NULL;
    graph->edge_count += 1u;
    return edge;
}

static void k_daawg_update_attractor(KDaawgNode *node) {
    node->is_attractor = (uint8_t)((node->frequency > 8u && node->child_count > 1u) ? 1u : 0u);
}

static int k_daawg_insert(KDaawg *graph, const uint8_t *data, size_t len, uint32_t boundary_mask) {
    if (!graph->root) {
        graph->root = k_daawg_new_node(graph, 0u);
        if (!graph->root) {
            return -1;
        }
        k_sketch_init((KSketch *)&graph->root->sketch, 0x1234u);
    }

    KDaawgNode *node = graph->root;
    node->frequency += 1u;
    k_daawg_update_attractor(node);

    for (size_t i = 0; i < len; ++i) {
        uint32_t symbol = (uint32_t)data[i];
        KDaawgEdge *edge = k_daawg_get_child(node, symbol);
        if (!edge) {
            edge = k_daawg_add_child(graph, node, symbol);
            if (!edge) {
                return -1;
            }
            KDaawgNode *child = k_daawg_new_node(graph, node->depth + 1u);
            if (!child) {
                return -1;
            }
            child->sketch = node->sketch ^ k_sketch_compose((uint64_t)symbol, node->depth + 1u);
            edge->target = k_daawg_dedupe(graph, child);
        }
        edge->frequency += 1u;
        node = edge->target;
        if (!node) {
            return -1;
        }
        node->frequency += 1u;
        if (i + 1u == len) {
            node->boundary_flags |= (uint8_t)boundary_mask;
        }
        k_daawg_update_attractor(node);
        node->sketch ^= k_sketch_compose(node->sketch, (uint64_t)symbol + ((uint64_t)node->frequency << 1u));
    }

    return 0;
}

static size_t k_daawg_collect(const KDaawgNode *node, uint8_t *buffer, size_t capacity, size_t depth) {
    if (!node || !buffer) {
        return 0u;
    }
    size_t length = 0u;
    if (node->boundary_flags && depth < capacity) {
        buffer[length++] = (uint8_t)node->boundary_flags;
    }
    for (uint16_t i = 0; i < node->child_count && length + 9u < capacity; ++i) {
        const KDaawgEdge *edge = &node->children[i];
        buffer[length++] = (uint8_t)edge->symbol;
        uint32_t freq = edge->frequency;
        memcpy(buffer + length, &freq, sizeof(uint32_t));
        length += sizeof(uint32_t);
    }
    return length;
}

static size_t k_daawg_generate(const KDaawg *graph, char *output, size_t capacity, double *delta_b, double *delta_d, uint64_t *rng) {
    if (!graph->root || capacity == 0u) {
        return 0u;
    }
    const KDaawgNode *node = graph->root;
    size_t written = 0u;
    double coverage = 0.0;
    double depth = 0.0;

    while (written + 1u < capacity && node && node->child_count > 0u) {
        uint32_t best = 0u;
        float best_score = -1.0e9f;
        for (uint16_t i = 0; i < node->child_count; ++i) {
            const KDaawgEdge *edge = &node->children[i];
            float base = (float)edge->frequency;
            float noise = (k_random_float(rng) - 0.5f) * 0.1f;
            float score = base + noise + (edge->flags ? 1.0f : 0.0f);
            if (score > best_score) {
                best_score = score;
                best = i;
            }
        }
        const KDaawgEdge *edge = &node->children[best];
        uint8_t symbol = (uint8_t)(edge->symbol & 0xffu);
        output[written++] = (char)symbol;
        coverage += 1.0;
        depth = (double)node->depth;
        node = edge->target;
        if (node && node->boundary_flags) {
            break;
        }
    }

    if (delta_b) {
        *delta_b = coverage;
    }
    if (delta_d) {
        *delta_d = depth;
    }
    if (written < capacity) {
        output[written] = '\0';
    }
    return written;
}

/* ------------------------------ Micro VM --------------------------------- */

typedef enum {
    K_VM_OP_END = 0,
    K_VM_OP_PUSH_CONST = 1,
    K_VM_OP_PUSH_CTX = 2,
    K_VM_OP_ADD = 3,
    K_VM_OP_SUB = 4,
    K_VM_OP_MUL = 5,
    K_VM_OP_DIV = 6,
    K_VM_OP_MIN = 7,
    K_VM_OP_MAX = 8,
    K_VM_OP_SIGMOID = 9,
    K_VM_OP_TANH = 10,
    K_VM_OP_ABS = 11,
    K_VM_OP_CLAMP01 = 12,
    K_VM_OP_NOISE = 13,
} KVmOpcode;

typedef struct {
    uint8_t opcode;
    uint8_t operand_index;
    float operand_value;
} KVmInstr;

typedef struct {
    uint16_t length;
    KVmInstr code[K_VM_PROGRAM_MAX];
} KVmProgram;

static float k_vm_sigmoid(float value) {
    return 1.0f / (1.0f + expf(-value));
}

static float k_vm_exec(const KVmProgram *program, const float *ctx, size_t ctx_len, uint64_t *rng) {
    float stack[K_VM_STACK_MAX];
    size_t sp = 0u;
    for (uint16_t ip = 0u; ip < program->length && ip < K_VM_PROGRAM_MAX; ++ip) {
        const KVmInstr *instr = &program->code[ip];
        switch ((KVmOpcode)instr->opcode) {
            case K_VM_OP_END:
                return sp ? stack[sp - 1u] : 0.0f;
            case K_VM_OP_PUSH_CONST:
                if (sp < K_VM_STACK_MAX) {
                    stack[sp++] = instr->operand_value;
                }
                break;
            case K_VM_OP_PUSH_CTX: {
                uint8_t index = instr->operand_index;
                float value = (index < ctx_len) ? ctx[index] : 0.0f;
                if (sp < K_VM_STACK_MAX) {
                    stack[sp++] = value;
                }
                break;
            }
            case K_VM_OP_ADD:
                if (sp >= 2u) {
                    stack[sp - 2u] = stack[sp - 2u] + stack[sp - 1u];
                    sp -= 1u;
                }
                break;
            case K_VM_OP_SUB:
                if (sp >= 2u) {
                    stack[sp - 2u] = stack[sp - 2u] - stack[sp - 1u];
                    sp -= 1u;
                }
                break;
            case K_VM_OP_MUL:
                if (sp >= 2u) {
                    stack[sp - 2u] = stack[sp - 2u] * stack[sp - 1u];
                    sp -= 1u;
                }
                break;
            case K_VM_OP_DIV:
                if (sp >= 2u) {
                    float denom = stack[sp - 1u];
                    stack[sp - 2u] = denom != 0.0f ? stack[sp - 2u] / denom : stack[sp - 2u];
                    sp -= 1u;
                }
                break;
            case K_VM_OP_MIN:
                if (sp >= 2u) {
                    stack[sp - 2u] = fminf(stack[sp - 2u], stack[sp - 1u]);
                    sp -= 1u;
                }
                break;
            case K_VM_OP_MAX:
                if (sp >= 2u) {
                    stack[sp - 2u] = fmaxf(stack[sp - 2u], stack[sp - 1u]);
                    sp -= 1u;
                }
                break;
            case K_VM_OP_SIGMOID:
                if (sp >= 1u) {
                    stack[sp - 1u] = k_vm_sigmoid(stack[sp - 1u]);
                }
                break;
            case K_VM_OP_TANH:
                if (sp >= 1u) {
                    stack[sp - 1u] = tanhf(stack[sp - 1u]);
                }
                break;
            case K_VM_OP_ABS:
                if (sp >= 1u) {
                    stack[sp - 1u] = fabsf(stack[sp - 1u]);
                }
                break;
            case K_VM_OP_CLAMP01:
                if (sp >= 1u) {
                    float value = stack[sp - 1u];
                    if (value < 0.0f) {
                        value = 0.0f;
                    } else if (value > 1.0f) {
                        value = 1.0f;
                    }
                    stack[sp - 1u] = value;
                }
                break;
            case K_VM_OP_NOISE:
                if (sp < K_VM_STACK_MAX) {
                    stack[sp++] = (k_random_float(rng) - 0.5f) * instr->operand_value;
                }
                break;
            default:
                break;
        }
    }
    return sp ? stack[sp - 1u] : 0.0f;
}

static void k_vm_fill_default(KVmProgram *program, float bias) {
    program->length = 0u;
    program->code[program->length++] = (KVmInstr){ .opcode = K_VM_OP_PUSH_CONST, .operand_value = bias };
    program->code[program->length++] = (KVmInstr){ .opcode = K_VM_OP_END };
}

/* ------------------------------- Digits ----------------------------------- */

typedef struct {
    KDaawg graph;
    KSketch level_sketch[K_MAX_LEVELS];
    float bias[ K_DIGIT_COUNT ];
    float energy;
    float phase;
    float logits[K_DIGIT_COUNT];
    float weight;
    KVmProgram vm_g;
    KVmProgram vm_d;
    KVmProgram vm_v;
    double budget_b;
    double budget_d;
} KDigit;

typedef struct {
    KDigit digits[K_DIGIT_COUNT];
    double limit_b;
    double limit_d;
    double window_b[K_WINDOW];
    double window_d[K_WINDOW];
    uint32_t window_index;
    uint32_t window_size;
    uint64_t rng_state;
    double transitions[K_DIGIT_COUNT][K_DIGIT_COUNT];
    double usage[K_DIGIT_COUNT];
    KSketch summary_sketch;
} KState;

typedef struct {
    double lambda_b;
    double lambda_d;
    double target_b;
    double target_d;
    double temperature;
    int top_k;
    int cf_beam;
} KBridgeControls;

static KState *g_state = NULL;
static KBridgeControls g_controls = {
    .lambda_b = 0.25,
    .lambda_d = 0.2,
    .target_b = NAN,
    .target_d = NAN,
    .temperature = 0.85,
    .top_k = 4,
    .cf_beam = 1,
};

static void k_digit_init(KDigit *digit, uint32_t seed) {
    k_daawg_init(&digit->graph);
    for (size_t i = 0; i < K_MAX_LEVELS; ++i) {
        k_sketch_init(&digit->level_sketch[i], k_rotl64(seed, (uint32_t)i + 1u));
    }
    for (size_t i = 0; i < K_DIGIT_COUNT; ++i) {
        digit->bias[i] = 0.0f;
        digit->logits[i] = 0.0f;
    }
    digit->energy = 0.0f;
    digit->phase = 0.0f;
    digit->weight = 1.0f;
    k_vm_fill_default(&digit->vm_g, 0.05f);
    k_vm_fill_default(&digit->vm_d, 0.1f);
    k_vm_fill_default(&digit->vm_v, 0.0f);
    digit->budget_b = 0.0;
    digit->budget_d = 0.0;
}

static void k_digit_dispose(KDigit *digit) {
    k_daawg_dispose(&digit->graph);
}

static void k_state_clear_windows(KState *state) {
    for (size_t i = 0; i < K_WINDOW; ++i) {
        state->window_b[i] = 0.0;
        state->window_d[i] = 0.0;
    }
    state->window_index = 0u;
    state->window_size = 0u;
}

static void k_state_push_window(KState *state, double b, double d) {
    if (state->window_size < K_WINDOW) {
        state->window_size += 1u;
    }
    state->window_b[state->window_index] = b;
    state->window_d[state->window_index] = d;
    state->window_index = (state->window_index + 1u) % K_WINDOW;
}

static double k_state_sum_window(const double *values, uint32_t size) {
    double total = 0.0;
    for (uint32_t i = 0u; i < size; ++i) {
        total += values[i];
    }
    return total;
}

static void k_state_recompute_budgets(KState *state) {
    double total_b = k_state_sum_window(state->window_b, state->window_size);
    double total_d = k_state_sum_window(state->window_d, state->window_size);
    for (size_t i = 0; i < K_DIGIT_COUNT; ++i) {
        state->digits[i].budget_b = total_b;
        state->digits[i].budget_d = total_d;
    }
}

static void k_state_init(KState *state) {
    state->limit_b = K_DEFAULT_B_LIMIT;
    state->limit_d = K_DEFAULT_D_LIMIT;
    state->rng_state = 0x42ull ^ (uintptr_t)state;
    k_sketch_init(&state->summary_sketch, 0x5a5aa5a5a5a5a5a5ull);
    for (size_t i = 0; i < K_DIGIT_COUNT; ++i) {
        k_digit_init(&state->digits[i], (uint32_t)(0x1234u + i * 37u));
        for (size_t j = 0; j < K_DIGIT_COUNT; ++j) {
            state->digits[i].bias[j] = (float)((i == j) ? 0.2 : 0.05);
            state->transitions[i][j] = 0.1;
        }
        state->usage[i] = 0.0;
    }
    k_state_clear_windows(state);
}

static void k_state_dispose(KState *state) {
    for (size_t i = 0; i < K_DIGIT_COUNT; ++i) {
        k_digit_dispose(&state->digits[i]);
    }
}

/* -------------------------- Observation pipeline ------------------------- */

static void k_digit_apply_vm(KDigit *digit, const float *ctx, size_t ctx_len, uint64_t *rng) {
    digit->energy = k_vm_exec(&digit->vm_g, ctx, ctx_len, rng);
    digit->phase = k_vm_exec(&digit->vm_d, ctx, ctx_len, rng);
    digit->weight = 1.0f + k_vm_exec(&digit->vm_v, ctx, ctx_len, rng);
    if (digit->weight < 0.1f) {
        digit->weight = 0.1f;
    }
    if (digit->weight > 10.0f) {
        digit->weight = 10.0f;
    }
}

static uint32_t k_token_digit(const char *token, size_t len) {
    if (len == 0u) {
        return 0u;
    }
    uint32_t accum = 0u;
    for (size_t i = 0; i < len; ++i) {
        accum = (accum * 33u + (uint32_t)(unsigned char)token[i]) % K_DIGIT_COUNT;
    }
    return accum % K_DIGIT_COUNT;
}

static void k_observe_token(KState *state, const char *token, size_t len) {
    if (!state || len == 0u) {
        return;
    }
    uint32_t digit_index = k_token_digit(token, len);
    KDigit *digit = &state->digits[digit_index];
    k_daawg_insert(&digit->graph, (const uint8_t *)token, len, 1u);
    k_sketch_update(&digit->level_sketch[0], (const uint8_t *)token, len);
    double coverage = (double)len;
    double depth = len > 0u ? log2((double)len + 1.0) : 0.0;
    state->usage[digit_index] += 1.0;
    k_state_push_window(state, coverage, depth);
    k_state_recompute_budgets(state);
}

static void k_parse_observation(KState *state, const char *text, size_t len) {
    size_t start = 0u;
    for (size_t i = 0; i <= len; ++i) {
        bool is_end = i == len || text[i] == ' ' || text[i] == '\n' || text[i] == '\t' || text[i] == '\r';
        if (!is_end) {
            continue;
        }
        size_t token_len = i - start;
        if (token_len > 0u) {
            if (token_len > K_MAX_TOKEN) {
                token_len = K_MAX_TOKEN;
            }
            k_observe_token(state, text + start, token_len);
        }
        start = i + 1u;
    }
}

static void k_refresh_digit_programs(KState *state) {
    float ctx[16];
    for (size_t i = 0; i < K_DIGIT_COUNT; ++i) {
        ctx[0] = (float)(state->usage[i]);
        ctx[1] = (float)(state->digits[i].budget_b);
        ctx[2] = (float)(state->digits[i].budget_d);
        ctx[3] = (float)(state->limit_b);
        ctx[4] = (float)(state->limit_d);
        ctx[5] = (float)(state->digits[i].energy);
        ctx[6] = (float)(state->digits[i].phase);
        ctx[7] = (float)(state->digits[i].weight);
        ctx[8] = (float)(i);
        ctx[9] = (float)(state->window_size);
        ctx[10] = (float)(state->transitions[i][i]);
        ctx[11] = (float)(state->usage[(i + 1u) % K_DIGIT_COUNT]);
        ctx[12] = (float)k_random_float(&state->rng_state);
        ctx[13] = 1.0f;
        ctx[14] = (float)(state->digits[i].bias[i]);
        ctx[15] = (float)(state->digits[i].logits[i]);
        k_digit_apply_vm(&state->digits[i], ctx, 16u, &state->rng_state);
    }
}

/* ---------------------------- Resonance voting --------------------------- */

static void k_resonance_scores(KState *state, float temperature, int topk, float *scores) {
    float baseline_phase[K_DIGIT_COUNT];
    for (size_t i = 0; i < K_DIGIT_COUNT; ++i) {
        baseline_phase[i] = state->digits[i].phase;
        for (size_t j = 0; j < K_DIGIT_COUNT; ++j) {
            float phase_delta = state->digits[i].phase - baseline_phase[j];
            float resonance = cosf(phase_delta);
            float logit = state->digits[i].bias[j] + state->digits[i].energy;
            scores[j] += state->digits[i].weight * logit * resonance;
        }
    }
    if (temperature <= 0.0f) {
        temperature = 1.0f;
    }
    for (size_t j = 0; j < K_DIGIT_COUNT; ++j) {
        scores[j] /= temperature;
        if (topk > 1) {
            scores[j] += (float)k_random_float(&state->rng_state) * 0.01f;
        }
    }
}

static uint32_t k_select_digit(KState *state, float temperature, int topk) {
    float scores[K_DIGIT_COUNT];
    for (size_t i = 0; i < K_DIGIT_COUNT; ++i) {
        scores[i] = -1000.0f;
    }
    k_resonance_scores(state, temperature, topk, scores);

    uint32_t order[K_DIGIT_COUNT];
    for (uint32_t i = 0u; i < K_DIGIT_COUNT; ++i) {
        order[i] = i;
    }
    for (uint32_t i = 0u; i < K_DIGIT_COUNT; ++i) {
        for (uint32_t j = i + 1u; j < K_DIGIT_COUNT; ++j) {
            if (scores[order[j]] > scores[order[i]]) {
                uint32_t tmp = order[i];
                order[i] = order[j];
                order[j] = tmp;
            }
        }
    }

    uint32_t limit = (uint32_t)(topk < K_MIN_TOPK ? K_MIN_TOPK : topk);
    if (limit > K_DIGIT_COUNT) {
        limit = K_DIGIT_COUNT;
    }
    uint32_t selected = order[0];
    if (limit > 1u) {
        uint32_t idx = k_random_u32(&state->rng_state, limit);
        selected = order[idx];
    }
    return selected % K_DIGIT_COUNT;
}

/* ----------------------------- API functions ----------------------------- */

EMSCRIPTEN_KEEPALIVE
KState *k_state_new(void) {
    if (g_state) {
        k_state_dispose(g_state);
        free(g_state);
        g_state = NULL;
    }
    g_state = (KState *)calloc(1u, sizeof(KState));
    if (!g_state) {
        return NULL;
    }
    k_state_init(g_state);
    return g_state;
}

EMSCRIPTEN_KEEPALIVE
void k_state_free(void) {
    if (g_state) {
        k_state_dispose(g_state);
        free(g_state);
        g_state = NULL;
    }
}

EMSCRIPTEN_KEEPALIVE
size_t k_state_save(uint8_t *buffer, size_t capacity) {
    if (!g_state || !buffer || capacity < sizeof(uint32_t) * 6u) {
        return 0u;
    }
    uint8_t *cursor = buffer;
    const uint8_t *end = buffer + capacity;
    if ((size_t)(end - cursor) < sizeof(uint32_t)) {
        return 0u;
    }
    uint32_t version = K_SAVE_VERSION;
    memcpy(cursor, &version, sizeof(uint32_t));
    cursor += sizeof(uint32_t);

    double limits[2] = { g_state->limit_b, g_state->limit_d };
    if ((size_t)(end - cursor) < sizeof(limits)) {
        return 0u;
    }
    memcpy(cursor, limits, sizeof(limits));
    cursor += sizeof(limits);

    if ((size_t)(end - cursor) < sizeof(g_state->usage)) {
        return 0u;
    }
    memcpy(cursor, g_state->usage, sizeof(g_state->usage));
    cursor += sizeof(g_state->usage);

    if ((size_t)(end - cursor) < sizeof(g_state->transitions)) {
        return 0u;
    }
    memcpy(cursor, g_state->transitions, sizeof(g_state->transitions));
    cursor += sizeof(g_state->transitions);

    if ((size_t)(end - cursor) < sizeof(g_state->window_b) + sizeof(g_state->window_d)) {
        return 0u;
    }
    memcpy(cursor, g_state->window_b, sizeof(g_state->window_b));
    cursor += sizeof(g_state->window_b);
    memcpy(cursor, g_state->window_d, sizeof(g_state->window_d));
    cursor += sizeof(g_state->window_d);

    if ((size_t)(end - cursor) < sizeof(uint32_t) * 2u + sizeof(uint64_t)) {
        return 0u;
    }
    memcpy(cursor, &g_state->window_index, sizeof(uint32_t));
    cursor += sizeof(uint32_t);
    memcpy(cursor, &g_state->window_size, sizeof(uint32_t));
    cursor += sizeof(uint32_t);
    memcpy(cursor, &g_state->rng_state, sizeof(uint64_t));
    cursor += sizeof(uint64_t);

    for (size_t d = 0; d < K_DIGIT_COUNT; ++d) {
        const KDigit *digit = &g_state->digits[d];
        if ((size_t)(end - cursor) < sizeof(digit->bias)) {
            return 0u;
        }
        memcpy(cursor, digit->bias, sizeof(digit->bias));
        cursor += sizeof(digit->bias);
        if ((size_t)(end - cursor) < sizeof(digit->energy) + sizeof(digit->phase) + sizeof(digit->weight)) {
            return 0u;
        }
        memcpy(cursor, &digit->energy, sizeof(digit->energy));
        cursor += sizeof(digit->energy);
        memcpy(cursor, &digit->phase, sizeof(digit->phase));
        cursor += sizeof(digit->phase);
        memcpy(cursor, &digit->weight, sizeof(digit->weight));
        cursor += sizeof(digit->weight);
        if ((size_t)(end - cursor) < sizeof(digit->budget_b) + sizeof(digit->budget_d)) {
            return 0u;
        }
        memcpy(cursor, &digit->budget_b, sizeof(digit->budget_b));
        cursor += sizeof(digit->budget_b);
        memcpy(cursor, &digit->budget_d, sizeof(digit->budget_d));
        cursor += sizeof(digit->budget_d);
    }

    return (size_t)(cursor - buffer);
}

EMSCRIPTEN_KEEPALIVE
int k_state_load(const uint8_t *buffer, size_t length) {
    if (!buffer || length < sizeof(uint32_t)) {
        return -1;
    }
    if (!g_state) {
        if (!k_state_new()) {
            return -1;
        }
    }
    const uint8_t *cursor = buffer;
    const uint8_t *end = buffer + length;

    uint32_t version = 0u;
    memcpy(&version, cursor, sizeof(uint32_t));
    cursor += sizeof(uint32_t);
    if (version != K_SAVE_VERSION) {
        return -1;
    }

    if ((size_t)(end - cursor) < sizeof(double) * 2u) {
        return -1;
    }
    memcpy(&g_state->limit_b, cursor, sizeof(double));
    cursor += sizeof(double);
    memcpy(&g_state->limit_d, cursor, sizeof(double));
    cursor += sizeof(double);

    if ((size_t)(end - cursor) < sizeof(g_state->usage)) {
        return -1;
    }
    memcpy(g_state->usage, cursor, sizeof(g_state->usage));
    cursor += sizeof(g_state->usage);

    if ((size_t)(end - cursor) < sizeof(g_state->transitions)) {
        return -1;
    }
    memcpy(g_state->transitions, cursor, sizeof(g_state->transitions));
    cursor += sizeof(g_state->transitions);

    if ((size_t)(end - cursor) < sizeof(g_state->window_b) + sizeof(g_state->window_d)) {
        return -1;
    }
    memcpy(g_state->window_b, cursor, sizeof(g_state->window_b));
    cursor += sizeof(g_state->window_b);
    memcpy(g_state->window_d, cursor, sizeof(g_state->window_d));
    cursor += sizeof(g_state->window_d);

    if ((size_t)(end - cursor) < sizeof(uint32_t) * 2u + sizeof(uint64_t)) {
        return -1;
    }
    memcpy(&g_state->window_index, cursor, sizeof(uint32_t));
    cursor += sizeof(uint32_t);
    memcpy(&g_state->window_size, cursor, sizeof(uint32_t));
    cursor += sizeof(uint32_t);
    memcpy(&g_state->rng_state, cursor, sizeof(uint64_t));
    cursor += sizeof(uint64_t);

    for (size_t d = 0; d < K_DIGIT_COUNT; ++d) {
        if ((size_t)(end - cursor) < sizeof(g_state->digits[d].bias)) {
            return -1;
        }
        memcpy(g_state->digits[d].bias, cursor, sizeof(g_state->digits[d].bias));
        cursor += sizeof(g_state->digits[d].bias);
        if ((size_t)(end - cursor) < sizeof(float) * 3u) {
            return -1;
        }
        memcpy(&g_state->digits[d].energy, cursor, sizeof(float));
        cursor += sizeof(float);
        memcpy(&g_state->digits[d].phase, cursor, sizeof(float));
        cursor += sizeof(float);
        memcpy(&g_state->digits[d].weight, cursor, sizeof(float));
        cursor += sizeof(float);
        if ((size_t)(end - cursor) < sizeof(double) * 2u) {
            return -1;
        }
        memcpy(&g_state->digits[d].budget_b, cursor, sizeof(double));
        cursor += sizeof(double);
        memcpy(&g_state->digits[d].budget_d, cursor, sizeof(double));
        cursor += sizeof(double);
    }

    return 0;
}

EMSCRIPTEN_KEEPALIVE
int k_observe(const uint8_t *data, size_t length) {
    if (!g_state || !data || length == 0u) {
        return -1;
    }
    k_parse_observation(g_state, (const char *)data, length);
    k_refresh_digit_programs(g_state);
    return 0;
}

EMSCRIPTEN_KEEPALIVE
size_t k_decode(const uint8_t *prompt, size_t prompt_len, uint8_t *output, size_t capacity, int temp_q8, int topk) {
    if (!g_state || !output || capacity == 0u) {
        return 0u;
    }
    float temperature = temp_q8 <= 0 ? 1.0f : (float)temp_q8 / 256.0f;
    if (temperature < 0.1f) {
        temperature = 0.1f;
    }
    if (prompt && prompt_len > 0u) {
        k_sketch_update(&g_state->summary_sketch, prompt, prompt_len);
    }

    uint32_t selected = k_select_digit(g_state, temperature, topk);
    KDigit *digit = &g_state->digits[selected];
    double delta_b = 0.0;
    double delta_d = 0.0;
    size_t produced = k_daawg_generate(&digit->graph, (char *)output, capacity, &delta_b, &delta_d, &g_state->rng_state);
    if (produced == 0u) {
        return 0u;
    }
    if (digit->budget_b + delta_b > g_state->limit_b || digit->budget_d + delta_d > g_state->limit_d) {
        output[0] = '\0';
        return 0u;
    }
    k_state_push_window(g_state, delta_b, delta_d);
    k_state_recompute_budgets(g_state);
    g_state->usage[selected] += 1.0;
    for (size_t j = 0; j < K_DIGIT_COUNT; ++j) {
        g_state->transitions[selected][j] *= 0.97;
    }
    return produced;
}

EMSCRIPTEN_KEEPALIVE
int k_digit_add_syll(uint32_t digit_index, const uint8_t *utf8, size_t length) {
    if (!g_state || !utf8 || digit_index >= K_DIGIT_COUNT || length == 0u) {
        return -1;
    }
    if (length > K_MAX_TOKEN) {
        length = K_MAX_TOKEN;
    }
    k_daawg_insert(&g_state->digits[digit_index].graph, utf8, length, 1u);
    k_state_push_window(g_state, (double)length, log2((double)length + 1.0));
    k_state_recompute_budgets(g_state);
    return 0;
}

EMSCRIPTEN_KEEPALIVE
size_t k_profile(uint32_t query, uint8_t *buffer, size_t capacity) {
    if (!buffer || capacity == 0u) {
        return 0u;
    }
    if (!g_state) {
        const char *empty = "{}";
        size_t len = strlen(empty);
        if (len >= capacity) {
            len = capacity - 1u;
        }
        memcpy(buffer, empty, len);
        buffer[len] = '\0';
        return len;
    }
    char scratch[K_MAX_PROFILE];
    double total_b = k_state_sum_window(g_state->window_b, g_state->window_size);
    double total_d = k_state_sum_window(g_state->window_d, g_state->window_size);
    int written = snprintf(
        scratch,
        sizeof(scratch),
        "{\n  \"limit_b\": %.3f,\n  \"limit_d\": %.3f,\n  \"budget_b\": %.3f,\n  \"budget_d\": %.3f,\n  \"usage\": [",
        g_state->limit_b,
        g_state->limit_d,
        total_b,
        total_d);
    if (written < 0) {
        return 0u;
    }
    size_t offset = (size_t)written;
    for (size_t i = 0; i < K_DIGIT_COUNT; ++i) {
        written = snprintf(scratch + offset, sizeof(scratch) - offset, "%s%.3f", i ? ", " : "", g_state->usage[i]);
        if (written < 0) {
            return 0u;
        }
        offset += (size_t)written;
    }
    written = snprintf(
        scratch + offset,
        sizeof(scratch) - offset,
        "],\n  \"window\": %u,\n  \"fragmentation\": %zu\n}\n",
        g_state->window_size,
        g_state->digits[0].graph.arena.fragmentation + g_state->digits[1].graph.arena.fragmentation);
    if (written < 0) {
        return 0u;
    }
    offset += (size_t)written;
    if (offset >= capacity) {
        offset = capacity - 1u;
    }
    memcpy(buffer, scratch, offset);
    buffer[offset] = '\0';
    return offset;
}

/* ---------------------- Compatibility bridge exports --------------------- */

EMSCRIPTEN_KEEPALIVE
int kolibri_bridge_init(void) {
    return k_state_new() ? 0 : -1;
}

EMSCRIPTEN_KEEPALIVE
int kolibri_bridge_reset(void) {
    k_state_free();
    return k_state_new() ? 0 : -1;
}

EMSCRIPTEN_KEEPALIVE
int kolibri_bridge_configure(int lambda_b_milli,
                             int lambda_d_milli,
                             int target_b_milli,
                             int target_d_milli,
                             int temperature_milli,
                             int top_k,
                             int enable_cf_beam) {
    if (!g_state) {
        if (!k_state_new()) {
            return -1;
        }
    }

    g_controls.lambda_b = (double)lambda_b_milli / 1000.0;
    g_controls.lambda_d = (double)lambda_d_milli / 1000.0;
    g_controls.target_b = target_b_milli < 0 ? NAN : (double)target_b_milli / 1000.0;
    g_controls.target_d = target_d_milli < 0 ? NAN : (double)target_d_milli / 1000.0;
    g_controls.temperature = (double)temperature_milli / 100.0;
    g_controls.top_k = top_k > 0 ? top_k : 1;
    g_controls.cf_beam = enable_cf_beam ? 1 : 0;

    return 0;
}

EMSCRIPTEN_KEEPALIVE
int kolibri_bridge_execute(const uint8_t *program, uint8_t *buffer, size_t capacity) {
    if (!program || !buffer || capacity == 0u) {
        return -1;
    }
    if (!g_state) {
        if (!k_state_new()) {
            return -1;
        }
    }
    size_t produced = k_decode(program, strlen((const char *)program), buffer, capacity, 256, 3);
    if (produced == 0u) {
        buffer[0] = '\0';
        return 0;
    }
    return (int)produced;
}


EMSCRIPTEN_KEEPALIVE
int kolibri_bridge_has_simd(void) {
#if defined(KOLIBRI_USE_WASM_SIMD) && defined(__wasm_simd128__)
    return 1;
#else
    return 0;
#endif
}

EMSCRIPTEN_KEEPALIVE
int kolibri_bridge_lane_width(void) {
#if defined(KOLIBRI_USE_WASM_SIMD) && defined(__wasm_simd128__)
    return 16;
#else
    return 1;
#endif
}

/* ------------------------------- End of file ----------------------------- */
