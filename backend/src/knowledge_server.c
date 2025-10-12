#include "kolibri/knowledge.h"

#include "kolibri/knowledge.h"

#include <arpa/inet.h>
#include <errno.h>
#include <netinet/in.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

#define KOLIBRI_SERVER_PORT 8000
#define KOLIBRI_SERVER_BACKLOG 16
#define KOLIBRI_REQUEST_BUFFER 8192
#define KOLIBRI_RESPONSE_BUFFER 32768
#define KOLIBRI_BOOTSTRAP_SCRIPT "knowledge_bootstrap.ks"

static volatile sig_atomic_t kolibri_server_running = 1;
static size_t kolibri_requests_total = 0U;
static size_t kolibri_search_hits = 0U;
static size_t kolibri_search_misses = 0U;
static time_t kolibri_bootstrap_timestamp = 0;

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
    size_t limit = index->count;
    if (limit > 12U) {
        limit = 12U;
    }
    for (size_t i = 0; i < limit; ++i) {
        const KolibriKnowledgeDocument *doc = &index->documents[i];
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

static void handle_client(int client_fd, const KolibriKnowledgeIndex *index) {
    char buffer[KOLIBRI_REQUEST_BUFFER];
    kolibri_requests_total += 1U;
    ssize_t received = recv(client_fd, buffer, sizeof(buffer) - 1U, 0);
    if (received <= 0) {
        return;
    }
    buffer[received] = '\0';
    if (!starts_with(buffer, "GET ")) {
        send_response(client_fd, 405, "application/json", "{\"error\":\"method not allowed\"}");
        return;
    }
    char *path_start = buffer + 4;
    char *space = strchr(path_start, ' ');
    if (!space) {
        send_response(client_fd, 400, "application/json", "{\"error\":\"bad request\"}");
        return;
    }
    *space = '\0';

    if (strcmp(path_start, "/healthz") == 0) {
        char body[128];
        snprintf(body, sizeof(body), "{\"status\":\"ok\",\"documents\":%zu}", index->count);
        send_response(client_fd, 200, "application/json", body);
        return;
    }

    if (strcmp(path_start, "/metrics") == 0) {
        char body[512];
        int len = snprintf(body,
                           sizeof(body),
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
                           "kolibri_bootstrap_generated_unixtime %.0f\n",
                           index->count,
                           kolibri_requests_total,
                           kolibri_search_hits,
                           kolibri_search_misses,
                           kolibri_bootstrap_timestamp > 0 ? (double)kolibri_bootstrap_timestamp : 0.0);
        if (len < 0) {
            send_response(client_fd, 500, "text/plain", "error");
            return;
        }
        send_response(client_fd, 200, "text/plain; version=0.0.4", body);
        return;
    }

    if (!starts_with(path_start, "/api/knowledge/search")) {
        send_response(client_fd, 404, "application/json", "{\"error\":\"not found\"}");
        return;
    }

    char query[512];
    size_t limit = 3U;
    parse_query(path_start, query, sizeof(query), &limit);
    if (!*query) {
        kolibri_search_misses += 1U;
        send_response(client_fd, 200, "application/json", "{\"snippets\":[]}");
        return;
    }

    const KolibriKnowledgeDocument *results[16];
    double scores[16];
    if (limit > 16U) {
        limit = 16U;
    }
    size_t found = kolibri_knowledge_search(index, query, limit, results, scores);

    char response[KOLIBRI_RESPONSE_BUFFER];
    size_t offset = 0;
    offset += (size_t)snprintf(response + offset, sizeof(response) - offset, "{\"snippets\":[");
    for (size_t i = 0; i < found && offset < sizeof(response); ++i) {
        const KolibriKnowledgeDocument *doc = results[i];
        const char *separator = (i + 1U < found) ? "," : "";
        char id_buf[256];
        char title_buf[512];
        char content_buf[1024];
        char source_buf[512];
        json_escape(doc->id ? doc->id : "", id_buf, sizeof(id_buf));
        json_escape(doc->title ? doc->title : "", title_buf, sizeof(title_buf));
        json_escape(doc->content ? doc->content : "", content_buf, sizeof(content_buf));
        json_escape(doc->source ? doc->source : "", source_buf, sizeof(source_buf));
        offset += (size_t)snprintf(response + offset, sizeof(response) - offset,
                                   "{\"id\":\"%s\",\"title\":\"%s\",\"content\":\"%s\",\"source\":\"%s\",\"score\":%.3f}%s",
                                   id_buf,
                                   title_buf,
                                   content_buf,
                                   source_buf,
                                   scores[i],
                                   separator);
    }
    if (found == 0) {
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
}

int main(void) {
    KolibriKnowledgeIndex index;
    if (kolibri_knowledge_index_init(&index) != 0) {
        fprintf(stderr, "[kolibri-knowledge] failed to init index\n");
        return 1;
    }
    kolibri_knowledge_index_load_directory(&index, "docs");
    kolibri_knowledge_index_load_directory(&index, "data");
    fprintf(stdout, "[kolibri-knowledge] loaded %zu documents\n", index.count);
    if (index.count > 0) {
        write_bootstrap_script(&index, KOLIBRI_BOOTSTRAP_SCRIPT);
    }

    signal(SIGINT, handle_signal);
    signal(SIGTERM, handle_signal);

    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) {
        perror("socket");
        kolibri_knowledge_index_free(&index);
        return 1;
    }
    int reuse = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = htons(KOLIBRI_SERVER_PORT);
    if (bind(server_fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
        perror("bind");
        close(server_fd);
        kolibri_knowledge_index_free(&index);
        return 1;
    }
    if (listen(server_fd, KOLIBRI_SERVER_BACKLOG) != 0) {
        perror("listen");
        close(server_fd);
        kolibri_knowledge_index_free(&index);
        return 1;
    }

    fprintf(stdout, "[kolibri-knowledge] listening on http://127.0.0.1:%d\n", KOLIBRI_SERVER_PORT);
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
        handle_client(client_fd, &index);
        close(client_fd);
    }

    close(server_fd);
    kolibri_knowledge_index_free(&index);
    fprintf(stdout, "[kolibri-knowledge] shutdown\n");
    return 0;
}
