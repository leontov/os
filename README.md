# Kolibri OS Prototype

Новое видение будущего.

## Быстрый старт

```bash
make
./kolibri.sh up
```

### Запуск узла Kolibri

```bash
./build/kolibri_node --seed 42 --node-id 1 --listen 4050 --peer 127.0.0.1:4051
```

Параметры `--listen` и `--peer` включают простой бинарный протокол роя для
обмена лучшими формулами между узлами Kolibri.

## Тесты

```bash
make test
```

## Документация

- [Индекс документации / Documentation Index](docs/README.md)
- [Интегрированный прототип ИИ «Колибри»](docs/kolibri_integrated_prototype.md)
- [Master Prompt for the Materialization of Kolibri AI Ecosystem](docs/master_prompt.md)
- [Архитектура Kolibri](docs/architecture.md)
- [Руководство разработчика](docs/developer_guide.md)
- [Протокол роя](docs/swarm_protocol.md)
- [Слой десятичного мышления](docs/decimal_cognition.md)
- [Эволюция формул](docs/formula_evolution.md)
- [Цифровой геном Kolibri](docs/genome_chain.md)
- [Kolibri OS](docs/kolibri_os.md)
- [Веб-интерфейс и WASM-мост](docs/web_interface.md)
- [Научная повестка](docs/research_agenda.md)
