#include "kolibri/sim.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static void print_usage(void) {
    fprintf(stderr,
            "Usage:\n"
            "  kolibri_sim tick [--seed N] [--steps S]\n"
            "  kolibri_sim reset [--seed N]\n"
            "  kolibri_sim soak [--seed N] [--minutes M] [--log PATH]\n");
}

static void json_escape(FILE *out, const char *text) {
    if (!text) {
        return;
    }
    for (const unsigned char *c = (const unsigned char *)text; *c; ++c) {
        switch (*c) {
        case '"':
        case '\\':
            fputc('\\', out);
            fputc(*c, out);
            break;
        case '\n':
            fputs("\\n", out);
            break;
        case '\r':
            fputs("\\r", out);
            break;
        case '\t':
            fputs("\\t", out);
            break;
        default:
            fputc(*c, out);
            break;
        }
    }
}

static void dump_logs(KolibriSim *sim, FILE *out, size_t *last_offset, int as_json) {
    KolibriSimLog logs[64];
    size_t count = 0U;
    size_t offset = 0U;
    if (kolibri_sim_get_logs(sim, logs, 64U, &count, &offset) != 0) {
        return;
    }
    if (count == 0U) {
        return;
    }
    size_t start = 0U;
    if (*last_offset > offset) {
        start = *last_offset - offset;
        if (start > count) {
            start = count;
        }
    }
    for (size_t i = start; i < count; ++i) {
        const char *tip = logs[i].tip ? logs[i].tip : "";
        const char *msg = logs[i].soobshenie ? logs[i].soobshenie : "";
        if (as_json) {
            fprintf(out, "{");
            fputs("\"tip\":\"", out);
            json_escape(out, tip);
            fputs("\",\"soobshenie\":\"", out);
            json_escape(out, msg);
            fprintf(out, "\",\"metka\":%.6f}\n", logs[i].metka);
        } else {
            fprintf(out, "[%zu] %s: %s\n", offset + i, tip, msg);
        }
    }
    fflush(out);
    *last_offset = offset + count;
}

static void sim_print_logs(KolibriSim *sim) {
    size_t last_offset = 0U;
    dump_logs(sim, stdout, &last_offset, 0);
}

static int cmd_tick(int argc, char **argv) {
    uint32_t seed = 0U;
    size_t steps = 1U;
    for (int i = 0; i < argc; ++i) {
        if (strcmp(argv[i], "--seed") == 0 && i + 1 < argc) {
            seed = (uint32_t)strtoul(argv[++i], NULL, 10);
        } else if (strcmp(argv[i], "--steps") == 0 && i + 1 < argc) {
            steps = (size_t)strtoul(argv[++i], NULL, 10);
        }
    }

    KolibriSimConfig cfg = {
        .seed = seed,
        .hmac_key = "kolibri-hmac",
        .trace_path = NULL,
        .trace_include_genome = 0,
        .genome_path = NULL,
    };

    KolibriSim *sim = kolibri_sim_create(&cfg);
    if (!sim) {
        fprintf(stderr, "kolibri_sim_create failed\n");
        return 1;
    }

    for (size_t step = 0; step < steps; ++step) {
        if (kolibri_sim_tick(sim) != 0) {
            fprintf(stderr, "kolibri_sim_tick failed\n");
            kolibri_sim_destroy(sim);
            return 1;
        }
    }

    sim_print_logs(sim);
    kolibri_sim_destroy(sim);
    return 0;
}

static int cmd_reset(int argc, char **argv) {
    uint32_t seed = 0U;
    for (int i = 0; i < argc; ++i) {
        if (strcmp(argv[i], "--seed") == 0 && i + 1 < argc) {
            seed = (uint32_t)strtoul(argv[++i], NULL, 10);
        }
    }

    KolibriSimConfig cfg = {
        .seed = seed,
        .hmac_key = "kolibri-hmac",
        .trace_path = NULL,
        .trace_include_genome = 0,
        .genome_path = NULL,
    };
    KolibriSim *sim = kolibri_sim_create(&cfg);
    if (!sim) {
        fprintf(stderr, "kolibri_sim_create failed\n");
        return 1;
    }
    if (kolibri_sim_reset(sim, &cfg) != 0) {
        fprintf(stderr, "kolibri_sim_reset failed\n");
        kolibri_sim_destroy(sim);
        return 1;
    }
    sim_print_logs(sim);
    kolibri_sim_destroy(sim);
    return 0;
}

static int cmd_soak(int argc, char **argv) {
    uint32_t seed = 0U;
    size_t minutes = 5U;
    const char *log_path = NULL;
    for (int i = 0; i < argc; ++i) {
        if (strcmp(argv[i], "--seed") == 0 && i + 1 < argc) {
            seed = (uint32_t)strtoul(argv[++i], NULL, 10);
        } else if (strcmp(argv[i], "--minutes") == 0 && i + 1 < argc) {
            minutes = (size_t)strtoul(argv[++i], NULL, 10);
        } else if (strcmp(argv[i], "--log") == 0 && i + 1 < argc) {
            log_path = argv[++i];
        }
    }

    KolibriSimConfig cfg = {
        .seed = seed,
        .hmac_key = "kolibri-hmac",
        .trace_path = NULL,
        .trace_include_genome = 0,
        .genome_path = NULL,
    };

    KolibriSim *sim = kolibri_sim_create(&cfg);
    if (!sim) {
        fprintf(stderr, "kolibri_sim_create failed\n");
        return 1;
    }

    FILE *log_file = NULL;
    if (log_path) {
        log_file = fopen(log_path, "w");
        if (!log_file) {
            fprintf(stderr, "unable to open log file: %s\n", log_path);
            kolibri_sim_destroy(sim);
            return 1;
        }
    }

    size_t last_offset_file = 0U;
    size_t total_ticks = 0U;
    const size_t ticks_per_minute = 60U;
    for (size_t minute = 0; minute < minutes; ++minute) {
        for (size_t step = 0; step < ticks_per_minute; ++step) {
            if (kolibri_sim_tick(sim) != 0) {
                fprintf(stderr, "kolibri_sim_tick failed\n");
                if (log_file) {
                    fclose(log_file);
                }
                kolibri_sim_destroy(sim);
                return 1;
            }
            total_ticks += 1U;
            if (log_file) {
                dump_logs(sim, log_file, &last_offset_file, 1);
            }
        }
    }

    if (log_file) {
        fclose(log_file);
    } else {
        size_t offset_stdout = 0U;
        dump_logs(sim, stdout, &offset_stdout, 0);
    }

    printf("{\"minutes\":%zu,\"ticks\":%zu,\"seed\":%u,\"log_path\":",
           minutes,
           total_ticks,
           seed);
    if (log_path) {
        printf("\"%s\"}", log_path);
    } else {
        printf("null}");
    }
    putchar('\n');

    kolibri_sim_destroy(sim);
    return 0;
}

int main(int argc, char **argv) {
    if (argc < 2) {
        print_usage();
        return 1;
    }
    const char *command = argv[1];
    if (strcmp(command, "tick") == 0) {
        return cmd_tick(argc - 2, &argv[2]);
    }
    if (strcmp(command, "reset") == 0) {
        return cmd_reset(argc - 2, &argv[2]);
    }
    if (strcmp(command, "soak") == 0) {
        return cmd_soak(argc - 2, &argv[2]);
    }
    print_usage();
    return 1;
}
