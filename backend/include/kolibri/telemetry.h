#ifndef KOLIBRI_TELEMETRY_H
#define KOLIBRI_TELEMETRY_H

#include <stdbool.h>
#include <stddef.h>
#include <time.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
  const char *operation;
  struct timespec start;
  bool active;
} KolibriTelemetrySpan;

int kt_init(const char *textfile_dir);
void kt_shutdown(void);
void kt_flush(void);

void kt_span_start(KolibriTelemetrySpan *span, const char *operation);
void kt_span_finish(KolibriTelemetrySpan *span, bool success);

void kt_set_trace_hint(const char *hint);
void kt_clear_trace_hint(void);
unsigned int kt_current_trace_hash(void);

#ifdef __cplusplus
}
#endif

#endif /* KOLIBRI_TELEMETRY_H */
