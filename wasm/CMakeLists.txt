set(EMCC_LINK_FLAGS
    "-sEXPORT_ALL=1"
    "-sEXPORTED_FUNCTIONS=['_kolibri_sim_wasm_init','_kolibri_sim_wasm_tick','_kolibri_sim_wasm_get_logs','_kolibri_sim_wasm_reset','_kolibri_sim_wasm_free']"
    "-sALLOW_MEMORY_GROWTH=1"
)

add_executable(kolibri_sim_wasm wasm/kolibri_sim_wasm.c)
set_target_properties(kolibri_sim_wasm PROPERTIES LINK_FLAGS "${EMCC_LINK_FLAGS}")
target_link_libraries(kolibri_sim_wasm PRIVATE kolibri_core)
