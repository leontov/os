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

- [Интегрированный прототип ИИ «Колибри»](docs/kolibri_integrated_prototype.md)
- [Master Prompt for the Materialization of Kolibri AI Ecosystem](docs/master_prompt.md)
