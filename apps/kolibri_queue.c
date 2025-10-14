#include "kolibri/knowledge_queue.h"

#include <sqlite3.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void print_usage(void) {
    fprintf(stderr,
            "Usage:\n"
            "  kolibri_queue enqueue --db PATH --title TITLE --content TEXT [--source S] [--metadata JSON]\n"
            "  kolibri_queue list --db PATH [--status pending|approved|rejected] [--limit N]\n"
            "  kolibri_queue moderate --db PATH --id ID --status approved|rejected --moderator NAME [--note TEXT]\n"
            "  kolibri_queue export --db PATH --status approved|rejected --output DIR\n");
}

static int parse_status(const char *text, KolibriQueueStatus *out_status) {
    if (kolibri_queue_status_from_string(text, out_status) != 0) {
        fprintf(stderr, "Unknown status: %s\n", text);
        return 1;
    }
    return 0;
}

static int cmd_enqueue(int argc, char **argv) {
    const char *db_path = NULL;
    const char *title = NULL;
    const char *content = NULL;
    const char *source = NULL;
    const char *metadata = NULL;
    for (int i = 0; i < argc; ++i) {
        if (strcmp(argv[i], "--db") == 0 && i + 1 < argc) {
            db_path = argv[++i];
        } else if (strcmp(argv[i], "--title") == 0 && i + 1 < argc) {
            title = argv[++i];
        } else if (strcmp(argv[i], "--content") == 0 && i + 1 < argc) {
            content = argv[++i];
        } else if (strcmp(argv[i], "--source") == 0 && i + 1 < argc) {
            source = argv[++i];
        } else if (strcmp(argv[i], "--metadata") == 0 && i + 1 < argc) {
            metadata = argv[++i];
        }
    }
    if (!db_path || !title || !content) {
        print_usage();
        return 1;
    }
    KolibriQueue *queue = NULL;
    if (kolibri_queue_open(db_path, &queue) != SQLITE_OK) {
        fprintf(stderr, "Unable to open queue database\n");
        return 1;
    }
    long long submission_id = 0;
    int rc = kolibri_queue_enqueue(queue, title, content, source, metadata, &submission_id);
    kolibri_queue_close(queue);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Failed to enqueue: %d\n", rc);
        return 1;
    }
    printf("Добавлена заявка #%lld\n", submission_id);
    return 0;
}

static int cmd_list(int argc, char **argv) {
    const char *db_path = NULL;
    KolibriQueueStatus status = KOLIBRI_QUEUE_STATUS_PENDING;
    size_t limit = 20U;
    for (int i = 0; i < argc; ++i) {
        if (strcmp(argv[i], "--db") == 0 && i + 1 < argc) {
            db_path = argv[++i];
        } else if (strcmp(argv[i], "--status") == 0 && i + 1 < argc) {
            if (parse_status(argv[++i], &status) != 0) {
                return 1;
            }
        } else if (strcmp(argv[i], "--limit") == 0 && i + 1 < argc) {
            limit = (size_t)atoi(argv[++i]);
        }
    }
    if (!db_path) {
        print_usage();
        return 1;
    }
    KolibriQueue *queue = NULL;
    if (kolibri_queue_open(db_path, &queue) != SQLITE_OK) {
        fprintf(stderr, "Unable to open queue database\n");
        return 1;
    }
    KolibriQueueRecord *records = NULL;
    size_t count = 0U;
    int rc = kolibri_queue_fetch(queue, status, limit, &records, &count);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Fetch failed: %d\n", rc);
        kolibri_queue_close(queue);
        return 1;
    }
    if (count == 0U) {
        printf("Заявок не найдено\n");
    } else {
        for (size_t i = 0; i < count; ++i) {
            KolibriQueueRecord *rec = &records[i];
            printf("#%lld [%s] %s\n", rec->submission_id, kolibri_queue_status_to_string(rec->status), rec->title ? rec->title : "-");
            if (rec->source) {
                printf("  источник: %s\n", rec->source);
            }
            if (rec->moderator) {
                printf("  модератор: %s\n", rec->moderator);
            }
            if (rec->moderation_note) {
                printf("  заметка: %s\n", rec->moderation_note);
            }
        }
    }
    kolibri_queue_free_records(records, count);
    kolibri_queue_close(queue);
    return 0;
}

static int cmd_moderate(int argc, char **argv) {
    const char *db_path = NULL;
    long long submission_id = 0;
    KolibriQueueStatus status = KOLIBRI_QUEUE_STATUS_PENDING;
    const char *moderator = NULL;
    const char *note = NULL;
    for (int i = 0; i < argc; ++i) {
        if (strcmp(argv[i], "--db") == 0 && i + 1 < argc) {
            db_path = argv[++i];
        } else if (strcmp(argv[i], "--id") == 0 && i + 1 < argc) {
            submission_id = atoll(argv[++i]);
        } else if (strcmp(argv[i], "--status") == 0 && i + 1 < argc) {
            if (parse_status(argv[++i], &status) != 0) {
                return 1;
            }
        } else if (strcmp(argv[i], "--moderator") == 0 && i + 1 < argc) {
            moderator = argv[++i];
        } else if (strcmp(argv[i], "--note") == 0 && i + 1 < argc) {
            note = argv[++i];
        }
    }
    if (!db_path || submission_id == 0 || status == KOLIBRI_QUEUE_STATUS_PENDING || !moderator) {
        print_usage();
        return 1;
    }
    KolibriQueue *queue = NULL;
    if (kolibri_queue_open(db_path, &queue) != SQLITE_OK) {
        fprintf(stderr, "Unable to open queue database\n");
        return 1;
    }
    int rc = kolibri_queue_moderate(queue, submission_id, status, moderator, note);
    kolibri_queue_close(queue);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Moderation failed: %d\n", rc);
        return 1;
    }
    printf("Заявка #%lld обновлена до статуса %s\n", submission_id, kolibri_queue_status_to_string(status));
    return 0;
}

static int cmd_export(int argc, char **argv) {
    const char *db_path = NULL;
    const char *output_dir = NULL;
    KolibriQueueStatus status = KOLIBRI_QUEUE_STATUS_APPROVED;
    for (int i = 0; i < argc; ++i) {
        if (strcmp(argv[i], "--db") == 0 && i + 1 < argc) {
            db_path = argv[++i];
        } else if (strcmp(argv[i], "--status") == 0 && i + 1 < argc) {
            if (parse_status(argv[++i], &status) != 0) {
                return 1;
            }
        } else if (strcmp(argv[i], "--output") == 0 && i + 1 < argc) {
            output_dir = argv[++i];
        }
    }
    if (!db_path || !output_dir) {
        print_usage();
        return 1;
    }
    KolibriQueue *queue = NULL;
    if (kolibri_queue_open(db_path, &queue) != SQLITE_OK) {
        fprintf(stderr, "Unable to open queue database\n");
        return 1;
    }
    size_t exported = 0U;
    int rc = kolibri_queue_export_markdown(queue, status, output_dir, &exported);
    kolibri_queue_close(queue);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Export failed: %d\n", rc);
        return 1;
    }
    printf("Экспортировано %zu файлов\n", exported);
    return 0;
}

int main(int argc, char **argv) {
    if (argc < 2) {
        print_usage();
        return 1;
    }
    const char *command = argv[1];
    if (strcmp(command, "enqueue") == 0) {
        return cmd_enqueue(argc - 2, &argv[2]);
    }
    if (strcmp(command, "list") == 0) {
        return cmd_list(argc - 2, &argv[2]);
    }
    if (strcmp(command, "moderate") == 0) {
        return cmd_moderate(argc - 2, &argv[2]);
    }
    if (strcmp(command, "export") == 0) {
        return cmd_export(argc - 2, &argv[2]);
    }
    print_usage();
    return 1;
}
