/*
 * Колибри сервер: REST/gRPC заглушка.
 */

#include "kolibri/server.h"

#include <arpa/inet.h>
#include <errno.h>
#include <netinet/in.h>
#include <pthread.h>
#include <signal.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

typedef struct {
    KolibriServerConfig config;
    atomic_bool running;
    atomic_int rest_listener;
    atomic_int grpc_listener;
    pthread_t rest_thread;
    pthread_t grpc_thread;
} KolibriServer;

static volatile sig_atomic_t g_stop_signal = 0;

static void kolibri_server_request_shutdown(KolibriServer *server);

static void kolibri_log(const char *tag, const char *message) {
    time_t now = time(NULL);
    struct tm tm_now;
    localtime_r(&now, &tm_now);
    char timestamp[32];
    strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S", &tm_now);
    fprintf(stdout, "[%s] [%s] %s\n", timestamp, tag, message);
    fflush(stdout);
}

static void kolibri_log_error(const char *tag, const char *message) {
    time_t now = time(NULL);
    struct tm tm_now;
    localtime_r(&now, &tm_now);
    char timestamp[32];
    strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S", &tm_now);
    fprintf(stderr, "[%s] [%s] %s\n", timestamp, tag, message);
    fflush(stderr);
}

static void kolibri_log_errno(const char *tag, const char *context, int error_code) {
    time_t now = time(NULL);
    struct tm tm_now;
    localtime_r(&now, &tm_now);
    char timestamp[32];
    strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S", &tm_now);
    fprintf(stderr, "[%s] [%s] %s: %s (errno=%d)\n", timestamp, tag, context,
            strerror(error_code), error_code);
    fflush(stderr);
}

static int kolibri_server_create_listener(uint16_t port) {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) {
        return -1;
    }

    int opt = 1;
    if (setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) != 0) {
        int err = errno;
        close(fd);
        errno = err;
        return -1;
    }

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_ANY);
    addr.sin_port = htons(port);

    if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
        int err = errno;
        close(fd);
        errno = err;
        return -1;
    }

    if (listen(fd, 16) != 0) {
        int err = errno;
        close(fd);
        errno = err;
        return -1;
    }

    return fd;
}

static void kolibri_server_close_listener(atomic_int *listener) {
    int fd = atomic_exchange(listener, -1);
    if (fd >= 0) {
        close(fd);
    }
}

static void kolibri_server_request_shutdown(KolibriServer *server) {
    if (!server) {
        return;
    }
    atomic_store(&server->running, false);
    kolibri_server_close_listener(&server->rest_listener);
    kolibri_server_close_listener(&server->grpc_listener);
}

static void kolibri_server_signal_handler(int signo) {
    (void)signo;
    g_stop_signal = 1;
}

static int kolibri_server_install_signals(void) {
    struct sigaction sa;
    memset(&sa, 0, sizeof(sa));
    sa.sa_handler = kolibri_server_signal_handler;
    if (sigaction(SIGINT, &sa, NULL) != 0) {
        return -1;
    }
    if (sigaction(SIGTERM, &sa, NULL) != 0) {
        return -1;
    }
    return 0;
}

static void kolibri_rest_respond(int client_fd, int status,
                                 const char *status_text,
                                 const char *body,
                                 const char *content_type) {
    if (!body) {
        body = "";
    }
    if (!content_type) {
        content_type = "application/json";
    }
    char header[512];
    int body_len = (int)strlen(body);
    int header_len = snprintf(header, sizeof(header),
                              "HTTP/1.1 %d %s\r\n"
                              "Content-Type: %s\r\n"
                              "Content-Length: %d\r\n"
                              "Connection: close\r\n\r\n",
                              status, status_text, content_type, body_len);
    if (header_len < 0) {
        return;
    }
    send(client_fd, header, (size_t)header_len, 0);
    if (body_len > 0) {
        send(client_fd, body, (size_t)body_len, 0);
    }
}

static void kolibri_rest_handle_client(int client_fd) {
    char buffer[1024];
    ssize_t received = recv(client_fd, buffer, sizeof(buffer) - 1, 0);
    if (received <= 0) {
        return;
    }
    buffer[received] = '\0';

    char method[8];
    char path[128];
    if (sscanf(buffer, "%7s %127s", method, path) != 2) {
        kolibri_rest_respond(client_fd, 400, "Bad Request",
                             "{\"error\":\"bad request\"}",
                             "application/json");
        return;
    }

    if (strcmp(method, "GET") == 0 && strcmp(path, "/health") == 0) {
        kolibri_rest_respond(client_fd, 200, "OK",
                             "{\"status\":\"ok\"}",
                             "application/json");
        return;
    }

    if (strcmp(method, "GET") == 0 && strcmp(path, "/v1/metrics") == 0) {
        kolibri_rest_respond(client_fd, 200, "OK",
                             "{\"uptime\":0,\"pending_jobs\":0}",
                             "application/json");
        return;
    }

    if (strcmp(method, "POST") == 0 && strcmp(path, "/v1/evaluate") == 0) {
        kolibri_rest_respond(client_fd, 202, "Accepted",
                             "{\"message\":\"evaluation scheduled\"}",
                             "application/json");
        return;
    }

    kolibri_rest_respond(client_fd, 404, "Not Found",
                         "{\"error\":\"not found\"}",
                         "application/json");
}

static void *kolibri_rest_thread(void *arg) {
    KolibriServer *server = (KolibriServer *)arg;
    const uint16_t port = server->config.rest_port;
    char log_message[128];
    snprintf(log_message, sizeof(log_message),
             "REST endpoint слушает на 0.0.0.0:%u", port);
    kolibri_log("rest", log_message);

    int listener = kolibri_server_create_listener(port);
    if (listener < 0) {
        kolibri_log_errno("rest", "не удалось открыть сокет", errno);
        kolibri_server_request_shutdown(server);
        return NULL;
    }
    atomic_store(&server->rest_listener, listener);

    while (atomic_load(&server->running)) {
        struct sockaddr_in addr;
        socklen_t addr_len = sizeof(addr);
        int client = accept(listener, (struct sockaddr *)&addr, &addr_len);
        if (client < 0) {
            if (!atomic_load(&server->running)) {
                break;
            }
            if (errno == EINTR) {
                continue;
            }
            kolibri_log_errno("rest", "ошибка accept", errno);
            continue;
        }

        kolibri_rest_handle_client(client);
        close(client);
    }

    kolibri_server_close_listener(&server->rest_listener);
    kolibri_log("rest", "REST endpoint остановлен");
    return NULL;
}

static void kolibri_grpc_handle_client(int client_fd) {
    char buffer[512];
    ssize_t received = recv(client_fd, buffer, sizeof(buffer) - 1, 0);
    if (received <= 0) {
        return;
    }
    buffer[received] = '\0';

    const char *response = "ACK:kolibri";
    send(client_fd, response, strlen(response), 0);
}

static void *kolibri_grpc_thread(void *arg) {
    KolibriServer *server = (KolibriServer *)arg;
    const uint16_t port = server->config.grpc_port;
    char log_message[128];
    snprintf(log_message, sizeof(log_message),
             "gRPC endpoint слушает на 0.0.0.0:%u (заглушка)", port);
    kolibri_log("grpc", log_message);

    int listener = kolibri_server_create_listener(port);
    if (listener < 0) {
        kolibri_log_errno("grpc", "не удалось открыть сокет", errno);
        kolibri_server_request_shutdown(server);
        return NULL;
    }
    atomic_store(&server->grpc_listener, listener);

    while (atomic_load(&server->running)) {
        struct sockaddr_in addr;
        socklen_t addr_len = sizeof(addr);
        int client = accept(listener, (struct sockaddr *)&addr, &addr_len);
        if (client < 0) {
            if (!atomic_load(&server->running)) {
                break;
            }
            if (errno == EINTR) {
                continue;
            }
            kolibri_log_errno("grpc", "ошибка accept", errno);
            continue;
        }

        kolibri_grpc_handle_client(client);
        close(client);
    }

    kolibri_server_close_listener(&server->grpc_listener);
    kolibri_log("grpc", "gRPC endpoint остановлен");
    return NULL;
}

int kolibri_server_run(const KolibriServerConfig *config) {
    if (!config) {
        return -1;
    }

    g_stop_signal = 0;

    KolibriServer server;
    server.config = *config;
    atomic_init(&server.running, true);
    atomic_init(&server.rest_listener, -1);
    atomic_init(&server.grpc_listener, -1);

    if (kolibri_server_install_signals() != 0) {
        kolibri_log_errno("server", "не удалось установить обработчики сигналов",
                          errno);
        return -1;
    }

    if (server.config.enable_rest) {
        if (pthread_create(&server.rest_thread, NULL, kolibri_rest_thread,
                           &server) != 0) {
            kolibri_log_error("server", "не удалось создать поток REST");
            return -1;
        }
    } else {
        memset(&server.rest_thread, 0, sizeof(server.rest_thread));
    }

    if (server.config.enable_grpc) {
        if (pthread_create(&server.grpc_thread, NULL, kolibri_grpc_thread,
                           &server) != 0) {
            kolibri_log_error("server", "не удалось создать поток gRPC");
            kolibri_server_request_shutdown(&server);
            if (server.config.enable_rest) {
                pthread_join(server.rest_thread, NULL);
            }
            return -1;
        }
    } else {
        memset(&server.grpc_thread, 0, sizeof(server.grpc_thread));
    }

    kolibri_log("server", "Kolibri server запущен");

    while (atomic_load(&server.running)) {
        if (g_stop_signal) {
            kolibri_server_request_shutdown(&server);
            break;
        }
        sleep(1);
    }

    kolibri_server_request_shutdown(&server);

    if (server.config.enable_rest) {
        pthread_join(server.rest_thread, NULL);
    }
    if (server.config.enable_grpc) {
        pthread_join(server.grpc_thread, NULL);
    }

    kolibri_log("server", "Kolibri server остановлен");
    return 0;
}

static void kolibri_print_usage(const char *prog) {
    printf("Usage: %s [OPTIONS]\n", prog);
    printf("\n");
    printf("Options:\n");
    printf("  --rest-port <port>    REST порт (по умолчанию %u)\n",
           KOLIBRI_SERVER_DEFAULT_REST_PORT);
    printf("  --grpc-port <port>    gRPC порт (по умолчанию %u)\n",
           KOLIBRI_SERVER_DEFAULT_GRPC_PORT);
    printf("  --no-rest             Отключить REST endpoint\n");
    printf("  --no-grpc             Отключить gRPC endpoint\n");
    printf("  -h, --help            Показать эту справку\n");
}

int main(int argc, char **argv) {
    KolibriServerConfig config;
    config.enable_rest = true;
    config.enable_grpc = true;
    config.rest_port = KOLIBRI_SERVER_DEFAULT_REST_PORT;
    config.grpc_port = KOLIBRI_SERVER_DEFAULT_GRPC_PORT;

    for (int i = 1; i < argc; ++i) {
        if (strcmp(argv[i], "--rest-port") == 0 && i + 1 < argc) {
            config.rest_port = (uint16_t)strtoul(argv[++i], NULL, 10);
            continue;
        }
        if (strcmp(argv[i], "--grpc-port") == 0 && i + 1 < argc) {
            config.grpc_port = (uint16_t)strtoul(argv[++i], NULL, 10);
            continue;
        }
        if (strcmp(argv[i], "--no-rest") == 0) {
            config.enable_rest = false;
            continue;
        }
        if (strcmp(argv[i], "--no-grpc") == 0) {
            config.enable_grpc = false;
            continue;
        }
        if (strcmp(argv[i], "--help") == 0 || strcmp(argv[i], "-h") == 0) {
            kolibri_print_usage(argv[0]);
            return 0;
        }
        fprintf(stderr, "Неизвестный параметр: %s\n", argv[i]);
        kolibri_print_usage(argv[0]);
        return 1;
    }

    if (!config.enable_rest && !config.enable_grpc) {
        fprintf(stderr, "Нечего запускать: все endpoints выключены\n");
        return 1;
    }

    if (config.rest_port == config.grpc_port && config.enable_rest &&
        config.enable_grpc) {
        fprintf(stderr, "REST и gRPC порты не должны совпадать\n");
        return 1;
    }

    return kolibri_server_run(&config);
}
