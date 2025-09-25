#include "kolibri/script.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

static void test_script_basic(void) {
  const char *script =
      "начало\n"
      "переменная x = 2\n"
      "переменная y = 0\n"
      "если x > 1 тогда\n"
      "    показать \"больше\"\n"
      "    установить y = x + 3\n"
      "иначе\n"
      "    показать \"меньше\"\n"
      "конецесли\n"
      "показать y\n"
      "конец\n";
  KolibriScriptContext context;
  ks_context_init(&context);
  FILE *tmp = tmpfile();
  assert(tmp != NULL);
  assert(ks_execute_text(&context, script, tmp) == 0);
  fflush(tmp);
  rewind(tmp);
  char buffer[128];
  size_t read = fread(buffer, 1U, sizeof(buffer) - 1U, tmp);
  buffer[read] = '\0';
  fclose(tmp);
  assert(strstr(buffer, "больше") != NULL);
  assert(strstr(buffer, "5") != NULL);
}

static void test_script_else_branch(void) {
  const char *script =
      "начало\n"
      "переменная x = -1\n"
      "если x > 0 тогда\n"
      "    показать \"плюс\"\n"
      "иначе\n"
      "    показать \"минус\"\n"
      "конецесли\n"
      "конец\n";
  KolibriScriptContext context;
  ks_context_init(&context);
  FILE *tmp = tmpfile();
  assert(tmp != NULL);
  assert(ks_execute_text(&context, script, tmp) == 0);
  fflush(tmp);
  rewind(tmp);
  char buffer[64];
  size_t read = fread(buffer, 1U, sizeof(buffer) - 1U, tmp);
  buffer[read] = '\0';
  fclose(tmp);
  assert(strstr(buffer, "минус") != NULL);
}

static void test_script_error_detection(void) {
  const char *script =
      "начало\n"
      "переменная x = 1\n";
  KolibriScriptContext context;
  ks_context_init(&context);
  FILE *tmp = tmpfile();
  assert(tmp != NULL);
  assert(ks_execute_text(&context, script, tmp) != 0);
  fclose(tmp);
  const char *error = ks_last_error(&context);
  assert(error != NULL);
  assert(strstr(error, "конец") != NULL);
}

void test_script(void) {
  test_script_basic();
  test_script_else_branch();
  test_script_error_detection();
}
