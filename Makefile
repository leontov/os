.PHONY: all build test clean kernel iso

all: build/kolibri_node

build:
	cmake -S . -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON

build/kolibri_node: build
	cmake --build build

clean:
	rm -rf build

# make test relies on build existing

test: build/kolibri_node
	cmake --build build --target kolibri_tests
	ctest --test-dir build --output-on-failure

kernel:
	./scripts/build_iso.sh

iso: kernel
