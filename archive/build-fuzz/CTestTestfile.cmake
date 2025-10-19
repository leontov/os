# CMake generated Testfile for 
# Source directory: /Users/kolibri/Documents/os
# Build directory: /Users/kolibri/Documents/os/build-fuzz
# 
# This file includes the relevant testing commands required for 
# testing this directory and lists subdirectories to be tested as well.
add_test(kolibri_tests "/Users/kolibri/Documents/os/build-fuzz/kolibri_tests")
set_tests_properties(kolibri_tests PROPERTIES  _BACKTRACE_TRIPLES "/Users/kolibri/Documents/os/CMakeLists.txt;141;add_test;/Users/kolibri/Documents/os/CMakeLists.txt;0;")
add_test(ks_compiler_roundtrip "/opt/homebrew/bin/cmake" "-Dks_compiler=/Users/kolibri/Documents/os/build-fuzz/ks_compiler" "-P" "/Users/kolibri/Documents/os/build-fuzz/ks_compiler_roundtrip.cmake")
set_tests_properties(ks_compiler_roundtrip PROPERTIES  _BACKTRACE_TRIPLES "/Users/kolibri/Documents/os/CMakeLists.txt;146;add_test;/Users/kolibri/Documents/os/CMakeLists.txt;0;")
add_test(kolibri_node_usage "/Users/kolibri/Documents/os/build-fuzz/kolibri_node" "--help")
set_tests_properties(kolibri_node_usage PROPERTIES  _BACKTRACE_TRIPLES "/Users/kolibri/Documents/os/CMakeLists.txt;151;add_test;/Users/kolibri/Documents/os/CMakeLists.txt;0;")
add_test(kolibri_indexer_usage "/Users/kolibri/Documents/os/build-fuzz/kolibri_indexer")
set_tests_properties(kolibri_indexer_usage PROPERTIES  WILL_FAIL "TRUE" _BACKTRACE_TRIPLES "/Users/kolibri/Documents/os/CMakeLists.txt;153;add_test;/Users/kolibri/Documents/os/CMakeLists.txt;0;")
add_test(kolibri_queue_usage "/Users/kolibri/Documents/os/build-fuzz/kolibri_queue")
set_tests_properties(kolibri_queue_usage PROPERTIES  WILL_FAIL "TRUE" _BACKTRACE_TRIPLES "/Users/kolibri/Documents/os/CMakeLists.txt;156;add_test;/Users/kolibri/Documents/os/CMakeLists.txt;0;")
add_test(kolibri_sim_usage "/Users/kolibri/Documents/os/build-fuzz/kolibri_sim")
set_tests_properties(kolibri_sim_usage PROPERTIES  WILL_FAIL "TRUE" _BACKTRACE_TRIPLES "/Users/kolibri/Documents/os/CMakeLists.txt;159;add_test;/Users/kolibri/Documents/os/CMakeLists.txt;0;")
