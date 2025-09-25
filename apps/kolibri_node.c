/*
 * Copyright (c) 2025 Кочуров Владислав Евгеньевич
 */

#include "kolibri/decimal.h"
#include "kolibri/formula.h"
#include "kolibri/genome.h"
#include "kolibri/net.h
#include <ctype.h>
#include <inttypes.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>


#define KOLIBRI_MEMORY_CAPACITY 8192U

typedef struct {
    uint64_t seed;
    uint32_t node_id;
    bool listen_enabled;
    uint16_t listen_port;
    bool peer_enabled;
    char peer_host[64];
    uint16_t peer_port;
    bool verify_genome;
    char genome_path[260];
} KolibriNodeOptions;

typedef struct {
    KolibriNodeOptions options;
    KolibriGenome genome;
    bool genome_ready;
    KolibriFormulaPool pool;
    uint8_t memory_buffer[KOLIBRI_MEMORY_CAPACITY];
    k_digit_stream memory;
    bool listener_ready;
    KolibriNetListener listener;
    KolibriGene last_gene;
    bool last_gene_valid;
    int last_question;
    int last_answer;
} KolibriNode;

static const unsigned char KOLIBRI_HMAC_KEY[] = "kolibri-secret-key";

static void options_init(KolibriNodeOptions *options) {
    options->seed = 20250923ULL;
    options->node_id = 1U;
    options->listen_enabled = false;
    options->listen_port = 4050U;
    options->peer_enabled = false;
    options->peer_host[0] = '\0';
    options->peer_port = 4050U;
    options->verify_genome = false;
    strncpy(options->genome_path, "genome.dat", sizeof(options->genome_path) - 1);
    options->genome_path[sizeof(options->genome_path) - 1] = '\0';
}

static void parse_options(int argc, char **argv, KolibriNodeOptions *options) {
    options_init(options);
    for (int i = 1; i < argc; ++i) {
        if (strcmp(argv[i], "--seed") == 0 && i + 1 < argc) {
            options->seed = (uint64_t)strtoull(argv[i + 1], NULL, 10);
            ++i;
            continue;
        }
        if (strcmp(argv[i], "--node-id") == 0 && i + 1 < argc) {
            options->node_id = (uint32_t)strtoul(argv[i + 1], NULL, 10);
            ++i;
            continue;
        }
        if (strcmp(argv[i], "--listen") == 0 && i + 1 < argc) {
            options->listen_enabled = true;
            options->listen_port = (uint16_t)strtoul(argv[i + 1], NULL, 10);
            ++i;
            continue;
        }
        if (strcmp(argv[i], "--peer") == 0 && i + 1 < argc) {
            const char *endpoint = argv[i + 1];
            const char *colon = strchr(endpoint, ':');
            if (colon) {
                size_t host_len = (size_t)(colon - endpoint);
                if (host_len >= sizeof(options->peer_host)) {
                    host_len = sizeof(options->peer_host) - 1U;
                }
                memcpy(options->peer_host, endpoint, host_len);
                options->peer_host[host_len] = '\0';
                options->peer_port = (uint16_t)strtoul(colon + 1, NULL, 10);
                options->peer_enabled = true;
            }
            ++i;
            continue;
        }
        if (strcmp(argv[i], "--genome") == 0 && i + 1 < argc) {
            strncpy(options->genome_path, argv[i + 1],
                    sizeof(options->genome_path) - 1);
            options->genome_path[sizeof(options->genome_path) - 1] = '\0';
            ++i;
            continue;
        }
        if (strcmp(argv[i], "--verify-genome") == 0) {
            options->verify_genome = true;
            continue;
        }
    }
}

static void trim_newline(char *line) {
    if (!line) {
        return;
    }
    size_t len = strlen(line);
    while (len > 0 && (line[len - 1] == '\n' || line[len - 1] == '\r')) {
        line[len - 1] = '\0';
        len--;
    }
}

static void trim_spaces(char *line) {
    if (!line) {
        return;
    }
    size_t len = strlen(line);
    while (len > 0 && isspace((unsigned char)line[len - 1])) {
        line[len - 1] = '\0';
        len--;
    }
    size_t start = 0;
    while (line[start] != '\0' && isspace((unsigned char)line[start])) {
        start++;
    }
    if (start > 0) {
        memmove(line, line + start, strlen(line + start) + 1U);
    }
}

static bool parse_int32(const char *text, int *out_value) {
    if (!text || !out_value) {
        return false;
    }
    char *endptr = NULL;
    long value = strtol(text, &endptr, 10);
    if (endptr == text || *endptr != '\0') {
        return false;
    }
    if (value > 2147483647L || value < -2147483648L) {
        return false;
    }
    *out_value = (int)value;
    return true;
}

static int node_record_event(KolibriNode *node, const char *event, const char *payload) {
    if (!node || !node->genome_ready) {
        return -1;
    }
    if (kg_append(&node->genome, event, payload ? payload : "", NULL) != 0) {
        fprintf(stderr, "[Геном] не удалось записать событие %s\n", event);
        return -1;
    }
    return 0;
}

static void node_store_text(KolibriNode *node, const char *text) {
    if (!node || !text) {
        return;
    }
    uint8_t digits[384];
    k_digit_stream local;
    k_digit_stream_init(&local, digits, sizeof(digits));
    size_t len = strlen(text);
    if (len > 120U) {
        len = 120U;
    }
    if (k_transduce_utf8(&local, (const unsigned char *)text, len) != 0) {
        return;
    }
    for (size_t i = 0; i < local.length; ++i) {
        if (k_digit_stream_push(&node->memory, local.digits[i]) != 0) {
            break;
        }
    }
}

static void node_reset_last_answer(KolibriNode *node) {
    if (!node) {
        return;
    }
    node->last_gene_valid = false;
    node->last_question = 0;
    node->last_answer = 0;
    memset(&node->last_gene, 0, sizeof(node->last_gene));
}

static void node_apply_feedback(KolibriNode *node, double delta, const char *rating, const char *message) {
    if (!node) {
        return;
    }
    if (!node->last_gene_valid) {
        printf("[Учитель] нет последнего ответа для оценки\n");
        return;
    }
    if (kf_pool_feedback(&node->pool, &node->last_gene, delta) != 0) {
        printf("[Учитель] текущий ген уже изменился, повторите запрос\n");
        node_reset_last_answer(node);
        return;
    }
    if (message) {
        printf("%s\n", message);
    }
    char payload[128];
    snprintf(payload, sizeof(payload), "rating=%s input=%d output=%d delta=%.3f",
             rating ? rating : "unknown", node->last_question, node->last_answer, delta);
    node_record_event(node, "USER_FEEDBACK", payload);
    const KolibriFormula *best = kf_pool_best(&node->pool);
    if (best) {
        char description[128];
        if (kf_formula_describe(best, description, sizeof(description)) == 0) {
            printf("[Формулы] %s\n", description);
        }
    }
}

static void node_handle_good(KolibriNode *node) {
    node_apply_feedback(node, 0.15, "good", "[Учитель] формула поощрена");
}

static void node_handle_bad(KolibriNode *node) {
    node_apply_feedback(node, -0.25, "bad", "[Учитель] формула наказана");
}

static int node_open_genome(KolibriNode *node) {
    if (!node) {
        return -1;
    }
    if (node->options.verify_genome) {
        int status = kg_verify_file(node->options.genome_path, KOLIBRI_HMAC_KEY,
                                    sizeof(KOLIBRI_HMAC_KEY) - 1U);
        if (status == 1) {
            printf("[Геном] существующий журнал отсутствует, создаём новый\n");
        } else if (status != 0) {
            fprintf(stderr, "[Геном] проверка целостности провалена\n");
            return -1;
        } else {
            printf("[Геном] целостность подтверждена\n");
        }
    }
    if (kg_open(&node->genome, node->options.genome_path, KOLIBRI_HMAC_KEY,
                sizeof(KOLIBRI_HMAC_KEY) - 1U) != 0) {
        fprintf(stderr, "[Геном] не удалось открыть %s\n", node->options.genome_path);
        return -1;
    }
    node->genome_ready = true;
    node_record_event(node, "BOOT", "узел активирован");
    return 0;
}

static void node_close_genome(KolibriNode *node) {
    if (!node) {
        return;
    }
    if (node->genome_ready) {
        kg_close(&node->genome);
        node->genome_ready = false;
    }
}

static void node_print_canvas(const KolibriNode *node) {
    if (!node) {
        return;
    }
    printf("== Фрактальная канва памяти ==\n");
    if (node->memory.length == 0) {
        printf("(память пуста)\n");
        return;
    }
    size_t offset = 0;
    size_t depth = 0;
    while (offset < node->memory.length) {
        printf("слой %zu: ", depth);
        for (size_t i = 0; i < 30 && offset + i < node->memory.length; ++i) {
            printf("%u", (unsigned)node->memory.digits[offset + i]);
            if ((i + 1U) % 10U == 0U) {
                printf(" ");
            }
        }
        printf("\n");
        offset += 30U;
        depth++;
    }
}

static void node_report_formula(const KolibriNode *node) {
    const KolibriFormula *best = kf_pool_best(&node->pool);
    if (!best) {
        printf("[Формулы] пока нет подходящих генов\n");
        return;
    }
    char description[128];
    if (kf_formula_describe(best, description, sizeof(description)) != 0) {
        printf("[Формулы] не удалось построить описание\n");
        return;
    }
    uint8_t digits[32];
    size_t len = kf_formula_digits(best, digits, sizeof(digits));
    printf("[Формулы] %s\n", description);
    printf("[Формулы] ген: ");
    for (size_t i = 0; i < len; ++i) {
        printf("%u", (unsigned)digits[i]);
    }
    printf("\n");
}

static void node_share_formula(KolibriNode *node) {
    if (!node->options.peer_enabled) {
        printf("[Рой] соседи не заданы\n");
        return;
    }
    const KolibriFormula *best = kf_pool_best(&node->pool);
    if (!best) {
        printf("[Рой] подходящая формула отсутствует\n");
        return;
    }
    if (kn_share_formula(node->options.peer_host, node->options.peer_port,
                         node->options.node_id, best) == 0) {
        printf("[Рой] формула отправлена на %s:%u\n", node->options.peer_host,
               node->options.peer_port);
        node_record_event(node, "SYNC", "передан лучший ген");
    } else {
        fprintf(stderr, "[Рой] не удалось отправить формулу\n");
    }
}

static void node_poll_listener(KolibriNode *node) {
    if (!node->listener_ready) {
        return;
    }
    KolibriNetMessage message;
    int status = kn_listener_poll(&node->listener, 0U, &message);
    if (status <= 0) {
        return;
    }
    switch (message.type) {
    case KOLIBRI_MSG_HELLO:
        printf("[Рой] приветствие от узла %u\n", message.data.hello.node_id);
        break;
    case KOLIBRI_MSG_MIGRATE_RULE: {
        printf("[Рой] получен ген от узла %u\n", message.data.formula.node_id);
        KolibriFormula imported;
        imported.gene.length = message.data.formula.length;
        memcpy(imported.gene.digits, message.data.formula.digits,
               message.data.formula.length);
        imported.fitness = message.data.formula.fitness;
        if (node->pool.count > 0) {
            size_t slot = node->pool.count - 1U;
            node->pool.formulas[slot] = imported;
            kf_pool_tick(&node->pool, 4);
            node_record_event(node, "IMPORT", "ген принят от соседа");
        }
        break;
    }
    case KOLIBRI_MSG_ACK:
        printf("[Рой] ACK=%u\n", message.data.ack.status);
        break;
    }
}

static void node_handle_tick(KolibriNode *node, size_t generations) {
    if (node->pool.examples == 0) {
        printf("[Формулы] нет обучающих примеров\n");
        return;
    }
    kf_pool_tick(&node->pool, generations);
    printf("[Формулы] выполнено поколений: %zu\n", generations);
    node_record_event(node, "EVOLVE", "цикл выполнен");
    node_reset_last_answer(node);
}

static void node_handle_teach(KolibriNode *node, const char *payload) {
    if (!payload || payload[0] == '\0') {
        printf("[Учитель] требуется пример формата a->b\n");
        return;
    }
    char buffer[256];
    strncpy(buffer, payload, sizeof(buffer) - 1U);
    buffer[sizeof(buffer) - 1U] = '\0';
    trim_spaces(buffer);
    char *arrow = strstr(buffer, "->");
    if (arrow) {
        *arrow = '\0';
        char *rhs = arrow + 2;
        trim_spaces(buffer);
        trim_spaces(rhs);
        int input = 0;
        int target = 0;
        if (!parse_int32(buffer, &input) || !parse_int32(rhs, &target)) {
            printf("[Учитель] не удалось разобрать числа\n");
            return;
        }
        if (kf_pool_add_example(&node->pool, input, target) != 0) {
            printf("[Учитель] буфер примеров заполнен\n");
            return;
        }
        node_store_text(node, payload);
        node_record_event(node, "TEACH", "пример добавлен");
        node_handle_tick(node, 8);
        return;
    }
    node_store_text(node, payload);
    node_record_event(node, "NOTE", "произвольный импульс сохранён");
    printf("[Учитель] сохранён числовой импульс\n");
}

static void node_handle_ask(KolibriNode *node, const char *payload) {
    if (!payload || payload[0] == '\0') {
        printf("[Вопрос] требуется аргумент\n");
        return;
    }
    int value = 0;
    if (!parse_int32(payload, &value)) {
        printf("[Вопрос] ожидалось целое число\n");
        return;
    }
    const KolibriFormula *best = kf_pool_best(&node->pool);
    if (!best) {
        printf("[Вопрос] эволюция ещё не дала формулы\n");
        return;
    }
    int result = 0;
    if (kf_formula_apply(best, value, &result) != 0) {
        printf("[Вопрос] формула не смогла ответить\n");
        return;
    }
    printf("[Ответ] f(%d) = %d\n", value, result);
    node->last_gene = best->gene;
    node->last_gene_valid = true;
    node->last_question = value;
    node->last_answer = result;
    char description[128];
    if (kf_formula_describe(best, description, sizeof(description)) == 0) {
        printf("[Пояснение] %s\n", description);
    }
    node_record_event(node, "ASK", "вопрос обработан");
}

static void node_handle_verify(KolibriNode *node) {
    int status = kg_verify_file(node->options.genome_path, KOLIBRI_HMAC_KEY,
                                sizeof(KOLIBRI_HMAC_KEY) - 1U);
    if (status == 0) {
        printf("[Геном] проверка завершилась успехом\n");
    } else if (status == 1) {
        printf("[Геном] файл отсутствует\n");
    } else {
        printf("[Геном] обнаружено повреждение\n");
    }
}

static void node_print_help(void) {
    printf(":teach a->b — добавить обучающий пример\n");
    printf(":ask x — вычислить значение лучшей формулы\n");
    printf(":good — поощрить последнюю формулу за ответ\n");
    printf(":bad — наказать последнюю формулу\n");
    printf(":tick [n] — выполнить n поколений (по умолчанию 1)\n");
    printf(":evolve [n] — форсировать дополнительную эволюцию\n");
    printf(":why — показать текущую формулу\n");
    printf(":canvas — вывести канву памяти\n");
    printf(":sync — поделиться формулой с соседом\n");
    printf(":verify — проверить геном\n");
    printf(":quit — завершить работу\n");
}

static void node_run(KolibriNode *node) {
    printf("Колибри узел %u готов. :help для списка команд.\n",
           node->options.node_id);
    char line[512];
    while (true) {
        node_poll_listener(node);
        printf("колибри-%u> ", node->options.node_id);
        fflush(stdout);
        if (!fgets(line, sizeof(line), stdin)) {
            printf("\n[Сессия] входной поток закрыт\n");
            break;
        }
        trim_newline(line);
        trim_spaces(line);
        if (line[0] == '\0') {
            continue;
        }
        node_poll_listener(node);
        if (line[0] == ':') {
            const char *command = line + 1;
            while (*command && !isspace((unsigned char)*command)) {
                ++command;
            }
            size_t prefix = (size_t)(command - (line + 1));
            char name[32];
            strncpy(name, line + 1, prefix);
            name[prefix] = '\0';
            while (*command && isspace((unsigned char)*command)) {
                ++command;
            }
            if (strcmp(name, "teach") == 0) {
                node_handle_teach(node, command);
                continue;
            }
            if (strcmp(name, "ask") == 0) {
                node_handle_ask(node, command);
                continue;
            }
            if (strcmp(name, "good") == 0) {
                node_handle_good(node);
                continue;
            }
            if (strcmp(name, "bad") == 0) {
                node_handle_bad(node);
                continue;
            }
            if (strcmp(name, "tick") == 0) {
                int generations = 1;
                if (command[0] != '\0') {
                    if (!parse_int32(command, &generations) || generations <= 0) {
                        printf("[Формулы] ожидалось натуральное число\n");
                        continue;
                    }
                }
                node_handle_tick(node, (size_t)generations);
                continue;
            }
            if (strcmp(name, "evolve") == 0) {
                int generations = 32;
                if (command[0] != '\0') {
                    if (!parse_int32(command, &generations) || generations <= 0) {
                        printf("[Формулы] ожидалось натуральное число\n");
                        continue;
                    }
                }
                node_handle_tick(node, (size_t)generations);
                continue;
            }
            if (strcmp(name, "why") == 0) {
                node_report_formula(node);
                continue;
            }
            if (strcmp(name, "canvas") == 0) {
                node_print_canvas(node);
                continue;
            }
            if (strcmp(name, "sync") == 0) {
                node_share_formula(node);
                continue;
            }
            if (strcmp(name, "verify") == 0) {
                node_handle_verify(node);
                continue;
            }
            if (strcmp(name, "help") == 0) {
                node_print_help();
                continue;
            }
            if (strcmp(name, "quit") == 0 || strcmp(name, "exit") == 0) {
                printf("[Сессия] завершение работы по команде\n");
                break;
            }
            printf("[Команда] неизвестная директива %s\n", name);
            continue;
        }
        node_store_text(node, line);
        node_record_event(node, "NOTE", "свободный текст сохранён");
    }
}

static int node_start_listener(KolibriNode *node) {
    if (!node->options.listen_enabled) {
        return 0;
    }
    if (kn_listener_start(&node->listener, node->options.listen_port) != 0) {
        fprintf(stderr, "[Рой] не удалось открыть порт %u\n",
                node->options.listen_port);
        return -1;
    }
    node->listener_ready = true;
    printf("[Рой] слушаем порт %u\n", node->options.listen_port);
    return 0;
}

static void node_stop_listener(KolibriNode *node) {
    if (!node->listener_ready) {
        return;
    }
    kn_listener_close(&node->listener);
    node->listener_ready = false;
}

static int node_init(KolibriNode *node, const KolibriNodeOptions *options) {
    memset(node, 0, sizeof(*node));
    node->options = *options;
    node_reset_last_answer(node);
    k_digit_stream_init(&node->memory, node->memory_buffer, sizeof(node->memory_buffer));
    kf_pool_init(&node->pool, node->options.seed);
    if (node_open_genome(node) != 0) {
        return -1;
    }
    if (node_start_listener(node) != 0) {
        node_close_genome(node);
        return -1;
    }
    return 0;
}

static void node_shutdown(KolibriNode *node) {
    node_stop_listener(node);
    node_close_genome(node);
}

int main(int argc, char **argv) {
    KolibriNodeOptions options;
    parse_options(argc, argv, &options);
    KolibriNode node;
    if (node_init(&node, &options) != 0) {
        return 1;
    }
    node_run(&node);
    node_shutdown(&node);
    printf("Колибри узел %u завершил работу\n", options.node_id);
    return 0;

typedef struct {
  uint64_t seed;
  uint32_t node_id;
  bool listen_enabled;
  uint16_t listen_port;
  bool peer_enabled;
  char peer_host[64];
  uint16_t peer_port;
  bool verify_genome;
  char genome_path[260];
} KolibriNodeOptions;

static void options_init(KolibriNodeOptions *options) {
  options->seed = 20250923ULL;
  options->node_id = 1U;
  options->listen_enabled = false;
  options->listen_port = 4050U;
  options->peer_enabled = false;
  options->peer_host[0] = '\0';
  options->peer_port = 4050U;
  options->verify_genome = false;
  strncpy(options->genome_path, "genome.dat", sizeof(options->genome_path) - 1);
  options->genome_path[sizeof(options->genome_path) - 1] = '\0';
}

static void parse_options(int argc, char **argv, KolibriNodeOptions *options) {
  options_init(options);
  for (int i = 1; i < argc; ++i) {
    if (strcmp(argv[i], "--seed") == 0 && i + 1 < argc) {
      options->seed = (uint64_t)strtoull(argv[i + 1], NULL, 10);
      ++i;
      continue;
    }
    if (strcmp(argv[i], "--node-id") == 0 && i + 1 < argc) {
      options->node_id = (uint32_t)strtoul(argv[i + 1], NULL, 10);
      ++i;
      continue;
    }
    if (strcmp(argv[i], "--listen") == 0 && i + 1 < argc) {
      options->listen_enabled = true;
      options->listen_port = (uint16_t)strtoul(argv[i + 1], NULL, 10);
      ++i;
      continue;
    }
    if (strcmp(argv[i], "--peer") == 0 && i + 1 < argc) {
      const char *endpoint = argv[i + 1];
      const char *colon = strchr(endpoint, ':');
      if (colon) {
        size_t host_len = (size_t)(colon - endpoint);
        if (host_len >= sizeof(options->peer_host)) {
          host_len = sizeof(options->peer_host) - 1U;
        }
        memcpy(options->peer_host, endpoint, host_len);
        options->peer_host[host_len] = '\0';
        options->peer_port = (uint16_t)strtoul(colon + 1, NULL, 10);
        options->peer_enabled = true;
      }
      ++i;
      continue;
    }
    if (strcmp(argv[i], "--genome") == 0 && i + 1 < argc) {
      strncpy(options->genome_path, argv[i + 1],
              sizeof(options->genome_path) - 1);
      options->genome_path[sizeof(options->genome_path) - 1] = '\0';
      ++i;
      continue;
    }
    if (strcmp(argv[i], "--verify-genome") == 0) {
      options->verify_genome = true;
      continue;
    }
  }
}

static void demo_decimal_layer(void) {
  const char *sample = "Kolibri";
  size_t encoded_len = k_encode_text_length(strlen(sample));
  char encoded[64];
  char decoded[32];
  if (encoded_len > sizeof(encoded) ||
      k_encode_text(sample, encoded, sizeof(encoded)) != 0) {
    fprintf(stderr, "Failed to encode sample text\n");
    return;
  }
  if (k_decode_text(encoded, decoded, sizeof(decoded)) != 0) {
    fprintf(stderr, "Failed to decode sample text\n");
    return;
  }
  printf("[Decimal] '%s' -> %s -> '%s'\n", sample, encoded, decoded);
}

static int demo_genome(const KolibriNodeOptions *options) {
  if (!options) {
    return -1;
  }

  const unsigned char key[] = "kolibri-secret-key";

  if (options->verify_genome) {
    int verify = kg_verify_file(options->genome_path, key, sizeof(key) - 1);
    if (verify == 1) {
      printf("[Genome] No existing ledger at %s, nothing to verify\n",
             options->genome_path);
    } else if (verify != 0) {
      fprintf(stderr, "[Genome] Integrity check failed for %s\n",
              options->genome_path);
      return -1;
    } else {
      printf("[Genome] Verified %s\n", options->genome_path);
    }
  }

  KolibriGenome genome;
  if (kg_open(&genome, options->genome_path, key, sizeof(key) - 1) != 0) {
    fprintf(stderr, "Unable to open %s\n", options->genome_path);
    return -1;
  }

  ReasonBlock block;
  if (kg_append(&genome, "BOOT", "Kolibri node initialized", &block) == 0) {
    printf("[Genome] Appended block #%" PRIu64 " to %s\n", block.index,
           options->genome_path);
  } else {
    fprintf(stderr, "[Genome] Failed to append block\n");
    kg_close(&genome);
    return -1;
  }

  kg_close(&genome);
  return 0;
}

static void demo_formula(uint64_t seed, KolibriFormulaPool *out_pool) {
  KolibriFormulaPool pool;
  kf_pool_init(&pool, seed);

  const int inputs[] = {0, 1, 2, 3};
  const int targets[] = {1, 3, 5, 7};

  for (int i = 0; i < 16; ++i) {
    kf_pool_tick(&pool, inputs, targets, sizeof(inputs) / sizeof(inputs[0]));
  }

  if (out_pool) {
    *out_pool = pool;
  }

  const KolibriFormula *best = kf_pool_best(out_pool ? out_pool : &pool);
  if (best) {
    printf("[Formula] Best a=%d b=%d fitness=%.3f\n", best->a, best->b,
           best->fitness);
    printf("[Formula] f(4) = %d\n", kf_formula_apply(best, 4));
  }
}

int main(int argc, char **argv) {
  KolibriNodeOptions options;
  parse_options(argc, argv, &options);

  printf("Kolibri node starting with seed=%" PRIu64 " node=%u\n", options.seed,
         options.node_id);

  KolibriNetListener listener;
  listener.socket_fd = -1;
  if (options.listen_enabled) {
    if (kn_listener_start(&listener, options.listen_port) == 0) {
      printf("[Swarm] Listening on port %u\n", options.listen_port);
    } else {
      fprintf(stderr, "[Swarm] Failed to bind port %u\n", options.listen_port);
      options.listen_enabled = false;
    }
  }

  demo_decimal_layer();
  if (demo_genome(&options) != 0) {
    return 1;
  }
  KolibriFormulaPool pool;
  demo_formula(options.seed, &pool);

  const KolibriFormula *best = kf_pool_best(&pool);
  if (best && options.peer_enabled) {
    printf("[Swarm] Sharing formula with %s:%u\n", options.peer_host,
           options.peer_port);
    if (kn_share_formula(options.peer_host, options.peer_port, options.node_id,
                         best) == 0) {
      printf("[Swarm] Share complete\n");
    } else {
      fprintf(stderr, "[Swarm] Share failed\n");
    }
  }

  if (options.listen_enabled) {
    printf("[Swarm] Awaiting incoming messages...\n");
    KolibriNetMessage message;
    int res = kn_listener_poll(&listener, 2000U, &message);
    if (res == 1) {
      switch (message.type) {
      case KOLIBRI_MSG_HELLO:
        printf("[Swarm] HELLO from node %u\n", message.data.hello.node_id);
        break;
      case KOLIBRI_MSG_MIGRATE_RULE:
        printf("[Swarm] Received formula from node %u a=%d b=%d fitness=%.3f\n",
               message.data.formula.node_id, message.data.formula.a,
               message.data.formula.b, message.data.formula.fitness);
        break;
      case KOLIBRI_MSG_ACK:
        printf("[Swarm] ACK status=%u\n", message.data.ack.status);
        break;
      }
    } else if (res == 0) {
      printf("[Swarm] No incoming swarm traffic\n");
    } else {
      fprintf(stderr, "[Swarm] Listener error\n");
    }
    kn_listener_close(&listener);
  }

  printf("Kolibri node shutdown\n");
  return 0;

}
