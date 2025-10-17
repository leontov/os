#include "kolibri/knowledge_index.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void print_usage(void) {
    fprintf(stderr,
            "Usage:\n"
            "  kolibri_indexer build --output DIR ROOT...\n"
            "  kolibri_indexer search --query TEXT [--limit N] ROOT...\n");
}

static int handle_build(int argc, char **argv) {
    const char *output_dir = NULL;
    size_t root_start = 0U;
    for (int i = 0; i < argc; ++i) {
        if (strcmp(argv[i], "--output") == 0 && i + 1 < argc) {
            output_dir = argv[i + 1];
            root_start = (size_t)(i + 2);
            break;
        }
    }
    if (!output_dir || root_start >= (size_t)argc) {
        print_usage();
        return 1;
    }

    size_t root_count = (size_t)argc - root_start;
    KolibriKnowledgeIndex *index = NULL;
    int err = kolibri_knowledge_index_create((const char *const *)&argv[root_start], root_count, 1024U, &index);
    if (err != 0 || !index) {
        fprintf(stderr, "Failed to build index: %d\n", err);
        return 1;
    }
    err = kolibri_knowledge_index_write_json(index, output_dir);
    kolibri_knowledge_index_destroy(index);
    if (err != 0) {
        fprintf(stderr, "Failed to write index: %d\n", err);
        return 1;
    }
    return 0;
}

static int handle_search(int argc, char **argv) {
    const char *query = NULL;
    size_t limit = 5U;
    size_t root_start = 0U;
    for (int i = 0; i < argc; ++i) {
        if (strcmp(argv[i], "--query") == 0 && i + 1 < argc) {
            query = argv[i + 1];
            i++;
        } else if (strcmp(argv[i], "--limit") == 0 && i + 1 < argc) {
            limit = (size_t)atoi(argv[i + 1]);
            i++;
        } else {
            root_start = (size_t)i;
            break;
        }
    }
    if (!query || root_start >= (size_t)argc) {
        print_usage();
        return 1;
    }

    size_t root_count = (size_t)argc - root_start;
    KolibriKnowledgeIndex *index = NULL;
    int err = kolibri_knowledge_index_create((const char *const *)&argv[root_start], root_count, 1024U, &index);
    if (err != 0 || !index) {
        fprintf(stderr, "Failed to build index: %d\n", err);
        return 1;
    }

    size_t *indices = (size_t *)malloc(limit * sizeof(size_t));
    float *scores = (float *)malloc(limit * sizeof(float));
    if (!indices || !scores) {
        fprintf(stderr, "Allocation failure\n");
        kolibri_knowledge_index_destroy(index);
        free(indices);
        free(scores);
        return 1;
    }

    size_t result_count = 0U;
    err = kolibri_knowledge_index_search(index, query, limit, indices, scores, &result_count);
    if (err != 0) {
        fprintf(stderr, "Search failed: %d\n", err);
        kolibri_knowledge_index_destroy(index);
        free(indices);
        free(scores);
        return 1;
    }

    for (size_t i = 0; i < result_count; ++i) {
        const KolibriKnowledgeDoc *doc = kolibri_knowledge_index_document(index, indices[i]);
        printf("%.4f\t%s\t%s\n", scores[i], doc->id, doc->title);
    }

    kolibri_knowledge_index_destroy(index);
    free(indices);
    free(scores);
    return 0;
}

int main(int argc, char **argv) {
    if (argc < 2) {
        print_usage();
        return 1;
    }
    if (strcmp(argv[1], "build") == 0) {
        return handle_build(argc - 2, &argv[2]);
    }
    if (strcmp(argv[1], "search") == 0) {
        return handle_search(argc - 2, &argv[2]);
    }
    print_usage();
    return 1;
}
