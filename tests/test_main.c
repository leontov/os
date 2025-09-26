#include <stdio.h>

void test_decimal(void);
void test_genome(void);
void test_formula(void);
void test_roy(void);
void test_script(void);

int main(void) {
    test_decimal();
    test_genome();
    test_formula();
    test_roy();
    test_script();
    printf("all tests passed\n");
    return 0;
}
