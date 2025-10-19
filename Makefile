SHELL := /bin/bash
PYTHON ?= python3
VENV ?= .venv
VENV_BIN := $(VENV)/bin
BUILD_DIR ?= build
BUILD_TYPE ?= Release

.PHONY: python-env build-core build-wasm build-frontend pipeline lint test wasm frontend ci clean

python-env:
	$(PYTHON) -m venv $(VENV)
	$(VENV_BIN)/pip install --upgrade pip
	$(VENV_BIN)/pip install -r requirements.txt

build-core:
	cmake -S . -B $(BUILD_DIR) -DCMAKE_BUILD_TYPE=$(BUILD_TYPE)
	cmake --build $(BUILD_DIR)

build-wasm: build-core
	./scripts/build/build_wasm.sh

build-frontend: build-wasm
	npm install --prefix frontend
	npm run build --prefix frontend

pipeline: python-env build-core build-wasm build-frontend

lint: python-env
	$(VENV_BIN)/ruff check .
	$(VENV_BIN)/pyright

test: build-core
	ctest --test-dir $(BUILD_DIR)
	$(VENV_BIN)/pytest -q
	npm run test --prefix frontend -- --runInBand

wasm:
	./scripts/build/build_wasm.sh

frontend: build-wasm
	npm install --prefix frontend
	npm run build --prefix frontend

ci: pipeline lint test
	./scripts/build/build_iso.sh
	./scripts/build/generate_sbom.py
	./scripts/ops/policy_validate.py

clean:
	rm -rf $(BUILD_DIR) $(VENV) frontend/dist frontend/node_modules build/wasm
