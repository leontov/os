# Kolibri Public Interfaces / Публичные интерфейсы Kolibri / Kolibri 公共接口

## 1. Overview / Обзор / 概述

This document records the interfaces that Kolibri guarantees to keep stable across
releases. Interfaces not listed here are considered experimental and may change
without notice. Use this document together with the versioning policy outlined in
`docs/developer_guide.md`.

Документ фиксирует интерфейсы Kolibri с гарантией стабильности между релизами.
Неупомянутые элементы считаются экспериментальными и могут измениться без
предупреждения. Следуйте совместно с политикой версионирования из
`docs/developer_guide.md`.

本文档描述 Kolibri 在各版本之间保证稳定的接口。未列出的接口视为试验性，
可能随时变更。请配合 `docs/developer_guide.md` 中的版本策略使用。

## 2. Stable C API / Стабильный C API / 稳定 C API

The following headers under `backend/include/kolibri/` define the supported C
interfaces. Consumers must include only the listed headers and link against the
Kolibri runtime built for their platform.

Ниже приведены заголовки, описывающие поддерживаемый C API. Используйте только
указанные функции и структуры, подключая Kolibri runtime для целевой платформы.

下列 `backend/include/kolibri/` 头文件定义受支持的 C 接口。建议只使用列出的
函数与结构，并链接对应平台构建的 Kolibri 运行时。

| Header | Stable Symbols | ABI Notes |
|--------|----------------|----------|
| `script.h` | `KolibriScript`, `ks_init`, `ks_free`, `ks_set_output`, `ks_load_text`, `ks_load_file`, `ks_execute` | `KolibriScript` is opaque: consumers may inspect but MUST NOT alter internal arrays directly. Struct size/layout may grow; new fields appended to the end. |
| `knowledge_index.h` | `KolibriKnowledgeIndex`, `KolibriKnowledgeDoc`, `KolibriKnowledgeToken`, `kolibri_knowledge_index_create/destroy/document_count/document/token/search/write_json/load_json` | Pointers returned remain valid until `kolibri_knowledge_index_destroy`. Fields marked “reserved” may change; avoid direct modification. |
| `net.h` | `KolibriNetListener`, `KolibriNetEndpoint`, helper routines | Wire protocol is backwards-compatible within a major version. Structs may gain trailing fields with default zero-initialisation. |
| `genome.h` | `KolibriGenome`, `ReasonBlock`, `kg_open`, `kg_close`, `kg_append`, `kg_verify_file`, `kg_encode_payload` | Blocks are stored big-endian; HMAC is SHA-256. `KolibriGenome` contains FILE* members that are internal; callers interact only via API functions. |
| `formula.h` | `KolibriGene`, `KolibriAssociation`, `KolibriFormula`, `KolibriFormulaPool`, `kf_*` helpers | Pool capacity constants define ABI; increases happen only in major releases. Struct fields may gain new trailing members reserved for future use. |
| `decimal.h`, `digits.h`, `random.h` | Utility conversion/hash and RNG helpers | Pure functions; signatures are stable. |

**Error handling / Обработка ошибок / 错误处理**

- Functions return `0` on success and non-zero error codes on failure. Unless
  explicitly stated, error codes use `errno` semantics.
- Ownership: any pointer returned from an API remains owned by the runtime unless
  documentation states otherwise. When transferring ownership, the callee is
  responsible for freeing memory using `free`.

## 3. Node CLI / CLI узла / 节点 CLI

Binary: `kolibri_node` (see `apps/kolibri_node.c`).

Параметры командной строки:

| Option | Description | Notes |
|--------|-------------|-------|
| `--seed <uint64>` | RNG seed for deterministic runs | Defaults to `20250923`. |
| `--node-id <uint32>` | Node identifier within the cluster | Must remain unique. |
| `--listen <port>` | Enable TCP listener on the given port | Implies server mode. |
| `--peer <host:port>` | Connect to upstream peer | Multiple peers may be supplied by repeating the flag (future enhancement). |
| `--genome <path>` | Path to genome file to load at startup | Defaults to `genome.dat`. |
| `--bootstrap <path>` | Optional KolibriScript file executed after startup | Script must be UTF-8 encoded. |
| `--verify-genome` | Enable on-start genome integrity verification | Fails fast on checksum mismatch. |

**Input/Output**

- STDIN accepts interactive commands in future releases; current stable behaviour
  is no-op.
- STDOUT/STDERR provide log lines prefixed with `[INFO]` / `[ERROR]`. Consumers
  should treat output as UTF-8 text.

## 4. Python Interfaces / Python-интерфейсы / Python 接口

The public Python module is `core.kolibri_sim`. The following items are stable:

- `KolibriSim` class with constructor parameters `(zerno=0, hmac_klyuch=None, trace_path=None, trace_include_genome=None, genome_path=None, secrets_config=None, secrets_path=None)`.
- Helper functions: `preobrazovat_tekst_v_cifry`, `vosstanovit_tekst_iz_cifr`,
  `dec_hash`, `dolzhen_zapustit_repl`.
- Data classes / typed dicts defined in `core/kolibri_sim.py` (`FormulaRecord`,
  `ZhurnalZapis`, `ZhurnalSnapshot`, `SoakResult`, etc.) remain structurally stable.
- Genome tooling in `core.kolibri_script.genome`:
  `KolibriGenomeLedger`, `SecretsConfig`, `load_secrets_config`.

**Tracing**

`KolibriSim` uses `JsonLinesTracer` from `core.tracing`. Trace output is UTF-8 JSONL.
Structure is compatible within a major release; new optional fields may be added.

**Language Support**

Python APIs emit user-facing strings in Russian (RU). Formatting and key names
are treated as stable; applications relying on localisation should not assume
English translations are available at runtime.

## 5. Experimental Interfaces / Экспериментальные интерфейсы / 实验性接口

The following components are subject to change without bumping the major version:

- `core.tracing` internals beyond `JsonLinesTracer`.
- Scripts in `scripts/` other than those explicitly referenced in this document.
- Experimental network backends and wasm bridge helpers in `frontend/src/core/`.
- Any struct fields marked as “reserved” within C headers.

Stabilisation of these interfaces will be announced in the changelog as they
mature. Contributions relying on them should expect potential refactors.

## 6. Change Control / Управление изменениями / 变更控制

- Additions to stable APIs require at least one release candidate cycle.
- Breaking changes are only permitted in a new major release and must be called
  out in the changelog.
- Deprecations must remain functional for at least one minor release, with
  warnings emitted where possible.
