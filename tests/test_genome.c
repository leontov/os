#include "kolibri/genome.h"

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

typedef struct {
    size_t schetchik;
    uint64_t poslednij_indeks;
    char poslednee_sobytie[KOLIBRI_EVENT_TYPE_SIZE];
} RezhimProigrysha;

/* Обратный вызов для проверки порядка блоков при воспроизведении. */
static int kontrolnyj_posetitel(const ReasonBlock *blok, void *kontekst)
{
    RezhimProigrysha *sostoyanie = (RezhimProigrysha *)kontekst;
    sostoyanie->schetchik++;
    sostoyanie->poslednij_indeks = blok->index;
    char tekst[KOLIBRI_EVENT_TYPE_SIZE];
    if (kg_block_event_text(blok, tekst, sizeof(tekst)) != 0) {
        return -1;
    }
    strncpy(sostoyanie->poslednee_sobytie, tekst,
            sizeof(sostoyanie->poslednee_sobytie) - 1U);
    sostoyanie->poslednee_sobytie[sizeof(sostoyanie->poslednee_sobytie) - 1U] = '\0';
    return 0;
}

void test_genome(void)
{
    char shablon[] = "/tmp/kolibri_genomeXXXXXX";
    int fd = mkstemp(shablon);
    assert(fd != -1);
    close(fd);

    const unsigned char klyuch[] = "test-key";
    KolibriGenome genome;
    int kod = kg_open(&genome, shablon, klyuch, sizeof(klyuch) - 1U);
    assert(kod == 0);

    ReasonBlock blok1;
    ReasonBlock blok2;
    assert(kg_append(&genome, "TEST", "payload1", &blok1) == 0);
    assert(kg_append(&genome, "ASK", "payload2", &blok2) == 0);
    assert(blok1.index == 0U);
    assert(blok2.index == 1U);
    assert(blok1.event_digits_len % 3U == 0U);
    assert(blok2.payload_digits_len % 3U == 0U);

    char vosstanovlennoe[KOLIBRI_PAYLOAD_SIZE];
    assert(kg_block_event_text(&blok2, vosstanovlennoe,
                sizeof(vosstanovlennoe)) == 0);
    assert(strcmp(vosstanovlennoe, "ASK") == 0);
    assert(kg_block_payload_text(&blok1, vosstanovlennoe,
                sizeof(vosstanovlennoe)) == 0);
    assert(strcmp(vosstanovlennoe, "payload1") == 0);

    kg_close(&genome);

    RezhimProigrysha sostoyanie = {0U, 0U, {0}};
    kod = kg_replay(shablon, klyuch, sizeof(klyuch) - 1U, kontrolnyj_posetitel,
            &sostoyanie);
    assert(kod == 0);
    assert(sostoyanie.schetchik == 2U);
    assert(sostoyanie.poslednij_indeks == blok2.index);
    assert(strcmp(sostoyanie.poslednee_sobytie, "ASK") == 0);

    kod = kg_verify_file(shablon, klyuch, sizeof(klyuch) - 1U);
    assert(kod == 0);

    FILE *fail = fopen(shablon, "r+");
    assert(fail != NULL);
    int simvol = fgetc(fail);
    assert(simvol != EOF);
    fseek(fail, 0, SEEK_SET);
    fputc(simvol == '0' ? '1' : '0', fail);
    fclose(fail);

    assert(kg_verify_file(shablon, klyuch, sizeof(klyuch) - 1U) == -1);
    assert(kg_replay(shablon, klyuch, sizeof(klyuch) - 1U, kontrolnyj_posetitel,
            &sostoyanie) == -1);

    remove(shablon);

    assert(kg_verify_file(shablon, klyuch, sizeof(klyuch) - 1U) == 1);
    assert(kg_replay(shablon, klyuch, sizeof(klyuch) - 1U, kontrolnyj_posetitel,
            &sostoyanie) == 1);
}
