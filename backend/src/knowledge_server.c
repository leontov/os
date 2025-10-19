#include "kolibri/knowledge_index.h"
#include "kolibri/genome.h"
#include "kolibri/swarm.h"

#include <arpa/inet.h>
#include <errno.h>
#include <netinet/in.h>
#include <strings.h>
#include <ctype.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <sys/time.h>
#include <time.h>
#include <unistd.h>
#include <sys/stat.h>

#define KOLIBRI_DEFAULT_PORT 8000
#define KOLIBRI_SERVER_BACKLOG 16
#define KOLIBRI_REQUEST_BUFFER 8192
#define KOLIBRI_RESPONSE_BUFFER 32768
#define KOLIBRI_MAX_CONTENT_LENGTH 2048
#define KOLIBRI_RATE_LIMIT_WINDOW 60
#define KOLIBRI_RATE_LIMIT_BURST 30
#define KOLIBRI_DEFAULT_INDEX_CACHE ".kolibri/index"
#define KOLIBRI_BOOTSTRAP_SCRIPT "knowledge_bootstrap.ks"
#define KOLIBRI_KNOWLEDGE_GENOME ".kolibri/knowledge_genome.dat"

static volatile sig_atomic_t kolibri_server_running = 1;
static size_t kolibri_requests_total = 0U;
static size_t kolibri_search_hits = 0U;
static size_t kolibri_search_misses = 0U;
static time_t kolibri_bootstrap_timestamp = 0;
static time_t kolibri_index_timestamp = 0;
static time_t kolibri_server_started_at = 0;

static int kolibri_server_port = KOLIBRI_DEFAULT_PORT;
static char kolibri_bind_address[64] = "127.0.0.1";
static char **kolibri_knowledge_directories = NULL;
static size_t kolibri_knowledge_directory_count = 0U;
static char kolibri_index_json_path[512];
static char kolibri_index_cache_dir[512] = KOLIBRI_DEFAULT_INDEX_CACHE;
static char kolibri_admin_token[256];
static char kolibri_index_source[64] = "directories";

static KolibriGenome kolibri_genome;
static int kolibri_genome_ready = 0;
static unsigned char kolibri_hmac_key[KOLIBRI_HMAC_KEY_SIZE];
static size_t kolibri_hmac_key_len = 0U;
static char kolibri_hmac_key_origin[128];
static KolibriSwarm kolibri_swarm;
static int kolibri_swarm_ready = 0;
static char kolibri_swarm_nodes_config[1024];
static char kolibri_swarm_node_id[KOLIBRI_SWARM_ID_MAX];

typedef struct {
    time_t window_start;
    size_t count;
} KolibriRateLimiter;

static KolibriRateLimiter kolibri_feedback_rate = { 0, 0 };
static KolibriRateLimiter kolibri_teach_rate = { 0, 0 };

static int load_admin_token_from_file(const char *path, char *out, size_t out_size);

static void handle_signal(int sig) {
    (void)sig;
    kolibri_server_running = 0;
}

static void escape_script_string(const char *input, char *output, size_t out_size) {
    if (!output || out_size == 0) {
        return;
    }
    size_t out_index = 0;
    if (!input) {
        output[0] = '\0';
        return;
    }
    for (size_t i = 0; input[i] && out_index + 2 < out_size; ++i) {
        char ch = input[i];
        if (ch == '"' || ch == '\\') {
            if (out_index + 2 < out_size) {
                output[out_index++] = '\\';
                output[out_index++] = ch;
            }
        } else if (ch == '\n' || ch == '\r') {
            if (out_index + 2 < out_size) {
                output[out_index++] = '\\';
                output[out_index++] = 'n';
            }
        } else {
            output[out_index++] = ch;
        }
    }
    output[out_index] = '\0';
}

static char *snippet_preview(const char *content, size_t limit) {
    if (!content) {
        return NULL;
    }
    size_t length = strlen(content);
    if (length <= limit) {
        return strdup(content);
    }
    char *snippet = (char *)malloc(limit + 4U);
    if (!snippet) {
        return NULL;
    }
    memcpy(snippet, content, limit);
    snippet[limit] = '\0';
    strcat(snippet, "...");
    return snippet;
}

static void ensure_dir_exists(const char *path) {
    if (!path) {
        return;
    }
    /* create a single-level directory like .kolibri if missing */
    struct stat st;
    if (stat(path, &st) == 0) {
        return;
    }
    mkdir(path, 0755);
}

static void free_knowledge_directories(void) {
    if (!kolibri_knowledge_directories) {
        return;
    }
    for (size_t i = 0; i < kolibri_knowledge_directory_count; ++i) {
        free(kolibri_knowledge_directories[i]);
    }
    free(kolibri_knowledge_directories);
    kolibri_knowledge_directories = NULL;
    kolibri_knowledge_directory_count = 0U;
}

static void trim_whitespace(char *text) {
    if (!text) {
        return;
    }
    char *start = text;
    while (*start && isspace((unsigned char)*start)) {
        start++;
    }
    if (start != text) {
        memmove(text, start, strlen(start) + 1U);
    }
    size_t len = strlen(text);
    while (len > 0U && isspace((unsigned char)text[len - 1U])) {
        text[len - 1U] = '\0';
        len--;
    }
}

static void configure_swarm_from_config(void) {
    if (!kolibri_swarm_ready || kolibri_swarm_nodes_config[0] == '\0') {
        return;
    }
    char copy[sizeof(kolibri_swarm_nodes_config)];
    strncpy(copy, kolibri_swarm_nodes_config, sizeof(copy) - 1U);
    copy[sizeof(copy) - 1U] = '\0';
    char *saveptr = NULL;
    char *token = strtok_r(copy, ",", &saveptr);
    size_t generated = 0U;
    while (token) {
        trim_whitespace(token);
        if (*token) {
            char node_id[KOLIBRI_SWARM_ID_MAX];
            char endpoint[KOLIBRI_SWARM_ENDPOINT_MAX];
            node_id[0] = '\0';
            endpoint[0] = '\0';
            char *at = strchr(token, '@');
            if (at) {
                *at = '\0';
                strncpy(node_id, token, sizeof(node_id) - 1U);
                node_id[sizeof(node_id) - 1U] = '\0';
                strncpy(endpoint, at + 1, sizeof(endpoint) - 1U);
                endpoint[sizeof(endpoint) - 1U] = '\0';
            } else {
                snprintf(node_id, sizeof(node_id), "peer-%zu", kolibri_swarm.node_count + generated + 1U);
                strncpy(endpoint, token, sizeof(endpoint) - 1U);
                endpoint[sizeof(endpoint) - 1U] = '\0';
            }
            trim_whitespace(node_id);
            trim_whitespace(endpoint);
            if (endpoint[0] != '\0') {
                if (node_id[0] == '\0') {
                    snprintf(node_id, sizeof(node_id), "peer-%zu", kolibri_swarm.node_count + generated + 1U);
                }
                if (kolibri_swarm_add_node(&kolibri_swarm, node_id, endpoint) != 0) {
                    fprintf(stderr,
                            "[kolibri-knowledge] failed to add swarm peer %s@%s\n",
                            node_id,
                            endpoint);
                }
            }
        }
        token = strtok_r(NULL, ",", &saveptr);
        generated += 1U;
    }
    fprintf(stdout,
            "[kolibri-knowledge] swarm configured with %zu peers\n",
            kolibri_swarm.node_count);
}

static int add_knowledge_directory(const char *path) {
    if (!path || *path == '\0') {
        return 0;
    }
    char *copy = strdup(path);
    if (!copy) {
        return -1;
    }
    char **next = realloc(kolibri_knowledge_directories,
                          (kolibri_knowledge_directory_count + 1U) * sizeof(char *));
    if (!next) {
        free(copy);
        return -1;
    }
    kolibri_knowledge_directories = next;
    kolibri_knowledge_directories[kolibri_knowledge_directory_count] = copy;
    kolibri_knowledge_directory_count += 1U;
    return 0;
}

static int parse_directory_list(const char *value) {
    if (!value || *value == '\0') {
        return 0;
    }
    char *copy = strdup(value);
    if (!copy) {
        return -1;
    }
    char *token = copy;
    while (token && *token) {
        char *sep = strpbrk(token, ":,;");
        if (sep) {
            *sep = '\0';
        }
        while (*token == ' ') {
            ++token;
        }
        char *end = token + strlen(token);
        while (end > token && (end[-1] == ' ')) {
            --end;
        }
        *end = '\0';
        if (*token) {
            if (add_knowledge_directory(token) != 0) {
                free(copy);
                return -1;
            }
        }
        if (!sep) {
            break;
        }
        token = sep + 1;
    }
    free(copy);
    return 0;
}

static int parse_port_number(const char *text, int *out) {
    if (!text || !out || *text == '\0') {
        return -1;
    }
    char *endptr = NULL;
    long value = strtol(text, &endptr, 10);
    if (!endptr || *endptr != '\0') {
        return -1;
    }
    if (value < 1L || value > 65535L) {
        return -1;
    }
    *out = (int)value;
    return 0;
}

static void set_index_timestamp_from_path(const char *path) {
    if (!path) {
        kolibri_index_timestamp = time(NULL);
        return;
    }
    struct stat st;
    if (stat(path, &st) == 0) {
        kolibri_index_timestamp = st.st_mtime;
    } else {
        kolibri_index_timestamp = time(NULL);
    }
}

static int rate_limiter_allow(KolibriRateLimiter *limiter, time_t now, size_t limit) {
    if (!limiter || limit == 0U) {
        return 0;
    }
    if (limiter->window_start == 0 || now - limiter->window_start >= KOLIBRI_RATE_LIMIT_WINDOW) {
        limiter->window_start = now;
        limiter->count = 0U;
    }
    if (limiter->count >= limit) {
        return 0;
    }
    limiter->count += 1U;
    return 1;
}

static void compose_manifest_path(char *buffer, size_t buffer_size, const char *base) {
    if (!buffer || buffer_size == 0U) {
        return;
    }
    buffer[0] = '\0';
    if (!base || *base == '\0') {
        return;
    }
    const char *suffix = "/manifest.json";
    size_t base_len = strlen(base);
    size_t suffix_len = strlen(suffix);
    if (base_len + suffix_len + 1U > buffer_size) {
        return;
    }
    snprintf(buffer, buffer_size, "%s%s", base, suffix);
}

static void apply_environment_configuration(void) {
    const char *port_env = getenv("KOLIBRI_KNOWLEDGE_PORT");
    if (port_env && *port_env) {
        int parsed_port = 0;
        if (parse_port_number(port_env, &parsed_port) == 0) {
            kolibri_server_port = parsed_port;
        } else {
            fprintf(stderr, "[kolibri-knowledge] invalid KOLIBRI_KNOWLEDGE_PORT value: %s\n", port_env);
        }
    }

    const char *bind_env = getenv("KOLIBRI_KNOWLEDGE_BIND");
    if (bind_env && *bind_env) {
        strncpy(kolibri_bind_address, bind_env, sizeof(kolibri_bind_address) - 1U);
        kolibri_bind_address[sizeof(kolibri_bind_address) - 1U] = '\0';
    }

    const char *dirs_env = getenv("KOLIBRI_KNOWLEDGE_DIRS");
    if (dirs_env && *dirs_env) {
        free_knowledge_directories();
        if (parse_directory_list(dirs_env) != 0) {
            fprintf(stderr, "[kolibri-knowledge] failed to parse KOLIBRI_KNOWLEDGE_DIRS\n");
        }
    }

    const char *cache_env = getenv("KOLIBRI_KNOWLEDGE_INDEX_CACHE");
    if (cache_env && *cache_env) {
        strncpy(kolibri_index_cache_dir, cache_env, sizeof(kolibri_index_cache_dir) - 1U);
        kolibri_index_cache_dir[sizeof(kolibri_index_cache_dir) - 1U] = '\0';
    }

    const char *json_env = getenv("KOLIBRI_KNOWLEDGE_INDEX_JSON");
    if (json_env && *json_env) {
        strncpy(kolibri_index_json_path, json_env, sizeof(kolibri_index_json_path) - 1U);
        kolibri_index_json_path[sizeof(kolibri_index_json_path) - 1U] = '\0';
    }

    const char *admin_env = getenv("KOLIBRI_KNOWLEDGE_ADMIN_TOKEN");
    if (admin_env && *admin_env) {
        strncpy(kolibri_admin_token, admin_env, sizeof(kolibri_admin_token) - 1U);
        kolibri_admin_token[sizeof(kolibri_admin_token) - 1U] = '\0';
    } else {
        const char *admin_file_env = getenv("KOLIBRI_KNOWLEDGE_ADMIN_TOKEN_FILE");
        if (admin_file_env && *admin_file_env) {
            if (load_admin_token_from_file(admin_file_env, kolibri_admin_token, sizeof(kolibri_admin_token)) != 0) {
                fprintf(stderr,
                        "[kolibri-knowledge] failed to read admin token from %s\n",
                        admin_file_env);
            }
        }
    }

    const char *swarm_nodes_env = getenv("KOLIBRI_SWARM_NODES");
    if (swarm_nodes_env && *swarm_nodes_env) {
        strncpy(kolibri_swarm_nodes_config, swarm_nodes_env, sizeof(kolibri_swarm_nodes_config) - 1U);
        kolibri_swarm_nodes_config[sizeof(kolibri_swarm_nodes_config) - 1U] = '\0';
    } else {
        kolibri_swarm_nodes_config[0] = '\0';
    }

    const char *swarm_id_env = getenv("KOLIBRI_SWARM_ID");
    if (swarm_id_env && *swarm_id_env) {
        strncpy(kolibri_swarm_node_id, swarm_id_env, sizeof(kolibri_swarm_node_id) - 1U);
        kolibri_swarm_node_id[sizeof(kolibri_swarm_node_id) - 1U] = '\0';
    }
}

static int apply_cli_arguments(int argc, char **argv) {
    for (int i = 1; i < argc; ++i) {
        const char *arg = argv[i];
        if (strcmp(arg, "--port") == 0) {
            if (i + 1 >= argc) {
                fprintf(stderr, "[kolibri-knowledge] --port requires a value\n");
                return -1;
            }
            int parsed_port = 0;
            if (parse_port_number(argv[i + 1], &parsed_port) != 0) {
                fprintf(stderr, "[kolibri-knowledge] invalid port: %s\n", argv[i + 1]);
                return -1;
            }
            kolibri_server_port = parsed_port;
            i += 1;
        } else if (strcmp(arg, "--bind") == 0) {
            if (i + 1 >= argc) {
                fprintf(stderr, "[kolibri-knowledge] --bind requires a value\n");
                return -1;
            }
            strncpy(kolibri_bind_address, argv[i + 1], sizeof(kolibri_bind_address) - 1U);
            kolibri_bind_address[sizeof(kolibri_bind_address) - 1U] = '\0';
            i += 1;
        } else if (strcmp(arg, "--knowledge-dir") == 0) {
            if (i + 1 >= argc) {
                fprintf(stderr, "[kolibri-knowledge] --knowledge-dir requires a value\n");
                return -1;
            }
            if (add_knowledge_directory(argv[i + 1]) != 0) {
                fprintf(stderr, "[kolibri-knowledge] failed to record knowledge directory\n");
                return -1;
            }
            i += 1;
        } else if (strcmp(arg, "--index-json") == 0) {
            if (i + 1 >= argc) {
                fprintf(stderr, "[kolibri-knowledge] --index-json requires a path\n");
                return -1;
            }
            strncpy(kolibri_index_json_path, argv[i + 1], sizeof(kolibri_index_json_path) - 1U);
            kolibri_index_json_path[sizeof(kolibri_index_json_path) - 1U] = '\0';
            i += 1;
        } else if (strcmp(arg, "--index-cache") == 0) {
            if (i + 1 >= argc) {
                fprintf(stderr, "[kolibri-knowledge] --index-cache requires a path\n");
                return -1;
            }
            strncpy(kolibri_index_cache_dir, argv[i + 1], sizeof(kolibri_index_cache_dir) - 1U);
            kolibri_index_cache_dir[sizeof(kolibri_index_cache_dir) - 1U] = '\0';
            i += 1;
        } else if (strcmp(arg, "--admin-token") == 0) {
            if (i + 1 >= argc) {
                fprintf(stderr, "[kolibri-knowledge] --admin-token requires a value\n");
                return -1;
            }
            strncpy(kolibri_admin_token, argv[i + 1], sizeof(kolibri_admin_token) - 1U);
            kolibri_admin_token[sizeof(kolibri_admin_token) - 1U] = '\0';
            i += 1;
        } else if (strcmp(arg, "--admin-token-file") == 0) {
            if (i + 1 >= argc) {
                fprintf(stderr, "[kolibri-knowledge] --admin-token-file requires a path\n");
                return -1;
            }
            if (load_admin_token_from_file(argv[i + 1], kolibri_admin_token, sizeof(kolibri_admin_token)) != 0) {
                fprintf(stderr, "[kolibri-knowledge] failed to read admin token from %s\n", argv[i + 1]);
                return -1;
            }
            i += 1;
        } else if (strcmp(arg, "--help") == 0 || strcmp(arg, "-h") == 0) {
            fprintf(stdout,
                    "Usage: %s [--port PORT] [--bind ADDRESS] [--knowledge-dir PATH]\n"
                    "             [--index-json DIR] [--index-cache DIR] [--admin-token TOKEN]\n"
                    "       Environment overrides: KOLIBRI_KNOWLEDGE_PORT, KOLIBRI_KNOWLEDGE_BIND,"
                    " KOLIBRI_KNOWLEDGE_DIRS (colon-separated),\n"
                    "         KOLIBRI_KNOWLEDGE_INDEX_JSON, KOLIBRI_KNOWLEDGE_INDEX_CACHE,"
                    " KOLIBRI_KNOWLEDGE_ADMIN_TOKEN\n",
                    argv[0]);
            return 1;
        } else {
            fprintf(stderr, "[kolibri-knowledge] unknown argument: %s\n", arg);
            return -1;
        }
    }
    return 0;
}

static int ensure_default_directories(void) {
    if (kolibri_knowledge_directory_count > 0U) {
        return 0;
    }
    if (add_knowledge_directory("docs") != 0) {
        return -1;
    }
    if (add_knowledge_directory("data") != 0) {
        return -1;
    }
    return 0;
}

static int load_index_from_cache(KolibriKnowledgeIndex **out_index) {
    if (!out_index) {
        return EINVAL;
    }
    *out_index = NULL;
    if (kolibri_index_json_path[0] != '\0') {
        int err = kolibri_knowledge_index_load_json(kolibri_index_json_path, out_index);
        if (err == 0 && *out_index) {
            strncpy(kolibri_index_source, "prebuilt", sizeof(kolibri_index_source) - 1U);
            kolibri_index_source[sizeof(kolibri_index_source) - 1U] = '\0';
            char manifest_path[512];
            compose_manifest_path(manifest_path, sizeof(manifest_path), kolibri_index_json_path);
            if (manifest_path[0] != '\0') {
                set_index_timestamp_from_path(manifest_path);
            }
            return 0;
        }
        fprintf(stderr,
                "[kolibri-knowledge] failed to load index from %s (err=%d)\n",
                kolibri_index_json_path,
                err);
    }
    if (kolibri_index_cache_dir[0] != '\0') {
        char manifest_path[512];
        compose_manifest_path(manifest_path, sizeof(manifest_path), kolibri_index_cache_dir);
        struct stat st;
        if (manifest_path[0] != '\0' && stat(manifest_path, &st) == 0) {
            int err = kolibri_knowledge_index_load_json(kolibri_index_cache_dir, out_index);
            if (err == 0 && *out_index) {
                strncpy(kolibri_index_source, "cache", sizeof(kolibri_index_source) - 1U);
                kolibri_index_source[sizeof(kolibri_index_source) - 1U] = '\0';
                kolibri_index_timestamp = st.st_mtime;
                return 0;
            }
            fprintf(stderr,
                    "[kolibri-knowledge] failed to load cached index from %s (err=%d)\n",
                    kolibri_index_cache_dir,
                    err);
        }
    }
    return ENOENT;
}

static int build_index_from_directories(KolibriKnowledgeIndex **out_index) {
    if (!out_index) {
        return EINVAL;
    }
    *out_index = NULL;
    if (kolibri_knowledge_directory_count == 0U) {
        return ENOENT;
    }
    int err = kolibri_knowledge_index_create((const char *const *)kolibri_knowledge_directories,
                                             kolibri_knowledge_directory_count,
                                             1024U,
                                             out_index);
    if (err != 0) {
        return err;
    }
    if (*out_index) {
        strncpy(kolibri_index_source, "directories", sizeof(kolibri_index_source) - 1U);
        kolibri_index_source[sizeof(kolibri_index_source) - 1U] = '\0';
        kolibri_index_timestamp = time(NULL);
        if (kolibri_index_cache_dir[0] != '\0') {
            ensure_dir_exists(kolibri_index_cache_dir);
            int write_err = kolibri_knowledge_index_write_json(*out_index, kolibri_index_cache_dir);
            if (write_err != 0) {
                fprintf(stderr,
                        "[kolibri-knowledge] failed to write index cache to %s (err=%d)\n",
                        kolibri_index_cache_dir,
                        write_err);
            } else {
                char manifest_path[512];
                compose_manifest_path(manifest_path, sizeof(manifest_path), kolibri_index_cache_dir);
                if (manifest_path[0] != '\0') {
                    set_index_timestamp_from_path(manifest_path);
                }
            }
        }
    }
    return 0;
}

static int load_or_build_index(KolibriKnowledgeIndex **out_index) {
    if (!out_index) {
        return EINVAL;
    }
    *out_index = NULL;
    int err = load_index_from_cache(out_index);
    if (err == 0 && *out_index) {
        return 0;
    }
    err = build_index_from_directories(out_index);
    return err;
}

static int load_hmac_key_from_file(const char *path, unsigned char *out, size_t *out_len) {
    if (!path || !out || !out_len) {
        return -1;
    }
    FILE *f = fopen(path, "rb");
    if (!f) {
        return -1;
    }
    size_t total = 0U;
    while (total < KOLIBRI_HMAC_KEY_SIZE) {
        size_t n = fread(out + total, 1, KOLIBRI_HMAC_KEY_SIZE - total, f);
        if (n == 0) {
            break;
        }
        total += n;
    }
    fclose(f);
    if (total == 0U) {
        return -1;
    }
    *out_len = total;
    return 0;
}

static int load_admin_token_from_file(const char *path, char *out, size_t out_size) {
    if (!path || !out || out_size == 0U) {
        return -1;
    }
    FILE *file = fopen(path, "rb");
    if (!file) {
        return -1;
    }
    size_t read = fread(out, 1U, out_size - 1U, file);
    fclose(file);
    while (read > 0U && (out[read - 1U] == '\n' || out[read - 1U] == '\r')) {
        read--;
    }
    out[read] = '\0';
    return read > 0U ? 0 : -1;
}

static int load_hmac_key_from_environment(void) {
    kolibri_hmac_key_len = 0U;
    kolibri_hmac_key_origin[0] = '\0';

    const char *env_inline = getenv("KOLIBRI_HMAC_KEY");
    if (env_inline && *env_inline) {
        size_t len = strnlen(env_inline, KOLIBRI_HMAC_KEY_SIZE);
        memcpy(kolibri_hmac_key, env_inline, len);
        kolibri_hmac_key_len = len;
        snprintf(kolibri_hmac_key_origin,
                 sizeof(kolibri_hmac_key_origin),
                 "env(KOLIBRI_HMAC_KEY, %zu bytes)",
                 kolibri_hmac_key_len);
        return 0;
    }

    const char *env_file = getenv("KOLIBRI_HMAC_KEY_FILE");
    const char *path = (env_file && *env_file) ? env_file : "root.key";
    if (load_hmac_key_from_file(path, kolibri_hmac_key, &kolibri_hmac_key_len) == 0) {
        snprintf(kolibri_hmac_key_origin,
                 sizeof(kolibri_hmac_key_origin),
                 "%s (%zu bytes)",
                 path,
                 kolibri_hmac_key_len);
        return 0;
    }

    return -1;
}

static int kolibri_genome_init_or_open(void) {
    if (load_hmac_key_from_environment() != 0) {
        fprintf(stderr,
                "[kolibri-knowledge] no HMAC key configured. Set KOLIBRI_HMAC_KEY or KOLIBRI_HMAC_KEY_FILE/root.key\n");
        return -1;
    }

    ensure_dir_exists(".kolibri");
    if (kg_open(&kolibri_genome, KOLIBRI_KNOWLEDGE_GENOME, kolibri_hmac_key, kolibri_hmac_key_len) == 0) {
        kolibri_genome_ready = 1;
        char payload[KOLIBRI_PAYLOAD_SIZE];
        snprintf(payload, sizeof(payload), "knowledge_server стартовал (ключ: %s)", kolibri_hmac_key_origin);
        char encoded[KOLIBRI_PAYLOAD_SIZE];
        if (kg_encode_payload(payload, encoded, sizeof(encoded)) == 0) {
            kg_append(&kolibri_genome, "BOOT", encoded, NULL);
        }
        return 0;
    }

    kolibri_genome_ready = 0;
    fprintf(stderr, "[kolibri-knowledge] genome open failed\n");
    return -1;
}

static void kolibri_genome_close(void) {
    if (kolibri_genome_ready) {
        kg_close(&kolibri_genome);
        kolibri_genome_ready = 0;
    }
}

static void knowledge_record_event(const char *event, const char *payload) {
    if (!kolibri_genome_ready || !event || !payload) {
        return;
    }
    char encoded[KOLIBRI_PAYLOAD_SIZE];
    if (kg_encode_payload(payload, encoded, sizeof(encoded)) != 0) {
        return;
    }
    kg_append(&kolibri_genome, event, encoded, NULL);
}

static void write_bootstrap_script(const KolibriKnowledgeIndex *index, const char *path) {
    if (!index || !path) {
        return;
    }
    FILE *file = fopen(path, "w");
    if (!file) {
        perror("[kolibri-knowledge] fopen bootstrap");
        return;
    }
    fprintf(file, "начало:\n");
    fprintf(file, "    показать \"Kolibri загружает знания\"\n");
    size_t limit = kolibri_knowledge_index_document_count(index);
    if (limit > 12U) {
        limit = 12U;
    }
    for (size_t i = 0; i < limit; ++i) {
        const KolibriKnowledgeDoc *doc = kolibri_knowledge_index_document(index, i);
        if (!doc) {
            continue;
        }
        char question[256];
        char answer[512];
        char source_label[256];
        const char *title = doc->title ? doc->title : doc->id;
        const char *source = doc->source ? doc->source : doc->id;
        char *preview = snippet_preview(doc->content, 360U);
        escape_script_string(title, question, sizeof(question));
        escape_script_string(preview ? preview : "", answer, sizeof(answer));
        escape_script_string(source, source_label, sizeof(source_label));
        free(preview);
        fprintf(file, "    переменная источник_%zu = \"%s\"\n", i + 1, source_label);
        fprintf(file, "    обучить связь \"%s\" -> \"%s\"\n", question, answer);
    }
    fprintf(file, "    создать формулу ответ из \"ассоциация\"\n");
    fprintf(file, "    вызвать эволюцию\n");
    fprintf(file, "    показать \"Знания загружены\"\n");
    fprintf(file, "конец.\n");
    fclose(file);
    fprintf(stdout, "[kolibri-knowledge] bootstrap script written to %s\n", path);
    kolibri_bootstrap_timestamp = time(NULL);
}

static int starts_with(const char *text, const char *prefix) {
    if (!text || !prefix) {
        return 0;
    }
    while (*prefix) {
        if (*text++ != *prefix++) {
            return 0;
        }
    }
    return 1;
}

static int extract_header_value(const char *headers,
                                size_t header_len,
                                const char *name,
                                char *output,
                                size_t output_size) {
    if (!headers || !name || !output || output_size == 0U) {
        return -1;
    }
    size_t name_len = strlen(name);
    const char *cursor = headers;
    const char *end = headers + header_len;
    while (cursor < end) {
        const char *line_end = strstr(cursor, "\r\n");
        size_t line_len = line_end ? (size_t)(line_end - cursor) : (size_t)(end - cursor);
        if (line_len >= name_len + 1U && strncasecmp(cursor, name, name_len) == 0 && cursor[name_len] == ':') {
            const char *value_start = cursor + name_len + 1U;
            while (value_start < cursor + line_len && (*value_start == ' ' || *value_start == '\t')) {
                value_start++;
            }
            size_t value_len = cursor + line_len - value_start;
            if (value_len >= output_size) {
                value_len = output_size - 1U;
            }
            memcpy(output, value_start, value_len);
            output[value_len] = '\0';
            return 0;
        }
        if (!line_end) {
            break;
        }
        cursor = line_end + 2;
    }
    return -1;
}

static size_t parse_content_length_header(const char *headers, size_t header_len, int *has_header) {
    char value[32];
    if (extract_header_value(headers, header_len, "Content-Length", value, sizeof(value)) == 0) {
        char *endptr = NULL;
        unsigned long long parsed = strtoull(value, &endptr, 10);
        if (!endptr || *endptr != '\0') {
            if (has_header) {
                *has_header = 1;
            }
            return 0U;
        }
        if (has_header) {
            *has_header = 1;
        }
        return (size_t)parsed;
    }
    if (has_header) {
        *has_header = 0;
    }
    return 0U;
}

static void url_decode(char *text) {
    char *src = text;
    char *dst = text;
    while (*src) {
        if (*src == '%' && src[1] && src[2]) {
            char buf[3] = { src[1], src[2], '\0' };
            *dst++ = (char)strtol(buf, NULL, 16);
            src += 3;
        } else if (*src == '+') {
            *dst++ = ' ';
            ++src;
        } else {
            *dst++ = *src++;
        }
    }
    *dst = '\0';
}

static void parse_query(const char *path, char *query_buffer, size_t query_size, size_t *limit_out) {
    query_buffer[0] = '\0';
    if (limit_out) {
        *limit_out = 3U;
    }
    const char *question_mark = strchr(path, '?');
    if (!question_mark) {
        return;
    }
    const char *params = question_mark + 1;
    char temp[1024];
    strncpy(temp, params, sizeof(temp) - 1U);
    temp[sizeof(temp) - 1U] = '\0';
    char *token = strtok(temp, "&");
    while (token) {
        if (starts_with(token, "q=")) {
            strncpy(query_buffer, token + 2, query_size - 1U);
            query_buffer[query_size - 1U] = '\0';
            url_decode(query_buffer);
        } else if (starts_with(token, "limit=")) {
            int value = atoi(token + 6);
            if (value > 0 && limit_out) {
                *limit_out = (size_t)value;
            }
        }
        token = strtok(NULL, "&");
    }
}

static void parse_form_field(const char *payload, const char *key, char *output, size_t output_size) {
    if (!output || output_size == 0U) {
        return;
    }
    output[0] = '\0';
    if (!payload || !key) {
        return;
    }
    size_t key_len = strlen(key);
    const char *cursor = payload;
    while (*cursor) {
        const char *amp = strchr(cursor, '&');
        size_t segment_len = amp ? (size_t)(amp - cursor) : strlen(cursor);
        if (segment_len >= key_len + 1U && strncmp(cursor, key, key_len) == 0 && cursor[key_len] == '=') {
            size_t copy_len = segment_len - key_len - 1U;
            if (copy_len >= output_size) {
                copy_len = output_size - 1U;
            }
            memcpy(output, cursor + key_len + 1U, copy_len);
            output[copy_len] = '\0';
            url_decode(output);
            return;
        }
        if (!amp) {
            break;
        }
        cursor = amp + 1;
    }
}

static int require_admin_token(const char *headers, size_t header_len) {
    if (kolibri_admin_token[0] == '\0') {
        return 503;
    }
    char auth_value[256];
    if (extract_header_value(headers, header_len, "Authorization", auth_value, sizeof(auth_value)) != 0) {
        return 401;
    }
    const char *prefix = "Bearer ";
    size_t prefix_len = strlen(prefix);
    if (strncasecmp(auth_value, prefix, prefix_len) != 0) {
        return 401;
    }
    const char *token = auth_value + prefix_len;
    while (*token == ' ') {
        token++;
    }
    if (strcmp(token, kolibri_admin_token) != 0) {
        return 403;
    }
    return 0;
}

static ssize_t receive_http_request(int fd,
                                    char *buffer,
                                    size_t buffer_size,
                                    size_t *header_len_out,
                                    size_t *content_len_out) {
    if (!buffer || buffer_size == 0U) {
        return -1;
    }
    size_t total = 0U;
    size_t header_len = 0U;
    size_t content_length = 0U;
    int content_length_present = 0;
    while (total < buffer_size - 1U) {
        ssize_t received = recv(fd, buffer + total, buffer_size - 1U - total, 0);
        if (received < 0) {
            if (errno == EWOULDBLOCK || errno == EAGAIN) {
                return -2;
            }
            return -1;
        }
        if (received == 0) {
            break;
        }
        total += (size_t)received;
        buffer[total] = '\0';
        if (header_len == 0U) {
            char *marker = strstr(buffer, "\r\n\r\n");
            if (marker) {
                header_len = (size_t)(marker - buffer) + 4U;
                content_length = parse_content_length_header(buffer, header_len, &content_length_present);
                if (content_length > KOLIBRI_MAX_CONTENT_LENGTH) {
                    return -3;
                }
                if (total >= header_len + content_length) {
                    break;
                }
            }
        } else if (total >= header_len + content_length) {
            break;
        }
    }
    if (header_len == 0U) {
        return -4;
    }
    if (total >= buffer_size - 1U) {
        return -5;
    }
    if (total < header_len + content_length) {
        return -6;
    }
    (void)content_length_present;
    buffer[total] = '\0';
    if (header_len_out) {
        *header_len_out = header_len;
    }
    if (content_len_out) {
        *content_len_out = content_length;
    }
    return (ssize_t)total;
}

static int format_iso8601_utc(time_t value, char *output, size_t out_size) {
    if (!output || out_size == 0) {
        return -1;
    }
    if (value <= 0) {
        output[0] = '\0';
        return -1;
    }
    struct tm tm_value;
    if (!gmtime_r(&value, &tm_value)) {
        output[0] = '\0';
        return -1;
    }
    if (strftime(output, out_size, "%Y-%m-%dT%H:%M:%SZ", &tm_value) == 0) {
        output[0] = '\0';
        return -1;
    }
    return 0;
}

static void send_response(int client_fd, int status_code, const char *content_type, const char *body) {
    char header[256];
    int header_len = snprintf(header, sizeof(header),
                              "HTTP/1.1 %d %s\r\nContent-Type: %s\r\nContent-Length: %zu\r\nConnection: close\r\n\r\n",
                              status_code,
                              status_code == 200 ? "OK" : "Error",
                              content_type,
                              body ? strlen(body) : 0U);
    if (header_len > 0) {
        send(client_fd, header, (size_t)header_len, 0);
    }
    if (body && *body) {
        send(client_fd, body, strlen(body), 0);
    }
}

static size_t json_escape_char(char ch, char *output, size_t out_size) {
    if (!output || out_size == 0) {
        return 0;
    }
    switch (ch) {
    case '"':
    case '\\':
        if (out_size >= 2) {
            output[0] = '\\';
            output[1] = ch;
            return 2;
        }
        return 0;
    case '\n':
        if (out_size >= 2) {
            output[0] = '\\';
            output[1] = 'n';
            return 2;
        }
        return 0;
    case '\r':
        if (out_size >= 2) {
            output[0] = '\\';
            output[1] = 'r';
            return 2;
        }
        return 0;
    case '\t':
        if (out_size >= 2) {
            output[0] = '\\';
            output[1] = 't';
            return 2;
        }
        return 0;
    default:
        if ((unsigned char)ch < 0x20U) {
            if (out_size >= 6) {
                unsigned char value = (unsigned char)ch;
                snprintf(output, out_size, "\\u%04x", value);
                return 6;
            }
            return 0;
        }
        output[0] = ch;
        return 1;
    }
}

static void json_escape(const char *input, char *output, size_t out_size) {
    if (!output || out_size == 0) {
        return;
    }
    if (!input) {
        output[0] = '\0';
        return;
    }
    size_t out_index = 0;
    for (size_t i = 0; input[i] != '\0' && out_index + 1 < out_size; ++i) {
        size_t written = json_escape_char(input[i], output + out_index, out_size - out_index - 1U);
        if (written == 0) {
            break;
        }
        out_index += written;
    }
    output[out_index] = '\0';
}

static void build_directories_json(char *buffer, size_t buffer_size) {
    if (!buffer || buffer_size == 0) {
        return;
    }
    if (buffer_size < 3U) {
        buffer[0] = '\0';
        return;
    }
    size_t offset = 0U;
    buffer[offset++] = '[';
    for (size_t i = 0; i < kolibri_knowledge_directory_count; ++i) {
        if (offset + 2U >= buffer_size) {
            break;
        }
        if (i > 0U) {
            buffer[offset++] = ',';
            if (offset >= buffer_size) {
                break;
            }
        }
        buffer[offset++] = '"';
        if (offset >= buffer_size) {
            break;
        }
        char escaped[256];
        json_escape(kolibri_knowledge_directories[i], escaped, sizeof(escaped));
        size_t len = strlen(escaped);
        if (len > buffer_size - offset - 2U) {
            len = buffer_size - offset - 2U;
        }
        memcpy(buffer + offset, escaped, len);
        offset += len;
        if (offset < buffer_size) {
            buffer[offset++] = '"';
        }
    }
    if (offset >= buffer_size - 1U) {
        buffer[buffer_size - 1U] = '\0';
        return;
    }
    buffer[offset++] = ']';
    if (offset < buffer_size) {
        buffer[offset] = '\0';
    } else {
        buffer[buffer_size - 1U] = '\0';
    }
}

static void prometheus_escape_label(const char *input, char *output, size_t out_size) {
    if (!output || out_size == 0) {
        return;
    }
    if (!input) {
        output[0] = '\0';
        return;
    }
    size_t out_index = 0U;
    for (size_t i = 0; input[i] != '\0' && out_index + 1U < out_size; ++i) {
        char ch = input[i];
        if (ch == '\\' || ch == '"') {
            if (out_index + 2U >= out_size) {
                break;
            }
            output[out_index++] = '\\';
            output[out_index++] = ch;
        } else if (ch == '\n') {
            if (out_index + 2U >= out_size) {
                break;
            }
            output[out_index++] = '\\';
            output[out_index++] = 'n';
        } else {
            output[out_index++] = ch;
        }
    }
    output[out_index] = '\0';
}


static void handle_client(int client_fd, const KolibriKnowledgeIndex *index) {
    char buffer[KOLIBRI_REQUEST_BUFFER];
    kolibri_requests_total += 1U;

    struct timeval timeout;
    timeout.tv_sec = 5;
    timeout.tv_usec = 0;
    setsockopt(client_fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
    setsockopt(client_fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));

    size_t header_len = 0U;
    size_t content_len = 0U;
    ssize_t total = receive_http_request(client_fd, buffer, sizeof(buffer), &header_len, &content_len);
    if (total < 0) {
        if (total == -2) {
            send_response(client_fd, 408, "application/json", "{\"error\":\"timeout\"}");
        } else if (total == -3 || total == -5) {
            send_response(client_fd, 413, "application/json", "{\"error\":\"payload too large\"}");
        } else {
            send_response(client_fd, 400, "application/json", "{\"error\":\"bad request\"}");
        }
        return;
    }

    char *line_end = strstr(buffer, "\r\n");
    if (!line_end) {
        send_response(client_fd, 400, "application/json", "{\"error\":\"bad request\"}");
        return;
    }
    *line_end = '\0';

    char method[8];
    char *method_end = strchr(buffer, ' ');
    if (!method_end) {
        send_response(client_fd, 400, "application/json", "{\"error\":\"bad request\"}");
        return;
    }
    size_t method_len = (size_t)(method_end - buffer);
    if (method_len >= sizeof(method)) {
        method_len = sizeof(method) - 1U;
    }
    memcpy(method, buffer, method_len);
    method[method_len] = '\0';

    char *path_start = method_end + 1;
    char *version_start = strchr(path_start, ' ');
    if (!version_start) {
        send_response(client_fd, 400, "application/json", "{\"error\":\"bad request\"}");
        return;
    }
    *version_start = '\0';

    const char *header_start = line_end + 2;
    size_t header_bytes = header_len > (size_t)(header_start - buffer) ? header_len - (size_t)(header_start - buffer) : 0U;
    const char *body = buffer + header_len;

    size_t document_count = index ? kolibri_knowledge_index_document_count(index) : 0U;

    if (strcmp(method, "GET") == 0 &&
        (strcmp(path_start, "/healthz") == 0 || starts_with(path_start, "/api/knowledge/healthz"))) {
        char generated_iso[64];
        char bootstrap_iso[64];
        char generated_field[72];
        char bootstrap_field[72];
        if (format_iso8601_utc(kolibri_index_timestamp, generated_iso, sizeof(generated_iso)) == 0) {
            snprintf(generated_field, sizeof(generated_field), "\"%s\"", generated_iso);
        } else {
            strcpy(generated_field, "null");
        }
        if (format_iso8601_utc(kolibri_bootstrap_timestamp, bootstrap_iso, sizeof(bootstrap_iso)) == 0) {
            snprintf(bootstrap_field, sizeof(bootstrap_field), "\"%s\"", bootstrap_iso);
        } else {
            strcpy(bootstrap_field, "null");
        }
        double uptime = 0.0;
        if (kolibri_server_started_at > 0) {
            uptime = difftime(time(NULL), kolibri_server_started_at);
            if (uptime < 0.0) {
                uptime = 0.0;
            }
        }
        char directories_json[512];
        build_directories_json(directories_json, sizeof(directories_json));
        if (directories_json[0] == '\0') {
            strncpy(directories_json, "[]", sizeof(directories_json) - 1U);
            directories_json[sizeof(directories_json) - 1U] = '\0';
        }
        char key_origin_field[256];
        if (kolibri_hmac_key_origin[0] != '\0') {
            char escaped_origin[192];
            json_escape(kolibri_hmac_key_origin, escaped_origin, sizeof(escaped_origin));
            snprintf(key_origin_field, sizeof(key_origin_field), "\"%s\"", escaped_origin);
        } else {
            strcpy(key_origin_field, "null");
        }
        char escaped_source[128];
        json_escape(kolibri_index_source, escaped_source, sizeof(escaped_source));
        char escaped_cache[256];
        json_escape(kolibri_index_cache_dir, escaped_cache, sizeof(escaped_cache));
        char body_json[1280];
        int len = snprintf(body_json,
                           sizeof(body_json),
                           "{\"status\":\"ok\",\"documents\":%zu,\"generatedAt\":%s,\"bootstrapGeneratedAt\":%s,"
                           "\"requests\":%zu,\"hits\":%zu,\"misses\":%zu,\"uptimeSeconds\":%.0f,\"keyOrigin\":%s,\"indexRoots\":%s,\"indexSource\":\"%s\",\"indexCache\":\"%s\"}",
                           document_count,
                           generated_field,
                           bootstrap_field,
                           kolibri_requests_total,
                           kolibri_search_hits,
                           kolibri_search_misses,
                           uptime,
                           key_origin_field,
                           directories_json,
                           escaped_source,
                           escaped_cache);
        if (len < 0 || (size_t)len >= sizeof(body_json)) {
            send_response(client_fd, 500, "application/json", "{\"error\":\"internal\"}");
            return;
        }
        send_response(client_fd, 200, "application/json", body_json);
        return;
    }

    if (strcmp(method, "GET") == 0 &&
        (strcmp(path_start, "/metrics") == 0 || starts_with(path_start, "/api/knowledge/metrics"))) {
        double bootstrap_generated = kolibri_bootstrap_timestamp > 0 ? (double)kolibri_bootstrap_timestamp : 0.0;
        double index_generated = kolibri_index_timestamp > 0 ? (double)kolibri_index_timestamp : 0.0;
        double uptime = 0.0;
        if (kolibri_server_started_at > 0) {
            uptime = difftime(time(NULL), kolibri_server_started_at);
            if (uptime < 0.0) {
                uptime = 0.0;
            }
        }
        char body_metrics[4096];
        int len = snprintf(body_metrics,
                           sizeof(body_metrics),
                           "# HELP kolibri_knowledge_documents Number of documents in knowledge index\n"
                           "# TYPE kolibri_knowledge_documents gauge\n"
                           "kolibri_knowledge_documents %zu\n"
                           "# HELP kolibri_requests_total Total HTTP requests handled\n"
                           "# TYPE kolibri_requests_total counter\n"
                           "kolibri_requests_total %zu\n"
                           "# HELP kolibri_search_hits_success Total search queries with results\n"
                           "# TYPE kolibri_search_hits_success counter\n"
                           "kolibri_search_hits_success %zu\n"
                           "# HELP kolibri_search_misses_total Total search queries without results\n"
                           "# TYPE kolibri_search_misses_total counter\n"
                           "kolibri_search_misses_total %zu\n"
                           "# HELP kolibri_bootstrap_generated_unixtime Timestamp of last bootstrap script generation\n"
                           "# TYPE kolibri_bootstrap_generated_unixtime gauge\n"
                           "kolibri_bootstrap_generated_unixtime %.0f\n"
                           "# HELP kolibri_knowledge_generated_unixtime Timestamp of last knowledge index build\n"
                           "# TYPE kolibri_knowledge_generated_unixtime gauge\n"
                           "kolibri_knowledge_generated_unixtime %.0f\n"
                           "# HELP kolibri_knowledge_uptime_seconds Knowledge server uptime\n"
                           "# TYPE kolibri_knowledge_uptime_seconds gauge\n"
                           "kolibri_knowledge_uptime_seconds %.0f\n"
                           "# HELP kolibri_knowledge_key_length_bytes Length of configured HMAC key\n"
                           "# TYPE kolibri_knowledge_key_length_bytes gauge\n"
                           "kolibri_knowledge_key_length_bytes %zu\n"
                           "# HELP kolibri_knowledge_directories_total Number of knowledge directories\n"
                           "# TYPE kolibri_knowledge_directories_total gauge\n"
                           "kolibri_knowledge_directories_total %zu\n",
                           document_count,
                           kolibri_requests_total,
                           kolibri_search_hits,
                           kolibri_search_misses,
                           bootstrap_generated,
                           index_generated,
                           uptime,
                           kolibri_hmac_key_len,
                           kolibri_knowledge_directory_count);
        if (len < 0) {
            send_response(client_fd, 500, "text/plain", "error");
            return;
        }
        size_t offset = (size_t)len;
        for (size_t i = 0; i < kolibri_knowledge_directory_count && offset < sizeof(body_metrics); ++i) {
            char label[256];
            prometheus_escape_label(kolibri_knowledge_directories[i], label, sizeof(label));
            int written = snprintf(body_metrics + offset,
                                   sizeof(body_metrics) - offset,
                                   "kolibri_knowledge_directory_info{path=\"%s\"} 1\n",
                                   label);
            if (written < 0 || (size_t)written >= sizeof(body_metrics) - offset) {
                send_response(client_fd, 500, "text/plain", "error");
                return;
            }
            offset += (size_t)written;
        }
        if (kolibri_hmac_key_origin[0] != '\0') {
            char origin_label[256];
            prometheus_escape_label(kolibri_hmac_key_origin, origin_label, sizeof(origin_label));
            int written = snprintf(body_metrics + offset,
                                   sizeof(body_metrics) - offset,
                                   "kolibri_knowledge_hmac_key_info{origin=\"%s\"} 1\n",
                                   origin_label);
            if (written < 0 || (size_t)written >= sizeof(body_metrics) - offset) {
                send_response(client_fd, 500, "text/plain", "error");
                return;
            }
            offset += (size_t)written;
        }
        send_response(client_fd, 200, "text/plain; version=0.0.4", body_metrics);
        return;
    }

    if (strcmp(method, "POST") == 0 && strcmp(path_start, "/api/knowledge/feedback") == 0) {
        int auth_status = require_admin_token(header_start, header_bytes);
        if (auth_status != 0) {
            if (auth_status == 503) {
                send_response(client_fd, 503, "application/json", "{\"error\":\"admin token not configured\"}");
            } else if (auth_status == 401) {
                send_response(client_fd, 401, "application/json", "{\"error\":\"unauthorized\"}");
            } else {
                send_response(client_fd, 403, "application/json", "{\"error\":\"forbidden\"}");
            }
            return;
        }
        time_t now = time(NULL);
        if (!rate_limiter_allow(&kolibri_feedback_rate, now, KOLIBRI_RATE_LIMIT_BURST)) {
            send_response(client_fd, 429, "application/json", "{\"error\":\"rate limited\"}");
            return;
        }
        char rating[64];
        char question[512];
        char answer[512];
        parse_form_field(body, "rating", rating, sizeof(rating));
        parse_form_field(body, "q", question, sizeof(question));
        parse_form_field(body, "a", answer, sizeof(answer));
        char decoded_q[512];
        char decoded_a[512];
        strncpy(decoded_q, question, sizeof(decoded_q) - 1U);
        decoded_q[sizeof(decoded_q) - 1U] = '\0';
        strncpy(decoded_a, answer, sizeof(decoded_a) - 1U);
        decoded_a[sizeof(decoded_a) - 1U] = '\0';
        url_decode(decoded_q);
        url_decode(decoded_a);
        const char *rating_value = rating[0] ? rating : "unknown";
        char payload[512];
        snprintf(payload,
                 sizeof(payload),
                 "rating=%.*s q=%.*s a=%.*s",
                 64,
                 rating_value,
                 192,
                 decoded_q,
                 192,
                 decoded_a);
        knowledge_record_event("USER_FEEDBACK", payload);
        send_response(client_fd, 200, "application/json", "{\"status\":\"ok\"}");
        return;
    }

    if (strcmp(method, "POST") == 0 && strcmp(path_start, "/api/knowledge/teach") == 0) {
        int auth_status = require_admin_token(header_start, header_bytes);
        if (auth_status != 0) {
            if (auth_status == 503) {
                send_response(client_fd, 503, "application/json", "{\"error\":\"admin token not configured\"}");
            } else if (auth_status == 401) {
                send_response(client_fd, 401, "application/json", "{\"error\":\"unauthorized\"}");
            } else {
                send_response(client_fd, 403, "application/json", "{\"error\":\"forbidden\"}");
            }
            return;
        }
        time_t now = time(NULL);
        if (!rate_limiter_allow(&kolibri_teach_rate, now, KOLIBRI_RATE_LIMIT_BURST)) {
            send_response(client_fd, 429, "application/json", "{\"error\":\"rate limited\"}");
            return;
        }
        char question[512];
        char answer[512];
        parse_form_field(body, "q", question, sizeof(question));
        parse_form_field(body, "a", answer, sizeof(answer));
        if (question[0] == '\0' || answer[0] == '\0') {
            send_response(client_fd, 400, "application/json", "{\"error\":\"missing q or a\"}");
            return;
        }
        char payload[512];
        snprintf(payload, sizeof(payload), "q=%.*s a=%.*s", 200, question, 200, answer);
        knowledge_record_event("TEACH", payload);
        send_response(client_fd, 200, "application/json", "{\"status\":\"ok\"}");
        return;
    }

    if (!(strcmp(method, "GET") == 0 && starts_with(path_start, "/api/knowledge/search"))) {
        send_response(client_fd, 404, "application/json", "{\"error\":\"not found\"}");
        return;
    }

    char query[512];
    size_t limit = 3U;
    parse_query(path_start, query, sizeof(query), &limit);
    if (!*query || !index) {
        kolibri_search_misses += 1U;
        send_response(client_fd, 200, "application/json", "{\"snippets\":[]}");
        return;
    }
    if (limit > 16U) {
        limit = 16U;
    }

    size_t indices[16];
    float scores[16];
    size_t result_count = 0U;
    int search_err = kolibri_knowledge_index_search(index, query, limit, indices, scores, &result_count);
    if (search_err != 0) {
        send_response(client_fd, 500, "application/json", "{\"error\":\"search failed\"}");
        return;
    }

    char response[KOLIBRI_RESPONSE_BUFFER];
    size_t offset = 0U;
    offset += (size_t)snprintf(response + offset, sizeof(response) - offset, "{\"snippets\":[");
    for (size_t i = 0; i < result_count && offset < sizeof(response); ++i) {
        const KolibriKnowledgeDoc *doc = kolibri_knowledge_index_document(index, indices[i]);
        if (!doc) {
            continue;
        }
        const char *separator = (i + 1U < result_count) ? "," : "";
        char id_buf[256];
        char title_buf[512];
        char content_buf[1024];
        char source_buf[512];
        json_escape(doc->id ? doc->id : "", id_buf, sizeof(id_buf));
        json_escape(doc->title ? doc->title : "", title_buf, sizeof(title_buf));
        json_escape(doc->content ? doc->content : "", content_buf, sizeof(content_buf));
        json_escape(doc->source ? doc->source : "", source_buf, sizeof(source_buf));
        offset += (size_t)snprintf(response + offset,
                                   sizeof(response) - offset,
                                   "{\"id\":\"%s\",\"title\":\"%s\",\"content\":\"%s\",\"source\":\"%s\",\"score\":%.3f}%s",
                                   id_buf,
                                   title_buf,
                                   content_buf,
                                   source_buf,
                                   scores[i],
                                   separator);
    }
    if (result_count == 0U) {
        kolibri_search_misses += 1U;
    } else {
        kolibri_search_hits += 1U;
    }

    if (offset >= sizeof(response) - 2U) {
        offset = sizeof(response) - 3U;
    }
    offset += (size_t)snprintf(response + offset, sizeof(response) - offset, "]}");
    response[sizeof(response) - 1U] = '\0';

    send_response(client_fd, 200, "application/json", response);

    if (kolibri_genome_ready) {
        char ask_payload[512];
        int query_limit = (int)sizeof(ask_payload) - 3;
        if (query_limit < 0) {
            query_limit = 0;
        }
        snprintf(ask_payload, sizeof(ask_payload), "q=%.*s", query_limit, query);
        knowledge_record_event("ASK", ask_payload);
        size_t replay = result_count < 3U ? result_count : 3U;
        for (size_t i = 0; i < replay; ++i) {
            const KolibriKnowledgeDoc *doc = kolibri_knowledge_index_document(index, indices[i]);
            if (!doc) {
                continue;
            }
            const char *answer_src = doc->content ? doc->content : "";
            char *preview = snippet_preview(answer_src, 200U);
            char teach_payload[512];
            int remaining = (int)sizeof(teach_payload) - 1 - 5;
            if (remaining < 0) {
                remaining = 0;
            }
            int teach_q_limit = remaining > 0 ? remaining / 2 : 0;
            int teach_a_limit = remaining - teach_q_limit;
            snprintf(teach_payload,
                     sizeof(teach_payload),
                     "q=%.*s a=%.*s",
                     teach_q_limit,
                     query,
                     teach_a_limit,
                     preview ? preview : "");
            knowledge_record_event("TEACH", teach_payload);
            free(preview);
        }
    }
}


int main(int argc, char **argv) {
    kolibri_server_started_at = time(NULL);

    apply_environment_configuration();
    int cli_status = apply_cli_arguments(argc, argv);
    if (cli_status > 0) {
        free_knowledge_directories();
        return 0;
    }
    if (cli_status < 0) {
        free_knowledge_directories();
        return 1;
    }

    if (ensure_default_directories() != 0) {
        fprintf(stderr, "[kolibri-knowledge] failed to prepare knowledge directories\n");
        free_knowledge_directories();
        return 1;
    }

    KolibriKnowledgeIndex *index = NULL;
    int index_status = load_or_build_index(&index);
    if (index_status != 0 || !index) {
        fprintf(stderr, "[kolibri-knowledge] failed to prepare knowledge index (err=%d)\n", index_status);
        free_knowledge_directories();
        return 1;
    }

    size_t document_count = kolibri_knowledge_index_document_count(index);
    fprintf(stdout, "[kolibri-knowledge] loaded %zu documents (%s)\n", document_count, kolibri_index_source);
    if (document_count > 0U) {
        write_bootstrap_script(index, KOLIBRI_BOOTSTRAP_SCRIPT);
    }

    if (kolibri_genome_init_or_open() != 0) {
        kolibri_knowledge_index_destroy(index);
        free_knowledge_directories();
        return 1;
    }

    struct sigaction sa;
    memset(&sa, 0, sizeof(sa));
    sa.sa_handler = handle_signal;
    sigemptyset(&sa.sa_mask);
    if (sigaction(SIGINT, &sa, NULL) != 0 || sigaction(SIGTERM, &sa, NULL) != 0) {
        perror("sigaction");
        kolibri_genome_close();
        kolibri_knowledge_index_destroy(index);
        free_knowledge_directories();
        return 1;
    }

    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) {
        perror("socket");
        kolibri_genome_close();
        kolibri_knowledge_index_destroy(index);
        free_knowledge_directories();
        return 1;
    }
    int reuse = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    if (inet_pton(AF_INET, kolibri_bind_address, &addr.sin_addr) != 1) {
        fprintf(stderr, "[kolibri-knowledge] invalid bind address: %s\n", kolibri_bind_address);
        close(server_fd);
        kolibri_genome_close();
        kolibri_knowledge_index_destroy(index);
        free_knowledge_directories();
        return 1;
    }
    addr.sin_port = htons((uint16_t)kolibri_server_port);
    if (bind(server_fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
        perror("bind");
        close(server_fd);
        kolibri_genome_close();
        kolibri_knowledge_index_destroy(index);
        free_knowledge_directories();
        return 1;
    }
    if (listen(server_fd, KOLIBRI_SERVER_BACKLOG) != 0) {
        perror("listen");
        close(server_fd);
        kolibri_genome_close();
        kolibri_knowledge_index_destroy(index);
        free_knowledge_directories();
        return 1;
    }

    fprintf(stdout,
            "[kolibri-knowledge] listening on http://%s:%d\n",
            kolibri_bind_address,
            kolibri_server_port);

    while (kolibri_server_running) {
        struct sockaddr_in client_addr;
        socklen_t client_len = sizeof(client_addr);
        int client_fd = accept(server_fd, (struct sockaddr *)&client_addr, &client_len);
        if (client_fd < 0) {
            if (errno == EINTR) {
                continue;
            }
            perror("accept");
            break;
        }
        handle_client(client_fd, index);
        close(client_fd);
    }

    close(server_fd);
    kolibri_genome_close();
    kolibri_knowledge_index_destroy(index);
    free_knowledge_directories();
    fprintf(stdout, "[kolibri-knowledge] shutdown\n");
    return 0;
}
