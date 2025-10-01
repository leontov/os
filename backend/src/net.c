/*
 * Copyright (c) 2025 Кочуров Владислав Евгеньевич
 */

#include "kolibri/net.h"

#include <arpa/inet.h>
#include <errno.h>
#include <netinet/in.h>
#include <openssl/err.h>
#include <openssl/evp.h>
#include <openssl/ssl.h>
#include <openssl/x509.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/time.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

#define KOLIBRI_HEADER_SIZE 3U
#define KOLIBRI_MAX_PAYLOAD 256U
#define KOLIBRI_MAX_MESSAGE_SIZE (KOLIBRI_HEADER_SIZE + KOLIBRI_MAX_PAYLOAD)
#define KOLIBRI_IO_TIMEOUT_MS 5000U
#define KOLIBRI_TLS_CERT_DAYS_VALID 365
#define KOLIBRI_TLS_CN "kolibri-node"

static int kolibri_socket_set_timeouts(int sockfd) {
  struct timeval tv;
  tv.tv_sec = (time_t)(KOLIBRI_IO_TIMEOUT_MS / 1000U);
  tv.tv_usec = (long)((KOLIBRI_IO_TIMEOUT_MS % 1000U) * 1000U);
  if (setsockopt(sockfd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv)) < 0) {
    return -1;
  }
  if (setsockopt(sockfd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv)) < 0) {
    return -1;
  }
  return 0;
}

static int kolibri_tls_configure_self_signed(SSL_CTX *ctx) {
  int result = -1;
  EVP_PKEY_CTX *pctx = EVP_PKEY_CTX_new_id(EVP_PKEY_RSA, NULL);
  if (!pctx) {
    return -1;
  }

  EVP_PKEY *pkey = NULL;
  if (EVP_PKEY_keygen_init(pctx) <= 0 ||
      EVP_PKEY_CTX_set_rsa_keygen_bits(pctx, 2048) <= 0 ||
      EVP_PKEY_keygen(pctx, &pkey) <= 0) {
    goto cleanup;
  }

  X509 *cert = X509_new();
  if (!cert) {
    goto cleanup;
  }

  if (X509_set_version(cert, 2L) != 1) {
    goto cleanup_cert;
  }

  ASN1_INTEGER_set(X509_get_serialNumber(cert), (long)time(NULL));
  if (!X509_gmtime_adj(X509_get_notBefore(cert), 0)) {
    goto cleanup_cert;
  }
  if (!X509_gmtime_adj(X509_get_notAfter(cert),
                        (long)KOLIBRI_TLS_CERT_DAYS_VALID * 24L * 60L * 60L)) {
    goto cleanup_cert;
  }

  if (X509_set_pubkey(cert, pkey) != 1) {
    goto cleanup_cert;
  }

  X509_NAME *name = X509_get_subject_name(cert);
  if (!name) {
    goto cleanup_cert;
  }

  if (X509_NAME_add_entry_by_txt(name, "CN", MBSTRING_ASC,
                                 (const unsigned char *)KOLIBRI_TLS_CN, -1, -1,
                                 0) != 1) {
    goto cleanup_cert;
  }

  if (X509_set_issuer_name(cert, name) != 1) {
    goto cleanup_cert;
  }

  if (X509_sign(cert, pkey, EVP_sha256()) <= 0) {
    goto cleanup_cert;
  }

  if (SSL_CTX_use_certificate(ctx, cert) != 1) {
    goto cleanup_cert;
  }
  if (SSL_CTX_use_PrivateKey(ctx, pkey) != 1) {
    goto cleanup_cert;
  }
  if (SSL_CTX_check_private_key(ctx) != 1) {
    goto cleanup_cert;
  }

  result = 0;

cleanup_cert:
  X509_free(cert);
cleanup:
  EVP_PKEY_free(pkey);
  EVP_PKEY_CTX_free(pctx);
  return result;
}

static SSL_CTX *kolibri_tls_create_client_ctx(void) {
  SSL_CTX *ctx = SSL_CTX_new(TLS_client_method());
  if (!ctx) {
    return NULL;
  }
  SSL_CTX_set_min_proto_version(ctx, TLS1_2_VERSION);
  SSL_CTX_set_options(ctx, SSL_OP_NO_COMPRESSION);
  SSL_CTX_set_mode(ctx, SSL_MODE_AUTO_RETRY);
  SSL_CTX_set_verify(ctx, SSL_VERIFY_NONE, NULL);
  return ctx;
}

static SSL_CTX *kolibri_tls_create_server_ctx(void) {
  SSL_CTX *ctx = SSL_CTX_new(TLS_server_method());
  if (!ctx) {
    return NULL;
  }
  SSL_CTX_set_min_proto_version(ctx, TLS1_2_VERSION);
  SSL_CTX_set_options(ctx, SSL_OP_NO_COMPRESSION);
  SSL_CTX_set_mode(ctx, SSL_MODE_AUTO_RETRY);
  SSL_CTX_set_verify(ctx, SSL_VERIFY_NONE, NULL);
  if (kolibri_tls_configure_self_signed(ctx) != 0) {
    SSL_CTX_free(ctx);
    return NULL;
  }
  return ctx;
}

static uint64_t kolibri_htonll(uint64_t value) {
#if __BYTE_ORDER__ == __ORDER_LITTLE_ENDIAN__
  return (((uint64_t)htonl((uint32_t)(value & 0xFFFFFFFFULL))) << 32) |
         htonl((uint32_t)(value >> 32));
#else
  return value;
#endif
}

static uint64_t kolibri_ntohll(uint64_t value) {
#if __BYTE_ORDER__ == __ORDER_LITTLE_ENDIAN__
  return (((uint64_t)ntohl((uint32_t)(value & 0xFFFFFFFFULL))) << 32) |
         ntohl((uint32_t)(value >> 32));
#else
  return value;
#endif
}

static size_t kolibri_write_header(uint8_t *buffer, size_t buffer_len,
                                   KolibriNetMessageType type,
                                   uint16_t payload_length) {
  if (!buffer || buffer_len < KOLIBRI_HEADER_SIZE) {
    return 0;
  }
  buffer[0] = (uint8_t)type;
  uint16_t be_len = htons(payload_length);
  memcpy(&buffer[1], &be_len, sizeof(be_len));
  return KOLIBRI_HEADER_SIZE;
}

static int kolibri_tls_write_all(SSL *ssl, const uint8_t *data, size_t len) {
  if (!ssl) {
    return -1;
  }

  if (len == 0) {
    return 0;
  }

  if (!data || len > KOLIBRI_MAX_MESSAGE_SIZE) {
    return -1;
  }

  size_t sent_total = 0;
  while (sent_total < len) {
    int sent = SSL_write(ssl, data + sent_total, (int)(len - sent_total));
    if (sent > 0) {
      sent_total += (size_t)sent;
      continue;
    }

    int error = SSL_get_error(ssl, sent);
    if (error == SSL_ERROR_WANT_READ || error == SSL_ERROR_WANT_WRITE) {
      continue;
    }
    if (error == SSL_ERROR_SYSCALL && errno == EINTR) {
      continue;
    }
    return -1;
  }
  return 0;
}

static int kolibri_tls_read_all(SSL *ssl, uint8_t *data, size_t len) {
  if (!ssl) {
    return -1;
  }

  if (len == 0) {
    return 0;
  }

  if (!data || len > KOLIBRI_MAX_MESSAGE_SIZE) {
    return -1;
  }

  size_t received_total = 0;
  while (received_total < len) {
    int received = SSL_read(ssl, data + received_total,
                            (int)(len - received_total));
    if (received > 0) {
      received_total += (size_t)received;
      continue;
    }

    int error = SSL_get_error(ssl, received);
    if (error == SSL_ERROR_WANT_READ || error == SSL_ERROR_WANT_WRITE) {
      continue;
    }
    if (error == SSL_ERROR_SYSCALL && errno == EINTR) {
      continue;
    }
    return -1;
  }
  return 0;
}

size_t kn_message_encode_hello(uint8_t *buffer, size_t buffer_len,
                               uint32_t node_id) {
  if (!buffer) {
    return 0;
  }
  uint8_t payload[sizeof(uint32_t)];
  uint32_t be_id = htonl(node_id);
  memcpy(payload, &be_id, sizeof(be_id));

  size_t header = kolibri_write_header(buffer, buffer_len, KOLIBRI_MSG_HELLO,
                                       sizeof(payload));
  if (header == 0 || buffer_len < header + sizeof(payload)) {
    return 0;
  }
  memcpy(buffer + header, payload, sizeof(payload));
  return header + sizeof(payload);
}

size_t kn_message_encode_formula(uint8_t *buffer, size_t buffer_len,
                                 uint32_t node_id,
                                 const KolibriFormula *formula) {
  if (!buffer || !formula) {
    return 0;
  }

  uint8_t digits[32];
  size_t digit_len = kf_formula_digits(formula, digits, sizeof(digits));
  if (digit_len == 0 || digit_len > sizeof(digits)) {
    return 0;
  }

  uint8_t payload[KOLIBRI_MAX_PAYLOAD];
  uint32_t be_node = htonl(node_id);
  uint64_t fitness_bits;
  memcpy(&fitness_bits, &formula->fitness, sizeof(fitness_bits));
  fitness_bits = kolibri_htonll(fitness_bits);

  size_t offset = 0;
  memcpy(payload + offset, &be_node, sizeof(be_node));
  offset += sizeof(be_node);
  payload[offset++] = (uint8_t)digit_len;
  memcpy(payload + offset, digits, digit_len);
  offset += digit_len;
  memcpy(payload + offset, &fitness_bits, sizeof(fitness_bits));
  offset += sizeof(fitness_bits);

  size_t header =
      kolibri_write_header(buffer, buffer_len, KOLIBRI_MSG_MIGRATE_RULE, offset);
  if (header == 0 || buffer_len < header + offset) {
    return 0;
  }
  memcpy(buffer + header, payload, offset);
  return header + offset;
}

size_t kn_message_encode_ack(uint8_t *buffer, size_t buffer_len,
                             uint8_t status) {
  if (!buffer) {
    return 0;
  }
  uint8_t payload[1] = {status};
  size_t header = kolibri_write_header(buffer, buffer_len, KOLIBRI_MSG_ACK,
                                       sizeof(payload));
  if (header == 0 || buffer_len < header + sizeof(payload)) {
    return 0;
  }
  memcpy(buffer + header, payload, sizeof(payload));
  return header + sizeof(payload);
}

int kn_message_decode(const uint8_t *buffer, size_t buffer_len,
                      KolibriNetMessage *out_message) {
  if (!buffer || buffer_len < KOLIBRI_HEADER_SIZE || !out_message) {
    return -1;
  }

  uint8_t type_byte = buffer[0];
  uint16_t payload_len;
  memcpy(&payload_len, &buffer[1], sizeof(payload_len));
  payload_len = ntohs(payload_len);

  if (buffer_len < KOLIBRI_HEADER_SIZE + payload_len) {
    return -1;
  }

  out_message->type = (KolibriNetMessageType)type_byte;
  const uint8_t *payload = buffer + KOLIBRI_HEADER_SIZE;

  switch (out_message->type) {
  case KOLIBRI_MSG_HELLO: {
    if (payload_len != sizeof(uint32_t)) {
      return -1;
    }
    uint32_t node_id;
    memcpy(&node_id, payload, sizeof(node_id));
    out_message->data.hello.node_id = ntohl(node_id);
    break;
  }
  case KOLIBRI_MSG_MIGRATE_RULE: {

    if (payload_len < sizeof(uint32_t) + 1 + sizeof(uint64_t)) {
      return -1;
    }
    size_t offset = 0;
    uint32_t node_raw;
    memcpy(&node_raw, payload + offset, sizeof(node_raw));
    offset += sizeof(node_raw);
    uint8_t length = payload[offset++];
    if (length > 32U || payload_len < offset + length + sizeof(uint64_t)) {
      return -1;
    }
    memset(out_message->data.formula.digits, 0,
           sizeof(out_message->data.formula.digits));
    memcpy(out_message->data.formula.digits, payload + offset, length);
    out_message->data.formula.length = length;
    offset += length;
    uint64_t fitness_raw;
    memcpy(&fitness_raw, payload + offset, sizeof(fitness_raw));
    fitness_raw = kolibri_ntohll(fitness_raw);
    double fitness_value;
    memcpy(&fitness_value, &fitness_raw, sizeof(fitness_value));
    out_message->data.formula.node_id = ntohl(node_raw);
    out_message->data.formula.fitness = fitness_value;
    break;
  }
  case KOLIBRI_MSG_ACK: {
    if (payload_len != 1) {
      return -1;
    }
    out_message->data.ack.status = payload[0];
    break;
  }
  default:
    return -1;
  }

  return 0;
}

static int kn_send_message(SSL *ssl, const uint8_t *buffer, size_t len) {
  if (!ssl) {
    return -1;
  }
  if (len == 0) {
    return 0;
  }
  if (!buffer || len > KOLIBRI_MAX_MESSAGE_SIZE) {
    return -1;
  }
  return kolibri_tls_write_all(ssl, buffer, len);
}

int kn_share_formula(const char *host, uint16_t port, uint32_t node_id,
                     const KolibriFormula *formula) {
  if (!host || !formula) {
    return -1;
  }

  int sockfd = socket(AF_INET, SOCK_STREAM, 0);
  if (sockfd < 0) {
    return -1;
  }

  if (kolibri_socket_set_timeouts(sockfd) != 0) {
    close(sockfd);
    return -1;
  }

  struct sockaddr_in addr;
  memset(&addr, 0, sizeof(addr));
  addr.sin_family = AF_INET;
  addr.sin_port = htons(port);
  if (inet_pton(AF_INET, host, &addr.sin_addr) <= 0) {
    close(sockfd);
    return -1;
  }

  if (connect(sockfd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
    close(sockfd);
    return -1;
  }

  SSL_CTX *client_ctx = kolibri_tls_create_client_ctx();
  if (!client_ctx) {
    close(sockfd);
    return -1;
  }

  SSL *ssl = SSL_new(client_ctx);
  if (!ssl) {
    SSL_CTX_free(client_ctx);
    close(sockfd);
    return -1;
  }

  bool handshake_done = false;
  int result = -1;

  if (SSL_set_fd(ssl, sockfd) != 1) {
    goto cleanup;
  }

  if (SSL_connect(ssl) != 1) {
    goto cleanup;
  }

  handshake_done = true;

  uint8_t buffer[KOLIBRI_MAX_MESSAGE_SIZE];
  size_t len = kn_message_encode_hello(buffer, sizeof(buffer), node_id);
  if (len == 0 || kn_send_message(ssl, buffer, len) != 0) {
    goto cleanup;
  }

  len = kn_message_encode_formula(buffer, sizeof(buffer), node_id, formula);
  if (len == 0 || kn_send_message(ssl, buffer, len) != 0) {
    goto cleanup;
  }

  result = 0;

cleanup:
  if (ssl) {
    if (handshake_done) {
      SSL_shutdown(ssl);
    }
    SSL_free(ssl);
  }
  SSL_CTX_free(client_ctx);
  close(sockfd);
  return result;
}

int kn_listener_start(KolibriNetListener *listener, uint16_t port) {
  if (!listener) {
    return -1;
  }

  listener->socket_fd = -1;
  listener->tls_ctx = NULL;

  int sockfd = socket(AF_INET, SOCK_STREAM, 0);
  if (sockfd < 0) {
    return -1;
  }

  int opt = 1;
  if (setsockopt(sockfd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
    close(sockfd);
    listener->socket_fd = -1;
    return -1;
  }

  struct sockaddr_in addr;
  memset(&addr, 0, sizeof(addr));
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = htonl(INADDR_ANY);
  addr.sin_port = htons(port);

  if (bind(sockfd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
    close(sockfd);
    listener->socket_fd = -1;
    return -1;
  }

  if (listen(sockfd, 4) < 0) {
    close(sockfd);
    return -1;
  }

  SSL_CTX *server_ctx = kolibri_tls_create_server_ctx();
  if (!server_ctx) {
    close(sockfd);
    return -1;
  }

  listener->socket_fd = sockfd;
  listener->port = port;
  listener->tls_ctx = server_ctx;
  return 0;
}

int kn_listener_poll(KolibriNetListener *listener, uint32_t timeout_ms,
                     KolibriNetMessage *out_message) {
  if (!listener || listener->socket_fd < 0 || !out_message) {
    return -1;
  }

  fd_set readfds;
  FD_ZERO(&readfds);
  FD_SET(listener->socket_fd, &readfds);

  struct timeval tv;
  struct timeval *timeout_ptr = NULL;
  if (timeout_ms != UINT32_MAX) {
    /* Pass an explicit zeroed timeval when timeout_ms == 0 to preserve
       non-blocking semantics. UINT32_MAX can be used to wait indefinitely. */
    tv.tv_sec = timeout_ms / 1000U;
    tv.tv_usec = (timeout_ms % 1000U) * 1000U;
    timeout_ptr = &tv;
  }

  int ready = select(listener->socket_fd + 1, &readfds, NULL, NULL, timeout_ptr);
  if (ready < 0) {
    if (errno == EINTR) {
      return 0;
    }
    return -1;
  }
  if (ready == 0) {
    return 0;
  }

  struct sockaddr_in client_addr;
  socklen_t client_len = sizeof(client_addr);
  int client_fd = accept(listener->socket_fd, (struct sockaddr *)&client_addr,
                         &client_len);
  if (client_fd < 0) {
    return -1;
  }

  if (kolibri_socket_set_timeouts(client_fd) != 0) {
    close(client_fd);
    return -1;
  }

  SSL_CTX *server_ctx = (SSL_CTX *)listener->tls_ctx;
  if (!server_ctx) {
    close(client_fd);
    return -1;
  }

  SSL *ssl = SSL_new(server_ctx);
  if (!ssl) {
    close(client_fd);
    return -1;
  }

  bool handshake_done = false;
  int result = -1;

  if (SSL_set_fd(ssl, client_fd) != 1) {
    goto cleanup;
  }

  if (SSL_accept(ssl) != 1) {
    goto cleanup;
  }

  handshake_done = true;

  uint8_t buffer[KOLIBRI_MAX_MESSAGE_SIZE];
  KolibriNetMessage last_message;
  bool has_last = false;

  while (true) {
    if (kolibri_tls_read_all(ssl, buffer, KOLIBRI_HEADER_SIZE) != 0) {
      break;
    }

    uint16_t payload_len;
    memcpy(&payload_len, &buffer[1], sizeof(payload_len));
    payload_len = ntohs(payload_len);

    if (payload_len > KOLIBRI_MAX_PAYLOAD ||
        (size_t)payload_len + KOLIBRI_HEADER_SIZE > KOLIBRI_MAX_MESSAGE_SIZE) {
      break;
    }

    if (kolibri_tls_read_all(ssl, buffer + KOLIBRI_HEADER_SIZE, payload_len) !=
        0) {
      break;
    }

    size_t message_len = KOLIBRI_HEADER_SIZE + payload_len;
    KolibriNetMessage decoded;
    if (kn_message_decode(buffer, message_len, &decoded) == 0) {
      has_last = true;
      last_message = decoded;
      if (decoded.type == KOLIBRI_MSG_MIGRATE_RULE) {
        *out_message = decoded;
        result = 1;
        goto cleanup;
      }
      continue;
    }
    break;
  }

  if (has_last) {
    *out_message = last_message;
    result = 1;
  }

cleanup:
  if (ssl) {
    if (handshake_done) {
      SSL_shutdown(ssl);
    }
    SSL_free(ssl);
  }
  close(client_fd);
  return result;
}

void kn_listener_close(KolibriNetListener *listener) {
  if (!listener) {
    return;
  }
  if (listener->socket_fd >= 0) {
    close(listener->socket_fd);
  }
  if (listener->tls_ctx) {
    SSL_CTX_free((SSL_CTX *)listener->tls_ctx);
  }
  listener->socket_fd = -1;
  listener->tls_ctx = NULL;
}
