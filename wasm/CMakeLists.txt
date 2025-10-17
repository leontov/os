set(EMCC_LINK_FLAGS
    "-msimd128"
    "-sSTANDALONE_WASM=1"
    "-sSIDE_MODULE=0"
    "-sALLOW_MEMORY_GROWTH=1"
    "-sEXPORTED_FUNCTIONS=['_k_state_new','_k_state_free','_k_state_save','_k_state_load','_k_observe','_k_decode','_k_digit_add_syll','_k_profile','_kolibri_bridge_init','_kolibri_bridge_reset','_kolibri_bridge_execute','_malloc','_free']"
)

add_executable(kolibri_wasm wasm/kolibri_core.c)
set_target_properties(kolibri_wasm PROPERTIES LINK_FLAGS "${EMCC_LINK_FLAGS}")
