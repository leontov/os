#include <arpa/inet.h>
#include <assert.h>
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

static void write_file(const char *path, const char *content) {
    FILE *f = fopen(path, "wb");
    assert(f);
    assert(fputs(content, f) >= 0);
    fclose(f);
}

static int http_request(const char *method,
                        const char *path,
                        const char *body,
                        const char *extra_headers,
                        char *response,
                        size_t response_size,
                        int port) {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    assert(sock >= 0);

    struct timeval tv;
    tv.tv_sec = 2;
    tv.tv_usec = 0;
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons((uint16_t)port);
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    int rc = connect(sock, (struct sockaddr *)&addr, sizeof(addr));
    if (rc != 0) {
        close(sock);
        return -1;
    }

    const char *payload = body ? body : "";
    size_t payload_len = strlen(payload);
    const char *headers = extra_headers ? extra_headers : "";

    char request[2048];
    int len = snprintf(request,
                       sizeof(request),
                       "%s %s HTTP/1.1\r\n"
                       "Host: 127.0.0.1:%d\r\n"
                       "Connection: close\r\n"
                       "Content-Length: %zu\r\n"
                       "Content-Type: application/x-www-form-urlencoded\r\n"
                       "%s"
                       "\r\n"
                       "%s",
                       method,
                       path,
                       port,
                       payload_len,
                       headers,
                       payload);
    assert(len > 0 && (size_t)len < sizeof(request));
    rc = send(sock, request, (size_t)len, 0);
    assert(rc == len);

    size_t total = 0U;
    while (total + 1 < response_size) {
        ssize_t chunk = recv(sock, response + total, response_size - total - 1U, 0);
        if (chunk <= 0) {
            break;
        }
        total += (size_t)chunk;
    }
    response[total] = '\0';
    close(sock);

    if (total == 0) {
        return -1;
    }
    if (strncmp(response, "HTTP/", 5) != 0) {
        return -1;
    }
    const char *code_start = strchr(response, ' ');
    if (!code_start) {
        return -1;
    }
    int status = atoi(code_start + 1);
    return status;
}

static void wait_for_server(int port) {
    char buffer[4096];
    for (int attempt = 0; attempt < 60; ++attempt) {
        int status = http_request("GET", "/healthz", NULL, NULL, buffer, sizeof(buffer), port);
        if (status == 200) {
            return;
        }
        struct timespec ts = { .tv_sec = 0, .tv_nsec = 100000000L };
        nanosleep(&ts, NULL);
    }
    assert(!"knowledge server did not become ready");
}

static void spawn_env_set(const char *key, const char *value) {
    if (value) {
        assert(setenv(key, value, 1) == 0);
    } else {
        assert(unsetenv(key) == 0);
    }
}

static void remove_path(const char *path) {
    (void)remove(path);
}

void test_knowledge_server_integration(void) {
    char docs_template[] = "/tmp/kolibri_docsXXXXXX";
    char cache_template[] = "/tmp/kolibri_cacheXXXXXX";
    char *docs_dir = mkdtemp(docs_template);
    char *cache_dir = mkdtemp(cache_template);
    assert(docs_dir && cache_dir);

    char doc_path[512];
    snprintf(doc_path, sizeof(doc_path), "%s/guide.md", docs_dir);
    write_file(doc_path, "# Kolibri\n\nKolibri knowledge server integration test.");

    const char *token = "secret-token";
    const int port = 19081;

    pid_t pid = fork();
    assert(pid >= 0);
    if (pid == 0) {
        spawn_env_set("KOLIBRI_KNOWLEDGE_PORT", "19081");
        spawn_env_set("KOLIBRI_KNOWLEDGE_BIND", "127.0.0.1");
        spawn_env_set("KOLIBRI_KNOWLEDGE_DIRS", docs_dir);
        spawn_env_set("KOLIBRI_KNOWLEDGE_INDEX_CACHE", cache_dir);
        spawn_env_set("KOLIBRI_HMAC_KEY", "integration-key");
        spawn_env_set("KOLIBRI_KNOWLEDGE_ADMIN_TOKEN", token);
        execl("./kolibri_knowledge_server", "kolibri_knowledge_server", NULL);
        perror("execl");
        _exit(1);
    }

    wait_for_server(port);

    char response[4096];
    int status = http_request("GET", "/healthz", NULL, NULL, response, sizeof(response), port);
    assert(status == 200);
    assert(strstr(response, "\"documents\":1"));
    assert(strstr(response, "\"indexSource\":\"directories\""));

    status = http_request("GET", "/api/knowledge/search?q=Kolibri", NULL, NULL, response, sizeof(response), port);
    assert(status == 200);
    assert(strstr(response, "snippets"));

    status = http_request("POST",
                          "/api/knowledge/feedback",
                          "rating=good&q=question&a=answer",
                          NULL,
                          response,
                          sizeof(response),
                          port);
    assert(status == 401);

    status = http_request("POST",
                          "/api/knowledge/feedback",
                          "rating=good&q=question&a=answer",
                          "Authorization: Bearer secret-token\r\n",
                          response,
                          sizeof(response),
                          port);
    assert(status == 200);

    kill(pid, SIGTERM);
    waitpid(pid, NULL, 0);

    remove_path(doc_path);
    rmdir(docs_dir);

    pid = fork();
    assert(pid >= 0);
    if (pid == 0) {
        spawn_env_set("KOLIBRI_KNOWLEDGE_PORT", "19081");
        spawn_env_set("KOLIBRI_KNOWLEDGE_BIND", "127.0.0.1");
        spawn_env_set("KOLIBRI_KNOWLEDGE_DIRS", docs_dir);
        spawn_env_set("KOLIBRI_KNOWLEDGE_INDEX_CACHE", cache_dir);
        spawn_env_set("KOLIBRI_KNOWLEDGE_INDEX_JSON", cache_dir);
        spawn_env_set("KOLIBRI_HMAC_KEY", "integration-key");
        spawn_env_set("KOLIBRI_KNOWLEDGE_ADMIN_TOKEN", token);
        execl("./kolibri_knowledge_server", "kolibri_knowledge_server", NULL);
        perror("execl");
        _exit(1);
    }

    wait_for_server(port);
    status = http_request("GET", "/healthz", NULL, NULL, response, sizeof(response), port);
    assert(status == 200);
    assert(strstr(response, "\"indexSource\":\"prebuilt\""));
    assert(strstr(response, "\"documents\":1"));

    status = http_request("GET", "/api/knowledge/search?q=Kolibri", NULL, NULL, response, sizeof(response), port);
    assert(status == 200);
    assert(strstr(response, "Kolibri"));

    kill(pid, SIGTERM);
    waitpid(pid, NULL, 0);

    char cache_index[512];
    char cache_manifest[512];
    snprintf(cache_index, sizeof(cache_index), "%s/index.json", cache_dir);
    snprintf(cache_manifest, sizeof(cache_manifest), "%s/manifest.json", cache_dir);
    remove_path(cache_index);
    remove_path(cache_manifest);
    rmdir(cache_dir);
}
