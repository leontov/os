#include "kolibri_runtime.h"

#include <arpa/inet.h>
#include <ctype.h>
#include <errno.h>
#include <netinet/in.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <unistd.h>

#define SERVER_BUFFER_SIZE 8192

typedef struct {
    KolibriRuntimeOptions runtime;
    char bind_address[64];
    uint16_t http_port;
} KolibriServerOptions;

typedef struct {
    KolibriServerOptions options;
    KolibriRuntime runtime;
    int listen_fd;
} KolibriServer;

static void server_options_init(KolibriServerOptions *options) {
    kolibri_runtime_options_init(&options->runtime);
    strncpy(options->bind_address, "0.0.0.0", sizeof(options->bind_address) - 1U);
    options->bind_address[sizeof(options->bind_address) - 1U] = '\0';
    options->http_port = 8080U;
}

static void parse_server_options(int argc, char **argv, KolibriServerOptions *options) {
    server_options_init(options);
    for (int i = 1; i < argc; ++i) {
        if (strcmp(argv[i], "--seed") == 0 && i + 1 < argc) {
            options->runtime.seed = (uint64_t)strtoull(argv[i + 1], NULL, 10);
            ++i;
            continue;
        }
        if (strcmp(argv[i], "--node-id") == 0 && i + 1 < argc) {
            options->runtime.node_id = (uint32_t)strtoul(argv[i + 1], NULL, 10);
            ++i;
            continue;
        }
        if (strcmp(argv[i], "--genome") == 0 && i + 1 < argc) {
            strncpy(options->runtime.genome_path, argv[i + 1],
                    sizeof(options->runtime.genome_path) - 1U);
            options->runtime.genome_path[sizeof(options->runtime.genome_path) - 1U] = '\0';
            ++i;
            continue;
        }
        if (strcmp(argv[i], "--verify-genome") == 0) {
            options->runtime.verify_genome = true;
            continue;
        }
        if (strcmp(argv[i], "--bind") == 0 && i + 1 < argc) {
            strncpy(options->bind_address, argv[i + 1], sizeof(options->bind_address) - 1U);
            options->bind_address[sizeof(options->bind_address) - 1U] = '\0';
            ++i;
            continue;
        }
        if (strcmp(argv[i], "--http-port") == 0 && i + 1 < argc) {
            options->http_port = (uint16_t)strtoul(argv[i + 1], NULL, 10);
            ++i;
            continue;
        }
    }
}

static const char *http_status_text(int status_code) {
    switch (status_code) {
    case 200:
        return "OK";
    case 201:
        return "Created";
    case 202:
        return "Accepted";
    case 204:
        return "No Content";
    case 400:
        return "Bad Request";
    case 404:
        return "Not Found";
    case 405:
        return "Method Not Allowed";
    case 409:
        return "Conflict";
    case 413:
        return "Payload Too Large";
    default:
        return "Internal Server Error";
    }
}

static void send_response(int client_fd, int status_code, const char *content_type,
                          const char *body) {
    const char *status_text = http_status_text(status_code);
    size_t body_len = body ? strlen(body) : 0U;
    char header[256];
    int header_len = snprintf(header, sizeof(header),
                              "HTTP/1.1 %d %s\r\n"
                              "Content-Type: %s\r\n"
                              "Content-Length: %zu\r\n"
                              "Connection: close\r\n\r\n",
                              status_code, status_text, content_type ? content_type : "text/plain",
                              body_len);
    if (header_len < 0) {
        return;
    }
    (void)send(client_fd, header, (size_t)header_len, 0);
    if (body_len > 0U) {
        (void)send(client_fd, body, body_len, 0);
    }
}

static ssize_t find_header_end(const char *buffer, size_t length) {
    for (size_t i = 0; i + 3 < length; ++i) {
        if (buffer[i] == '\r' && buffer[i + 1] == '\n' && buffer[i + 2] == '\r' &&
            buffer[i + 3] == '\n') {
            return (ssize_t)(i + 4);
        }
    }
    return -1;
}

static bool json_extract_int(const char *json, const char *key, int *out_value) {
    if (!json || !key || !out_value) {
        return false;
    }
    char pattern[64];
    snprintf(pattern, sizeof(pattern), "\"%s\"", key);
    const char *pos = strstr(json, pattern);
    if (!pos) {
        return false;
    }
    pos += strlen(pattern);
    while (*pos && isspace((unsigned char)*pos)) {
        ++pos;
    }
    if (*pos != ':') {
        return false;
    }
    ++pos;
    while (*pos && isspace((unsigned char)*pos)) {
        ++pos;
    }
    char *endptr = NULL;
    long value = strtol(pos, &endptr, 10);
    if (endptr == pos) {
        return false;
    }
    *out_value = (int)value;
    return true;
}

static bool json_extract_double(const char *json, const char *key, double *out_value) {
    if (!json || !key || !out_value) {
        return false;
    }
    char pattern[64];
    snprintf(pattern, sizeof(pattern), "\"%s\"", key);
    const char *pos = strstr(json, pattern);
    if (!pos) {
        return false;
    }
    pos += strlen(pattern);
    while (*pos && isspace((unsigned char)*pos)) {
        ++pos;
    }
    if (*pos != ':') {
        return false;
    }
    ++pos;
    while (*pos && isspace((unsigned char)*pos)) {
        ++pos;
    }
    char *endptr = NULL;
    double value = strtod(pos, &endptr);
    if (endptr == pos) {
        return false;
    }
    *out_value = value;
    return true;
}

static bool json_extract_string(const char *json, const char *key, char *out, size_t out_len) {
    if (!json || !key || !out || out_len == 0U) {
        return false;
    }
    char pattern[64];
    snprintf(pattern, sizeof(pattern), "\"%s\"", key);
    const char *pos = strstr(json, pattern);
    if (!pos) {
        return false;
    }
    pos += strlen(pattern);
    while (*pos && isspace((unsigned char)*pos)) {
        ++pos;
    }
    if (*pos != ':') {
        return false;
    }
    ++pos;
    while (*pos && isspace((unsigned char)*pos)) {
        ++pos;
    }
    if (*pos != '"') {
        return false;
    }
    ++pos;
    size_t written = 0;
    while (*pos && *pos != '"') {
        if (written + 1U >= out_len) {
            break;
        }
        if (*pos == '\\' && pos[1] != '\0') {
            ++pos;
        }
        out[written++] = *pos++;
    }
    out[written] = '\0';
    return true;
}

static void handle_status(KolibriServer *server, int client_fd) {
    const KolibriFormula *best = kolibri_runtime_best_formula(&server->runtime);
    char description[128] = {0};
    if (best) {
        kolibri_runtime_describe_formula(best, description, sizeof(description));
    }
    char body[512];
    snprintf(body, sizeof(body),
             "{\"node_id\":%u,\"examples\":%zu,\"has_last_answer\":%s,"
             "\"best_formula\":\"%s\"}",
             server->options.runtime.node_id,
             kolibri_runtime_example_count(&server->runtime),
             kolibri_runtime_has_last_answer(&server->runtime) ? "true" : "false",
             description);
    send_response(client_fd, 200, "application/json", body);
}

static void handle_teach(KolibriServer *server, int client_fd, const char *body,
                         const char *content_type) {
    int input = 0;
    int target = 0;
    if (!json_extract_int(body, "input", &input) ||
        !json_extract_int(body, "target", &target)) {
        send_response(client_fd, 400, content_type,
                      "{\"error\":\"expected input and target\"}");
        return;
    }
    if (kolibri_runtime_add_example(&server->runtime, input, target) != 0) {
        send_response(client_fd, 409, content_type,
                      "{\"error\":\"example buffer full\"}");
        return;
    }
    char example_text[64];
    snprintf(example_text, sizeof(example_text), "%d->%d", input, target);
    kolibri_runtime_store_text(&server->runtime, example_text);
    char note[256];
    if (json_extract_string(body, "note", note, sizeof(note))) {
        kolibri_runtime_store_text(&server->runtime, note);
    }
    kolibri_runtime_record_event(&server->runtime, "TEACH", "пример добавлен через API");
    kolibri_runtime_tick(&server->runtime, 8);
    char response[256];
    snprintf(response, sizeof(response),
             "{\"status\":\"ok\",\"examples\":%zu,\"generations\":8}",
             kolibri_runtime_example_count(&server->runtime));
    send_response(client_fd, 200, content_type, response);
}

static void handle_ask(KolibriServer *server, int client_fd, const char *body,
                       const char *content_type) {
    int input = 0;
    if (!json_extract_int(body, "input", &input)) {
        send_response(client_fd, 400, content_type,
                      "{\"error\":\"expected input\"}");
        return;
    }
    int result = 0;
    char description[128];
    int status = kolibri_runtime_ask(&server->runtime, input, &result, description,
                                     sizeof(description));
    if (status == 1) {
        send_response(client_fd, 409, content_type,
                      "{\"error\":\"no formula available\"}");
        return;
    }
    if (status != 0) {
        send_response(client_fd, 500, content_type,
                      "{\"error\":\"failed to evaluate formula\"}");
        return;
    }
    char response[256];
    snprintf(response, sizeof(response),
             "{\"status\":\"ok\",\"output\":%d,\"description\":\"%s\"}",
             result, description);
    send_response(client_fd, 200, content_type, response);
}

static void handle_feedback(KolibriServer *server, int client_fd, const char *body,
                            const char *content_type) {
    double delta = 0.0;
    char rating[32];
    if (!json_extract_double(body, "delta", &delta)) {
        send_response(client_fd, 400, content_type,
                      "{\"error\":\"expected delta\"}");
        return;
    }
    if (!json_extract_string(body, "rating", rating, sizeof(rating))) {
        strncpy(rating, "unspecified", sizeof(rating) - 1U);
        rating[sizeof(rating) - 1U] = '\0';
    }
    int status = kolibri_runtime_feedback(&server->runtime, delta, rating);
    if (status == 1) {
        send_response(client_fd, 409, content_type,
                      "{\"error\":\"no answer to rate\"}");
        return;
    }
    if (status != 0) {
        send_response(client_fd, 409, content_type,
                      "{\"error\":\"answer changed, ask again\"}");
        return;
    }
    send_response(client_fd, 200, content_type, "{\"status\":\"ok\"}");
}

static void handle_note(KolibriServer *server, int client_fd, const char *body,
                        const char *content_type) {
    char text[256];
    if (!json_extract_string(body, "text", text, sizeof(text))) {
        send_response(client_fd, 400, content_type,
                      "{\"error\":\"expected text\"}");
        return;
    }
    kolibri_runtime_store_text(&server->runtime, text);
    kolibri_runtime_record_event(&server->runtime, "NOTE", "заметка через API");
    send_response(client_fd, 200, content_type, "{\"status\":\"ok\"}");
}

static void handle_grpc(KolibriServer *server, int client_fd, const char *path,
                        const char *body) {
    const char *method = path + strlen("/grpc/");
    if (strcmp(method, "kolibri.Runtime/Teach") == 0) {
        handle_teach(server, client_fd, body, "application/grpc+json");
        return;
    }
    if (strcmp(method, "kolibri.Runtime/Ask") == 0) {
        handle_ask(server, client_fd, body, "application/grpc+json");
        return;
    }
    if (strcmp(method, "kolibri.Runtime/Feedback") == 0) {
        handle_feedback(server, client_fd, body, "application/grpc+json");
        return;
    }
    if (strcmp(method, "kolibri.Runtime/Note") == 0) {
        handle_note(server, client_fd, body, "application/grpc+json");
        return;
    }
    send_response(client_fd, 404, "application/json",
                  "{\"error\":\"unknown gRPC method\"}");
}

static void handle_request(KolibriServer *server, int client_fd, char *request,
                           size_t request_len) {
    ssize_t header_end = find_header_end(request, request_len);
    if (header_end < 0) {
        send_response(client_fd, 400, "application/json",
                      "{\"error\":\"malformed request\"}");
        return;
    }
    size_t header_len = (size_t)header_end;
    char saved = request[header_len];
    request[header_len] = '\0';
    const char *headers = request;
    size_t content_length = 0U;
    const char *cl = strstr(headers, "Content-Length:");
    if (cl) {
        cl += strlen("Content-Length:");
        while (*cl && isspace((unsigned char)*cl)) {
            ++cl;
        }
        content_length = (size_t)strtoul(cl, NULL, 10);
    }
    request[header_len] = saved;
    if (content_length + header_len > request_len) {
        send_response(client_fd, 413, "application/json",
                      "{\"error\":\"payload too large\"}");
        return;
    }
    request[request_len] = '\0';
    char method[8];
    char path[128];
    if (sscanf(request, "%7s %127s", method, path) != 2) {
        send_response(client_fd, 400, "application/json",
                      "{\"error\":\"malformed request line\"}");
        return;
    }
    char *body = request + header_len;
    body[content_length] = '\0';
    if (strcmp(method, "GET") == 0) {
        if (strcmp(path, "/status") == 0) {
            handle_status(server, client_fd);
            return;
        }
        if (strcmp(path, "/healthz") == 0) {
            send_response(client_fd, 200, "text/plain", "ok");
            return;
        }
        send_response(client_fd, 404, "application/json",
                      "{\"error\":\"not found\"}");
        return;
    }
    if (strcmp(method, "POST") != 0) {
        send_response(client_fd, 405, "application/json",
                      "{\"error\":\"method not allowed\"}");
        return;
    }
    if (strncmp(path, "/grpc/", 6) == 0) {
        handle_grpc(server, client_fd, path, body);
        return;
    }
    if (strcmp(path, "/teach") == 0) {
        handle_teach(server, client_fd, body, "application/json");
        return;
    }
    if (strcmp(path, "/ask") == 0) {
        handle_ask(server, client_fd, body, "application/json");
        return;
    }
    if (strcmp(path, "/feedback") == 0) {
        handle_feedback(server, client_fd, body, "application/json");
        return;
    }
    if (strcmp(path, "/note") == 0) {
        handle_note(server, client_fd, body, "application/json");
        return;
    }
    send_response(client_fd, 404, "application/json",
                  "{\"error\":\"not found\"}");
}

static void server_handle_client(KolibriServer *server, int client_fd) {
    char buffer[SERVER_BUFFER_SIZE + 1];
    size_t total = 0U;
    ssize_t header_end = -1;
    while (total < SERVER_BUFFER_SIZE) {
        ssize_t received = recv(client_fd, buffer + total, SERVER_BUFFER_SIZE - total, 0);
        if (received < 0) {
            if (errno == EINTR) {
                continue;
            }
            return;
        }
        if (received == 0) {
            break;
        }
        total += (size_t)received;
        if (header_end < 0) {
            header_end = find_header_end(buffer, total);
        }
        if (header_end >= 0) {
            const char *headers = buffer;
            const char *cl = strstr(headers, "Content-Length:");
            size_t content_length = 0U;
            if (cl) {
                cl += strlen("Content-Length:");
                while (*cl && isspace((unsigned char)*cl)) {
                    ++cl;
                }
                content_length = (size_t)strtoul(cl, NULL, 10);
            }
            if (header_end + (ssize_t)content_length <= (ssize_t)total) {
                break;
            }
        }
    }
    if (total == 0U) {
        return;
    }
    if (total >= SERVER_BUFFER_SIZE) {
        send_response(client_fd, 413, "application/json",
                      "{\"error\":\"payload too large\"}");
        return;
    }
    buffer[total] = '\0';
    handle_request(server, client_fd, buffer, total);
}

static int server_start_listener(KolibriServer *server) {
    server->listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server->listen_fd < 0) {
        perror("socket");
        return -1;
    }
    int enable = 1;
    (void)setsockopt(server->listen_fd, SOL_SOCKET, SO_REUSEADDR, &enable, sizeof(enable));
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(server->options.http_port);
    if (inet_pton(AF_INET, server->options.bind_address, &addr.sin_addr) != 1) {
        fprintf(stderr, "[HTTP] invalid bind address %s\n", server->options.bind_address);
        return -1;
    }
    if (bind(server->listen_fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
        perror("bind");
        return -1;
    }
    if (listen(server->listen_fd, 16) != 0) {
        perror("listen");
        return -1;
    }
    return 0;
}

static int server_init(KolibriServer *server, const KolibriServerOptions *options) {
    memset(server, 0, sizeof(*server));
    server->options = *options;
    server->listen_fd = -1;
    if (kolibri_runtime_start(&server->runtime, &server->options.runtime) != 0) {
        return -1;
    }
    if (server_start_listener(server) != 0) {
        kolibri_runtime_stop(&server->runtime);
        return -1;
    }
    return 0;
}

static void server_shutdown(KolibriServer *server) {
    if (server->listen_fd >= 0) {
        close(server->listen_fd);
        server->listen_fd = -1;
    }
    kolibri_runtime_stop(&server->runtime);
}

static void server_run(KolibriServer *server) {
    printf("Kolibri server listening on http://%s:%u (node %u)\n", server->options.bind_address,
           server->options.http_port, server->options.runtime.node_id);
    while (true) {
        int client_fd = accept(server->listen_fd, NULL, NULL);
        if (client_fd < 0) {
            if (errno == EINTR) {
                continue;
            }
            perror("accept");
            break;
        }
        server_handle_client(server, client_fd);
        close(client_fd);
    }
}

int main(int argc, char **argv) {
    KolibriServerOptions options;
    parse_server_options(argc, argv, &options);
    KolibriServer server;
    if (server_init(&server, &options) != 0) {
        fprintf(stderr, "[HTTP] не удалось запустить сервер\n");
        return 1;
    }
    server_run(&server);
    server_shutdown(&server);
    return 0;
}
