#include "kolibri/net.h"

#include <assert.h>
#include <math.h>
#include <netinet/in.h>
#include <pthread.h>
#include <stdbool.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

typedef struct {
    KolibriNetListener slushatel;
    KolibriNetMessage soobshchenie;
    int rezultat;
    bool gotov;
    uint16_t port;
    pthread_mutex_t blokirovka;
    pthread_cond_t uslovie;
} KolibriTestContext;

/*
 * Ищет свободный порт, который можно использовать в тестах, минимизируя
 * конфликты с другими процессами.
 */
static uint16_t najti_svobodnyj_port(void)
{
    int soket = socket(AF_INET, SOCK_STREAM, 0);
    assert(soket >= 0);

    struct sockaddr_in adres;
    memset(&adres, 0, sizeof(adres));
    adres.sin_family = AF_INET;
    adres.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    adres.sin_port = htons(0);

    assert(bind(soket, (struct sockaddr *)&adres, sizeof(adres)) == 0);

    socklen_t dlina = sizeof(adres);
    assert(getsockname(soket, (struct sockaddr *)&adres, &dlina) == 0);
    uint16_t port = ntohs(adres.sin_port);
    close(soket);
    return port;
}

/*
 * Запускает сетевой слушатель в отдельном потоке и ожидает появление
 * первого входящего сообщения, сохраняя результат в контексте.
 */
static void *
zapustit_slushatel(void *dannyj)
{
    KolibriTestContext *kontekst = (KolibriTestContext *)dannyj;
    pthread_mutex_lock(&kontekst->blokirovka);
    kontekst->rezultat = -1;
    pthread_mutex_unlock(&kontekst->blokirovka);

    if (kn_listener_start(&kontekst->slushatel, kontekst->port) != 0) {
        pthread_mutex_lock(&kontekst->blokirovka);
        kontekst->gotov = true;
        pthread_cond_signal(&kontekst->uslovie);
        pthread_mutex_unlock(&kontekst->blokirovka);
        return NULL;
    }

    pthread_mutex_lock(&kontekst->blokirovka);
    kontekst->gotov = true;
    pthread_cond_signal(&kontekst->uslovie);
    pthread_mutex_unlock(&kontekst->blokirovka);

    for (size_t iteraciya = 0; iteraciya < 100U; ++iteraciya) {
        KolibriNetMessage prinjatoe;
        int status = kn_listener_poll(&kontekst->slushatel, 100U, &prinjatoe);
        if (status > 0) {
            pthread_mutex_lock(&kontekst->blokirovka);
            kontekst->soobshchenie = prinjatoe;
            kontekst->rezultat = 0;
            pthread_mutex_unlock(&kontekst->blokirovka);
            break;
        }
    }

    kn_listener_close(&kontekst->slushatel);
    return NULL;
}

/*
 * Проверяет полный цикл обмена между отправителем и слушателем, включая
 * фактическое сетевое соединение, чтобы подтвердить корректность этапов
 * приветствия и передачи генов.
 */
static void
proverit_polnyj_cikl_obmena(void)
{
    KolibriTestContext kontekst;
    memset(&kontekst, 0, sizeof(kontekst));
    pthread_mutex_init(&kontekst.blokirovka, NULL);
    pthread_cond_init(&kontekst.uslovie, NULL);
    kontekst.port = najti_svobodnyj_port();

    pthread_t potok;
    assert(pthread_create(&potok, NULL, zapustit_slushatel, &kontekst) == 0);

    pthread_mutex_lock(&kontekst.blokirovka);
    while (!kontekst.gotov) {
        pthread_cond_wait(&kontekst.uslovie, &kontekst.blokirovka);
    }
    pthread_mutex_unlock(&kontekst.blokirovka);

    KolibriFormula formula;
    memset(&formula, 0, sizeof(formula));
    formula.gene.length = 6U;
    for (size_t indeks = 0; indeks < formula.gene.length; ++indeks) {
        formula.gene.digits[indeks] = (uint8_t)((indeks + 3U) % 10U);
    }
    formula.fitness = 0.61;

    assert(kn_share_formula("127.0.0.1", kontekst.port, 1234U, &formula) == 0);

    assert(pthread_join(potok, NULL) == 0);

    pthread_mutex_lock(&kontekst.blokirovka);
    int rezultat = kontekst.rezultat;
    KolibriNetMessage soobshchenie = kontekst.soobshchenie;
    pthread_mutex_unlock(&kontekst.blokirovka);

    pthread_mutex_destroy(&kontekst.blokirovka);
    pthread_cond_destroy(&kontekst.uslovie);

    assert(rezultat == 0);
    assert(soobshchenie.type == KOLIBRI_MSG_MIGRATE_RULE);
    assert(soobshchenie.data.formula.node_id == 1234U);
    assert(soobshchenie.data.formula.length == formula.gene.length);
    assert(memcmp(soobshchenie.data.formula.digits, formula.gene.digits,
            formula.gene.length) == 0);
    assert(fabs(soobshchenie.data.formula.fitness - formula.fitness) < 1e-9);
}

void test_net(void)
{
    uint8_t buffer[64];
    KolibriNetMessage message;

    size_t dlina = kn_message_encode_hello(buffer, sizeof(buffer), 42U);
    assert(dlina == 7U);
    assert(kn_message_decode(buffer, dlina, &message) == 0);
    assert(message.type == KOLIBRI_MSG_HELLO);
    assert(message.data.hello.node_id == 42U);

    KolibriFormula formula;
    formula.fitness = 0.875;
    formula.gene.length = 8U;
    for (size_t indeks = 0; indeks < formula.gene.length; ++indeks) {
        formula.gene.digits[indeks] = (uint8_t)(indeks % 10U);
    }
    dlina = kn_message_encode_formula(buffer, sizeof(buffer), 7U, &formula);
    assert(dlina == 3U + sizeof(uint32_t) + 1U + formula.gene.length + sizeof(uint64_t));
    assert(kn_message_decode(buffer, dlina, &message) == 0);
    assert(message.type == KOLIBRI_MSG_MIGRATE_RULE);
    assert(message.data.formula.node_id == 7U);
    assert(message.data.formula.length == formula.gene.length);
    assert(memcmp(message.data.formula.digits, formula.gene.digits,
            formula.gene.length) == 0);
    assert(fabs(message.data.formula.fitness - formula.fitness) < 1e-9);

    dlina = kn_message_encode_ack(buffer, sizeof(buffer), 0x5AU);
    assert(dlina == 4U);
    assert(kn_message_decode(buffer, dlina, &message) == 0);
    assert(message.type == KOLIBRI_MSG_ACK);
    assert(message.data.ack.status == 0x5AU);

    proverit_polnyj_cikl_obmena();
}
