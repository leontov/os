#include "kolibri/script.h"

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

typedef struct {
    int obuchenie;
    int vopros;
    int ocenki_polozhitelnye;
    int ocenki_otricatelnye;
    char poslednij_vopros[64];
    char poslednij_otvet[64];
} TestSostoyanie;

static int test_obuchenie(void *polz, const char *vopros, const char *otvet)
{
    TestSostoyanie *sostoyanie = (TestSostoyanie *)polz;
    ++sostoyanie->obuchenie;
    strncpy(sostoyanie->poslednij_vopros, vopros,
            sizeof(sostoyanie->poslednij_vopros) - 1U);
    sostoyanie->poslednij_vopros[sizeof(sostoyanie->poslednij_vopros) - 1U] = '\0';
    strncpy(sostoyanie->poslednij_otvet, otvet,
            sizeof(sostoyanie->poslednij_otvet) - 1U);
    sostoyanie->poslednij_otvet[sizeof(sostoyanie->poslednij_otvet) - 1U] = '\0';
    return 0;
}

static int test_vopros(void *polz, const char *zapros)
{
    TestSostoyanie *sostoyanie = (TestSostoyanie *)polz;
    ++sostoyanie->vopros;
    strncpy(sostoyanie->poslednij_vopros, zapros,
            sizeof(sostoyanie->poslednij_vopros) - 1U);
    sostoyanie->poslednij_vopros[sizeof(sostoyanie->poslednij_vopros) - 1U] = '\0';
    return 0;
}

static int test_ocenka(void *polz, int znachenie)
{
    TestSostoyanie *sostoyanie = (TestSostoyanie *)polz;
    if (znachenie > 0) {
        ++sostoyanie->ocenki_polozhitelnye;
    } else if (znachenie < 0) {
        ++sostoyanie->ocenki_otricatelnye;
    }
    return 0;
}

static void zapisat_fail(const char *path, const char *soderzhanie)
{
    FILE *f = fopen(path, "w");
    assert(f);
    fputs(soderzhanie, f);
    fclose(f);
}

static void test_uspeh(void)
{
    char path[] = "/tmp/kolibri_scriptXXXXXX";
    int fd = mkstemp(path);
    assert(fd >= 0);
    close(fd);
    zapisat_fail(path,
                 "начало:\n"
                 "  обучить \"2\" -> \"4\"\n"
                 "  спросить \"2\"\n"
                 "  похвала\n"
                 "  порицание\n"
                 "конец.\n");
    TestSostoyanie sostoyanie;
    memset(&sostoyanie, 0, sizeof(sostoyanie));
    kolibri_script_obrabotchiki obrabotchiki;
    obrabotchiki.polzovatelskie_dannye = &sostoyanie;
    obrabotchiki.obrabotat_obuchenie = test_obuchenie;
    obrabotchiki.obrabotat_vopros = test_vopros;
    obrabotchiki.obrabotat_ocenku = test_ocenka;
    char oshibka[128];
    int status = kolibri_script_vypolnit(path, &obrabotchiki, oshibka,
                                         sizeof(oshibka));
    assert(status == 0);
    assert(sostoyanie.obuchenie == 1);
    assert(sostoyanie.vopros == 1);
    assert(sostoyanie.ocenki_polozhitelnye == 1);
    assert(sostoyanie.ocenki_otricatelnye == 1);
    assert(strcmp(sostoyanie.poslednij_vopros, "2") == 0);
    assert(strcmp(sostoyanie.poslednij_otvet, "4") == 0);
    unlink(path);
}

static void test_oshibka(void)
{
    char path[] = "/tmp/kolibri_script_badXXXXXX";
    int fd = mkstemp(path);
    assert(fd >= 0);
    close(fd);
    zapisat_fail(path, "обучить \"2\" -> 4\n");
    TestSostoyanie sostoyanie;
    memset(&sostoyanie, 0, sizeof(sostoyanie));
    kolibri_script_obrabotchiki obrabotchiki;
    obrabotchiki.polzovatelskie_dannye = &sostoyanie;
    obrabotchiki.obrabotat_obuchenie = test_obuchenie;
    obrabotchiki.obrabotat_vopros = test_vopros;
    obrabotchiki.obrabotat_ocenku = test_ocenka;
    char oshibka[128];
    int status = kolibri_script_vypolnit(path, &obrabotchiki, oshibka,
                                         sizeof(oshibka));
    assert(status != 0);
    assert(oshibka[0] != '\0');
    unlink(path);
}

void test_script(void)
{
    test_uspeh();
    test_oshibka();
}
