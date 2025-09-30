# Kolibri networking

This document describes the current wire protocol used by Kolibri nodes
(transport version **2**).

## Transport overview

* **Transport:** TLS over TCP. Connections are established by the sender and
  closed after the message batch is transferred.
* **TLS configuration:** the backend generates an ephemeral RSA key and
  self-signed X.509 certificate at runtime. Clients accept this certificate
  without verification (suitable for trusted laboratory environments). TLS 1.2
  is the minimum protocol version and compression is disabled.
* **I/O timeouts:** both send and receive operations abort after 5 seconds of
  inactivity.
* **Message size limits:** the encoded message (header + payload) may not
  exceed 259 bytes. Payloads are limited to 256 bytes.

## Version history

| Version | Transport | Notes |
|---------|-----------|-------|
| 1       | Plain TCP | Legacy implementation without encryption or timeouts. |
| 2       | TLS/TCP   | Adds TLS encapsulation, timeouts, and stricter message bounds. |

## Envelope

Each message is composed of a 3-byte header followed by a payload:

| Field | Size (bytes) | Description |
|-------|--------------|-------------|
| Type  | 1            | `KolibriNetMessageType` value. |
| Length| 2            | Payload size in bytes, big-endian. |
| Payload | variable (≤256) | Encoded message body. |

Messages exceeding the declared limits are rejected.

## Schemas

* **HELLO (`KOLIBRI_MSG_HELLO`, type = 1)**
  * Payload: 4-byte unsigned integer (`node_id`, big-endian).

* **MIGRATE_RULE (`KOLIBRI_MSG_MIGRATE_RULE`, type = 2)**
  * Payload layout:
    1. `node_id` – 4-byte unsigned integer (big-endian).
    2. `length` – 1 byte, number of digits (≤32).
    3. `digits` – raw digit bytes (`length` bytes).
    4. `fitness` – IEEE-754 double encoded as 8-byte unsigned integer in
       network byte order.

* **ACK (`KOLIBRI_MSG_ACK`, type = 3)**
  * Payload: 1 byte status code.

Protocol consumers should validate payload sizes before decoding fields.
