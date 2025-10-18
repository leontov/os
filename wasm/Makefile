EMCC ?= emcc
BUILD ?= ../build/wasm
TARGET := $(BUILD)/kolibri.wasm
SRC := kolibri_core.c
CFLAGS := -O3 -std=gnu11 -msimd128 -Wall -Wextra -Wno-unused-parameter
LDFLAGS := -sSTANDALONE_WASM=1 -sSIDE_MODULE=0 -sALLOW_MEMORY_GROWTH=1 \
    -sEXPORTED_RUNTIME_METHODS='[]' \
    -sEXPORTED_FUNCTIONS='["_k_state_new","_k_state_free","_k_state_save","_k_state_load","_k_observe","_k_decode","_k_digit_add_syll","_k_profile","_kolibri_bridge_init","_kolibri_bridge_reset","_kolibri_bridge_execute","_malloc","_free"]' \
    -sDEFAULT_LIBRARY_FUNCS_TO_INCLUDE='[]' --no-entry

all: $(TARGET)

$(TARGET): $(SRC)
	@mkdir -p $(BUILD)
	$(EMCC) $(CFLAGS) $< $(LDFLAGS) -o $@

clean:
	rm -rf $(BUILD)

.PHONY: all clean
