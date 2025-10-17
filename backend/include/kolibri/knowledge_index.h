/*
 * Kolibri Knowledge Index — C API for building search index from Markdown files.
 */

#ifndef KOLIBRI_KNOWLEDGE_INDEX_H
#define KOLIBRI_KNOWLEDGE_INDEX_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct KolibriKnowledgeIndex KolibriKnowledgeIndex;

typedef struct {
    size_t token_index;
    float weight;
} KolibriKnowledgeVectorItem;

typedef struct {
    const char *id;
    const char *title;
    const char *source;
    const char *content;
    const KolibriKnowledgeVectorItem *vector;
    size_t vector_size;
    float norm;
} KolibriKnowledgeDoc;

typedef struct {
    const char *token;
    float idf;
} KolibriKnowledgeToken;

int kolibri_knowledge_index_create(const char *const *roots,
                                   size_t root_count,
                                   size_t max_length,
                                   KolibriKnowledgeIndex **out_index);

void kolibri_knowledge_index_destroy(KolibriKnowledgeIndex *index);

size_t kolibri_knowledge_index_document_count(const KolibriKnowledgeIndex *index);

const KolibriKnowledgeDoc *kolibri_knowledge_index_document(const KolibriKnowledgeIndex *index,
                                                            size_t idx);

size_t kolibri_knowledge_index_token_count(const KolibriKnowledgeIndex *index);

const KolibriKnowledgeToken *kolibri_knowledge_index_token(const KolibriKnowledgeIndex *index,
                                                           size_t idx);

int kolibri_knowledge_index_search(const KolibriKnowledgeIndex *index,
                                   const char *query,
                                   size_t limit,
                                   size_t *out_indices,
                                   float *out_scores,
                                   size_t *out_result_count);

int kolibri_knowledge_index_write_json(const KolibriKnowledgeIndex *index,
                                       const char *output_dir);

int kolibri_knowledge_index_load_json(const char *input_dir,
                                      KolibriKnowledgeIndex **out_index);

#ifdef __cplusplus
}
#endif

#endif /* KOLIBRI_KNOWLEDGE_INDEX_H */

