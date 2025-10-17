# Руководство по подготовке данных и запуску обучения

Этот документ описывает минимальные шаги по подготовке текстового датасета для
обучения модели классификации и запуску процесса обучения с помощью
`scripts/train_model.py`.

## Подготовка датасета

1. Соберите данные и сохраните их в формате JSON Lines (по одной записи на
   строку).
2. Каждая запись должна содержать поля:
   - `text` — исходный текстовый пример;
   - `label` — целевой класс. Допускаются как числовые значения, так и строки.
3. Пример файла `train.jsonl`:

   ```json
   {"text": "пример положительного отзыва", "label": 1}
   {"text": "пример отрицательного отзыва", "label": 0}
   ```

4. (Опционально) Если целевые метки представлены строками, создайте отдельный
   JSON-файл с сопоставлением строковых значений числовым ID. Пример
   `label_mapping.json`:

   ```json
   {"negative": 0, "positive": 1}
   ```

5. Разделите данные на обучающую и валидационную выборки (например,
   `train.jsonl` и `validation.jsonl`).

## Конфигурация модели

Создайте JSON-файл с гиперпараметрами обучения. Обязательные поля:

- `model_name_or_path` — имя или путь модели в каталоге Hugging Face;
- `num_labels` — количество классов.

Дополнительные параметры (необязательные, имеют значения по умолчанию):

- `learning_rate`
- `weight_decay`
- `num_train_epochs`
- `warmup_steps`
- `per_device_batch_size`
- `gradient_accumulation_steps`
- `max_length`
- `checkpoint_steps`

Пример `config.json`:

```json
{
  "model_name_or_path": "distilbert-base-uncased",
  "num_labels": 2,
  "learning_rate": 3e-5,
  "num_train_epochs": 4,
  "per_device_batch_size": 16,
  "checkpoint_steps": 250
}
```

## Запуск обучения

1. Установите зависимости:

   ```bash
   pip install -r requirements.txt
   ```

2. Запустите обучение, указав пути к файлам данных и конфигурации:

   ```bash
   python scripts/train_model.py \
     --train-file /path/to/train.jsonl \
     --validation-file /path/to/validation.jsonl \
     --config /path/to/config.json \
     --output-dir ./checkpoints \
     --label-mapping /path/to/label_mapping.json
   ```

3. После завершения обучения итоговая модель и токенизатор будут сохранены в
   каталоге `--output-dir`. Промежуточные чекпоинты создаются каждые
   `checkpoint_steps` шагов и располагаются в подпапках `checkpoint-<номер>`.

4. Для продолжения обучения или инференса используйте API Transformers, передав
   путь к сохранённой директории модели.
