cmake_minimum_required(VERSION 3.16)
project(kolibri LANGUAGES C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

option(KOLIBRI_ENABLE_TESTS "Enable Kolibri tests" ON)

add_library(kolibri_core
    backend/src/decimal.c
    backend/src/genome.c
    backend/src/random.c
    backend/src/formula.c

    backend/src/roy.c

)

target_include_directories(kolibri_core
    PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/backend/include>
        $<INSTALL_INTERFACE:include>
)

find_package(OpenSSL REQUIRED)

find_package(Threads REQUIRED)


target_link_libraries(kolibri_core PRIVATE OpenSSL::Crypto)

add_executable(kolibri_node apps/kolibri_node.c)

target_link_libraries(kolibri_node PRIVATE kolibri_core)

if(KOLIBRI_ENABLE_TESTS)
    enable_testing()
    add_executable(kolibri_tests
        tests/test_main.c
        tests/test_decimal.c
        tests/test_genome.c
        tests/test_formula.c
        tests/test_roy.c
    )
    target_link_libraries(kolibri_tests PRIVATE kolibri_core Threads::Threads)

    add_test(NAME kolibri_tests COMMAND kolibri_tests)
endif()
