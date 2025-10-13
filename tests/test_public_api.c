#include "kolibri/formula.h"
#include "kolibri/genome.h"
#include "kolibri/script.h"

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void test_script_smoke(void) {
    KolibriFormulaPool pool;
    kf_pool_init(&pool, 1234U);

    KolibriGenome genome;
    memset(&genome, 0, sizeof(genome));

    KolibriScript script;
    int rc = ks_init(&script, &pool, &genome);
    assert(rc == 0);

    FILE *capture = tmpfile();
    assert(capture);
    ks_set_output(&script, capture);

    rc = ks_load_text(&script, "начало:\n    показать \"API\"\nконец.\n");
    assert(rc == 0);

    rc = ks_execute(&script);
    assert(rc == 0);

    fclose(capture);
    ks_free(&script);
}

static void test_genome_smoke(void) {
    unsigned char key[KOLIBRI_HMAC_KEY_SIZE];
    memset(key, 1, sizeof(key));

    char path[L_tmpnam];
    assert(tmpnam(path));

    KolibriGenome genome;
    int rc = kg_open(&genome, path, key, sizeof(key));
    assert(rc == 0);
    kg_close(&genome);
    remove(path);
}

void test_public_api(void) {
    test_script_smoke();
    test_genome_smoke();
}
