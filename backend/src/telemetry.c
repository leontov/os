#include "kolibri/telemetry.h"

#include <errno.h>
#include <inttypes.h>
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

#define KOLIBRI_TELEMETRY_PATH_MAX 512

typedef struct {
  char name[64];
  uint64_t success_count;
  uint64_t error_count;
  double total_latency_seconds;
  double max_latency_seconds;
  unsigned int last_trace_hash;
} KolibriTelemetryMetric;

static KolibriTelemetryMetric *metrics = NULL;
static size_t metrics_count = 0;
static size_t metrics_capacity = 0;
static pthread_mutex_t metrics_mutex = PTHREAD_MUTEX_INITIALIZER;
static char metrics_path[KOLIBRI_TELEMETRY_PATH_MAX];

static _Thread_local unsigned int current_trace_hash = 0U;

static unsigned int fnv1a_hash(const char *value) {
  if (!value || value[0] == '\0') {
    return 0U;
  }
  const unsigned int fnv_offset = 2166136261u;
  const unsigned int fnv_prime = 16777619u;
  unsigned int hash = fnv_offset;
  for (size_t i = 0; value[i] != '\0'; ++i) {
    hash ^= (unsigned int)(unsigned char)value[i];
    hash *= fnv_prime;
  }
  return hash;
}

static KolibriTelemetryMetric *ensure_metric(const char *name) {
  if (!name) {
    return NULL;
  }

  for (size_t i = 0; i < metrics_count; ++i) {
    if (strncmp(metrics[i].name, name, sizeof(metrics[i].name)) == 0) {
      return &metrics[i];
    }
  }

  if (metrics_count == metrics_capacity) {
    size_t new_capacity = metrics_capacity == 0 ? 4 : metrics_capacity * 2;
    KolibriTelemetryMetric *resized =
        realloc(metrics, new_capacity * sizeof(KolibriTelemetryMetric));
    if (!resized) {
      return NULL;
    }
    metrics = resized;
    metrics_capacity = new_capacity;
  }

  KolibriTelemetryMetric *metric = &metrics[metrics_count++];
  memset(metric, 0, sizeof(*metric));
  strncpy(metric->name, name, sizeof(metric->name) - 1U);
  metric->name[sizeof(metric->name) - 1U] = '\0';
  return metric;
}

static int mkdir_p(const char *path) {
  struct stat st;
  if (stat(path, &st) == 0) {
    return S_ISDIR(st.st_mode) ? 0 : -1;
  }
  if (errno != ENOENT) {
    return -1;
  }
  if (mkdir(path, 0755) == 0) {
    return 0;
  }
  return errno == EEXIST ? 0 : -1;
}

int kt_init(const char *textfile_dir) {
  if (!textfile_dir) {
    return -1;
  }

  if (mkdir_p(textfile_dir) != 0) {
    return -1;
  }

  int written = snprintf(metrics_path, sizeof(metrics_path), "%s/%s",
                         textfile_dir, "kolibri_metrics.prom");
  if (written < 0 || (size_t)written >= sizeof(metrics_path)) {
    metrics_path[0] = '\0';
    return -1;
  }

  return 0;
}

void kt_shutdown(void) {
  kt_flush();
  pthread_mutex_lock(&metrics_mutex);
  free(metrics);
  metrics = NULL;
  metrics_count = 0;
  metrics_capacity = 0;
  pthread_mutex_unlock(&metrics_mutex);
}

static void write_metrics(FILE *file) {
  fprintf(file, "# HELP kolibri_operation_latency_seconds Latency of Kolibri node operations in seconds\n");
  fprintf(file, "# TYPE kolibri_operation_latency_seconds summary\n");
  for (size_t i = 0; i < metrics_count; ++i) {
    const KolibriTelemetryMetric *metric = &metrics[i];
    uint64_t total = metric->success_count + metric->error_count;
    fprintf(file,
            "kolibri_operation_latency_seconds_count{operation=\"%s\"} %" PRIu64 "\n",
            metric->name, total);
    fprintf(file,
            "kolibri_operation_latency_seconds_sum{operation=\"%s\"} %.9f\n",
            metric->name, metric->total_latency_seconds);
    fprintf(file,
            "kolibri_operation_latency_seconds_max{operation=\"%s\"} %.9f\n",
            metric->name, metric->max_latency_seconds);
  }
  fprintf(file, "# HELP kolibri_operation_errors_total Number of failed Kolibri node operations\n");
  fprintf(file, "# TYPE kolibri_operation_errors_total counter\n");
  for (size_t i = 0; i < metrics_count; ++i) {
    const KolibriTelemetryMetric *metric = &metrics[i];
    fprintf(file,
            "kolibri_operation_errors_total{operation=\"%s\"} %" PRIu64 "\n",
            metric->name, metric->error_count);
  }
  fprintf(file, "# HELP kolibri_operation_trace_hash Hash of the most recent trace that touched the operation\n");
  fprintf(file, "# TYPE kolibri_operation_trace_hash gauge\n");
  for (size_t i = 0; i < metrics_count; ++i) {
    const KolibriTelemetryMetric *metric = &metrics[i];
    fprintf(file,
            "kolibri_operation_trace_hash{operation=\"%s\"} %u\n",
            metric->name, metric->last_trace_hash);
  }
}

void kt_flush(void) {
  if (metrics_path[0] == '\0') {
    return;
  }

  pthread_mutex_lock(&metrics_mutex);
  const char *path = metrics_path;
  char tmp_path[KOLIBRI_TELEMETRY_PATH_MAX];
  int written = snprintf(tmp_path, sizeof(tmp_path), "%s.tmp", path);
  if (written < 0 || (size_t)written >= sizeof(tmp_path)) {
    pthread_mutex_unlock(&metrics_mutex);
    return;
  }

  FILE *file = fopen(tmp_path, "w");
  if (!file) {
    pthread_mutex_unlock(&metrics_mutex);
    return;
  }

  write_metrics(file);
  fclose(file);
  rename(tmp_path, path);
  pthread_mutex_unlock(&metrics_mutex);
}

void kt_span_start(KolibriTelemetrySpan *span, const char *operation) {
  if (!span || !operation) {
    return;
  }
  span->operation = operation;
  span->active = clock_gettime(CLOCK_MONOTONIC, &span->start) == 0;
}

static double compute_duration_seconds(const struct timespec *start,
                                       const struct timespec *end) {
  if (!start || !end) {
    return 0.0;
  }
  time_t sec = end->tv_sec - start->tv_sec;
  long nsec = end->tv_nsec - start->tv_nsec;
  return (double)sec + (double)nsec / 1e9;
}

void kt_span_finish(KolibriTelemetrySpan *span, bool success) {
  if (!span || !span->operation || !span->active) {
    return;
  }

  struct timespec now;
  if (clock_gettime(CLOCK_MONOTONIC, &now) != 0) {
    return;
  }

  double duration = compute_duration_seconds(&span->start, &now);
  if (duration < 0.0) {
    duration = 0.0;
  }

  pthread_mutex_lock(&metrics_mutex);
  KolibriTelemetryMetric *metric = ensure_metric(span->operation);
  if (!metric) {
    pthread_mutex_unlock(&metrics_mutex);
    return;
  }

  if (success) {
    metric->success_count++;
  } else {
    metric->error_count++;
  }
  metric->total_latency_seconds += duration;
  if (duration > metric->max_latency_seconds) {
    metric->max_latency_seconds = duration;
  }
  metric->last_trace_hash = current_trace_hash;
  pthread_mutex_unlock(&metrics_mutex);

  kt_flush();
}

void kt_set_trace_hint(const char *hint) { current_trace_hash = fnv1a_hash(hint); }

void kt_clear_trace_hint(void) { current_trace_hash = 0U; }

unsigned int kt_current_trace_hash(void) { return current_trace_hash; }
